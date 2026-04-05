
(* The type of tokens. *)

type token = 
  | STAR
  | SLASH
  | RPAREN
  | PLUS
  | MINUS
  | LPAREN
  | IDENT of (string)
  | FLOAT of (float)
  | EQUALS
  | EOF

(* This exception is raised by the monolithic API functions. *)

exception Error

(* The monolithic API. *)

val input: (Lexing.lexbuf -> token) -> Lexing.lexbuf -> (Ast.statement)
