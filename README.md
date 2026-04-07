# melange-sample

OCaml/Melange でロジックコア（電卓 DSL の字句解析・構文解析・評価）を書き、
ブラウザでは xterm.js ベースの REPL UI から呼び出すフロントエンド検証プロジェクト。

- **コアロジック**: OCaml + ocamllex + Menhir (incremental API)
- **トランスパイル**: Melange で ES6 モジュールへ変換
- **UI**: Vite + xterm.js + @gytx/xterm-local-echo
- **REPL**: readline 風 Emacs キーバインド (C-a/C-e/C-b/C-f/C-h/C-k/C-u/C-w/C-p/C-n) 対応

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
│   └── main.js             # xterm.js REPL UI と readline 風キーバインド層
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

ブラウザで開くと、xterm.js 上に電卓 REPL が表示される:

```
Melange Calculator REPL
readline keys: C-a C-e C-b C-f C-h C-k C-u C-w M-b M-f  / history: C-p C-n up/down

next: [number] [identifier] [-] [(]
calc> 1 + 2 * 3
- : float = 7
```

## REPL の機能

### 評価

- 算術式: `1 + 2 * 3`
- 変数束縛: 評価結果は内部に保持される（実装中）
- エラーは列番号付きキャレットで指示される

### 入力ヒント

Menhir incremental API の `acceptable` を使い、現在のカーソル位置で次に来うる
トークン集合を `next: [...]` 行に表示する。文法上の許容入力をリアルタイムに把握できる。

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

差分更新 (ICH/DCH/EL ANSI シーケンス) を直接書き込むことで、編集中のちらつきを排除している。

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
| @xterm/xterm | 5.x | ターミナル描画レイヤ |
| @gytx/xterm-local-echo | 0.1.x | 行編集 / 履歴管理 |

詳細な実装ノートは `TIPS.md` を参照。
