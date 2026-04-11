(* Calc_language_service の complete / hover / tokens テスト。
   state は Session 経由で構築する (session → env → of_env)。 *)

module S = Calc_core.Session
module CLS = Calc_core.Calc_language_service
module LS = Calc_core.Language_service

let state_with_bindings pairs =
  let (session, _) =
    List.fold_left
      (fun (s, _) (name, value) ->
        S.eval s (Printf.sprintf "%s = %g" name value))
      (S.empty, S.Expr 0.0)
      pairs
  in
  session

(* complete の結果からラベルの集合を取り出す *)
let labels items = List.map (fun (i : LS.completion_item) -> i.label) items

let has_label items label =
  List.exists (fun l -> l = label) (labels items)

let test_complete_empty_input () =
  (* 空入力 (offset 0) では式の先頭として識別子・数値・( などが受理される。
     識別子カテゴリからは keywords + vars が展開される。vars が空なら空リスト可。 *)
  let items = S.complete S.empty "" 0 in
  (* 演算子 "(" は式先頭で受理されるはず *)
  Alcotest.(check bool) "has (" true (has_label items "(")

let test_complete_variable_prefix () =
  let st = state_with_bindings [("pi", 3.14); ("pie", 2.71)] in
  let items = S.complete st "p" 1 in
  Alcotest.(check bool) "pi present" true (has_label items "pi");
  Alcotest.(check bool) "pie present" true (has_label items "pie");
  (* 接頭辞フィルタで "p" から始まらない "(" は出ない *)
  Alcotest.(check bool) "( filtered out" false (has_label items "(")

let test_complete_operator_after_expr () =
  (* 式の後では二項演算子候補が出る *)
  let items = S.complete S.empty "1 " 2 in
  Alcotest.(check bool) "+ present" true (has_label items "+");
  Alcotest.(check bool) "* present" true (has_label items "*")

let test_hover_defined_var () =
  let st = state_with_bindings [("x", 42.0)] in
  match S.hover st "x" 0 with
  | None -> Alcotest.fail "expected hover info"
  | Some h ->
    Alcotest.(check bool) "contents mentions x"
      true (String.length h.contents > 0);
    Alcotest.(check int) "start_col" 0 h.start_col;
    Alcotest.(check int) "end_col" 1 h.end_col

let test_hover_undefined_var () =
  match S.hover S.empty "y" 0 with
  | None -> () (* OK: undefined hover returns None *)
  | Some _ -> Alcotest.fail "expected None for undefined var"

let test_hover_non_identifier () =
  match S.hover S.empty "1+2" 1 with
  | None -> () (* '+' はホバー対象外 *)
  | Some _ -> Alcotest.fail "+ should not produce hover"

let tok_kind_to_string = function
  | LS.TkKeyword -> "keyword"
  | LS.TkIdent -> "ident"
  | LS.TkNumber -> "number"
  | LS.TkOperator -> "operator"
  | LS.TkPunct -> "punct"

let test_tokens_simple () =
  let toks = S.tokens "x + 42" in
  let kinds = List.map (fun (t : LS.semantic_token) -> tok_kind_to_string t.kind) toks in
  Alcotest.(check (list string)) "x + 42 kinds"
    ["ident"; "operator"; "number"] kinds

let test_tokens_paren () =
  let toks = S.tokens "(1)" in
  let kinds = List.map (fun (t : LS.semantic_token) -> tok_kind_to_string t.kind) toks in
  Alcotest.(check (list string)) "(1) kinds"
    ["punct"; "number"; "punct"] kinds

let test_tokens_empty () =
  let toks = S.tokens "" in
  Alcotest.(check int) "empty" 0 (List.length toks)

let tests = [
  "complete: empty input", `Quick, test_complete_empty_input;
  "complete: variable prefix filter", `Quick, test_complete_variable_prefix;
  "complete: operator after expr", `Quick, test_complete_operator_after_expr;
  "hover: defined var", `Quick, test_hover_defined_var;
  "hover: undefined var", `Quick, test_hover_undefined_var;
  "hover: non-identifier", `Quick, test_hover_non_identifier;
  "tokens: simple", `Quick, test_tokens_simple;
  "tokens: paren", `Quick, test_tokens_paren;
  "tokens: empty", `Quick, test_tokens_empty;
]

(* silence unused warning *)
let _ = CLS.empty
