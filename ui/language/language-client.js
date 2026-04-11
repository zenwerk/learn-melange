// 言語非依存の薄いクライアント。
// SessionClient (complete / diagnose / hover / tokens を持つ) を受け取り、
// デバウンスと簡易キャッシュだけを担当する。

/**
 * @typedef {import('./session-client.js').SessionClient} SessionClient
 * @typedef {import('../types.d.ts').CompletionItem} CompletionItem
 * @typedef {import('../types.d.ts').Diagnostic} Diagnostic
 * @typedef {import('../types.d.ts').HoverInfo} HoverInfo
 * @typedef {import('../types.d.ts').SemanticToken} SemanticToken
 */

/**
 * @param {{ input: string; offset: number }} a
 * @param {{ input: string; offset: number }} b
 */
const SAME_KEY = (a, b) => a.input === b.input && a.offset === b.offset;

export class LanguageClient {
  /**
   * @param {SessionClient} session
   * @param {{ debounceMs?: number }} [opts]
   */
  constructor(session, { debounceMs = 30 } = {}) {
    this.session = session;
    this.debounceMs = debounceMs;
    /** @type {{ input: string; offset: number } | null} */
    this._lastCompleteKey = null;
    /** @type {CompletionItem[] | null} */
    this._lastCompleteItems = null;
  }

  // 同期版: Tab 押下など即応が欲しいケース用
  /**
   * @param {string} input
   * @param {number} offset
   * @returns {CompletionItem[]}
   */
  completeSync(input, offset) {
    const key = { input, offset };
    if (this._lastCompleteKey && SAME_KEY(this._lastCompleteKey, key)) {
      return /** @type {CompletionItem[]} */ (this._lastCompleteItems);
    }
    const items = this.session.complete(input, offset);
    this._lastCompleteKey = key;
    this._lastCompleteItems = items;
    return items;
  }

  /**
   * @param {string} input
   * @returns {Diagnostic[]}
   */
  diagnose(input) {
    return this.session.diagnose(input);
  }

  /**
   * @param {string} input
   * @param {number} offset
   * @returns {HoverInfo | null}
   */
  hover(input, offset) {
    return this.session.hover(input, offset);
  }

  /**
   * @param {string} input
   * @returns {SemanticToken[]}
   */
  tokens(input) {
    return this.session.tokens(input);
  }
}

/**
 * @param {SessionClient} session
 * @param {{ debounceMs?: number }} [opts]
 */
export function createLanguageClient(session, opts) {
  return new LanguageClient(session, opts);
}
