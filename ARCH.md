# ARCH: Melange ↔ JS 接続の仕組み

このドキュメントは `learn-melange` リポジトリで OCaml (Melange) と JavaScript (Vite + ブラウザ) がどのように連結されているかをまとめたものである。

## 全体像

```
┌──────────────┐ OCaml ソース  ┌─────────────────────┐ ES6 .js   ┌──────────────┐
│ src/lib/*.ml │ ────────────→ │ dune + melange.emit │ ────────→ │ Vite (ui/)   │
│ src/main.ml  │               │ (alias melange)     │           │ が import    │
└──────────────┘               └─────────────────────┘           └──────────────┘
                                        ↓
                       _build/default/src/output/…/*.js
                       _build/default/src/output/node_modules/
                         ├── melange/
                         ├── melange.js/
                         └── melange.__private__.melange_mini_stdlib/
```

2 段パイプライン:

1. **OCaml → JS**: `dune build @melange` が `melange.emit` スタンザを実行し、OCaml ソースを ES6 モジュールとして `_build/default/src/output/` に書き出す。
2. **JS → ブラウザ**: Vite が `ui/` を root として起動し、`resolve.alias` で `_build/default/src/output/` 配下を仮想 npm パッケージのように見せかけ、ブラウザに配信する。

OCaml を書き換えると `.ml → .js → HMR` の順で即座に反映される。

## 1. OCaml 側

### 1.1 `src/lib/` — コアロジック (`calc_core` ライブラリ)

`src/lib/dune`:

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

(ocamllex lexer)
```

- `(modes melange)` で OCaml コードを JS 出力モードでビルドする。
- `(preprocess (pps melange.ppx))` により `[%mel.obj { ... }]` などの相互運用構文を利用可能にする。
- menhir (incremental API) と ocamllex で構築したパーサ/レキサを計算エンジンに使っている。

構成ファイル:

| ファイル | 役割 |
|---|---|
| `ast.ml` | 式・文の AST 定義 |
| `lexer.mll` | ocamllex によるトークナイザ |
| `parser.mly` | menhir incremental parser |
| `eval.ml` | AST 評価と環境管理 |
| `session.ml` | **JS との境界面**。REPL セッションと結果オブジェクトを公開する |

### 1.2 `src/main.ml` — エクスポート宣言

```ocaml
let create_session = Calc_core.Session.create_session
```

JS 側から `import { create_session } from 'melange-output/src/main.js'` で参照される入り口。`main.ml` がそのまま `main.js` に変換される。

### 1.3 `src/dune` — JS 出力スタンザ

```dune
(melange.emit
 (target output)
 (alias melange)
 (module_systems es6)
 (libraries calc_core)
 (preprocess (pps melange.ppx)))
```

- `melange.emit` は「ここから JS を吐く」宣言。
- `(target output)` によって出力先が `_build/default/src/output/` になる。
- `(module_systems es6)` で ES6 モジュール形式を指定 (Vite/ブラウザが直接読める)。
- `(alias melange)` により `dune build @melange` で起動できる。

## 2. Melange の相互運用プリミティブ

`src/lib/session.ml` が JS 境界で使っている Melange の機能:

### 2.1 `[%mel.obj { ... }]` — OCaml レコード → JS オブジェクト

```ocaml
let make_expr_result (v : float) : result_obj =
  [%mel.obj {
    success = true;
    kind = "expr";
    name = Js.Nullable.null;
    value = Js.Nullable.return v;
    error_message = Js.Nullable.null;
    error_column = Js.Nullable.null;
  }]
```

PPX が展開時に **JS オブジェクトリテラル** へ変換する。JS 側では通常のオブジェクトとしてプロパティアクセスできる。

### 2.2 open object type (`< ... > Js.t`)

```ocaml
type result_obj = <
  success : bool;
  kind : string;
  name : string Js.Nullable.t;
  value : float Js.Nullable.t;
  error_message : string Js.Nullable.t;
  error_column : int Js.Nullable.t;
> Js.t
```

OCaml のオブジェクト型で JS 側の「形」を表現する。型定義が JS オブジェクトの構造をそのまま反映する。

### 2.3 `Js.Nullable.t` — OCaml option の代わり

OCaml の `option` 型は JS では少し扱いづらいため、`Js.Nullable.t` を使い `Js.Nullable.null` / `Js.Nullable.return v` で `null | value` を表現する。JS 側では `result.value === null` で単純に判定できる。

### 2.4 クロージャで状態保持

```ocaml
let create_session () =
  let env = ref Eval.StringMap.empty in
  [%mel.obj {
    eval = (fun (input : string) -> ...);
    hints = (fun (input : string) -> ...)
  }]
