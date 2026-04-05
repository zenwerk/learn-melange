{
  open Parser

  exception Lexer_error of string * Lexing.position
}

let digit = ['0'-'9']
let alpha = ['a'-'z' 'A'-'Z' '_']
let ident = alpha (alpha | digit)*
let float_lit = digit+ ('.' digit*)? | '.' digit+

rule token = parse
  | [' ' '\t']    { token lexbuf }
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
