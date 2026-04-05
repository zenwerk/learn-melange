type op = Add | Sub | Mul | Div

type expr =
  | Float of float
  | Var of string
  | BinOp of op * expr * expr

type statement =
  | Expr of expr
  | Assign of string * expr
