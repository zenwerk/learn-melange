(* Protocol.handle のディスパッチが 5 variants すべて動くことを確認。
   各 variant が期待どおりのレスポンス variant を返すかだけ見る。 *)

module P = Calc_core.Protocol
module S = Calc_core.Session

let float_t = Alcotest.float 1e-9

let test_eval () =
  let (_, resp) = P.handle S.empty (P.Eval "1 + 2") in
  match resp with
  | P.REval (S.Expr v) -> Alcotest.check float_t "1+2" 3.0 v
  | _ -> Alcotest.fail "expected REval/Expr"

let test_complete () =
  let (_, resp) = P.handle S.empty (P.Complete { input = ""; offset = 0 }) in
  match resp with
  | P.RComplete items -> Alcotest.(check bool) "non-empty" true (items <> [])
  | _ -> Alcotest.fail "expected RComplete"

let test_diagnose () =
  let (_, resp) = P.handle S.empty (P.Diagnose "1 + 2") in
  match resp with
  | P.RDiagnose _ -> ()
  | _ -> Alcotest.fail "expected RDiagnose"

let test_hover_none () =
  let (_, resp) = P.handle S.empty (P.Hover { input = "x"; offset = 0 }) in
  match resp with
  | P.RHover None -> ()
  | P.RHover (Some _) -> Alcotest.fail "unexpected Some"
  | _ -> Alcotest.fail "expected RHover"

let test_hover_some () =
  let (s1, _) = P.handle S.empty (P.Eval "x = 10") in
  let (_, resp) = P.handle s1 (P.Hover { input = "x"; offset = 0 }) in
  match resp with
  | P.RHover (Some _) -> ()
  | _ -> Alcotest.fail "expected RHover Some"

let test_tokens () =
  let (_, resp) = P.handle S.empty (P.Tokens "x + 1") in
  match resp with
  | P.RTokens toks -> Alcotest.(check int) "3 tokens" 3 (List.length toks)
  | _ -> Alcotest.fail "expected RTokens"

let test_state_passthrough_non_eval () =
  (* Eval 以外は state を変更しない *)
  let (s1, _) = P.handle S.empty (P.Eval "x = 5") in
  let (s2, _) = P.handle s1 (P.Complete { input = "x"; offset = 1 }) in
  let (_, resp) = P.handle s2 (P.Eval "x") in
  match resp with
  | P.REval (S.Expr v) -> Alcotest.check float_t "x" 5.0 v
  | _ -> Alcotest.fail "x lost after Complete"

let tests = [
  "handle: Eval", `Quick, test_eval;
  "handle: Complete", `Quick, test_complete;
  "handle: Diagnose", `Quick, test_diagnose;
  "handle: Hover None", `Quick, test_hover_none;
  "handle: Hover Some after binding", `Quick, test_hover_some;
  "handle: Tokens", `Quick, test_tokens;
  "handle: non-Eval preserves state", `Quick, test_state_passthrough_non_eval;
]
