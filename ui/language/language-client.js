// SessionClient を受け取り、Tab 押下の連打で同じ位置に再問い合わせしない
// よう直近 1 件だけキャッシュする薄い層。diagnose/hover/tokens は現状
// 未使用のため wrap しない。

/**
 * @typedef {import('./session-client.js').SessionClient} SessionClient
 * @typedef {import('../types.d.ts').CompletionItem} CompletionItem
 */

export class LanguageClient {
  /** @param {SessionClient} session */
  constructor(session) {
    this.session = session;
    /** @type {{ input: string; offset: number } | null} */
    this._lastCompleteKey = null;
    /** @type {CompletionItem[] | null} */
    this._lastCompleteItems = null;
  }

  /**
   * @param {string} input
   * @param {number} offset
   * @returns {CompletionItem[]}
   */
  completeSync(input, offset) {
    const last = this._lastCompleteKey;
    if (last && last.input === input && last.offset === offset) {
      return /** @type {CompletionItem[]} */ (this._lastCompleteItems);
    }
    const items = this.session.complete(input, offset);
    this._lastCompleteKey = { input, offset };
    this._lastCompleteItems = items;
    return items;
  }
}
