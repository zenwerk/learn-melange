// 補完候補ポップアップ。
// WebGL ポストエフェクトの外側に別 Canvas を 1 枚重ねて、
// シャープな候補リストを描画する。

import { DEFAULT_THEME } from '../terminal/terminal-canvas.js';

const MAX_VISIBLE = 8;
const PADDING_X = 6;
const PADDING_Y = 4;
const ROW_GAP = 2;

const T = DEFAULT_THEME;
const COLORS = Object.freeze({
  background: 'rgba(24, 24, 37, 0.95)',
  border: 'rgba(137, 180, 250, 0.5)',
  text: T.foreground,
  dim: T.colors.gray,
  selectedBg: 'rgba(137, 180, 250, 0.25)',
  selectedText: '#f5e0dc',
  kindVariable: T.colors.yellow,
  kindKeyword: '#cba6f7',
  kindOperator: T.colors.cyan,
});

const KIND_COLOR = Object.freeze({
  variable: COLORS.kindVariable,
  keyword:  COLORS.kindKeyword,
  operator: COLORS.kindOperator,
});

export class CompletionPopup {
  constructor({ host }) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'completion-popup';
    this.canvas.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:none;display:none;z-index:10;';
    this.ctx = this.canvas.getContext('2d');
    host.appendChild(this.canvas);

    this.dpr = window.devicePixelRatio || 1;
    this.items = [];
    this.selection = 0;
    this.visible = false;
    this.font = '12px monospace';
    this.lineHeight = 18;
    this.anchor = { left: 0, top: 0 };

    // キャッシュ: show() 時に計算し、moveSelection では再計算しない
    this._cachedWidthPx = 0;
    this._cachedHeightPx = 0;
  }

  setFont(fontSize, fontFamily) {
    this.font = `${fontSize}px ${fontFamily}`;
    this.lineHeight = Math.ceil(fontSize * 1.35);
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
    this.visible = false;
    this.canvas.style.display = 'none';
  }

  show(items, anchorLeftPx, anchorTopPx) {
    if (!items || items.length === 0) {
      this.hide();
      return;
    }
    this.items = items;
    this.selection = 0;
    this.anchor = { left: anchorLeftPx, top: anchorTopPx };
    this.visible = true;
    this.canvas.style.display = 'block';
    this.#computeLayout();
    this.#render();
  }

  moveSelection(delta) {
    if (!this.visible || this.items.length === 0) return;
    const n = this.items.length;
    this.selection = (this.selection + delta + n) % n;
    this.#render();
  }

  // measureText + canvas サイズを計算してキャッシュ
  #computeLayout() {
    const ctx = this.ctx;
    ctx.font = this.font;
    let labelMax = 0;
    let detailMax = 0;
    for (const it of this.items) {
      const lw = ctx.measureText(it.label).width;
      if (lw > labelMax) labelMax = lw;
      if (it.detail) {
        const dw = ctx.measureText(it.detail).width;
        if (dw > detailMax) detailMax = dw;
      }
    }
    const gap = detailMax > 0 ? 16 : 0;
    const widthPx = labelMax + gap + detailMax + PADDING_X * 2;
    const rowCount = Math.min(this.items.length, MAX_VISIBLE);
    const heightPx = rowCount * (this.lineHeight + ROW_GAP) - ROW_GAP + PADDING_Y * 2;

    this._cachedWidthPx = widthPx;
    this._cachedHeightPx = heightPx;

    this.canvas.width = Math.ceil(widthPx * this.dpr);
    this.canvas.height = Math.ceil(heightPx * this.dpr);
    this.canvas.style.width = `${widthPx}px`;
    this.canvas.style.height = `${heightPx}px`;
    this.canvas.style.left = `${this.anchor.left}px`;
    this.canvas.style.top = `${this.anchor.top}px`;
  }

  #render() {
    const ctx = this.ctx;
    const widthPx = this._cachedWidthPx;
    const heightPx = this._cachedHeightPx;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = this.font;
    ctx.textBaseline = 'middle';

    // 背景
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, widthPx - 1, heightPx - 1);

    // スクロール: 選択行が範囲外に出ないようにする
    let start = 0;
    if (this.selection >= MAX_VISIBLE) {
      start = this.selection - MAX_VISIBLE + 1;
    }
    const end_ = Math.min(this.items.length, start + MAX_VISIBLE);

    for (let i = start; i < end_; i++) {
      const item = this.items[i];
      const rowIdx = i - start;
      const y = PADDING_Y + rowIdx * (this.lineHeight + ROW_GAP);
      const isSel = i === this.selection;

      if (isSel) {
        ctx.fillStyle = COLORS.selectedBg;
        ctx.fillRect(2, y, widthPx - 4, this.lineHeight);
      }

      ctx.fillStyle = isSel ? COLORS.selectedText : (KIND_COLOR[item.kind] ?? COLORS.text);
      ctx.fillText(item.label, PADDING_X, y + this.lineHeight / 2);

      if (item.detail) {
        ctx.fillStyle = COLORS.dim;
        const detailX = widthPx - PADDING_X - ctx.measureText(item.detail).width;
        ctx.fillText(item.detail, detailX, y + this.lineHeight / 2);
      }
    }
  }
}
