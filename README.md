# melange-sample

OCaml/Melange でロジックコア (電卓 DSL の字句解析・構文解析・評価) を書き、
ブラウザでは自前 Canvas2D + WebGL2 ポストプロセスによる CRT ターミナル風 REPL UI
から呼び出すフロントエンド検証プロジェクト。

- **コアロジック**: OCaml + ocamllex + Menhir (incremental API)
- **トランスパイル**: Melange で ES6 モジュールへ変換
- **UI**: Vite + 自前ターミナル (Canvas2D) + WebGL2 GLSL ポストプロセス
- **REPL**: readline 風 Emacs キーバインド (C-a/C-e/C-b/C-f/C-h/C-k/C-u/C-w/C-p/C-n/M-b/M-f)
- **画面エフェクト**: cool-retro-term 風の CRT シェーダー (樽型歪み/ブルーム/スキャンライン/
  ビネット/ノイズ/phosphor persistence/色収差)。切替可能なプロファイル機構。

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
opam install melange dune ocaml-lsp-server reason menhir -y

# 3. direnv を許可 (以降 cd するだけで opam env が自動適用される)
direnv allow

# 4. JS 側依存をインストール
npm install
```

## プロジェクト構成

```
melange-sample/
├── dune-project
├── src/
│   ├── dune                # melange.emit stanza
│   ├── main.ml             # エントリポイント
│   ├── lib/
│   │   ├── lexer.mll       # ocamllex 字句定義
│   │   ├── parser.mly      # Menhir incremental パーサ
│   │   ├── ast.ml          # 抽象構文木
│   │   ├── eval.ml         # 評価器
│   │   └── session.ml      # REPL セッション (eval + hints)
│   └── vendor/menhirLib/   # Menhir ランタイム (Melange 互換にベンダリング)
├── ui/
│   ├── index.html
│   ├── style.css
│   ├── main.js             # エントリ (ReplUI を起動するのみ)
│   ├── repl/repl.js        # ReplUI: 全体組み立て + 評価ループ + :effect コマンド
│   ├── terminal/           # 自前ターミナル (Canvas2D)
│   │   ├── cell-buffer.js  # row × col セルバッファ + writeCells ヘルパ
│   │   ├── terminal-canvas.js # Canvas2D 描画、dirty 行差分、カーソル点滅
│   │   ├── line-editor.js  # readline 風 1 行エディタ + IME 仮表示
│   │   ├── history.js      # 入力履歴
│   │   ├── keyboard-input.js # 透明 textarea で compositionXxx 吸収
│   │   ├── readline-keys.js  # KeyboardEvent → アクション名解決
│   │   └── width.js        # East Asian Width + サロゲート対応ヘルパ
│   ├── gfx/                # WebGL2 レンダリンググラフ
│   │   ├── gl.js           # context/program/FBO/テクスチャユーティリティ
│   │   ├── render-graph.js # 名前付きテクスチャの多段パス実行 + prev フィードバック
│   │   ├── fullscreen-quad.js
│   │   └── shaders/        # GLSL シェーダー群 (threshold/blur/crt-composite...)
│   └── effects/            # プラグイン可能なエフェクトプロファイル
│       ├── effect-manager.js # rAF ループ + プロファイル切替 + localStorage 永続化
│       ├── profile-base.js
│       ├── index.js        # EFFECTS レジストリ
│       ├── off.js          # passthrough
│       └── crt-default.js  # cool-retro-term 風の既定プロファイル
├── vite.config.js          # Melange 出力を alias 経由で取り込む
├── package.json
├── _build/                 # gitignore
├── _opam/                  # gitignore
└── .envrc
```

## ビルドと起動

```bash
# 1. OCaml/Melange を JS にコンパイル
dune build @melange

# 2. Vite 開発サーバを起動 (http://localhost:5173)
npm run dev
```

ブラウザで開くと、CRT 風ターミナル UI 上に電卓 REPL が表示される:

```
Melange Calculator REPL
readline: C-a C-e C-b C-f C-h C-k C-u C-w M-b M-f  / history: C-p C-n ↑↓
          / zoom: C-= C-- C-0  / effect: :effect / C-S-e

