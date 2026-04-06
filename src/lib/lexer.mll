(* ocamllexによるレキサー定義。Menhirのパーサーが定義するトークン型を直接使う。
   Lexer_errorに位置情報を含めているのは、session.mlのfeed_tokensでエラー箇所を
   UI側に伝えるため。 *)
{
  open Parser

  exception Lexer_error of string * Lexing.position
}

(* float_litは "42", "3.14", ".5" を受理する。整数リテラルは独立した型を持たず、
   すべてfloatとして扱う（電卓として十分なため）。 *)
let digit = ['0'-'9']
let alpha = ['a'-'z' 'A'-'Z' '_']
let ident = alpha (alpha | digit)*
let float_lit = digit+ ('.' digit*)? | '.' digit+

rule token = parse
  | [' ' '\t']    { token lexbuf }  (* 空白はスキップ。改行は扱わない（1行入力のREPLのため） *)
  | float_lit     { FLOAT (float_of_string (Lexing.lexeme lexbuf)) }
  | ident         { IDENT (Lexing.lexeme lexbuf) }
  | '+'           { PLUS }
  | '-'           { MINUS }
  | '*'           { STAR }
  | '/'           { SLASH }
  | '('           { LPAREN }
  | ')'           { RPAREN }
  | '='           { EQUALS }
  | eof           { EOF }
  | _ as c        { raise (Lexer_error (
                      Printf.sprintf "Unexpected character: '%c'" c,
                      lexbuf.Lexing.lex_curr_p)) }
