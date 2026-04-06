# Melange 開発 TIPS

このプロジェクトで得た OCaml/Melange + JS フロントエンド開発のノウハウ集。

## 環境構築

### opam local switch

```bash
opam switch create . ocaml-base-compiler.4.14.2 --no-install
```

- Melange 6.x は OCaml 4.14 を要求する（5.x 系は非対応）
- `--no-install` で switch 作成のみ行い、パッケージは別途インストール
- `.envrc` に `eval $(opam env)` を書いて direnv で自動適用

### dune-project の `(using melange 0.1)`

- `0.1` は **dune の melange プラグインの API バージョン** であり、melange 本体のバージョンとは無関係
- これがないと `(melange.emit ...)` stanza が認識されない

## Melange ライブラリの構成

### `(modes melange)` と `melange.emit` の分離

```
src/
├── lib/
│   └── dune    # (library (name calc_core) (modes melange))
├── dune        # (melange.emit ... (libraries calc_core))
└── main.ml     # エントリポイント
```

- **library stanza**: OCaml ロジックを `(modes melange)` で定義
- **melange.emit stanza**: ライブラリを依存に持ち、JS を出力する
- ocamllex の `.mll` ファイルは library stanza 内に `(ocamllex lexer)` で配置可能
- `melange.emit` から library のモジュールにアクセスするには `Calc_core.Session` のようにライブラリ名を付ける

### 生成される JS の出力先

`(melange.emit (target output) ...)` の場合:

```
_build/default/src/output/
├── src/
│   └── main.js                    # エントリポイント
└── node_modules/
    ├── melange/                    # OCaml 標準ライブラリ互換
    ├── melange.js/                 # JS ランタイム
    └── melange.__private__. .../   # 内部モジュール
```

## menhir + Melange の制約と回避策

### 問題: dune の `(menhir ...)` stanza が melange-only ライブラリで動かない

**原因の連鎖:**

1. menhir の `--code` バックエンド（デフォルト）は、全非終端記号の型情報が必要
2. `%type` を明示しない場合、dune は `--infer` を自動有効化する
3. `--infer` は型推論のために **OCaml byte コンパイラ (ocamlc)** を呼ぶ
4. `(modes melange)` のライブラリでは byte モードの `.cmi` が生成されない
5. → ビルドエラー: `No rule found for .calc_core.objs/byte/calc_core.cmi`

**`(modes byte melange)` にしても別のエラー:**

menhir `--code` は `.mli` を生成しないが、byte モードが `.mli` を期待して失敗する。

### 解決策: dune の `(rule ...)` stanza で menhir を直接呼ぶ

`(menhir ...)` stanza の代わりに `(rule ...)` で menhir を実行する。これにより `--infer` を回避しつつ、ビルドワークフローに自動統合できる。

**前提**: `.mly` で全非終端記号に `%type` を明示すること（`--infer` が不要になる）。

```dune
; src/lib/dune
(library
 (name calc_core)
 (modes melange)
 (preprocess (pps melange.ppx)))

(rule
 (targets parser.ml parser.mli)
 (deps parser.mly)
 (action (run %{bin:menhir} --code %{deps})))

(ocamllex lexer)
```

- `%{bin:menhir}`: opam でインストールされた menhir バイナリを参照
- `(targets ...)`: 生成されるファイルを明示（dune が依存関係を追跡できる）
- `(deps ...)`: `.mly` の変更を検知して自動再生成
- 生成された `parser.ml` / `parser.mli` は `_build/` 内に生成される（ソースツリーを汚さない）
- `.gitignore` に `src/lib/parser.ml` と `src/lib/parser.mli` を追加しておく

### `%type` の書き方

```
%type <Ast.expr> expr        ← これを追加するだけ
%start <Ast.statement> input ← start は元々 %type 不要
```

### `--code` vs `--table` バックエンド

| | `--code` (デフォルト) | `--table` |
|---|---|---|
| ランタイム依存 | なし（スタンドアロン） | menhirLib が必要 |
| incremental API | ❌ 利用不可 | ✅ `Parser.MenhirInterpreter` / `Parser.Incremental` が生成される |
| melange 互換性 | ✅ 生成コードのみ | ⚠️ menhirLib の vendoring が必要（後述） |

incremental API（push 型パーサー等）が必要な場合は `--table` を使う。

### menhirLib の vendoring（`--table` + Melange）

