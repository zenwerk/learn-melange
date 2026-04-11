// row × col のテキストセルバッファ。
// 全角文字は左セルに { ch, width: 2 } を入れ、右セルに { ch: null, width: 0 } 哨兵を置く。
// 行単位の dirty フラグで差分描画を駆動する。

import { cpWidth } from './width.js';

/**
 * @typedef {import('../types.d.ts').Cell} Cell
 * @typedef {import('../types.d.ts').CellStyle} CellStyle
 */

/**
 * @param {string | null} [ch]
 * @param {CellStyle | null} [style]
 * @param {number} [width]
 * @returns {Cell}
 */
export const makeCell = (ch = ' ', style = null, width = 1) => ({ ch, style, width });

/** @returns {Cell} */
const EMPTY = () => makeCell(' ', null, 1);

export class CellBuffer {
  /**
   * @param {number} rows
   * @param {number} cols
   */
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    /** @type {Cell[][]} */
    this.grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, EMPTY),
    );
    /** @type {Set<number>} */
    this.dirty = new Set();
    this.markAllDirty();
  }

  /**
   * @param {number} rows
   * @param {number} cols
   */
  resize(rows, cols) {
    const next = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const old = this.grid[r]?.[c];
        return old ? { ...old } : EMPTY();
      }),
    );
    this.grid = next;
    this.rows = rows;
    this.cols = cols;
    this.markAllDirty();
  }

  clear() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) this.grid[r][c] = EMPTY();
      this.dirty.add(r);
    }
  }

  // 1 セルを書き込む (全角判定は呼び出し側が行う)。
  /**
   * @param {number} row
   * @param {number} col
   * @param {Cell} cell
   */
  set(row, col, cell) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
    this.grid[row][col] = cell;
    this.dirty.add(row);
  }

  /**
   * @param {number} row
   * @param {number} col
   * @returns {Cell | undefined}
   */
  get(row, col) {
    return this.grid[row]?.[col];
  }

  // row の col..col+width-1 を消去 (幅 >1 のセル更新前に使う)
  /**
   * @param {number} row
   * @param {number} col
   * @param {number} width
   */
  clearRun(row, col, width) {
    for (let i = 0; i < width && col + i < this.cols; i++) {
      this.grid[row][col + i] = EMPTY();
    }
    this.dirty.add(row);
  }

  // 一番上 n 行を捨てて下に空行を足す。
  /** @param {number} [n] */
  scrollUp(n = 1) {
    if (n <= 0) return;
    if (n >= this.rows) {
      this.clear();
      return;
    }
    this.grid.splice(0, n);
    for (let i = 0; i < n; i++) {
      this.grid.push(Array.from({ length: this.cols }, EMPTY));
    }
    this.markAllDirty();
  }

  markAllDirty() {
    this.dirty.clear();
    for (let r = 0; r < this.rows; r++) this.dirty.add(r);
  }

  // dirty な行番号を返し、フラグをクリア。順序不問 (draw 側は row 単位独立)。
  /** @returns {number[]} */
  takeDirtyRows() {
    const rows = [...this.dirty];
    this.dirty.clear();
    return rows;
  }
}

// 文字列を row の col 位置から書き込む共通ヘルパ。全角文字は 2 セル占有 +
// 右セルに null 哨兵を置く。onWrap が渡されていれば col 超過時に呼び出し、
// (row, col) 組を新しく受け取って continue する。返り値は書き込み後の (row, col)。
/**
 * @param {CellBuffer} buffer
 * @param {number} row
 * @param {number} col
 * @param {string} text
 * @param {CellStyle | null} style
 * @param {(() => { row: number; col: number })} [onWrap]
 * @returns {{ row: number; col: number }}
 */
export function writeCells(buffer, row, col, text, style, onWrap) {
  for (const ch of text) {
    const w = cpWidth(/** @type {number} */ (ch.codePointAt(0)));
    if (w === 0) continue;
    if (col + w > buffer.cols) {
      if (!onWrap) break;
      ({ row, col } = onWrap());
    }
    buffer.set(row, col, makeCell(ch, style, w));
    if (w === 2) buffer.set(row, col + 1, makeCell(null, style, 0));
    col += w;
  }
  return { row, col };
}
