(* JS側とやり取りするための結果オブジェクト型。
   Melangeの open object type を使うことで、JSオブジェクトリテラルとして直接出力される。
   Js.Nullable.t を使うのは、成功/失敗で存在しないフィールドをnullとして表現するため。 *)
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

module I = Parser.MenhirInterpreter
open Parse_util

(* 通常のパース。AtEofの場合はEOFトークンを明示的に供給して文法の終端を確定させる。
   incremental APIは自動的にEOFを処理しないため、手動で渡す必要がある。 *)
let push_parse lexbuf checkpoint : (Ast.statement, string * int) result =
  match feed_tokens lexbuf checkpoint with
  | Fed v -> Ok v
  | AtEof cp ->
    let pos = lexbuf.Lexing.lex_curr_p in
    (match feed_tokens lexbuf (drain (I.offer cp (Parser.EOF, pos, pos))) with
     | Fed v -> Ok v
     | AtEof _ -> Error ("Syntax error", 0)
     | FeedError (msg, col) -> Error (msg, col))
  | FeedError (msg, col) -> Error (msg, col)

(* I.acceptableはトークンの「種類」を判定するが、引数として具体的なトークン値が必要。
   FLOATやIDENTはペイロードを持つため、ダミー値(0.0, "")を使って種類だけを問い合わせる。
   ラベルはUI表示用の人間が読める名前。 *)
let all_tokens : (Parser.token * string) list = [
  (Parser.FLOAT 0.0, "number");
  (Parser.IDENT "", "identifier");
  (Parser.PLUS, "+");
  (Parser.MINUS, "-");
  (Parser.STAR, "*");
  (Parser.SLASH, "/");
  (Parser.LPAREN, "(");
  (Parser.RPAREN, ")");
  (Parser.EQUALS, "=");
  (Parser.EOF, "EOF");
]

(* 入力途中のヒント生成。feed_tokensがAtEofを返した時点のチェックポイントには、
   パーサーのLR状態が保存されている。その状態に対してI.acceptableで各トークンを
   仮投入し、受理されるかどうかを調べることで、次に入力可能なトークンの一覧を得る。
   構文エラーや不完全な入力でfeed_tokensが失敗した場合は空リストを返す。 *)
let get_acceptable_tokens (input_str : string) : string list =
  let lexbuf = Lexing.from_string input_str in
  let checkpoint = Parser.Incremental.input lexbuf.Lexing.lex_curr_p in
  match feed_tokens lexbuf (drain checkpoint) with
  | AtEof cp ->
    let pos = lexbuf.Lexing.lex_curr_p in
    List.filter_map (fun (tok, label) ->
      if I.acceptable cp tok pos then Some label else None
    ) all_tokens
  | _ -> []

(* ---------- 言語サービス JS ブリッジ ----------
   Calc_language_service の返り値を [%mel.obj] で JS オブジェクト化する。
   OCaml 側は純粋な option/variant を使い、境界で Js.Nullable / 文字列に変換する。 *)

type completion_js = <
  label : string;
  kind : string;
  detail : string Js.Nullable.t;
> Js.t

let completion_kind_to_string = function
  | Language_service.CkKeyword -> "keyword"
  | Language_service.CkVariable -> "variable"
  | Language_service.CkOperator -> "operator"
  | Language_service.CkFunction -> "function"

let completion_to_js (item : Language_service.completion_item) : completion_js =
  [%mel.obj {
    label = item.label;
    kind = completion_kind_to_string item.kind;
    detail = (match item.detail with
              | Some s -> Js.Nullable.return s
              | None -> Js.Nullable.null);
  }]

let severity_to_string = function
  | Language_service.Error -> "error"
  | Language_service.Warning -> "warning"
  | Language_service.Info -> "info"

type diagnostic_js = <
  message : string;
  start_col : int;
  end_col : int;
  severity : string;
> Js.t

let diagnostic_to_js (d : Language_service.diagnostic) : diagnostic_js =
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

let hover_to_js (h : Language_service.hover_info) : hover_js =
  [%mel.obj {
    contents = h.contents;
    start_col = h.start_col;
    end_col = h.end_col;
  }]

let token_kind_to_string = function
  | Language_service.TkKeyword -> "keyword"
  | Language_service.TkIdent -> "ident"
  | Language_service.TkNumber -> "number"
  | Language_service.TkOperator -> "operator"
  | Language_service.TkPunct -> "punct"

type semantic_token_js = <
  start_col : int;
  length : int;
  kind : string;
> Js.t

let semantic_token_to_js (t : Language_service.semantic_token) : semantic_token_js =
  [%mel.obj {
    start_col = t.start_col;
    length = t.length;
    kind = token_kind_to_string t.kind;
  }]

let eval_input (env : Eval.env ref) (input_str : string) : result_obj =
  let lexbuf = Lexing.from_string input_str in
  let checkpoint = Parser.Incremental.input lexbuf.Lexing.lex_curr_p in
  match push_parse lexbuf (drain checkpoint) with
  | Error (msg, col) ->
    make_error msg col
  | Ok stmt ->
    match Eval.eval_statement !env stmt with
    | Ok (new_env, Eval.ExprResult v) ->
      env := new_env;
      make_expr_result v
    | Ok (new_env, Eval.BindResult (n, v)) ->
      env := new_env;
      make_bind_result n v
    | Error err ->
      make_error err.Eval.message err.Eval.column

(* セッションはenvをクロージャでキャプチャし、JS側にメソッドとして公開する。
   refで包んでいるのは、evalの呼び出しごとに変数束縛が蓄積されていくため。
   言語サービス (complete/diagnose/hover/tokens) は Calc_language_service に
   state を渡して問い合わせる。state.env と env は同じ値を保持するように同期する。
   %mel.objはMelangeのPPXで、OCamlのレコードをJSオブジェクトに変換する。 *)
let create_session () =
  let env = ref Eval.StringMap.empty in
  let ls_state = ref Calc_language_service.empty in
  let update_ls_state () = ls_state := Calc_language_service.of_env !env in
  [%mel.obj {
    eval = (fun (input : string) ->
      let input_str = String.trim input in
      if input_str = "" then
        make_error "Empty input" 0
      else begin
        let result = eval_input env input_str in
        update_ls_state ();
        result
      end);
    hints = (fun (input : string) ->
      let input_str = String.trim input in
      get_acceptable_tokens input_str
      |> Array.of_list);
    complete = (fun (input : string) (offset : int) ->
      Calc_language_service.complete (!ls_state) input offset
      |> List.map completion_to_js
      |> Array.of_list);
    diagnose = (fun (input : string) ->
      Calc_language_service.diagnose (!ls_state) input
      |> List.map diagnostic_to_js
      |> Array.of_list);
    hover = (fun (input : string) (offset : int) ->
      match Calc_language_service.hover (!ls_state) input offset with
      | Some h -> Js.Nullable.return (hover_to_js h)
      | None -> Js.Nullable.null);
    tokens = (fun (input : string) ->
      Calc_language_service.tokens input
      |> List.map semantic_token_to_js
      |> Array.of_list);
  }]