next: [number] [identifier] [-] [(]
calc> 1 + 2 * 3
- : float = 7
```

## REPL の機能

### 評価

- 算術式: `1 + 2 * 3`
- 変数束縛: `let x = 10` の評価結果は内部セッションに保持される
- エラーは列番号付きキャレットで指示される

### 入力ヒント

Menhir incremental API の `acceptable` を使い、現在のカーソル位置で次に来うる
トークン集合を `next: [...]` 行に表示する。文法上の許容入力をリアルタイムに把握できる。

### 画面エフェクト

起動時に `crt-default` プロファイルが適用され、WebGL2 のマルチパスシェーダーが
Canvas2D ターミナルをソーステクスチャとして後処理する。プロファイルは実行時に
切替可能で `localStorage` に保存される。

パイプライン (`crt-default`):
```
source (Canvas2D) → threshold → blur-h → blur-v → crt-composite → screen
                                                       ↑
                                                      prev (前フレーム)
```

`crt-composite` シェーダーで樽型歪み/ブルーム加算/スキャンライン/ビネット/
ノイズ/phosphor persistence/色収差を合成する。

エフェクト操作:

| 操作 | 効果 |
|------|------|
| `:effect` | 現在のプロファイル + 一覧を表示 |
| `:effect <name>` | プロファイル切替 (`off` / `crt-default`) |
| `Ctrl+Shift+E` | 次のプロファイルにサイクル |

新しいプロファイルは `ui/effects/` にモジュールを追加して `ui/effects/index.js` の
レジストリに登録するだけで作れる。シェーダーは Vite の `?raw` インポートで取り込む。

### 日本語 (IME) 対応

`compositionstart` / `compositionupdate` / `compositionend` を受け取り、変換中の
文字列はカーソル位置に下線付きで仮表示される。East Asian Width に基づき全角文字を
2 セル幅として扱い、削除・カーソル移動もセル幅基準で正しく動作する。

### キーバインド (Emacs / readline 互換)

| キー | 動作 |
|------|------|
| `C-a` / `C-e` | 行頭 / 行末 |
| `C-b` / `C-f` | 1 文字 左 / 右 |
| `C-h` / `Backspace` | 1 文字削除 |
| `C-k` | カーソル位置から行末まで削除 |
| `C-u` | 行頭からカーソル位置まで削除 |
| `C-w` | 直前の単語を削除 |
| `M-b` / `M-f` | 単語単位で 左 / 右 |
| `C-p` / `↑` | 履歴を遡る |
| `C-n` / `↓` | 履歴を進む |
| `Ctrl + = / -` | フォントサイズ拡大 / 縮小 (JIS の `Ctrl+Shift+;` も可) |
| `Ctrl + 0` | フォントサイズをリセット |
| `Ctrl + Shift + E` | 画面エフェクトを次のプロファイルに切替 |

## 開発ワークフロー

### Melange 側を watch する

```bash
dune build @melange --watch
```

OCaml ソース変更時に自動再ビルドされ、Vite の HMR がブラウザを更新する。

### 主要ツール

| ツール | バージョン | 用途 |
|--------|-----------|------|
| OCaml | 4.14.2 | コンパイラ |
| Melange | 6.0.1 | OCaml → JS |
| Menhir | latest | 構文解析器ジェネレータ (incremental API 使用) |
| dune | 3.22 | ビルドシステム |
| Vite | 6.x | フロントエンドバンドラ / 開発サーバ |
| WebGL2 | ブラウザ標準 | ポストプロセス用シェーダーパイプライン |

以前は `@xterm/xterm` + `@gytx/xterm-local-echo` に依存していたが、GLSL
ポストプロセスを自由に適用するため canvas ベースの自前ターミナルに置き換えた。
現在 JS 側の外部依存は Vite と Melange ランタイムのみ。

詳細な実装ノートは `TIPS.md` を参照。
