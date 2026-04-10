(* 電卓言語向けの言語サービス実装。
   Language_service.LANGUAGE_SERVICE シグネチャを満たし、将来別言語を
   追加するときは同じシグネチャで別モジュールを作ればよい。 *)

open Language_service

type state = {
  env : Eval.env;
}

let empty = { env = Eval.StringMap.empty }

let of_env (env : Eval.env) : state = { env }

(* 予約語テーブル。電卓には現状予約語はないが、将来 sin/cos/let 等を
   追加するときここに追記するだけで補完候補に自動で載る。 *)
let keywords : (string * string option) list = [
  (* (label, detail) *)
]

(* ----- 接頭辞抽出 ----- *)

let is_ident_start c =
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c = '_'

let is_ident_cont c =
  is_ident_start c || (c >= '0' && c <= '9')

(* offset 直前まで遡って識別子を構成する接頭辞の開始位置を返す。
   接頭辞がない場合は offset を返す (= 長さ 0 の接頭辞)。 *)
let find_prefix_start (input : string) (offset : int) : int =
  let len = String.length input in
  let off = if offset < 0 then 0 else if offset > len then len else offset in
  let rec loop i =
    if i <= 0 then 0
    else if is_ident_cont input.[i - 1] then loop (i - 1)
    else i
  in
  let start = loop off in
  (* 先頭文字が ident_start でなければ空接頭辞扱い (数字だけのトークンは除外) *)
  if start < off && is_ident_start input.[start] then start
  else off

module I = Parser.MenhirInterpreter
open Parse_util

(* token kind ラベルと「候補に展開するときの表示名・詳細」を対応づける。
   IDENT / FLOAT はカテゴリなので複数候補に展開される (後段で処理)。 *)
type token_spec =
  | TkSymbol of Parser.token * string   (* 1 候補 = そのラベル *)
  | TkIdentCat                            (* IDENT カテゴリ → keywords + vars *)
  | TkFloatCat                            (* FLOAT カテゴリ → 候補化しない *)

let token_specs : token_spec list = [
  TkSymbol (Parser.PLUS, "+");
  TkSymbol (Parser.MINUS, "-");
  TkSymbol (Parser.STAR, "*");
  TkSymbol (Parser.SLASH, "/");
  TkSymbol (Parser.LPAREN, "(");
  TkSymbol (Parser.RPAREN, ")");
  TkSymbol (Parser.EQUALS, "=");
  TkIdentCat;
  TkFloatCat;
]

(* acceptable 判定のためのダミートークン *)
let dummy_ident = Parser.IDENT ""
let dummy_float = Parser.FLOAT 0.0

(* チェックポイントで各 token_spec が受理されるか判定 *)
let acceptable_specs (cp : Ast.statement I.checkpoint) (pos : Lexing.position)
    : token_spec list =
  List.filter (fun spec ->
      match spec with
      | TkSymbol (tok, _) -> I.acceptable cp tok pos
      | TkIdentCat -> I.acceptable cp dummy_ident pos
      | TkFloatCat -> I.acceptable cp dummy_float pos
    ) token_specs

(* ----- 候補生成 ----- *)

let variable_items (env : Eval.env) : completion_item list =
  Eval.StringMap.bindings env
  |> List.map (fun (name, v) ->
      { label = name;
        kind = CkVariable;
        detail = Some (Printf.sprintf "float = %g" v) })

let keyword_items () : completion_item list =
  List.map (fun (label, detail) ->
      { label; kind = CkKeyword; detail }) keywords

let symbol_item label : completion_item =
  { label; kind = CkOperator; detail = None }

(* 接頭辞 (空文字列も可) で前方一致フィルタ *)
let has_prefix ~prefix (s : string) : bool =
  let pl = String.length prefix in
  pl = 0 ||
  (String.length s >= pl && String.sub s 0 pl = prefix)

