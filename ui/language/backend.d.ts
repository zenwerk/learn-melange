// REPL UI と言語サービスの間の契約。
// - LanguageBackend: データ取得 (eval / complete / ...) を定義
// - LanguageProfile: UI 表示 (prompt / banner / 結果整形) を定義
// 言語を差し替える際は ui/language/<name>-adapter.js を新規作成し、
// ui/main.js の import を差し替えるだけで REPL 本体は変更不要。

import type {
  EvalResultObj,
  CompletionItem,
  Diagnostic,
  HoverInfo,
  SemanticToken,
  Segment,
  CellStyle,
} from '../types.d.ts';

export interface LanguageBackend {
  eval(input: string): EvalResultObj;
  complete(input: string, offset: number): CompletionItem[];
  diagnose?(input: string): Diagnostic[];
  hover?(input: string, offset: number): HoverInfo | null;
  tokens?(input: string): SemanticToken[];
}

/** banner 1 行は Segment[] (多セグメントの色付き行) または空文字 (空行) */
export type BannerLine = Segment[] | string;

export interface LanguageProfile {
  readonly prompt: string;
  readonly banner: ReadonlyArray<BannerLine>;
  /** 成功結果を 1 行分の Segment 配列に整形する */
  formatResult(result: EvalResultObj): Segment[];
  /** エラー結果を複数行に整形する (caret 行 + message 行など) */
  formatError(result: EvalResultObj, promptLen: number): Segment[][];
  /** CompletionItem.kind に対応するセルスタイル。未知 kind は null でデフォルト */
  completionStyleFor(kind: string): CellStyle | null;
}
