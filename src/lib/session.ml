open Parse_util

type t = { env : Eval.env }

let empty : t = { env = Eval.StringMap.empty }

type eval_result =
  | Expr of float
  | Binding of string * float
  | Eval_error of { message : string; column : int }

(* AtEof を受けたら EOF を明示的に feed しないと文法が閉じない。
   Menhir の incremental API は自動で EOF を入れないため。 *)
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
      match Eval.eval_statement session.env stmt with
      | Error err ->
        (session, Eval_error { message = err.Eval.message; column = err.Eval.column })
      | Ok (new_env, payload) ->
        let next = { env = new_env } in
        let result = match payload with
          | Eval.ExprResult v -> Expr v
          | Eval.BindResult (n, v) -> Binding (n, v)
        in
        (next, result)
  end

let ls_state (session : t) = Calc_language_service.of_env session.env

let complete session input offset =
  Calc_language_service.complete (ls_state session) input offset

let diagnose session input =
  Calc_language_service.diagnose (ls_state session) input

let hover session input offset =
  Calc_language_service.hover (ls_state session) input offset

let tokens input = Calc_language_service.tokens input
