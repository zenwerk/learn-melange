// 補完候補ポップアップ (CellBuffer 直書き方式)。
// CellBuffer に候補テキストを直接書き込むことで、CRT ポストエフェクトの
// 対象となりターミナル本体と同じ質感で表示される。
// show/hide 時に対象行のセルを退避・復元する。

import { makeCell, writeCells } from '../terminal/cell-buffer.js';

const MAX_VISIBLE = 8;

// ポップアップ内のスタイル定義 (TerminalCanvas の resolveFg で解決される)
const POPUP_BG = '#1e1e2e';               // 通常行背景 (直接 CSS カラー)
const SELECTED_BG = '#313244';            // 選択行背景
const STYLE_LABEL_VAR = { fg: 'yellow' };
const STYLE_LABEL_KW  = { fg: 'magenta' };
const STYLE_LABEL_OP  = { fg: 'cyan' };
const STYLE_LABEL_DEF = null;
const STYLE_DETAIL    = { dim: true };
const STYLE_SELECTED_VAR = { fg: 'yellow', bg: SELECTED_BG };
const STYLE_SELECTED_KW  = { fg: 'magenta', bg: SELECTED_BG };
const STYLE_SELECTED_OP  = { fg: 'cyan', bg: SELECTED_BG };
const STYLE_SELECTED_DEF = { bg: SELECTED_BG };
const STYLE_DETAIL_SEL   = { dim: true, bg: SELECTED_BG };

const KIND_STYLE = {
  variable: STYLE_LABEL_VAR,
  keyword:  STYLE_LABEL_KW,
  operator: STYLE_LABEL_OP,
};
const KIND_STYLE_SEL = {
  variable: STYLE_SELECTED_VAR,
  keyword:  STYLE_SELECTED_KW,
  operator: STYLE_SELECTED_OP,
};

export class CompletionPopup {
  constructor({ buffer }) {
    this.buffer = buffer;

    this.items = [];
    this.selection = 0;
    this.visible = false;

    // ポップアップの左上アンカー (CellBuffer のセル座標)
    this.anchorRow = 0;
    this.anchorCol = 0;

    // ポップアップが占有する行数と列数 (show 時に計算)
    this.popupRows = 0;
    this.popupCols = 0;

    // 退避したセルデータ。show 前の状態に戻すのに使う。
    this._savedCells = null;
  }

  isVisible() {
    return this.visible;
  }

  currentItem() {
    if (!this.visible || this.items.length === 0) return null;
    return this.items[this.selection] ?? null;
  }

  hide() {
    if (!this.visible) return;
    this.#restoreCells();
    this.visible = false;
  }

  show(items, anchorRow, anchorCol) {
    if (!items || items.length === 0) {
      this.hide();
      return;
    }

    // 既にポップアップが出ていた場合は先に復元
    if (this.visible) this.#restoreCells();

    this.items = items;
    this.selection = 0;
    this.anchorRow = anchorRow;
    this.anchorCol = anchorCol;

    // レイアウト計算
    this.#computeLayout();
    // 対象行のセルを退避
    this.#saveCells();
    // 描画
    this.visible = true;
    this.#render();
  }

  moveSelection(delta) {
    if (!this.visible || this.items.length === 0) return;
    const n = this.items.length;
    this.selection = (this.selection + delta + n) % n;
    this.#render();
  }

  // ----- レイアウト -----

  #computeLayout() {
    // 候補のラベル最大幅 + detail 幅を文字数で計算
    let labelMax = 0;
    let detailMax = 0;
    for (const it of this.items) {
      if (it.label.length > labelMax) labelMax = it.label.length;
      if (it.detail && it.detail.length > detailMax) detailMax = it.detail.length;
    }
    const gap = detailMax > 0 ? 2 : 0;
    // 左右に 1 セルずつ余白
    this.popupCols = 1 + labelMax + gap + detailMax + 1;
    this.popupRows = Math.min(this.items.length, MAX_VISIBLE);

    // 画面右端を超える場合は左にずらす
    if (this.anchorCol + this.popupCols > this.buffer.cols) {
      this.anchorCol = Math.max(0, this.buffer.cols - this.popupCols);
    }
    // 画面下端を超える場合は上にずらす
    if (this.anchorRow + this.popupRows > this.buffer.rows) {
      this.anchorRow = Math.max(0, this.buffer.rows - this.popupRows);
    }

    this._labelMax = labelMax;
    this._detailMax = detailMax;
    this._gap = gap;
  }

  // ----- セル退避・復元 -----

  #saveCells() {
    const saved = [];
    for (let r = 0; r < this.popupRows; r++) {
      const row = this.anchorRow + r;
      if (row >= this.buffer.rows) break;
      const rowCells = [];
      for (let c = 0; c < this.popupCols; c++) {
        const col = this.anchorCol + c;
        if (col >= this.buffer.cols) break;
        const cell = this.buffer.grid[row][col];
        rowCells.push({ ...cell });
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
        this.buffer.set(row, col, rowCells[c]);
      }
    }
    this._savedCells = null;
  }

  // ----- 描画 -----

  #render() {
    // スクロール: 選択行が範囲外に出ないようにする
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
      const labelStyle = isSel
        ? (KIND_STYLE_SEL[item.kind] ?? STYLE_SELECTED_DEF)
        : (KIND_STYLE[item.kind] ?? STYLE_LABEL_DEF);
      const detailStyle = isSel ? STYLE_DETAIL_SEL : STYLE_DETAIL;

      // 行全体をポップアップ背景で塗る
      for (let c = 0; c < this.popupCols; c++) {
        const col = this.anchorCol + c;
        if (col >= this.buffer.cols) break;
        this.buffer.set(bufRow, col, makeCell(' ', { bg: bgColor }, 1));
      }

      // ラベルを書き込み (左余白 1 セル)
      let col = this.anchorCol + 1;
      writeCells(this.buffer, bufRow, col, item.label, labelStyle);

      // detail を右寄せ (右余白 1 セル)
      if (item.detail) {
        const detailCol = this.anchorCol + this.popupCols - 1 - item.detail.length;
        writeCells(this.buffer, bufRow, detailCol, item.detail, detailStyle);
      }
    }
  }
}
