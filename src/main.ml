(* melange.emit のエントリポイント。JS 側から import される公開 API はここに集める。
   実装は Js_bridge 側にある。 *)

let create_session = Js_bridge.create_session
