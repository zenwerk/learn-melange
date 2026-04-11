(* セッションとの通信を単一の request/response で表現する。
   JS 境界でも OCaml 内部でも handle 1 本に集約することで、将来 Worker や
   LSP サーバへ切り替える際にメッセージ種別を足すだけで済むようにする。 *)

type request =
  | Eval of string
  | Complete of { input : string; offset : int }
  | Diagnose of string
  | Hover of { input : string; offset : int }
  | Tokens of string

type response =
  | REval of Session.eval_result
  | RComplete of Language_service.completion_item list
  | RDiagnose of Language_service.diagnostic list
  | RHover of Language_service.hover_info option
  | RTokens of Language_service.semantic_token list

(* セッションに対して request を処理し、新しいセッションとレスポンスを返す。
   state が変化するのは Eval だけだが、将来のコマンド追加を容易にするため
   全ケースで (Session.t * response) を返す統一シグネチャにしている。 *)
let handle (session : Session.t) (req : request) : Session.t * response =
  match req with
  | Eval input ->
    let (next, result) = Session.eval session input in
    (next, REval result)
  | Complete { input; offset } ->
    let items = Session.complete session input offset in
    (session, RComplete items)
  | Diagnose input ->
    let diags = Session.diagnose session input in
    (session, RDiagnose diags)
  | Hover { input; offset } ->
    let info = Session.hover session input offset in
    (session, RHover info)
  | Tokens input ->
    let toks = Session.tokens input in
    (session, RTokens toks)
