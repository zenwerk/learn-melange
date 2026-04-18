// @ts-nocheck
// OCaml/Melange バックエンドの LanguageBackend ファクトリ。
// Profile は純関数のみで melange-profile.js に分離 (テストで OCaml ビルド
// 成果物を要求しないため)。
// 言語差し替え時は同形のアダプタを別ファイルに書き、main.js の import を
// 切り替えるだけで REPL 本体は変更不要。

import { create_session } from 'melange-output/src/main.js';
import { SessionClient } from './session-client.js';

/**
 * @typedef {import('./backend.d.ts').LanguageBackend} LanguageBackend
 */

/** @returns {LanguageBackend} */
export function createMelangeBackend() {
  return new SessionClient(create_session());
}
