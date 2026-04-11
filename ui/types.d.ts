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

export type EvalResultKind = 'expr' | 'binding' | 'error';

export interface EvalResultObj {
  success: boolean;
  kind: EvalResultKind;
  name: string | null;
  value: number | null;
  error_message: string | null;
  error_column: number | null;
}

export type CompletionKind = 'keyword' | 'variable' | 'operator' | 'function';

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  detail: string | null;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

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

export type TokenKind =
  | 'keyword'
  | 'ident'
  | 'number'
  | 'operator'
  | 'punct';

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
