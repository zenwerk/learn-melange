(* セッションとの通信を単一の request/response に集約する。将来 Worker
   や LSP サーバへ切り替える際は、この handle を postMessage ディスパッチ
   に差し替えれば済む。 *)

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

(* state が変化するのは Eval だけだが、将来のコマンド追加を容易にするため
   全ケースで (Session.t * response) を返す統一シグネチャにしている。 *)
let handle (session : Session.t) (req : request) : Session.t * response =
  match req with
  | Eval input ->
    let (next, result) = Session.eval session input in
    (next, REval result)
  | Complete { input; offset } ->
    (session, RComplete (Session.complete session input offset))
  | Diagnose input ->
    (session, RDiagnose (Session.diagnose session input))
  | Hover { input; offset } ->
    (session, RHover (Session.hover session input offset))
  | Tokens input ->
    (session, RTokens (Session.tokens input))
