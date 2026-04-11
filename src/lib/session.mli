(* セッションは環境 (evaluation env) と言語サービスの state を一体で持つ
   純粋 OCaml API。JS 境界向け変換は src/js_bridge.ml に分離されている。 *)

type t

val empty : t

(* eval_statement の結果を代数的データ型で返す。
   JS ブリッジ側はこの variant を %mel.obj にマッピングする。 *)
type eval_result =
  | Expr of float
  | Binding of string * float
  | Eval_error of { message : string; column : int }

(* 入力文字列を 1 文を評価し、新しいセッションと結果を返す。
   空入力はエラー扱い (column = 0) とする。 *)
val eval : t -> string -> t * eval_result

(* ----- 言語サービス委譲。Calc_language_service を直接叩くより、
   session の state を使う唯一の窓口にすることで同期ミスを防ぐ。 ----- *)

val complete : t -> string -> int -> Language_service.completion_item list
val diagnose : t -> string -> Language_service.diagnostic list
val hover : t -> string -> int -> Language_service.hover_info option
val tokens : string -> Language_service.semantic_token list
