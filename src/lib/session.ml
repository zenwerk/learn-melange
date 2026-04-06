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

(* Menhirのincremental APIでは、offer後にパーサーが内部的なシフト・リダクションを
   複数回行うことがある。drainはそれらを消化して、外部入力が必要な状態まで進める。
   これにより呼び出し側は「次のトークンを渡す」か「結果を受け取る」の2択に集中できる。 *)
let rec drain (checkpoint : 'a I.checkpoint) : 'a I.checkpoint =
  match checkpoint with
  | I.Shifting _ | I.AboutToReduce _ ->
    drain (I.resume checkpoint)
  | _ -> checkpoint

(* feed_tokensの戻り値型。EOFを特別扱いするのは、
   push_parse（EOFを供給して完了させる）と get_acceptable_tokens（EOFの手前で
   チェックポイントを検査する）で、EOF到達時の処理が異なるため。 *)
type 'a feed_result =
  | Fed of 'a
  | AtEof of Ast.statement I.checkpoint
  | FeedError of string * int

(* lexbufからトークンを読み出してパーサーに供給する共通ループ。
   EOFを供給せずAtEofとして返すことで、呼び出し側がEOF到達時の
   振る舞いを自由に決定できるようにしている。 *)
let rec feed_tokens lexbuf (cp : Ast.statement I.checkpoint) : Ast.statement feed_result =
  match cp with
  | I.InputNeeded _ ->
    (try
       let token = Lexer.token lexbuf in
       if token = Parser.EOF then
         AtEof cp
       else
         let startp = lexbuf.Lexing.lex_start_p in
         let endp = lexbuf.Lexing.lex_curr_p in
         feed_tokens lexbuf (drain (I.offer cp (token, startp, endp)))
     with
     | Lexer.Lexer_error (msg, pos) ->
       FeedError (msg, pos.Lexing.pos_cnum))
  | I.Accepted v -> Fed v
  | I.HandlingError _ ->
    let pos = lexbuf.Lexing.lex_curr_p in
    FeedError ("Syntax error", pos.Lexing.pos_cnum)
  | I.Rejected -> FeedError ("Syntax error", 0)
  | I.Shifting _ | I.AboutToReduce _ ->
    feed_tokens lexbuf (drain cp)

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
   %mel.objはMelangeのPPXで、OCamlのレコードをJSオブジェクトに変換する。 *)
let create_session () =
  let env = ref Eval.StringMap.empty in
  [%mel.obj {
    eval = (fun (input : string) ->
      let input_str = String.trim input in
      if input_str = "" then
        make_error "Empty input" 0
      else
        eval_input env input_str);
    hints = (fun (input : string) ->
      let input_str = String.trim input in
      get_acceptable_tokens input_str
      |> Array.of_list)
  }]
