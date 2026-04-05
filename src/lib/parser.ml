exception Parse_error of string * int

type state = {
  lexbuf : Lexing.lexbuf;
  mutable current : Token.t;
}

let make_state lexbuf =
  let tok = Lexer.token lexbuf in
  { lexbuf; current = tok }

let advance s =
  s.current <- Lexer.token s.lexbuf

let current_pos s =
  s.lexbuf.Lexing.lex_start_p.Lexing.pos_cnum

let error s msg =
  raise (Parse_error (msg, current_pos s))

let expect s tok =
  if s.current = tok then advance s
  else error s (Printf.sprintf "Expected token")

(* expr = additive *)
(* additive = multiplicative (('+' | '-') multiplicative)* *)
(* multiplicative = unary (('*' | '/') unary)* *)
(* unary = '-' unary | primary *)
(* primary = FLOAT | IDENT | '(' expr ')' *)

let rec parse_expr s =
  parse_additive s

and parse_additive s =
  let lhs = ref (parse_multiplicative s) in
  let continue = ref true in
  while !continue do
    match s.current with
    | Token.PLUS ->
      advance s;
      let rhs = parse_multiplicative s in
      lhs := Ast.BinOp (Ast.Add, !lhs, rhs)
    | Token.MINUS ->
      advance s;
      let rhs = parse_multiplicative s in
      lhs := Ast.BinOp (Ast.Sub, !lhs, rhs)
    | _ -> continue := false
  done;
  !lhs

and parse_multiplicative s =
  let lhs = ref (parse_unary s) in
  let continue = ref true in
  while !continue do
    match s.current with
    | Token.STAR ->
      advance s;
      let rhs = parse_unary s in
      lhs := Ast.BinOp (Ast.Mul, !lhs, rhs)
    | Token.SLASH ->
      advance s;
      let rhs = parse_unary s in
      lhs := Ast.BinOp (Ast.Div, !lhs, rhs)
    | _ -> continue := false
  done;
  !lhs

and parse_unary s =
  match s.current with
  | Token.MINUS ->
    advance s;
    let e = parse_unary s in
    Ast.BinOp (Ast.Sub, Ast.Float 0.0, e)
  | _ -> parse_primary s

and parse_primary s =
  match s.current with
  | Token.FLOAT f ->
    advance s;
    Ast.Float f
  | Token.IDENT name ->
    advance s;
    Ast.Var name
  | Token.LPAREN ->
    advance s;
    let e = parse_expr s in
    expect s Token.RPAREN;
    e
  | _ ->
    error s "Unexpected token"

let parse_input (lexbuf : Lexing.lexbuf) : Ast.statement =
  let s = make_state lexbuf in
  match s.current with
  | Token.IDENT name ->
    let _pos = current_pos s in
    advance s;
    (match s.current with
     | Token.EQUALS ->
       advance s;
       let e = parse_expr s in
       if s.current <> Token.EOF then
         error s "Expected end of input";
       Ast.Assign (name, e)
     | _ ->
       (* Backtrack: treat IDENT as start of expr *)
       let lhs = ref (Ast.Var name) in
       (* Continue parsing as if we're in additive *)
       let continue_mul = ref true in
       (* First handle any multiplicative ops that might follow the ident *)
       while !continue_mul do
         match s.current with
         | Token.STAR ->
           advance s;
           let rhs = parse_unary s in
           lhs := Ast.BinOp (Ast.Mul, !lhs, rhs)
         | Token.SLASH ->
           advance s;
           let rhs = parse_unary s in
           lhs := Ast.BinOp (Ast.Div, !lhs, rhs)
         | _ -> continue_mul := false
       done;
       (* Then handle additive ops *)
       let continue_add = ref true in
       while !continue_add do
         match s.current with
         | Token.PLUS ->
           advance s;
           let rhs = parse_multiplicative s in
           lhs := Ast.BinOp (Ast.Add, !lhs, rhs)
         | Token.MINUS ->
           advance s;
           let rhs = parse_multiplicative s in
           lhs := Ast.BinOp (Ast.Sub, !lhs, rhs)
         | _ -> continue_add := false
       done;
       if s.current <> Token.EOF then
         error s "Expected end of input";
       Ast.Expr !lhs)
  | _ ->
    let e = parse_expr s in
    if s.current <> Token.EOF then
      error s "Expected end of input";
    Ast.Expr e
