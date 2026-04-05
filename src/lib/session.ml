type result_obj = <
  success : bool;
  kind : string;
  name : string Js.Nullable.t;
  value : float Js.Nullable.t;
  error_message : string Js.Nullable.t;
  error_column : int Js.Nullable.t;
> Js.t

let make_expr_result (v : float) : result_obj =
  [%mel.obj {
    success = true;
    kind = "expr";
    name = Js.Nullable.null;
    value = Js.Nullable.return v;
    error_message = Js.Nullable.null;
    error_column = Js.Nullable.null;
  }]

let make_bind_result (n : string) (v : float) : result_obj =
  [%mel.obj {
    success = true;
    kind = "binding";
    name = Js.Nullable.return n;
    value = Js.Nullable.return v;
    error_message = Js.Nullable.null;
    error_column = Js.Nullable.null;
  }]

let make_error (msg : string) (col : int) : result_obj =
  [%mel.obj {
    success = false;
    kind = "error";
    name = Js.Nullable.null;
    value = Js.Nullable.null;
    error_message = Js.Nullable.return msg;
    error_column = Js.Nullable.return col;
  }]

let eval_input (env : Eval.env ref) (input_str : string) : result_obj =
  let lexbuf = Lexing.from_string input_str in
  try
    let stmt = Parser.parse_input lexbuf in
    match Eval.eval_statement !env stmt with
    | Ok (new_env, Eval.ExprResult v) ->
      env := new_env;
      make_expr_result v
    | Ok (new_env, Eval.BindResult (n, v)) ->
      env := new_env;
      make_bind_result n v
    | Error err ->
      make_error err.Eval.message err.Eval.column
  with
  | Lexer.Lexer_error (msg, pos) ->
    make_error msg pos.Lexing.pos_cnum
  | Parser.Parse_error (msg, col) ->
    make_error msg col

let create_session () =
  let env = ref Eval.StringMap.empty in
  [%mel.obj {
    eval = fun (input : string) ->
      let input_str = String.trim input in
      if input_str = "" then
        make_error "Empty input" 0
      else
        eval_input env input_str
  }]
