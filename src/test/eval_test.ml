(* Eval 単体。式の値と束縛、エラーケースの確認。 *)

module E = Calc_core.Eval
module A = Calc_core.Ast

let float_t = Alcotest.float 1e-9

let eval_ok env expr =
  match E.eval_expr env expr with
  | Ok v -> v
  | Error msg -> Alcotest.failf "expected Ok, got Error %S" msg

let eval_err env expr =
  match E.eval_expr env expr with
  | Ok v -> Alcotest.failf "expected Error, got Ok %g" v
  | Error msg -> msg

let test_float () =
  Alcotest.check float_t "literal" 3.14 (eval_ok E.StringMap.empty (A.Float 3.14))

let test_binop () =
  let env = E.StringMap.empty in
  Alcotest.check float_t "1+2"
    3.0 (eval_ok env (A.BinOp (A.Add, A.Float 1.0, A.Float 2.0)));
  Alcotest.check float_t "10-4"
    6.0 (eval_ok env (A.BinOp (A.Sub, A.Float 10.0, A.Float 4.0)));
  Alcotest.check float_t "3*4"
    12.0 (eval_ok env (A.BinOp (A.Mul, A.Float 3.0, A.Float 4.0)));
  Alcotest.check float_t "20/5"
    4.0 (eval_ok env (A.BinOp (A.Div, A.Float 20.0, A.Float 5.0)))

let test_var_lookup () =
  let env = E.StringMap.add "x" 42.0 E.StringMap.empty in
  Alcotest.check float_t "x" 42.0 (eval_ok env (A.Var "x"))

let test_unknown_var () =
  let msg = eval_err E.StringMap.empty (A.Var "missing") in
  Alcotest.(check bool) "message mentions name"
    true (String.length msg > 0 && String.length msg >= 9)

let test_div_by_zero () =
  let msg = eval_err E.StringMap.empty (A.BinOp (A.Div, A.Float 1.0, A.Float 0.0)) in
  Alcotest.(check string) "division by zero" "Division by zero" msg

let test_assign_updates_env () =
  match E.eval_statement E.StringMap.empty (A.Assign ("pi", A.Float 3.14)) with
  | Ok (env', E.BindResult ("pi", v)) ->
    Alcotest.check float_t "bound value" 3.14 v;
    Alcotest.check float_t "env has pi" 3.14 (E.StringMap.find "pi" env')
  | _ -> Alcotest.fail "expected BindResult"

let test_assign_then_expr () =
  (* pi = 3.14; pi * 2 の 2 段ステップを想定 *)
  match E.eval_statement E.StringMap.empty (A.Assign ("pi", A.Float 3.14)) with
  | Ok (env1, _) ->
    (match E.eval_statement env1 (A.Expr (A.BinOp (A.Mul, A.Var "pi", A.Float 2.0))) with
     | Ok (_, E.ExprResult v) -> Alcotest.check float_t "pi*2" 6.28 v
     | _ -> Alcotest.fail "expected ExprResult")
  | _ -> Alcotest.fail "first step failed"

let tests = [
  "literal float", `Quick, test_float;
  "binary ops", `Quick, test_binop;
  "var lookup", `Quick, test_var_lookup;
  "unknown var error", `Quick, test_unknown_var;
  "division by zero", `Quick, test_div_by_zero;
  "assign updates env", `Quick, test_assign_updates_env;
  "assign then expr", `Quick, test_assign_then_expr;
]
