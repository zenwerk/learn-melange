# learn-melange

OCaml/Melange でロジックコア (電卓 DSL の字句解析・構文解析・評価・言語サービス)
を書き、ブラウザでは自前 Canvas2D + WebGL2 ポストプロセスによる CRT ターミナル風
REPL UI から呼び出すフロントエンド検証プロジェクト。

- **コアロジック**: OCaml + ocamllex + Menhir (incremental API / `acceptable`)
- **言語サービス**: LSP 的な抽象 (`Language_service` sig) と電卓実装 (`Calc_language_service`)
- **JS 境界**: 単一の `session.request({ op, ... })` エンドポイント (Worker / LSP
  サーバ化を見据えた protocol 層)
- **トランスパイル**: Melange で ES6 モジュールへ変換
- **UI**: Vite + 自前ターミナル (Canvas2D) + WebGL2 GLSL ポストプロセス
- **REPL**: readline 風 Emacs キーバインド + Tab 補完 + ホバー + 履歴
- **画面エフェクト**: cool-retro-term 風の CRT シェーダー (樽型歪み/ブルーム/
  スキャンライン/ビネット/ノイズ/phosphor persistence/色収差)。宣言的プロファイル
  機構 + シェーダキャッシュ。
- **品質**: Alcotest (OCaml 36 tests) + vitest (JS 64 tests) + JSDoc 型注釈 +
  `tsc --noEmit` による checkJs

## 前提条件

