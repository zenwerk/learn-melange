let () =
  Alcotest.run "calc_core" [
    "Eval", Eval_test.tests;
    "Session", Session_test.tests;
    "LanguageService", Language_service_test.tests;
    "Protocol", Protocol_test.tests;
  ]
