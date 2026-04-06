/* Menhirで生成するLR(1)文法定義。
   --table フラグ付きでビルドすることで、incremental API が使えるようになり、
   push型パーサー（トークンを1つずつ外部から供給）やacceptableによるヒント生成が可能になる。 */
%{
  open Ast
%}

%token <float> FLOAT
%token <string> IDENT
%token PLUS MINUS STAR SLASH
%token LPAREN RPAREN
%token EQUALS
%token EOF

/* 演算子の優先順位と結合性。下にあるほど優先度が高い。
   %leftは左結合を意味し、 1-2-3 が (1-2)-3 と解釈される。 */
%left PLUS MINUS
%left STAR SLASH

%type <Ast.expr> expr

%start <Ast.statement> input

%%

/* 入力は「代入文」か「式」のいずれか。IDENTの後にEQUALSが来るかどうかで分岐する。
   LR(1)パーサーはIDENTを読んだ後、次のトークン(=か演算子か)を先読みして判断する。
   この先読みのおかげで、get_acceptable_tokensでIDENT入力後に=が候補に出る。 */
input:
  | name = IDENT; EQUALS; e = expr; EOF { Assign (name, e) }
  | e = expr; EOF                       { Expr (e) }
  ;

expr:
  | lhs = expr; PLUS; rhs = expr   { BinOp (Add, lhs, rhs) }
  | lhs = expr; MINUS; rhs = expr  { BinOp (Sub, lhs, rhs) }
  | lhs = expr; STAR; rhs = expr   { BinOp (Mul, lhs, rhs) }
  | lhs = expr; SLASH; rhs = expr  { BinOp (Div, lhs, rhs) }
  /* 単項マイナス。%prec STARで乗除と同じ優先度を与え、 -2+3 が (-2)+3 になるようにする。
     ASTノードを増やさず BinOp(Sub, 0.0, e) で表現している。 */
  | MINUS; e = expr %prec STAR     { BinOp (Sub, Float 0.0, e) }
  | LPAREN; e = expr; RPAREN       { e }
  | f = FLOAT                      { Float (f) }
  | name = IDENT                   { Var (name) }
  ;
