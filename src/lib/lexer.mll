{
  exception Lexer_error of string * Lexing.position
}

let digit = ['0'-'9']
let alpha = ['a'-'z' 'A'-'Z' '_']
let ident = alpha (alpha | digit)*
let float_lit = digit+ ('.' digit*)? | '.' digit+

rule token = parse
  | [' ' '\t']    { token lexbuf }
  | float_lit     { Token.FLOAT (float_of_string (Lexing.lexeme lexbuf)) }
  | ident         { Token.IDENT (Lexing.lexeme lexbuf) }
  | '+'           { Token.PLUS }
  | '-'           { Token.MINUS }
  | '*'           { Token.STAR }
  | '/'           { Token.SLASH }
  | '('           { Token.LPAREN }
  | ')'           { Token.RPAREN }
  | '='           { Token.EQUALS }
  | eof           { Token.EOF }
  | _ as c        { raise (Lexer_error (
                      Printf.sprintf "Unexpected character: '%c'" c,
                      lexbuf.Lexing.lex_curr_p)) }