- [opam](https://opam.ocaml.org/) 2.5+
- [direnv](https://direnv.net/)
- Node.js 22+

## 環境構築

```bash
# 1. opam local switch を作成 (OCaml 4.14.2)
opam switch create . ocaml-base-compiler.4.14.2 --no-install

# 2. 必要なパッケージをインストール
eval $(opam env)
opam install melange dune ocaml-lsp-server reason menhir alcotest -y

# 3. direnv を許可 (以降 cd するだけで opam env が自動適用される)
direnv allow

# 4. JS 側依存をインストール
npm install
```

## プロジェクト構成

```
learn-melange/
├── dune-project
├── src/
│   ├── dune                    # melange.emit stanza (src/ 直下は JS 境界)
│   ├── main.ml                 # エントリポイント (Js_bridge.create_session 再エクスポート)
│   ├── js_bridge.ml            # OCaml → JS 境界。[%mel.obj] 変換と create_session
│   ├── lib/                    # 純粋 OCaml ライブラリ calc_core (melange + byte + native)
│   │   ├── dune
│   │   ├── lexer.mll           # ocamllex 字句定義
│   │   ├── parser.mly          # Menhir incremental パーサ
│   │   ├── ast.ml              # 抽象構文木
│   │   ├── eval.ml             # 評価器 (env + StringMap)
│   │   ├── parse_util.ml       # feed_tokens / drain の共通ドライバ
│   │   ├── language_service.ml # LSP 風シグネチャ (complete/diagnose/hover/tokens)
│   │   ├── calc_language_service.ml # 電卓向けの言語サービス実装
│   │   ├── session.ml          # REPL セッション (env + 言語サービス委譲)
│   │   ├── session.mli         # Session の公開 API 契約
│   │   └── protocol.ml         # request/response 代数的データ型 + handle
│   ├── test/                   # Alcotest スイート (36 tests)
│   │   ├── dune
│   │   ├── run_test.ml
│   │   ├── eval_test.ml
│   │   ├── session_test.ml
│   │   ├── language_service_test.ml
│   │   └── protocol_test.ml
│   └── vendor/menhirLib/       # Menhir ランタイム (Melange 互換にベンダリング)
├── ui/
│   ├── types.d.ts              # OCaml↔JS 境界の型定義 (SessionOp / EvalResultObj 他)
│   ├── melange-output-stub/    # vite alias 用の型スタブ
│   ├── index.html
│   ├── style.css
│   ├── main.js                 # エントリ (ReplUI を起動するのみ)
│   ├── repl/
│   │   ├── repl.js             # ReplUI: 全体組み立て + 副作用バンドラ (#withRender)
│   │   └── completion-popup.js # 補完ポップアップ (CellBuffer 直書きで CRT 対象)
│   ├── terminal/
│   │   ├── cell-buffer.js      # row × col セルバッファ + writeCells ヘルパ
│   │   ├── terminal-canvas.js  # Canvas2D 描画、dirty 行差分、カーソル点滅
│   │   ├── line-editor.js      # readline 風 1 行エディタ + IME 仮表示
│   │   ├── history.js          # 入力履歴
│   │   ├── keyboard-input.js   # 透明 textarea で compositionXxx 吸収
│   │   ├── readline-keys.js    # KeyboardEvent → アクション名解決
│   │   └── width.js            # East Asian Width + サロゲート対応ヘルパ
│   ├── language/
│   │   ├── session-client.js   # session.request({ op, ... }) のメソッドラッパ
│   │   └── language-client.js  # Tab 補完の直近 1 件キャッシュ
│   ├── gfx/                    # WebGL2 レンダリンググラフ
│   │   ├── gl.js               # context/program/FBO/テクスチャユーティリティ
│   │   │                       # + 簡易 #include プリプロセッサ
│   │   ├── render-graph.js     # 宣言的 setPasses + shader program キャッシュ
│   │   ├── fullscreen-quad.js
│   │   └── shaders/
│   │       ├── common.glsl     # 共通ヘッダ (#version / precision / gaussian9)
│   │       ├── passthrough.frag
│   │       ├── threshold.frag
│   │       ├── blur.frag       # uAxis uniform で水平/垂直を切替
│   │       └── crt-composite.frag
│   └── effects/                # プラグイン可能なエフェクトプロファイル
│       ├── effect-manager.js   # rAF ループ + プロファイル切替 + localStorage 永続化
│       ├── profile-base.js     # defineProfile({ ..., passes })
│       ├── index.js            # EFFECTS レジストリ
│       ├── off.js              # passthrough
│       └── crt-default.js      # cool-retro-term 風の既定プロファイル
├── ui/__tests__/               # vitest (64 tests)
│   ├── cell-buffer.test.js
│   ├── history.test.js
│   ├── line-editor.test.js
│   ├── readline-keys.test.js
│   └── width.test.js
├── tsconfig.json               # checkJs: true, 段階導入 (ts-nocheck opt-out)
├── vitest.config.js
├── vite.config.js              # Melange 出力を alias 経由で取り込む
├── package.json
├── _build/                     # gitignore
├── _opam/                      # gitignore
└── .envrc
```

## ビルドと起動

```bash
# 1. OCaml/Melange を JS にコンパイル
dune build

# 2. Vite 開発サーバを起動 (http://localhost:5173)
npm run dev
```

ブラウザで開くと、CRT 風ターミナル UI 上に電卓 REPL が表示される:

```
Melange Calculator REPL
readline: C-a C-e C-b C-f C-h C-k C-u C-w M-b M-f  / history: C-p C-n ↑↓
          / complete: Tab S-Tab Esc  / clear: C-l  / zoom: C-= C-- C-0
          / effect: :effect / C-S-e

calc> pi = 3.14
val pi : float = 3.14
calc> pi * 2
- : float = 6.28
calc>
```

## テストと型チェック

```bash
npm run typecheck     # tsc --noEmit
npm test              # vitest (JS 64 tests)
dune runtest          # Alcotest (OCaml 36 tests)
npm run test:all      # 上記 3 つを順に実行
```

OCaml 側の `calc_core` は `(modes melange byte native)` でビルドされ、ネイティブ
バイナリとしてテストが走る。Melange 出力 (ブラウザ向け JS) は `_build/default/
src/output/` 以下に配置され、vite alias で `melange-output/` として解決される。

## REPL の機能

### 評価と変数束縛

```
calc> 1 + 2 * 3
- : float = 7
calc> r = 2.5
val r : float = 2.5
calc> r * r
- : float = 6.25
```

- 算術式 (`+`, `-`, `*`, `/`, 単項マイナス、括弧、float リテラル、変数参照)
- 代入文: `name = expr`
- 変数環境はセッションに保持され、次の評価から参照できる
- エラーは列番号付きキャレットで指示される

### Tab 補完 / ホバー (言語サービス)

Menhir incremental API の `acceptable` を使い、現在のカーソル位置で次に来うる
トークンを補完候補に変換する。識別子カテゴリの候補にはセッション内の変数が
展開される。

```
calc> p<Tab>    # → pi   float = 3.14
```

OCaml 側の `Calc_language_service.hover` は定義済み変数の値を返し、将来 LSP の
ホバー情報として再利用できる。

### 画面エフェクト

起動時に `crt-default` プロファイルが適用され、WebGL2 のマルチパスシェーダーが
Canvas2D ターミナルをソーステクスチャとして後処理する。プロファイルは実行時に
切替可能で `localStorage` に保存される。

パイプライン (`crt-default`):

```
source (Canvas2D) → threshold → blur (axis=(1,0)) → blur (axis=(0,1)) → crt-composite → screen
                                                                              ↑
                                                                             prev (前フレーム)
```

プロファイルは `passes: (params) => [descriptor, ...]` の純関数を返す宣言的な
形。`RenderGraph.setPasses` はシェーダソースをキーにしたプログラムキャッシュを
持つので、OFF ↔ CRT の切替を繰り返してもシェーダの再コンパイルは発生しない。

`crt-composite` シェーダーで樽型歪み/ブルーム加算/スキャンライン/ビネット/
ノイズ/phosphor persistence/色収差を合成する。blur の水平/垂直は単一の
`blur.frag` + `uAxis` uniform で切り替え、共通ヘルパ `gaussian9` は
`common.glsl` に置かれ `#include "common.glsl"` で参照される。

| 操作 | 効果 |
|------|------|
| `:effect` | 現在のプロファイル + 一覧を表示 |
| `:effect <name>` | プロファイル切替 (`off` / `crt-default`) |
| `Ctrl+Shift+E` | 次のプロファイルにサイクル |

新しいプロファイルは `ui/effects/` にモジュールを追加して `ui/effects/index.js`
の `EFFECTS` レジストリに登録するだけで作れる。シェーダーは Vite の `?raw`
インポートで取り込む。

### 日本語 (IME) 対応

`compositionstart` / `compositionupdate` / `compositionend` を受け取り、変換中の
文字列はカーソル位置に下線付きで仮表示される。East Asian Width に基づき全角文字を
2 セル幅として扱い、削除・カーソル移動もセル幅基準で正しく動作する。

### キーバインド (Emacs / readline 互換)

| キー | 動作 |
|------|------|
| `C-a` / `C-e` | 行頭 / 行末 |
| `C-b` / `C-f` | 1 文字 左 / 右 |
| `M-b` / `M-f` | 単語単位で 左 / 右 |
| `C-h` / `Backspace` | 1 文字削除 |
| `C-k` | カーソル位置から行末まで削除 |
| `C-u` | 行頭からカーソル位置まで削除 |
| `C-w` | 直前の単語を削除 |
| `C-p` / `↑` | 履歴を遡る |
| `C-n` / `↓` | 履歴を進む |
| `Tab` / `S-Tab` | 補完候補を順送り / 逆送り |
| `Esc` | 補完ポップアップを閉じる |
| `Enter` | ポップアップが開いていれば確定、そうでなければ行を評価 |
| `Ctrl + L` | 画面クリア |
| `Ctrl + = / -` | フォントサイズ拡大 / 縮小 (JIS の `Ctrl+Shift+;` も可) |
| `Ctrl + 0` | フォントサイズをリセット |
| `Ctrl + Shift + E` | 画面エフェクトを次のプロファイルに切替 |

## アーキテクチャ要点

### OCaml↔JS の境界は単一 request エンドポイント

JS 側からは `session.request({ op, input, offset })` 1 本だけを呼ぶ。`op` は
`'eval' | 'complete' | 'diagnose' | 'hover' | 'tokens'` の discriminated union。

```
JS                                OCaml
---                               -----
session.request({op:'eval', ...}) ──▶ Js_bridge.request_of_js
                                      ─▶ Protocol.handle
                                           ─▶ Session.eval / complete / ...
                                      ◀─ response variant
                                  ◀── eval_result_to_js / completion_to_js / ...
```

`Protocol` は純粋 OCaml の代数的データ型なので、将来 Web Worker 化する際は
`postMessage(req)` ディスパッチに差し替えるだけで済む。

### 副作用バンドラ (`#withRender`)

`ReplUI` の全エントリポイント (keyboard / resize / blink timer / main loop) は
`#withRender(fn)` でラップされ、`try/finally` で必ず `effects.requestRender()`
を呼ぶ。内部関数 (`#println`, `#handleXxx`, ...) は個別に描画要求を出さないので、
呼び忘れが構造的に発生しない。

### 宣言的エフェクトプロファイル

```js
// ui/effects/crt-default.js (抜粋)
passes: (p) => [
  { name: 'threshold', fs: thresholdFs, inputs: ['source'], output: 'brightA', uniforms: {...} },
  { name: 'blurH',     fs: blurFs, inputs: ['brightA'], output: 'brightB', uniforms: { uAxis: [1, 0] } },
  { name: 'blurV',     fs: blurFs, inputs: ['brightB'], output: 'brightA', uniforms: { uAxis: [0, 1] } },
  { name: 'composite', fs: compositeFs, inputs: ['source', 'brightA', 'prev'], output: 'screen', uniforms: {...} },
]
```

`RenderGraph.setPasses` は fs ソース文字列をキーに `programCache` を持つので、
同じシェーダを使う複数パス (blurH / blurV) は 1 つの `WebGLProgram` を共有し、
プロファイル切替を繰り返してもリンクは発生しない。

### JSDoc + `checkJs` による型チェック

`tsconfig.json` は `checkJs: true` で JS ファイルを型チェックする。境界型は
`ui/types.d.ts` に集約され、OCaml の `Js_bridge` が返す shape とここを同期する。
段階的導入のため、未対応のファイルは冒頭に `// @ts-nocheck` を置けば型チェック
から外せる (現状は `ui/effects/*`, `ui/gfx/*`, `ui/terminal/terminal-canvas.js`
が opt-out 中)。

## 開発ワークフロー

### Melange 側を watch する

```bash
dune build --watch
```

OCaml ソース変更時に自動再ビルドされ、Vite の HMR がブラウザを更新する。

### 主要ツール

| ツール | バージョン | 用途 |
|--------|-----------|------|
| OCaml | 4.14.2 | コンパイラ |
| Melange | 6.0.1 | OCaml → JS |
| Menhir | latest | 構文解析器ジェネレータ (incremental API 使用) |
| dune | 3.18+ | ビルドシステム |
| Alcotest | 1.9+ | OCaml 単体テスト |
| Vite | 6.x | フロントエンドバンドラ / 開発サーバ |
| vitest | 4.x | JS 単体テスト |
| TypeScript | 6.x | `tsc --noEmit` による checkJs |
| WebGL2 | ブラウザ標準 | ポストプロセス用シェーダーパイプライン |

以前は `@xterm/xterm` + `@gytx/xterm-local-echo` に依存していたが、GLSL
ポストプロセスを自由に適用するため canvas ベースの自前ターミナルに置き換えた。
現在 JS 側のランタイム依存は Melange 出力のみ (TypeScript / vitest / vite は
dev のみ)。

詳細な実装ノートは `TIPS.md` を参照。
