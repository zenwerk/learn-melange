// LanguageBackend を ReplUI が直接保持せずに済ませるためのラッパ。
// complete は Tab 連打時の直近 1 件キャッシュを持ち、eval はそのまま委譲する。
// diagnose/hover/tokens は現状未使用のため wrap しない。

/**
 * @typedef {import('./backend.d.ts').LanguageBackend} LanguageBackend
 * @typedef {import('../types.d.ts').CompletionItem} CompletionItem
 * @typedef {import('../types.d.ts').EvalResultObj} EvalResultObj
 */

export class LanguageClient {
  /** @param {LanguageBackend} backend */
  constructor(backend) {
    this.backend = backend;
    /** @type {{ input: string; offset: number } | null} */
    this._lastCompleteKey = null;
    /** @type {CompletionItem[] | null} */
    this._lastCompleteItems = null;
  }

  /**
   * @param {string} input
   * @returns {EvalResultObj}
   */
  eval(input) {
    return this.backend.eval(input);
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
    const items = this.backend.complete(input, offset);
    this._lastCompleteKey = { input, offset };
    this._lastCompleteItems = items;
    return items;
  }
}
