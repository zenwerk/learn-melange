// 将来 Worker 化した際、postMessage ベースに差し替えるだけで呼び出し元
// (repl.js / language-client.js) が一切変わらないようにするための薄い層。

/**
 * @typedef {import('../types.d.ts').SessionOp} SessionOp
 * @typedef {import('../types.d.ts').EvalResultObj} EvalResultObj
 * @typedef {import('../types.d.ts').CompletionItem} CompletionItem
 * @typedef {import('../types.d.ts').Diagnostic} Diagnostic
 * @typedef {import('../types.d.ts').HoverInfo} HoverInfo
 * @typedef {import('../types.d.ts').SemanticToken} SemanticToken
 * @typedef {import('melange-output/src/main.js').RawSession} RawSession
 */

/** @type {Readonly<Record<string, SessionOp>>} */
const OP = Object.freeze({
  EVAL: 'eval',
  COMPLETE: 'complete',
  DIAGNOSE: 'diagnose',
  HOVER: 'hover',
  TOKENS: 'tokens',
});

export class SessionClient {
  /** @param {RawSession} session */
  constructor(session) {
    this.session = session;
  }

  /**
   * @param {string} input
   * @returns {EvalResultObj}
   */
  eval(input) {
    return /** @type {EvalResultObj} */ (this.session.request({ op: OP.EVAL, input }));
  }

  /**
   * @param {string} input
   * @param {number} offset
   * @returns {CompletionItem[]}
   */
  complete(input, offset) {
    return /** @type {CompletionItem[]} */ (this.session.request({ op: OP.COMPLETE, input, offset }));
  }

  /**
   * @param {string} input
   * @returns {Diagnostic[]}
   */
  diagnose(input) {
    return /** @type {Diagnostic[]} */ (this.session.request({ op: OP.DIAGNOSE, input }));
  }

  /**
   * @param {string} input
   * @param {number} offset
   * @returns {HoverInfo | null}
   */
  hover(input, offset) {
    return /** @type {HoverInfo | null} */ (this.session.request({ op: OP.HOVER, input, offset }));
  }

  /**
   * @param {string} input
   * @returns {SemanticToken[]}
   */
  tokens(input) {
    return /** @type {SemanticToken[]} */ (this.session.request({ op: OP.TOKENS, input }));
  }
}

/** @param {RawSession} session */
export function createSessionClient(session) {
  return new SessionClient(session);
}
