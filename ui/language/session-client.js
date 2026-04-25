// 将来 Worker 化した際、postMessage ベースに差し替えるだけで呼び出し元
// が一切変わらないようにするための薄い層。
//
// UTF-16 ↔ UTF-8 ブリッジ:
//   Melange の Stdlib.Bytes.of_string は string を charCodeAt で 1 文字 1 byte
//   として扱うため、UTF-16 の `あ` (U+3042) をそのまま渡すと OCaml の lexer
//   には `[0x3042]` (範囲外 byte) として届き DFA がフォールバックする。
//   UI からの string を TextEncoder で UTF-8 に正規化し、各 byte を
//   String.fromCharCode で 1 文字に詰めた "byte string" にしてから渡すこと
//   で、Melange ランタイムを介しても OCaml 側の lexer.mll 規則
//   (utf8_char = 0xC2-0xDF utf8_cont | …) と整合する。
//   位置情報 (offset / column / start_col / end_col) は UI 側が UTF-16
//   code unit 単位で扱うため、入口で byte に、出口で code unit に逆変換する。

/**
 * @typedef {import('../types.d.ts').SessionOp} SessionOp
 * @typedef {import('../types.d.ts').EvalResultObj} EvalResultObj
 * @typedef {import('../types.d.ts').CompletionItem} CompletionItem
 * @typedef {import('../types.d.ts').Diagnostic} Diagnostic
 * @typedef {import('../types.d.ts').HoverInfo} HoverInfo
 * @typedef {import('../types.d.ts').SemanticToken} SemanticToken
 * @typedef {import('melange-output/src/main.js').RawSession} RawSession
 */

const _enc = new TextEncoder();
const _dec = new TextDecoder('utf-8');

/**
 * UTF-8 byte string (Melange から戻ってきた `name` や `contents`) を
 * UTF-16 string に戻す。byte string 内の各 code unit は 0–255 の範囲。
 * @param {string} s
 */
function utf8BytesToStr(s) {
  if (s === null || s === undefined) return s;
  // ASCII のみなら一致するので変換コストを避けたいが、
  // 識別子に non-ASCII が混じる前提で常にデコードする。
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return _dec.decode(bytes);
}

/**
 * UTF-16 string を UTF-8 byte string (1 文字 = 1 byte) に変換する。
 * Melange の `Bytes.of_string` が `charCodeAt` 経由で byte 値を読むため、
 * この形式にしておくと OCaml lexer が UTF-8 規則に従って認識できる。
 * @param {string} s
 */
function strToUtf8Bytes(s) {
  const bytes = _enc.encode(s);
  // 大きい文字列で fromCharCode の引数上限 (~65535) を踏まないよう分割
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + CHUNK)));
  }
  return out;
}

/**
 * UTF-16 code unit 位置 → UTF-8 byte 位置。
 * @param {string} s
 * @param {number} cuOffset
 */
function cuToByte(s, cuOffset) {
  if (cuOffset <= 0) return 0;
  const clamped = Math.min(cuOffset, s.length);
  return _enc.encode(s.slice(0, clamped)).length;
}

/**
 * UTF-8 byte 位置 → UTF-16 code unit 位置。byteOffset は s を UTF-8 で
 * エンコードしたときの byte 数として解釈する。
 * @param {string} s
 * @param {number} byteOffset
 */
function byteToCu(s, byteOffset) {
  if (byteOffset <= 0) return 0;
  let acc = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    let n;
    if (ch < 0x80) n = 1;
    else if (ch < 0x800) n = 2;
    else if (ch >= 0xD800 && ch <= 0xDBFF) {
      // サロゲートペアは 4 byte / 2 code unit
      n = 4;
      acc += n;
      if (acc >= byteOffset) return i + 2;
      i++;
      continue;
    } else {
      n = 3;
    }
    acc += n;
    if (acc >= byteOffset) return i + 1;
  }
  return s.length;
}

export class SessionClient {
  /** @param {RawSession} session */
  constructor(session) {
    this.session = session;
  }

  /**
   * 入口で input を UTF-8 byte string に詰め替え、offset を byte 位置に
   * 変換する。戻り値の column 系は呼び出し元で逆変換する。
   * @param {SessionOp} op
   * @param {{ input?: string; offset?: number }} payload
   */
  #call(op, payload) {
    const { input, offset } = payload;
    /** @type {{op: SessionOp, input?: string, offset?: number}} */
    const req = { op };
    if (input !== undefined) req.input = strToUtf8Bytes(input);
    if (offset !== undefined) {
      req.offset = input !== undefined ? cuToByte(input, offset) : offset;
    }
    return this.session.request(req);
  }

  /**
   * @param {string} input
   * @returns {EvalResultObj}
   */
  eval(input) {
    const r = /** @type {EvalResultObj} */ (this.#call('eval', { input }));
    if (r && typeof r.error_column === 'number') {
      r.error_column = byteToCu(input, r.error_column);
    }
    if (r && typeof r.name === 'string') r.name = utf8BytesToStr(r.name);
    if (r && typeof r.error_message === 'string') {
      r.error_message = utf8BytesToStr(r.error_message);
    }
    return r;
  }

  /**
   * @param {string} input
   * @param {number} offset
   * @returns {CompletionItem[]}
   */
  complete(input, offset) {
    const arr = /** @type {CompletionItem[]} */ (this.#call('complete', { input, offset }));
    for (const it of arr) {
      if (typeof it.label === 'string') it.label = utf8BytesToStr(it.label);
      if (typeof it.detail === 'string') it.detail = utf8BytesToStr(it.detail);
    }
    return arr;
  }

  /**
   * @param {string} input
   * @returns {Diagnostic[]}
   */
  diagnose(input) {
    const arr = /** @type {Diagnostic[]} */ (this.#call('diagnose', { input }));
    for (const d of arr) {
      d.start_col = byteToCu(input, d.start_col);
      d.end_col = byteToCu(input, d.end_col);
      if (typeof d.message === 'string') d.message = utf8BytesToStr(d.message);
    }
    return arr;
  }

  /**
   * @param {string} input
   * @param {number} offset
   * @returns {HoverInfo | null}
   */
  hover(input, offset) {
    const h = /** @type {HoverInfo | null} */ (this.#call('hover', { input, offset }));
    if (h) {
      h.start_col = byteToCu(input, h.start_col);
      h.end_col = byteToCu(input, h.end_col);
      if (typeof h.contents === 'string') h.contents = utf8BytesToStr(h.contents);
    }
    return h;
  }

  /**
   * @param {string} input
   * @returns {SemanticToken[]}
   */
  tokens(input) {
    const arr = /** @type {SemanticToken[]} */ (this.#call('tokens', { input }));
    for (const t of arr) {
      const startCu = byteToCu(input, t.start_col);
      const endCu = byteToCu(input, t.start_col + t.length);
      t.start_col = startCu;
      t.length = endCu - startCu;
    }
    return arr;
  }
}
