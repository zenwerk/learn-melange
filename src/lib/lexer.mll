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
let ascii_alpha = ['a'-'z' 'A'-'Z' '_']

(* UTF-8 のマルチバイトシーケンス。ocamllex はバイト単位でしか照合できないため、
   先頭バイト + 継続バイトを明示的に組み合わせて 1 文字分を表す。これにより
   'あ' や '⊗' のような非 ASCII 文字を識別子として受理できる。 *)
let utf8_cont  = ['\x80'-'\xBF']
let utf8_char  =
    ['\xC2'-'\xDF'] utf8_cont                           (* 2 バイト *)
  | ['\xE0'-'\xEF'] utf8_cont utf8_cont                 (* 3 バイト *)
  | ['\xF0'-'\xF4'] utf8_cont utf8_cont utf8_cont       (* 4 バイト *)

let ident_start = ascii_alpha | utf8_char
let ident_cont  = ident_start | digit
let ident       = ident_start ident_cont*
let float_lit   = digit+ ('.' digit*)? | '.' digit+

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
  (* 未知文字のエラー報告は Lexing.lexeme でマルチバイトも安全に含められる形にする。
     '%c' では UTF-8 の先頭バイトしか取り出せず、壊れた文字列が露出してしまう。 *)
  | _             { raise (Lexer_error (
                      Printf.sprintf "Unexpected character: '%s'" (Lexing.lexeme lexbuf),
                      lexbuf.Lexing.lex_curr_p)) }
