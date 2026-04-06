(* 変数環境を不変マップで表現。eval_statementは常に新しいenvを返すため、
   環境の変更履歴を保持したい場合は呼び出し側で古いenvを保存できる。 *)
module StringMap = Map.Make (String)

type env = float StringMap.t

type value =
  | ExprResult of float
  | BindResult of string * float

type error = {
  message : string;
  column : int;
}

(* 式の評価は副作用を持たず、環境を変更しない。
   エラーはresult型で伝播し、二項演算では左辺を先に評価する。 *)
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

(* 文の評価は新しい環境を返す。Assignの場合のみ環境が変わる。
   戻り値にenv含めているのは、呼び出し側が環境の更新を明示的に制御するため。 *)
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
