// OCaml Js_bridge ↔ JS の境界契約。
// src/js_bridge.ml の shape と常に同期していること。

declare module '*.frag?raw' {
  const content: string;
  export default content;
}
declare module '*.vert?raw' {
  const content: string;
  export default content;
}
declare module '*.glsl?raw' {
  const content: string;
  export default content;
}

export type SessionOp = 'eval' | 'complete' | 'diagnose' | 'hover' | 'tokens';

export type SessionRequest = {
  op: SessionOp;
  input?: string;
  offset?: number;
};

// enum は言語アダプタが自由に拡張できるよう string に緩和する。
// 既存 OCaml/Melange 実装が返す値 ('expr' | 'binding' | 'error' 等) は
// 部分集合として引き続き有効。新言語は任意の文字列を返してよい。
export type EvalResultKind = string;

export interface EvalResultObj {
  success: boolean;
  kind: EvalResultKind;
  name: string | null;
  value: unknown;
  error_message: string | null;
  error_column: number | null;
}

export type CompletionKind = string;

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  detail: string | null;
}

export type DiagnosticSeverity = string;

export interface Diagnostic {
  message: string;
  start_col: number;
  end_col: number;
  severity: DiagnosticSeverity;
}

export interface HoverInfo {
  contents: string;
  start_col: number;
  end_col: number;
}

export type TokenKind = string;

export interface SemanticToken {
  start_col: number;
  length: number;
  kind: TokenKind;
}

export interface CellStyle {
  fg?: string | null;
  bg?: string | null;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

export interface Cell {
  ch: string | null;
  style: CellStyle | null;
  width: number;
}

export interface Segment {
  text: string;
  style?: CellStyle | null;
}

export type ActionName =
  | 'submit'
  | 'deleteBack'
  | 'deleteForward'
  | 'moveLeft'
  | 'moveRight'
  | 'moveHome'
  | 'moveEnd'
  | 'moveWordLeft'
  | 'moveWordRight'
  | 'killToEnd'
  | 'killToHead'
  | 'killPrevWord'
  | 'historyPrev'
  | 'historyNext'
  | 'completeNext'
  | 'completePrev'
  | 'completeCancel';

export interface ComposeEvent {
  phase: 'start' | 'update' | 'end';
  text?: string;
}

export interface BeginOptions {
  input?: string;
  cursor?: number;
}
