// Melange の _build/default/src/output/src/main.js を型チェックする
// ためのスタブ。実行時は vite alias が本物を解決する。

export interface RawSession {
  request(req: unknown): unknown;
}

export function create_session(): RawSession;
