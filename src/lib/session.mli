type t

val empty : t

type eval_result =
  | Expr of float
  | Binding of string * float
  | Eval_error of { message : string; column : int }

val eval : t -> string -> t * eval_result

val complete : t -> string -> int -> Language_service.completion_item list
val diagnose : t -> string -> Language_service.diagnostic list
val hover : t -> string -> int -> Language_service.hover_info option
val tokens : string -> Language_service.semantic_token list
