(* OCaml → JS 境界。[%mel.obj] 変換と create_session の組み立てを集約。
   純粋 OCaml ロジックは Calc_core 側に置き、このモジュールは Js.Nullable /
   JS オブジェクトへの写像だけを担当する。将来 Worker/LSP 化する際は
   create_session を postMessage ベースに置き換えれば済む。 *)

module LS = Calc_core.Language_service
module S = Calc_core.Session
module P = Calc_core.Protocol

type result_obj = <
  success : bool;
  kind : string;
  name : string Js.Nullable.t;
  value : float Js.Nullable.t;
  error_message : string Js.Nullable.t;
  error_column : int Js.Nullable.t;
> Js.t

let make_expr_result (v : float) : result_obj =
  [%mel.obj {
    success = true;
    kind = "expr";
    name = Js.Nullable.null;
    value = Js.Nullable.return v;
    error_message = Js.Nullable.null;
    error_column = Js.Nullable.null;
  }]

let make_bind_result (n : string) (v : float) : result_obj =
  [%mel.obj {
    success = true;
    kind = "binding";
    name = Js.Nullable.return n;
    value = Js.Nullable.return v;
    error_message = Js.Nullable.null;
    error_column = Js.Nullable.null;
  }]

let make_error (msg : string) (col : int) : result_obj =
  [%mel.obj {
    success = false;
    kind = "error";
    name = Js.Nullable.null;
    value = Js.Nullable.null;
    error_message = Js.Nullable.return msg;
    error_column = Js.Nullable.return col;
  }]

let eval_result_to_js (r : S.eval_result) : result_obj =
  match r with
  | S.Expr v -> make_expr_result v
  | S.Binding (n, v) -> make_bind_result n v
  | S.Eval_error { message; column } -> make_error message column

type completion_js = <
  label : string;
  kind : string;
  detail : string Js.Nullable.t;
> Js.t

let completion_kind_to_string = function
  | LS.CkKeyword -> "keyword"
  | LS.CkVariable -> "variable"
  | LS.CkOperator -> "operator"
  | LS.CkFunction -> "function"

let completion_to_js (item : LS.completion_item) : completion_js =
  [%mel.obj {
    label = item.label;
    kind = completion_kind_to_string item.kind;
    detail = Js.Nullable.fromOption item.detail;
  }]

let severity_to_string = function
  | LS.Error -> "error"
  | LS.Warning -> "warning"
  | LS.Info -> "info"

type diagnostic_js = <
  message : string;
  start_col : int;
  end_col : int;
  severity : string;
> Js.t

let diagnostic_to_js (d : LS.diagnostic) : diagnostic_js =
  [%mel.obj {
    message = d.message;
    start_col = d.start_col;
    end_col = d.end_col;
    severity = severity_to_string d.severity;
  }]

type hover_js = <
  contents : string;
  start_col : int;
  end_col : int;
> Js.t

let hover_to_js (h : LS.hover_info) : hover_js =
  [%mel.obj {
    contents = h.contents;
    start_col = h.start_col;
    end_col = h.end_col;
  }]

let token_kind_to_string = function
  | LS.TkKeyword -> "keyword"
  | LS.TkIdent -> "ident"
  | LS.TkNumber -> "number"
  | LS.TkOperator -> "operator"
  | LS.TkPunct -> "punct"

type semantic_token_js = <
  start_col : int;
  length : int;
  kind : string;
> Js.t

let semantic_token_to_js (t : LS.semantic_token) : semantic_token_js =
  [%mel.obj {
    start_col = t.start_col;
    length = t.length;
    kind = token_kind_to_string t.kind;
  }]

type request_js = <
  op : string;
  input : string Js.Nullable.t;
  offset : int Js.Nullable.t;
> Js.t

let nullable_string_or_empty v =
  match Js.Nullable.toOption v with Some s -> s | None -> ""

let nullable_int_or_zero v =
  match Js.Nullable.toOption v with Some i -> i | None -> 0

let request_of_js (r : request_js) : P.request =
  let input = nullable_string_or_empty r##input in
  let offset = nullable_int_or_zero r##offset in
  match r##op with
  | "eval" -> P.Eval input
  | "complete" -> P.Complete { input; offset }
  | "diagnose" -> P.Diagnose input
  | "hover" -> P.Hover { input; offset }
  | "tokens" -> P.Tokens input
  | unknown -> failwith ("js_bridge: unknown session op: " ^ unknown)

(* response の JS 値は shape がブランチごとに異なり OCaml の型システム
   では 1 つの型に纏められないため、各ブランチで Obj.magic で < > Js.t
   に揃える。unsafe cast はこの関数だけに閉じ込める。 *)
let response_to_js (resp : P.response) : < > Js.t =
  match resp with
  | P.REval r -> Obj.magic (eval_result_to_js r)
  | P.RComplete items ->
    Obj.magic (Array.of_list (List.map completion_to_js items))
  | P.RDiagnose diags ->
    Obj.magic (Array.of_list (List.map diagnostic_to_js diags))
  | P.RHover info ->
    Obj.magic (Js.Nullable.fromOption (Option.map hover_to_js info))
  | P.RTokens toks ->
    Obj.magic (Array.of_list (List.map semantic_token_to_js toks))

(* Session.t は immutable なので handle のたびに新しい値を得る。
   JS 側は同じ session を使い回す UX を期待するため、ref で包んで
   request 内部で state を差し替える。 *)
let create_session () =
  let state = ref S.empty in
  [%mel.obj {
    request = (fun (req : request_js) ->
      let r = request_of_js req in
      let (next, resp) = P.handle !state r in
      state := next;
      response_to_js resp);
  }]
