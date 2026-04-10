(* Menhir incremental API のパース駆動ユーティリティ。
   session.ml と calc_language_service.ml の共通基盤。 *)

module I = Parser.MenhirInterpreter

(* offer 後の内部シフト・リダクションを消化して、外部入力が必要な状態まで進める。 *)
let rec drain (checkpoint : 'a I.checkpoint) : 'a I.checkpoint =
  match checkpoint with
  | I.Shifting _ | I.AboutToReduce _ -> drain (I.resume checkpoint)
  | _ -> checkpoint

(* feed_tokens の戻り値型。FeedError はエラーメッセージとカラム位置を持つ。
   calc_language_service 側のようにエラー詳細が不要なケースでは
   FeedError の内容を無視すればよい。 *)
type 'a feed_result =
  | Fed of 'a
  | AtEof of Ast.statement I.checkpoint
  | FeedError of string * int

(* lexbuf からトークンを読み出してパーサーに供給する共通ループ。
   EOF を供給せず AtEof として返すことで、呼び出し側が EOF 到達時の
   振る舞いを自由に決定できるようにしている。 *)
let rec feed_tokens lexbuf (cp : Ast.statement I.checkpoint) : Ast.statement feed_result =
  match cp with
  | I.InputNeeded _ ->
    (try
       let token = Lexer.token lexbuf in
       if token = Parser.EOF then AtEof cp
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
