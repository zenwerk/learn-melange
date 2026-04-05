%{
  open Ast
%}

%token <float> FLOAT
%token <string> IDENT
%token PLUS MINUS STAR SLASH
%token LPAREN RPAREN
%token EQUALS
%token EOF

%left PLUS MINUS
%left STAR SLASH

%type <Ast.expr> expr

%start <Ast.statement> input

%%

input:
  | name = IDENT; EQUALS; e = expr; EOF { Assign (name, e) }
  | e = expr; EOF                       { Expr (e) }
  ;

expr:
  | lhs = expr; PLUS; rhs = expr   { BinOp (Add, lhs, rhs) }
  | lhs = expr; MINUS; rhs = expr  { BinOp (Sub, lhs, rhs) }
  | lhs = expr; STAR; rhs = expr   { BinOp (Mul, lhs, rhs) }
  | lhs = expr; SLASH; rhs = expr  { BinOp (Div, lhs, rhs) }
  | MINUS; e = expr %prec STAR     { BinOp (Sub, Float 0.0, e) }
  | LPAREN; e = expr; RPAREN       { e }
  | f = FLOAT                      { Float (f) }
  | name = IDENT                   { Var (name) }
  ;
