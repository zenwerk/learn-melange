(* セッション状態と評価エントリポイント (純粋 OCaml)。
   JS 境界での [%mel.obj] 変換や create_session 組み立ては src/js_bridge.ml 側にある。 *)

open Parse_util

type t = {
  env : Eval.env;
  ls_state : Calc_language_service.state;
}

let empty : t = {
  env = Eval.StringMap.empty;
  ls_state = Calc_language_service.empty;
}

type eval_result =
  | Expr of float
  | Binding of string * float
  | Eval_error of { message : string; column : int }

(* 通常のパース。AtEof の場合は EOF トークンを明示的に供給して文法の終端を確定させる。
   incremental API は自動的に EOF を処理しないため、手動で渡す必要がある。 *)
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

let eval (session : t) (input : string) : t * eval_result =
  let input_str = String.trim input in
  if input_str = "" then
    (session, Eval_error { message = "Empty input"; column = 0 })
  else begin
    let lexbuf = Lexing.from_string input_str in
    let checkpoint = Parser.Incremental.input lexbuf.Lexing.lex_curr_p in
    match push_parse lexbuf (drain checkpoint) with
    | Error (msg, col) ->
      (session, Eval_error { message = msg; column = col })
    | Ok stmt ->
      (match Eval.eval_statement session.env stmt with
       | Ok (new_env, Eval.ExprResult v) ->
         let new_session = {
           env = new_env;
           ls_state = Calc_language_service.of_env new_env;
         } in
         (new_session, Expr v)
       | Ok (new_env, Eval.BindResult (n, v)) ->
         let new_session = {
           env = new_env;
           ls_state = Calc_language_service.of_env new_env;
         } in
         (new_session, Binding (n, v))
       | Error err ->
         (session, Eval_error { message = err.Eval.message; column = err.Eval.column }))
  end

(* ----- 言語サービス委譲 ----- *)

let complete (session : t) (input : string) (offset : int) =
  Calc_language_service.complete session.ls_state input offset

let diagnose (session : t) (input : string) =
  Calc_language_service.diagnose session.ls_state input

let hover (session : t) (input : string) (offset : int) =
  Calc_language_service.hover session.ls_state input offset

let tokens (input : string) =
  Calc_language_service.tokens input
