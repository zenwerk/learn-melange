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

type 'a feed_result =
  | Fed of 'a
  | AtEof of Ast.statement I.checkpoint
  | FeedError of string * int

(* Feed tokens from lexbuf into the parser until it accepts, reaches EOF, or fails. *)
let rec feed_tokens lexbuf (cp : Ast.statement I.checkpoint) : Ast.statement feed_result =
  match cp with
  | I.InputNeeded _ ->
    (try
       let token = Lexer.token lexbuf in
       if token = Parser.EOF then
         AtEof cp
       else
         let startp = lexbuf.Lexing.lex_start_p in
         let endp = lexbuf.Lexing.lex_curr_p in
         feed_tokens lexbuf (drain (I.offer cp (token, startp, endp)))
     with
     | Lexer.Lexer_error (msg, pos) ->
       FeedError (msg, pos.Lexing.pos_cnum))
  | I.Accepted v -> Fed v
  | I.HandlingError _ ->
    let pos = lexbuf.Lexing.lex_curr_p in
    FeedError ("Syntax error", pos.Lexing.pos_cnum)
  | I.Rejected -> FeedError ("Syntax error", 0)
  | I.Shifting _ | I.AboutToReduce _ ->
    feed_tokens lexbuf (drain cp)

let push_parse lexbuf checkpoint : (Ast.statement, string * int) result =
  match feed_tokens lexbuf checkpoint with
  | Fed v -> Ok v
  | AtEof cp ->
    (* Feed EOF to complete the parse *)
    let pos = lexbuf.Lexing.lex_curr_p in
    (match feed_tokens lexbuf (drain (I.offer cp (Parser.EOF, pos, pos))) with
     | Fed v -> Ok v
     | AtEof _ -> Error ("Syntax error", 0)
     | FeedError (msg, col) -> Error (msg, col))
  | FeedError (msg, col) -> Error (msg, col)

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

let get_acceptable_tokens (input_str : string) : string list =
  let lexbuf = Lexing.from_string input_str in
  let checkpoint = Parser.Incremental.input lexbuf.Lexing.lex_curr_p in
  match feed_tokens lexbuf (drain checkpoint) with
  | AtEof cp ->
    let pos = lexbuf.Lexing.lex_curr_p in
    List.filter_map (fun (tok, label) ->
      if I.acceptable cp tok pos then Some label else None
    ) all_tokens
  | _ -> []

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
