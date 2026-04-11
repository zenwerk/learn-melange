(* OCaml → JS 境界。[%mel.obj] による変換と create_session の組み立てを集約する。
   純粋 OCaml 側のロジックは Calc_core (= src/lib) に置き、このモジュールは
   Js.Nullable / JS オブジェクトへの写像だけを担当する。 *)

module LS = Calc_core.Language_service
module S = Calc_core.Session

(* ---------- eval 結果 ---------- *)

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

(* ---------- 言語サービス結果 ---------- *)

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
    detail = (match item.detail with
              | Some s -> Js.Nullable.return s
              | None -> Js.Nullable.null);
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

(* ---------- セッション (JS 側公開オブジェクト) ----------
   OCaml 純粋 API の Session.t は immutable なので、eval のたびに新しい値を得る。
   JS 側は同じ session オブジェクトを使い回す UX を期待するため、ref で包んで
   メソッド呼び出しの内部で state を差し替える。 *)

let create_session () =
  let state = ref S.empty in
  [%mel.obj {
    eval = (fun (input : string) ->
      let (next, result) = S.eval !state input in
      state := next;
      eval_result_to_js result);
    complete = (fun (input : string) (offset : int) ->
      S.complete !state input offset
      |> List.map completion_to_js
      |> Array.of_list);
    diagnose = (fun (input : string) ->
      S.diagnose !state input
      |> List.map diagnostic_to_js
      |> Array.of_list);
    hover = (fun (input : string) (offset : int) ->
      match S.hover !state input offset with
      | Some h -> Js.Nullable.return (hover_to_js h)
      | None -> Js.Nullable.null);
    tokens = (fun (input : string) ->
      S.tokens input
      |> List.map semantic_token_to_js
      |> Array.of_list);
  }]
