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

module I = Parser.MenhirInterpreter

(* Advance the parser through internal states (Shifting, AboutToReduce)
   until it needs input, accepts, or encounters an error. *)
let rec drain (checkpoint : 'a I.checkpoint) : 'a I.checkpoint =
  match checkpoint with
  | I.Shifting _ | I.AboutToReduce _ ->
    drain (I.resume checkpoint)
  | _ -> checkpoint

(* Push-based parser: the lexer drives the parser by feeding tokens one at a time. *)
let rec push_parse lexbuf (checkpoint : Ast.statement I.checkpoint) : (Ast.statement, string * int) result =
  match checkpoint with
  | I.InputNeeded _ ->
    (try
       let token = Lexer.token lexbuf in
       let startp = lexbuf.Lexing.lex_start_p in
       let endp = lexbuf.Lexing.lex_curr_p in
       let checkpoint = I.offer checkpoint (token, startp, endp) in
       push_parse lexbuf (drain checkpoint)
     with
     | Lexer.Lexer_error (msg, pos) ->
       Error (msg, pos.Lexing.pos_cnum))
  | I.Accepted v -> Ok v
  | I.HandlingError _ ->
    let pos = lexbuf.Lexing.lex_curr_p in
    Error ("Syntax error", pos.Lexing.pos_cnum)
  | I.Rejected -> Error ("Syntax error", 0)
  | I.Shifting _ | I.AboutToReduce _ ->
    push_parse lexbuf (drain checkpoint)

(* All token representatives with human-readable labels for hint display. *)
let all_tokens : (Parser.token * string) list = [
  (Parser.FLOAT 0.0, "number");
  (Parser.IDENT "", "identifier");
  (Parser.PLUS, "+");
  (Parser.MINUS, "-");
  (Parser.STAR, "*");
  (Parser.SLASH, "/");
  (Parser.LPAREN, "(");
  (Parser.RPAREN, ")");
  (Parser.EQUALS, "=");
  (Parser.EOF, "EOF");
]

(* Parse input as far as possible and return the set of acceptable next tokens. *)
let get_acceptable_tokens (input_str : string) : string list =
  let lexbuf = Lexing.from_string input_str in
  let checkpoint = Parser.Incremental.input lexbuf.Lexing.lex_curr_p in
  let rec feed cp =
    match cp with
    | I.InputNeeded _ ->
      (try
         let token = Lexer.token lexbuf in
         if token = Parser.EOF then
           collect_hints cp
         else
           let startp = lexbuf.Lexing.lex_start_p in
           let endp = lexbuf.Lexing.lex_curr_p in
           let cp' = I.offer cp (token, startp, endp) in
           feed (drain cp')
       with
       | Lexer.Lexer_error _ -> [])
    | I.Accepted _ -> []
    | I.HandlingError _ | I.Rejected -> []
    | I.Shifting _ | I.AboutToReduce _ -> feed (drain cp)
  and collect_hints cp =
    let pos = lexbuf.Lexing.lex_curr_p in
    List.filter_map (fun (tok, label) ->
      if I.acceptable cp tok pos then Some label else None
    ) all_tokens
  in
  feed (drain checkpoint)

let eval_input (env : Eval.env ref) (input_str : string) : result_obj =
  let lexbuf = Lexing.from_string input_str in
  let checkpoint = Parser.Incremental.input lexbuf.Lexing.lex_curr_p in
  match push_parse lexbuf (drain checkpoint) with
  | Error (msg, col) ->
    make_error msg col
  | Ok stmt ->
    match Eval.eval_statement !env stmt with
    | Ok (new_env, Eval.ExprResult v) ->
      env := new_env;
      make_expr_result v
    | Ok (new_env, Eval.BindResult (n, v)) ->
      env := new_env;
      make_bind_result n v
    | Error err ->
      make_error err.Eval.message err.Eval.column

let create_session () =
  let env = ref Eval.StringMap.empty in
  [%mel.obj {
    eval = (fun (input : string) ->
      let input_str = String.trim input in
      if input_str = "" then
        make_error "Empty input" 0
      else
        eval_input env input_str);
    hints = (fun (input : string) ->
      let input_str = String.trim input in
      get_acceptable_tokens input_str
      |> Array.of_list)
  }]
