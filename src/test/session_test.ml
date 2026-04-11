(* Session.eval の end-to-end: 文字列入力 → 結果 variant *)

module S = Calc_core.Session

let float_t = Alcotest.float 1e-9

let expect_expr ~input expected =
  let (_, result) = S.eval S.empty input in
  match result with
  | S.Expr v -> Alcotest.check float_t input expected v
  | S.Binding (n, v) ->
    Alcotest.failf "expected Expr, got Binding (%s, %g)" n v
  | S.Eval_error { message; _ } ->
    Alcotest.failf "expected Expr, got Error %S" message

let expect_binding ~input name expected =
  let (_, result) = S.eval S.empty input in
  match result with
  | S.Binding (n, v) ->
    Alcotest.(check string) "name" name n;
    Alcotest.check float_t "value" expected v
  | _ -> Alcotest.failf "expected Binding for %S" input

let expect_error ~input =
  let (_, result) = S.eval S.empty input in
  match result with
  | S.Eval_error { message; _ } ->
    Alcotest.(check bool) "error message non-empty"
      true (String.length message > 0)
  | _ -> Alcotest.failf "expected Error for %S" input

let test_simple_expr () = expect_expr ~input:"1+2" 3.0
let test_precedence () = expect_expr ~input:"2+3*4" 14.0
let test_paren () = expect_expr ~input:"(2+3)*4" 20.0
let test_unary_minus () = expect_expr ~input:"-2+5" 3.0
let test_decimal () = expect_expr ~input:"0.5+0.25" 0.75

let test_assignment () = expect_binding ~input:"x = 42" "x" 42.0
let test_assignment_expr () = expect_binding ~input:"y = 1+2*3" "y" 7.0

let test_empty_input () = expect_error ~input:""
let test_syntax_error () = expect_error ~input:"1 +"
let test_unknown_var () = expect_error ~input:"foo + 1"
let test_div_zero () = expect_error ~input:"1 / 0"

let test_state_persists () =
  let (s1, _) = S.eval S.empty "pi = 3.14" in
  let (_, r) = S.eval s1 "pi * 2" in
  match r with
  | S.Expr v -> Alcotest.check float_t "pi*2" 6.28 v
  | _ -> Alcotest.fail "state did not persist"

let test_state_isolated_on_error () =
  let (s1, _) = S.eval S.empty "x = 10" in
  let (s2, _) = S.eval s1 "1 / 0" in
  (* s2 must still know x *)
  let (_, r) = S.eval s2 "x" in
  match r with
  | S.Expr v -> Alcotest.check float_t "x survives error" 10.0 v
  | _ -> Alcotest.fail "error wiped state"

let tests = [
  "expr: simple", `Quick, test_simple_expr;
  "expr: precedence", `Quick, test_precedence;
  "expr: paren", `Quick, test_paren;
  "expr: unary minus", `Quick, test_unary_minus;
  "expr: decimal", `Quick, test_decimal;
  "binding: simple", `Quick, test_assignment;
  "binding: expression rhs", `Quick, test_assignment_expr;
  "error: empty input", `Quick, test_empty_input;
  "error: syntax error", `Quick, test_syntax_error;
  "error: unknown variable", `Quick, test_unknown_var;
  "error: division by zero", `Quick, test_div_zero;
  "state persists across eval", `Quick, test_state_persists;
  "state preserved on error", `Quick, test_state_isolated_on_error;
]