```

`env` (変数束縛) は `ref` でクロージャにキャプチャされ、生成された JS オブジェクトのメソッド越しに共有される。複数回 `session.eval(...)` を呼んでも状態が持続する。

## 3. ビルド成果物の構造

`dune build @melange` 後の `_build/default/src/output/` レイアウト:

```
_build/default/src/output/
├── src/
│   ├── main.js              ← create_session をエクスポート (ui からの入口)
│   └── lib/
│       ├── session.js
│       ├── eval.js
│       ├── parser.js
│       ├── lexer.js
│       └── ast.js
└── node_modules/
    ├── melange/                               ← OCaml 標準ライブラリの JS 移植
    ├── melange.js/                            ← Js.Nullable などの相互運用
    └── melange.__private__.melange_mini_stdlib/
```

重要な点:

- Melange は **自前の node_modules ディレクトリ構造** を output 配下に生成する。ランタイムと標準ライブラリはここに入る。
- 生成された `.js` ファイル同士は相対パスと `node_modules/` ルックアップで解決し合う通常の ES モジュールとして動く。
- つまり output ディレクトリは丸ごと「自己完結した小さな npm ワールド」になっている。

## 4. Vite 側の橋渡し (`vite.config.js`)

```js
import { defineConfig } from 'vite';
import path from 'path';

const melangeOutput = path.resolve(__dirname, '_build/default/src/output');
const melangeNodeModules = path.join(melangeOutput, 'node_modules');

export default defineConfig({
  root: 'ui',
  resolve: {
    alias: {
      'melange-output': melangeOutput,
      'melange.js':     path.join(melangeNodeModules, 'melange.js'),
      'melange.__private__.melange_mini_stdlib':
                        path.join(melangeNodeModules, 'melange.__private__.melange_mini_stdlib'),
      'melange':        path.join(melangeNodeModules, 'melange'),
    }
  },
  server: { fs: { allow: ['..'] } },
  build:   { target: 'esnext' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
```

ポイント:

- `root: 'ui'` で Vite のルートはフロントエンドディレクトリ。
- `resolve.alias` により、`_build/default/src/output/` をあたかも `melange-output` という npm パッケージかのように見せる。同時に `melange` / `melange.js` / `melange.__private__.melange_mini_stdlib` という Melange ランタイムの「仮想パッケージ」も登録する (出力 JS 内の `import 'melange/stdlib.js'` 等を解決するため)。
- `server.fs.allow: ['..']` で Vite が root 外 (`_build/`) へ読みに行くのを許可する。
- `esnext` ターゲットで最新 JS 機能をそのまま通す (Melange の出力は ES6+ 機能を前提)。

## 5. JS 側からの呼び出し (`ui/repl/repl.js`)

```js
import { create_session } from 'melange-output/src/main.js';

// ...

this.session = create_session();

// 評価
const result = this.session.eval(trimmed);
if (result.success) {
  if (result.kind === 'expr') {
    // result.value: float
  } else {
    // result.kind === 'binding' → result.name / result.value
  }
} else {
  // result.error_message / result.error_column
}
```

エイリアスを経由して `_build/default/src/output/src/main.js` に解決され、そこから再帰的に `./lib/session.js` や `melange/stdlib.js` などランタイムまで展開される。Vite の依存最適化 (`optimizeDeps`) が ES モジュール群をまとめてブラウザに配信する。

境界での型マッピングのまとめ:

| OCaml 側 | JS 側 |
|---|---|
| `< f : T > Js.t` object type | 通常の JS オブジェクト |
| `[%mel.obj { f = v }]` | `{ f: v }` リテラル |
| `string` / `float` / `int` / `bool` | 同名のプリミティブ |
| `Js.Nullable.t` | `T \| null` |
| 関数 (クロージャ) | JS 関数 (環境はクロージャで保持) |

## 6. 開発ワークフロー

典型的な並行実行:

```sh
# 端末 1: OCaml ウォッチビルド
dune build @melange -w

# 端末 2: Vite 開発サーバ
npm run dev
```

- `.ml` を保存 → dune が `_build/.../output/` を更新 → Vite が差分検知 → ブラウザ HMR。
- `npm run build` で `vite build` が走り、`ui/dist/` に静的サイトが出力される (Melange 出力は build 済みの `_build` を参照するので、dune build を先に通しておく必要がある)。

## 7. まとめ

- **Melange が OCaml を ES6 モジュールとして `_build` に吐き、Vite が alias でそれを通常の npm パッケージのように見せかけてブラウザへ配信する**、というのがこのリポジトリの全体構成。
- 境界で使われる相互運用の要は `[%mel.obj]`, `Js.Nullable.t`, open object type (`< ... > Js.t`) の 3 点。
- ランタイム (OCaml stdlib 相当) は Melange が生成する output 配下の `node_modules/` に自己完結しており、Vite の alias がこれを横取りしてブラウザ向けにバンドルする。
- OCaml 側で状態を保持したい場合は `ref` + クロージャでキャプチャし、`[%mel.obj]` のメソッドとして JS に公開するのが基本パターン (`Session.create_session` がその典型)。
