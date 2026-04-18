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

// 既知の値を列挙しつつ `(string & {})` で任意文字列も許すことで、
// 新言語アダプタは自由に拡張しながら既存値の autocomplete を保つ。
export type EvalResultKind = 'expr' | 'binding' | 'error' | (string & {});

export interface EvalResultObj {
  success: boolean;
  kind: EvalResultKind;
  name: string | null;
  value: unknown;
  error_message: string | null;
  error_column: number | null;
}

// 言語サービス由来の kind。OCaml 側 Js_bridge の completion_kind_to_string と同期。
export type LanguageCompletionKind = 'keyword' | 'variable' | 'operator' | 'function';

// エディタ層の trigger と区別するための discriminated union 用キー。
export type CompletionKind = LanguageCompletionKind | 'trigger';

export interface LanguageCompletion {
  label: string;
  kind: LanguageCompletionKind;
  detail: string | null;
}

export interface TriggerCompletion {
  label: string;
  kind: 'trigger';
  detail: string | null;
  triggerLen: number;
}

export type CompletionItem = LanguageCompletion | TriggerCompletion;

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | (string & {});

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

export type TokenKind = 'keyword' | 'ident' | 'number' | 'operator' | 'punct' | (string & {});

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
