(* OCaml → JS 境界。[%mel.obj] による変換と create_session の組み立てを集約する。
   純粋 OCaml 側のロジックは Calc_core (= src/lib) に置き、このモジュールは
   Js.Nullable / JS オブジェクトへの写像だけを担当する。

   create_session() は `session.request(req)` という単一エンドポイントを
   公開する。req は { type: 'eval' | 'complete' | 'diagnose' | 'hover' | 'tokens',
   input: string, offset?: int } という shape の JS オブジェクト。
   Protocol.handle が中身の分岐を行い、結果は type ごとに固有の shape で返る。
   将来 Worker 化や LSP 化する際は、この request/response を postMessage に
   置き換えれば済む。 *)

module LS = Calc_core.Language_service
module S = Calc_core.Session
module P = Calc_core.Protocol

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

(* ---------- request/response の JS 境界 ---------- *)

(* JS 側から渡ってくるリクエスト object の型。
   OCaml の予約語と衝突しない `op` フィールドでリクエスト種別を運ぶ。
   その他のフィールド (input / offset) は nullable で、op ごとに使われる。 *)
type request_js = <
  op : string;
  input : string Js.Nullable.t;
  offset : int Js.Nullable.t;
> Js.t

let nullable_string_or_empty (v : string Js.Nullable.t) : string =
  match Js.Nullable.toOption v with
  | Some s -> s
  | None -> ""

let nullable_int_or_zero (v : int Js.Nullable.t) : int =
  match Js.Nullable.toOption v with
  | Some i -> i
  | None -> 0

(* JS リクエストオブジェクトを Protocol.request に変換。
   未知の op は Eval "" (空評価 = エラー) に倒して安全側に倒す。 *)
let request_of_js (r : request_js) : P.request =
  let op = r##op in
  let input = nullable_string_or_empty r##input in
  let offset = nullable_int_or_zero r##offset in
  match op with
  | "eval" -> P.Eval input
  | "complete" -> P.Complete { input; offset }
  | "diagnose" -> P.Diagnose input
  | "hover" -> P.Hover { input; offset }
  | "tokens" -> P.Tokens input
  | _ -> P.Eval ""

(* Protocol.response を JS 境界の値 (shape は kind ごとに異なる) に変換。
   ブランチごとに戻り値の型が違うため、OCaml 型システムの外に出て
   Obj.magic で統一する。JS 側では session-client.js が shape を知っている。 *)
let response_to_js (resp : P.response) : < > Js.t =
  match resp with
  | P.REval r -> Obj.magic (eval_result_to_js r)
  | P.RComplete items ->
    items |> List.map completion_to_js |> Array.of_list |> Obj.magic
  | P.RDiagnose diags ->
    diags |> List.map diagnostic_to_js |> Array.of_list |> Obj.magic
  | P.RHover info ->
    (match info with
     | Some h -> Obj.magic (Js.Nullable.return (hover_to_js h))
     | None -> Obj.magic Js.Nullable.null)
  | P.RTokens toks ->
    toks |> List.map semantic_token_to_js |> Array.of_list |> Obj.magic

(* ---------- セッション (JS 側公開オブジェクト) ----------
   OCaml 純粋 API の Session.t は immutable なので、handle のたびに新しい値
   を得る。JS 側は同じ session オブジェクトを使い回す UX を期待するため、
   ref で包んで request 呼び出しの内部で state を差し替える。 *)

let create_session () =
  let state = ref S.empty in
  [%mel.obj {
    request = (fun (req : request_js) ->
      let r = request_of_js req in
      let (next, resp) = P.handle !state r in
      state := next;
      response_to_js resp);
  }]
