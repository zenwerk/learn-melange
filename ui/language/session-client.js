// 将来 Worker 化した際、postMessage ベースに差し替えるだけで呼び出し元
// が一切変わらないようにするための薄い層。

/**
 * @typedef {import('../types.d.ts').SessionOp} SessionOp
 * @typedef {import('../types.d.ts').EvalResultObj} EvalResultObj
 * @typedef {import('../types.d.ts').CompletionItem} CompletionItem
 * @typedef {import('../types.d.ts').Diagnostic} Diagnostic
 * @typedef {import('../types.d.ts').HoverInfo} HoverInfo
 * @typedef {import('../types.d.ts').SemanticToken} SemanticToken
 * @typedef {import('melange-output/src/main.js').RawSession} RawSession
 */

export class SessionClient {
  /** @param {RawSession} session */
  constructor(session) {
    this.session = session;
  }

  /**
   * @param {SessionOp} op
   * @param {{ input?: string; offset?: number }} payload
   */
  #call(op, payload) {
    return this.session.request({ op, ...payload });
  }

  /**
   * @param {string} input
   * @returns {EvalResultObj}
   */
  eval(input) {
    return /** @type {EvalResultObj} */ (this.#call('eval', { input }));
  }

  /**
   * @param {string} input
   * @param {number} offset
   * @returns {CompletionItem[]}
   */
  complete(input, offset) {
    return /** @type {CompletionItem[]} */ (this.#call('complete', { input, offset }));
  }

  /**
   * @param {string} input
   * @returns {Diagnostic[]}
   */
  diagnose(input) {
    return /** @type {Diagnostic[]} */ (this.#call('diagnose', { input }));
  }

  /**
   * @param {string} input
   * @param {number} offset
   * @returns {HoverInfo | null}
   */
  hover(input, offset) {
    return /** @type {HoverInfo | null} */ (this.#call('hover', { input, offset }));
  }

  /**
   * @param {string} input
   * @returns {SemanticToken[]}
   */
  tokens(input) {
    return /** @type {SemanticToken[]} */ (this.#call('tokens', { input }));
  }
}