`--table` バックエンドは実行時に `menhirLib` に依存するが、opam の menhirLib パッケージは `(modes byte native)` のみで **Melange に非対応**。回避策として menhirLib のソースを vendoring する。

menhirLib は純粋な OCaml コード（C バインディングなし）なので、そのまま `(modes melange)` でコンパイル可能。

**手順:**

1. ソースをコピー:
   ```bash
   SRC=$(opam var menhirLib:lib)  # or _opam/.opam-switch/sources/menhirLib.*/lib/
   DST=src/vendor/menhirLib
   mkdir -p $DST
   cp $SRC/*.ml $SRC/*.mli $DST/
   ```

2. `StaticVersion.ml` / `.mli` は menhir のバージョンに合わせて手動生成:
   ```ocaml
   (* StaticVersion.ml *)
   let require_20260209 = ()
   (* StaticVersion.mli *)
   val require_20260209 : unit
   ```
   バージョン番号は `menhir --version` で確認する。

3. dune を作成:
   ```dune
   ; src/vendor/menhirLib/dune
   (library
    (name menhirLib)
    (modes melange)
    (flags (:standard -w -a)))  ; vendor コードの warning を抑制
   ```

4. `calc_core` ライブラリで依存を追加:
   ```dune
   (library
    (name calc_core)
    (modes melange)
    (libraries menhirLib)
    (preprocess (pps melange.ppx)))

   (rule
    (targets parser.ml parser.mli)
    (deps parser.mly)
    (action (run %{bin:menhir} --table %{deps})))
   ```

**注意**: menhir を更新した場合、vendored ソースと `StaticVersion` のバージョン番号も合わせて更新すること。バージョン不一致があるとリンク時にエラーになる。

### パーサー再生成のワークフロー

`.mly` を編集したら `dune build @melange` するだけ。手動操作は不要。

### Menhir incremental API（push 型パーサー）

`--table` バックエンドで生成すると、従来の monolithic API に加えて **incremental API** が使える。これにより「パーサーが lexer を呼ぶ」pull 型から「lexer がトークンをパーサーに渡す」push 型に変更できる。

#### 生成されるモジュール

- `Parser.MenhirInterpreter` — パーサーの状態遷移を制御する関数群
- `Parser.Incremental` — エントリポイント（`%start` ごとに生成）

#### checkpoint 型

パーサーの状態は `'a checkpoint` で表現される:

| コンストラクタ | 意味 |
|---|---|
| `InputNeeded _` | パーサーが次のトークンを要求している |
| `Shifting _` | shift 遷移の途中（内部状態） |
| `AboutToReduce _` | reduce 直前（内部状態） |
| `HandlingError _` | 構文エラーを検出した |
| `Accepted v` | パース成功、`v` が結果 |
| `Rejected` | パース失敗（回復不能） |

#### 主要な関数

- `I.offer checkpoint (token, startp, endp)` — `InputNeeded` 状態のパーサーにトークンを渡す
- `I.resume checkpoint` — 内部状態（`Shifting` / `AboutToReduce`）を1ステップ進める

#### 実装パターン: push 型パーサー

```ocaml
module I = Parser.MenhirInterpreter

(* 内部状態を飛ばして、次に入力が必要な状態まで進める *)
let rec drain (checkpoint : 'a I.checkpoint) : 'a I.checkpoint =
  match checkpoint with
  | I.Shifting _ | I.AboutToReduce _ ->
    drain (I.resume checkpoint)
  | _ -> checkpoint

(* lexer がトークンを1つずつ取得してパーサーに push する *)
let rec push_parse lexbuf (checkpoint : Ast.statement I.checkpoint) =
  match checkpoint with
  | I.InputNeeded _ ->
    let token = Lexer.token lexbuf in
    let startp = lexbuf.Lexing.lex_start_p in
    let endp = lexbuf.Lexing.lex_curr_p in
    let checkpoint = I.offer checkpoint (token, startp, endp) in
    push_parse lexbuf (drain checkpoint)
  | I.Accepted v -> Ok v
  | I.HandlingError _ ->
    Error ("Syntax error", lexbuf.Lexing.lex_curr_p.Lexing.pos_cnum)
  | I.Rejected -> Error ("Syntax error", 0)
  | I.Shifting _ | I.AboutToReduce _ ->
    push_parse lexbuf (drain checkpoint)

(* エントリポイント *)
let parse input_str =
  let lexbuf = Lexing.from_string input_str in
  let checkpoint = Parser.Incremental.input lexbuf.Lexing.lex_curr_p in
  push_parse lexbuf (drain checkpoint)
```

