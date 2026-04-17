// 補完候補ポップアップ (CellBuffer 直書き方式)。
// CellBuffer に候補テキストを直接書き込むことで、CRT ポストエフェクトの
// 対象となりターミナル本体と同じ質感で表示される。
// show/hide 時に対象行のセルを退避・復元する。

import { makeCell, writeCells } from '../terminal/cell-buffer.js';

/**
 * @typedef {import('../terminal/cell-buffer.js').CellBuffer} CellBuffer
 * @typedef {import('../types.d.ts').Cell} Cell
 * @typedef {import('../types.d.ts').CellStyle} CellStyle
 * @typedef {import('../types.d.ts').CompletionItem} CompletionItem
 * @typedef {import('../types.d.ts').CompletionKind} CompletionKind
 */

const MAX_VISIBLE = 8;

// cell.style.bg に格納する「色名」。TerminalCanvas 側でテーマ経由に解決される。
// テーマ切替時にポップアップが表示中でも色が追従する。
const POPUP_BG = 'popup_bg';
const SELECTED_BG = 'popup_selected_bg';
/** @type {CellStyle} */
const STYLE_DETAIL = { dim: true };

/** @type {Partial<Record<CompletionKind, CellStyle>>} */
const KIND_STYLE = {
  variable: { fg: 'yellow' },
  keyword:  { fg: 'magenta' },
  operator: { fg: 'cyan' },
};

/**
 * @param {CellStyle | null | undefined} style
 * @param {string} bg
 * @returns {CellStyle}
 */
const withBg = (style, bg) => style ? { ...style, bg } : { bg };

export class CompletionPopup {
  /** @param {{ buffer: CellBuffer }} opts */
  constructor({ buffer }) {
    this.buffer = buffer;

    /** @type {CompletionItem[]} */
    this.items = [];
    this.selection = 0;
    this.visible = false;

    this.anchorRow = 0;
    this.anchorCol = 0;
    this.popupRows = 0;
    this.popupCols = 0;

    // show 前の元セルを保持。hide で復元する。
    // moveSelection 中は書き戻し→再描画で使い回す。
    /** @type {Cell[][] | null} */
    this._savedCells = null;
  }

  isVisible() {
    return this.visible;
  }

  /** @returns {CompletionItem | null} */
  currentItem() {
    if (!this.visible || this.items.length === 0) return null;
    return this.items[this.selection] ?? null;
  }

  hide() {
    if (!this.visible) return;
    this.#restoreCells();
    this._savedCells = null;
    this.visible = false;
  }

  /**
   * @param {CompletionItem[]} items
   * @param {number} anchorRow
   * @param {number} anchorCol
   */
  show(items, anchorRow, anchorCol) {
    if (!items || items.length === 0) {
      this.hide();
      return;
    }

    // 既にポップアップが出ていた場合は先に復元
    if (this.visible) {
      this.#restoreCells();
      this._savedCells = null;
    }

    this.items = items;
    this.selection = 0;
    this.anchorRow = anchorRow;
    this.anchorCol = anchorCol;

    this.#computeLayout();
    this.#saveCells();
    this.visible = true;
    this.#render();
  }

  /** @param {number} delta */
  moveSelection(delta) {
    if (!this.visible || this.items.length === 0) return;
    const n = this.items.length;
    this.selection = (this.selection + delta + n) % n;
    // savedCells から復元してから再描画 (savedCells 自体は保持)
    this.#restoreCells();
    this.#render();
  }

  // ----- レイアウト -----

  #computeLayout() {
    let labelMax = 0;
    let detailMax = 0;
    for (const it of this.items) {
      if (it.label.length > labelMax) labelMax = it.label.length;
      if (it.detail && it.detail.length > detailMax) detailMax = it.detail.length;
    }
    const gap = detailMax > 0 ? 2 : 0;
    this.popupCols = 1 + labelMax + gap + detailMax + 1;
    this.popupRows = Math.min(this.items.length, MAX_VISIBLE);

    // 画面端に収まるようアンカーを調整
    if (this.anchorCol + this.popupCols > this.buffer.cols) {
      this.anchorCol = Math.max(0, this.buffer.cols - this.popupCols);
    }
    if (this.anchorRow + this.popupRows > this.buffer.rows) {
      this.anchorRow = Math.max(0, this.buffer.rows - this.popupRows);
    }
  }

  // ----- セル退避・復元 -----

  #saveCells() {
    /** @type {Cell[][]} */
    const saved = [];
    for (let r = 0; r < this.popupRows; r++) {
      const row = this.anchorRow + r;
      if (row >= this.buffer.rows) break;
      /** @type {Cell[]} */
      const rowCells = [];
      for (let c = 0; c < this.popupCols; c++) {
        const col = this.anchorCol + c;
        if (col >= this.buffer.cols) break;
        rowCells.push({ ...this.buffer.grid[row][col] });
      }
      saved.push(rowCells);
    }
    this._savedCells = saved;
  }

  #restoreCells() {
    if (!this._savedCells) return;
    for (let r = 0; r < this._savedCells.length; r++) {
      const row = this.anchorRow + r;
      if (row >= this.buffer.rows) break;
      const rowCells = this._savedCells[r];
      for (let c = 0; c < rowCells.length; c++) {
        const col = this.anchorCol + c;
        if (col >= this.buffer.cols) break;
        this.buffer.set(row, col, { ...rowCells[c] });
      }
    }
    // 直上行も dirty にして背景オーバーラップからリカバリさせる
    if (this.anchorRow > 0) {
      this.buffer.dirty.add(this.anchorRow - 1);
    }
  }

  // ----- 描画 -----

  #render() {
    let start = 0;
    if (this.selection >= MAX_VISIBLE) {
      start = this.selection - MAX_VISIBLE + 1;
    }
    const end_ = Math.min(this.items.length, start + MAX_VISIBLE);

    for (let i = start; i < end_; i++) {
      const item = this.items[i];
      const rowIdx = i - start;
      const bufRow = this.anchorRow + rowIdx;
      if (bufRow >= this.buffer.rows) break;

      const isSel = i === this.selection;
      const bgColor = isSel ? SELECTED_BG : POPUP_BG;
      const baseStyle = KIND_STYLE[item.kind] ?? null;
      const labelStyle = isSel ? withBg(baseStyle, SELECTED_BG) : baseStyle;
      const detailStyle = isSel ? withBg(STYLE_DETAIL, SELECTED_BG) : STYLE_DETAIL;

      // 行全体をポップアップ背景で塗る
      for (let c = 0; c < this.popupCols; c++) {
        const col = this.anchorCol + c;
        if (col >= this.buffer.cols) break;
        this.buffer.set(bufRow, col, makeCell(' ', { bg: bgColor }, 1));
      }

      // ラベル (左余白 1 セル)
      writeCells(this.buffer, bufRow, this.anchorCol + 1, item.label, labelStyle);

      // detail 右寄せ (右余白 1 セル)
      if (item.detail) {
        const detailCol = this.anchorCol + this.popupCols - 1 - item.detail.length;
        writeCells(this.buffer, bufRow, detailCol, item.detail, detailStyle);
      }
    }

    // ポップアップ直上の行を dirty にマーク。draw() の背景クリアが
    // ±1px オーバーラップするため、ポップアップ行の描画が直上行の
    // グリフ下端を侵食する。直上行も再描画させることでリカバリする。
    if (this.anchorRow > 0) {
      this.buffer.dirty.add(this.anchorRow - 1);
    }
  }
}
