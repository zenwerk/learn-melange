module StringMap = Map.Make (String)

type env = float StringMap.t

type value =
  | ExprResult of float
  | BindResult of string * float

type error = {
  message : string;
  column : int;
}

let rec eval_expr (env : env) (expr : Ast.expr) : (float, string) result =
  match expr with
  | Ast.Float f -> Ok f
  | Ast.Var name ->
    (match StringMap.find_opt name env with
     | Some v -> Ok v
     | None -> Error (Printf.sprintf "Undefined variable: %s" name))
  | Ast.BinOp (op, lhs, rhs) ->
    (match eval_expr env lhs, eval_expr env rhs with
     | Ok l, Ok r ->
       (match op with
        | Ast.Add -> Ok (l +. r)
        | Ast.Sub -> Ok (l -. r)
        | Ast.Mul -> Ok (l *. r)
        | Ast.Div ->
          if r = 0.0 then Error "Division by zero"
          else Ok (l /. r))
     | Error e, _ | _, Error e -> Error e)

let eval_statement (env : env) (stmt : Ast.statement) : (env * value, error) result =
  match stmt with
  | Ast.Expr e ->
    (match eval_expr env e with
     | Ok v -> Ok (env, ExprResult v)
     | Error msg -> Error { message = msg; column = 0 })
  | Ast.Assign (name, e) ->
    (match eval_expr env e with
     | Ok v ->
       let env' = StringMap.add name v env in
       Ok (env', BindResult (name, v))
     | Error msg -> Error { message = msg; column = 0 })