**ポイント:**
- `drain` で `Shifting` / `AboutToReduce` をスキップすることで、`push_parse` の match は実質 `InputNeeded` / `Accepted` / エラー の3パターンに集約される
- `offer` は `InputNeeded` 以外の状態で呼ぶと例外を投げるため、必ず `drain` してから次のトークンを渡す
- lexer のエラー（不正な文字等）は `push_parse` 内の `try/with` で捕捉できる

#### 応用: トークン単位でのステップ実行

incremental API の真価は、checkpoint を保存して後からトークンを渡せること。これにより以下が可能になる:

- **非同期パーサー**: トークンが到着するたびに `offer` → `drain` → 状態を保存
- **エラー回復**: `HandlingError` で独自の回復ロジックを挿入
- **デバッグ**: 各トークン投入後のパーサー状態を観察

## Melange FFI (OCaml → JS)

### `[%mel.obj]` で JS オブジェクトを作る

```ocaml
let obj = [%mel.obj {
  name = "hello";
  value = 42;
}]
```

→ JS 側: `{ name: "hello", value: 42 }`

### Melange 6 での文字列型

- OCaml の `string` がそのまま JS の `string` にマッピングされる
- **`Js.string` 関数は存在しない**（古い BuckleScript/ReScript の API）
- `Js.String.t` は OCaml `string` のエイリアス

### Nullable 型

```ocaml
Js.Nullable.return value  (* JS: value *)
Js.Nullable.null          (* JS: null *)
```

型注釈: `string Js.Nullable.t`, `float Js.Nullable.t`

### `[%mel.obj]` のネストに注意

`[%mel.obj { ... }]` の内部で `try/with` や `match` を深くネストすると構文エラーになりやすい。ヘルパー関数に分離するのが安全:

```ocaml
(* ❌ 深いネストで構文エラーになりやすい *)
let create () = [%mel.obj {
  eval = fun input ->
    try ... with
    | Error -> [%mel.obj { ... }]   (* ここでパーサーが混乱 *)
}]

(* ✅ ヘルパー関数に分離 *)
let make_result v = [%mel.obj { success = true; value = v }]

let do_eval input = try ... with Error -> make_result 0

let create () = [%mel.obj {
  eval = fun input -> do_eval input
}]
```

### ステートフルなオブジェクトの公開

`ref` で可変状態を持つクロージャを `[%mel.obj]` で包む:

```ocaml
let create_session () =
  let state = ref initial_state in
  [%mel.obj {
    eval = fun input ->
      let result = process !state input in
      state := update !state result;
      result
  }]
```

## Vite + Melange 統合

### alias 設定が必須

Melange 生成 JS は bare import（`melange/lexing.js` 等）を使用する。Vite はこれを解決できないため、alias が必要:

```javascript
// vite.config.js
const melangeOutput = path.resolve(__dirname, '_build/default/src/output');
const melangeNodeModules = path.join(melangeOutput, 'node_modules');

export default defineConfig({
  root: 'ui',
  resolve: {
    alias: {
      'melange-output': melangeOutput,
      'melange.js': path.join(melangeNodeModules, 'melange.js'),
      'melange.__private__.melange_mini_stdlib':
        path.join(melangeNodeModules, 'melange.__private__.melange_mini_stdlib'),
      'melange': path.join(melangeNodeModules, 'melange'),
    }
  },
  server: {
    fs: { allow: ['..'] }   // _build へのアクセスを許可
  }
});
```

**alias の順序に注意**: `melange.js` を `melange` より先に定義すること（prefix マッチで先に `melange` にマッチしてしまうため）。

### JS 側からの import

```javascript
import { create_session } from 'melange-output/src/main.js';
```

### 開発ワークフロー（2ターミナル）

```bash
# Terminal 1: OCaml 変更を監視
dune build @melange --watch

# Terminal 2: Vite dev server（HMR）
npm run dev
```

## ocamllex + Melange

- Melange は `Lexing` モジュールの互換実装を持つ
- ocamllex で生成された `.ml` はそのまま Melange でコンパイル可能
- 位置情報（`Lexing.position`, `lex_curr_p`, `pos_cnum`）も正常に動作する
- `(ocamllex lexer)` stanza は `(modes melange)` のライブラリ内で問題なく使える
