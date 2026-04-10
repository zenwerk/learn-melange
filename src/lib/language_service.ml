(* 言語非依存な「言語サービス」インターフェース。
   LSP 相当の機能を段階的に実装するための抽象。最小の 4 機能
   (complete / diagnose / hover / tokens) を持ち、将来 LSP 化する際は
   このシグネチャの外側に JSON-RPC 変換層を置けば良い。

   state はセッションを跨いで保持される言語サービスの文脈
   (電卓なら定義済み変数マップ)。実装ごとに中身は異なる。 *)

type severity = Error | Warning | Info

type completion_kind =
  | CkKeyword
  | CkVariable
  | CkOperator
  | CkFunction

type completion_item = {
  label : string;               (* 表示 & 挿入文字列 *)
  kind : completion_kind;
  detail : string option;       (* 補助説明 (例: "float = 3.14") *)
}

type diagnostic = {
  message : string;
  start_col : int;
  end_col : int;
  severity : severity;
}

type hover_info = {
  contents : string;
  start_col : int;
  end_col : int;
}

type token_kind =
  | TkKeyword
  | TkIdent
  | TkNumber
  | TkOperator
  | TkPunct

type semantic_token = {
  start_col : int;
  length : int;
  kind : token_kind;
}

module type LANGUAGE_SERVICE = sig
  type state

  val empty : state

  (* text をカーソル位置 offset で切り、その位置で挿入可能な候補を返す。
     未完了接頭辞 (例: "x" まで入力済み) は実装側でフィルタする。 *)
  val complete : state -> string -> int -> completion_item list

  (* 入力全体を評価して見つかった診断を返す。
     1 件だけでも可 (将来 error recovery と合わせて複数化)。 *)
  val diagnose : state -> string -> diagnostic list

  (* カーソル位置のシンボルに対するホバー情報。 *)
  val hover : state -> string -> int -> hover_info option

  (* セマンティックトークン (シンタックスハイライト用)。
     state に依存しないケースが多いので state 引数は取らない。 *)
  val tokens : string -> semantic_token list
end
