# melange-sample

OCaml/Melange でロジックコアを書き、JS/TS で UI を実装するフロントエンド開発の検証プロジェクト。

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
opam install melange dune ocaml-lsp-server reason -y

# 3. direnv を許可 (以降 cd するだけで opam env が自動適用される)
direnv allow
```

## プロジェクト構成

```
melange-sample/
├── dune-project          # dune + melange プラグイン宣言
├── src/
│   ├── dune              # melange.emit stanza (ES6 モジュール出力)
│   └── hello.ml          # OCaml ソースコード
├── _build/               # ビルド成果物 (gitignore 対象)
├── _opam/                # opam local switch (gitignore 対象)
├── .envrc                # direnv 設定 (eval $(opam env))
└── .gitignore
```

## ビルド

```bash
dune build @melange
```

生成された JS は `_build/default/src/output/` 以下に出力される。

```
_build/default/src/output/
└── src/
    └── hello.js          # hello.ml から生成された ES6 モジュール
```

## 動作確認

```bash
# 生成された JS を Node.js で実行
node _build/default/src/output/src/hello.js
# => Hello, Melange!
```

## 開発ワークフロー

### ファイル変更の監視 (watch モード)

```bash
dune build @melange --watch
```

ソースファイルを変更すると自動的に JS が再生成される。

### OCaml ソースの追加

1. `src/` に `.ml` ファイルを追加する
2. `dune build @melange` でビルドすると `_build/default/src/output/src/` に対応する `.js` が生成される

### 主要ツール

| ツール | バージョン | 用途 |
|--------|-----------|------|
| OCaml | 4.14.2 | コンパイラ |
| Melange | 6.0.1 | OCaml -> JS コンパイラ |
| dune | 3.22 | ビルドシステム |
| ocaml-lsp-server | 1.21.0 | エディタ補完・型情報 |
| reason | 3.17 | ReasonML 構文サポート (任意) |