let complete (st : state) (input : string) (offset : int) : completion_item list =
  let prefix_start = find_prefix_start input offset in
  let prefix = String.sub input prefix_start (offset - prefix_start) in
  (* 部分パースは「接頭辞を含まない」テキストで実行する。
     未完了接頭辞は LR パーサ的には次の候補選択の判断材料にならないため。 *)
  let head = String.sub input 0 prefix_start in
  let lexbuf = Lexing.from_string head in
  let cp = Parser.Incremental.input lexbuf.Lexing.lex_curr_p in
  let specs =
    match feed_tokens lexbuf (drain cp) with
    | AtEof cp ->
      let pos = lexbuf.Lexing.lex_curr_p in
      acceptable_specs cp pos
    | Fed _ | FeedError _ -> []
  in
  (* 種別ごとに候補を展開 *)
  let items =
    List.concat_map (fun spec ->
        match spec with
        | TkSymbol (_, label) -> [symbol_item label]
        | TkIdentCat -> keyword_items () @ variable_items st.env
        | TkFloatCat -> []  (* 数値は候補化しない *)
      ) specs
  in
  (* 接頭辞フィルタ + ラベル重複除去 *)
  let seen = Hashtbl.create 16 in
  List.filter (fun item ->
      if Hashtbl.mem seen item.label then false
      else if not (has_prefix ~prefix item.label) then false
      else (Hashtbl.add seen item.label (); true)
    ) items

(* ----- diagnose / hover / tokens ----- *)

let diagnose (_st : state) (_input : string) : diagnostic list =
  (* 診断はまず枠だけ。実エラーは Session.eval_input 経由で出している。
     将来 LSP 化する際にここへ集約する。 *)
  []

(* offset 位置のシンボルを取り出す (identifier 前後両方に拡張) *)
let find_word_range (input : string) (offset : int) : (int * int) option =
  let len = String.length input in
  let off = if offset < 0 then 0 else if offset > len then len else offset in
  let rec back i =
    if i <= 0 then 0
    else if is_ident_cont input.[i - 1] then back (i - 1)
    else i
  in
  let rec fwd i =
    if i >= len then len
    else if is_ident_cont input.[i] then fwd (i + 1)
    else i
  in
  let s = back off and e = fwd off in
  if s < e && is_ident_start input.[s] then Some (s, e) else None

let hover (st : state) (input : string) (offset : int) : hover_info option =
  match find_word_range input offset with
  | None -> None
  | Some (s, e) ->
    let name = String.sub input s (e - s) in
    (match Eval.StringMap.find_opt name st.env with
     | Some v ->
       Some {
         contents = Printf.sprintf "%s : float = %g" name v;
         start_col = s;
         end_col = e;
       }
     | None -> None)

let tokens (input : string) : semantic_token list =
  let lexbuf = Lexing.from_string input in
  let rec loop acc =
    match (try Some (Lexer.token lexbuf) with Lexer.Lexer_error _ -> None) with
    | None -> List.rev acc
    | Some Parser.EOF -> List.rev acc
    | Some tok ->
      let start_col = lexbuf.Lexing.lex_start_p.Lexing.pos_cnum in
      let end_col = lexbuf.Lexing.lex_curr_p.Lexing.pos_cnum in
      let length = end_col - start_col in
      let kind = match tok with
        | Parser.FLOAT _ -> TkNumber
        | Parser.IDENT _ -> TkIdent
        | Parser.PLUS | Parser.MINUS | Parser.STAR | Parser.SLASH
        | Parser.EQUALS -> TkOperator
        | Parser.LPAREN | Parser.RPAREN -> TkPunct
        | Parser.EOF -> TkPunct (* unreachable *)
      in
      loop ({ start_col; length; kind } :: acc)
  in
  loop []

(* シグネチャ適合性の静的チェック。型を別名 M.state にして循環を避ける。 *)
module _ : Language_service.LANGUAGE_SERVICE = struct
  type nonrec state = state
  let empty = empty
  let complete = complete
  let diagnose = diagnose
  let hover = hover
  let tokens = tokens
end

