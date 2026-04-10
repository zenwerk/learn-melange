// 補完候補ポップアップ。
// WebGL ポストエフェクトの外側に別 Canvas を 1 枚重ねて、
// シャープな候補リストを描画する。
//
// 位置はターミナルのセル座標 (row, col) で指定し、TerminalCanvas の
// cellWidth/cellHeight とマウントの padding から画面上のピクセル座標に変換する。

const MAX_VISIBLE = 8;
const PADDING_X = 6;
const PADDING_Y = 4;
const ROW_GAP = 2;

const COLORS = {
  background: 'rgba(24, 24, 37, 0.95)',
  border: 'rgba(137, 180, 250, 0.5)',
  text: '#cdd6f4',
  dim: '#6c7086',
  selectedBg: 'rgba(137, 180, 250, 0.25)',
  selectedText: '#f5e0dc',
  kindVariable: '#f9e2af',
  kindKeyword: '#cba6f7',
  kindOperator: '#94e2d5',
};

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
    this.#render();
  }

  moveSelection(delta) {
    if (!this.visible || this.items.length === 0) return;
    const n = this.items.length;
    this.selection = (this.selection + delta + n) % n;
    this.#render();
  }

  // ----- 描画 -----

  #render() {
    const ctx = this.ctx;
    ctx.font = this.font;
    // 候補ラベル幅を計算
    const labelWidths = this.items.map((it) => ctx.measureText(it.label).width);
    const detailWidths = this.items.map((it) =>
      it.detail ? ctx.measureText(it.detail).width : 0
    );
    const labelMax = Math.max(...labelWidths, 0);
    const detailMax = Math.max(...detailWidths, 0);
    const gap = detailMax > 0 ? 16 : 0;
    const contentW = labelMax + gap + detailMax;
    const widthPx = contentW + PADDING_X * 2;

    const rowCount = Math.min(this.items.length, MAX_VISIBLE);
    const heightPx = rowCount * (this.lineHeight + ROW_GAP) - ROW_GAP + PADDING_Y * 2;

    // DPR 対応
    this.canvas.width = Math.ceil(widthPx * this.dpr);
    this.canvas.height = Math.ceil(heightPx * this.dpr);
    this.canvas.style.width = `${widthPx}px`;
    this.canvas.style.height = `${heightPx}px`;
    this.canvas.style.left = `${this.anchor.left}px`;
    this.canvas.style.top = `${this.anchor.top}px`;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = this.font;
    ctx.textBaseline = 'middle';

    // 背景
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, widthPx - 1, heightPx - 1);

    // 表示開始インデックス (選択が外に出ないようスクロール)
    let start = 0;
    if (this.selection >= MAX_VISIBLE) {
      start = this.selection - MAX_VISIBLE + 1;
    }
    const end = Math.min(this.items.length, start + MAX_VISIBLE);

    for (let i = start; i < end; i++) {
      const item = this.items[i];
      const rowIdx = i - start;
      const y = PADDING_Y + rowIdx * (this.lineHeight + ROW_GAP);
      const isSel = i === this.selection;

      if (isSel) {
        ctx.fillStyle = COLORS.selectedBg;
        ctx.fillRect(2, y, widthPx - 4, this.lineHeight);
      }

      // ラベル (種別で色分け)
      ctx.fillStyle = isSel
        ? COLORS.selectedText
        : kindColor(item.kind);
      ctx.fillText(item.label, PADDING_X, y + this.lineHeight / 2);

      // 詳細 (右寄せ、dim)
      if (item.detail) {
        ctx.fillStyle = COLORS.dim;
        const detailX = widthPx - PADDING_X - ctx.measureText(item.detail).width;
        ctx.fillText(item.detail, detailX, y + this.lineHeight / 2);
      }
    }
  }
}

function kindColor(kind) {
  switch (kind) {
    case 'variable': return COLORS.kindVariable;
    case 'keyword':  return COLORS.kindKeyword;
    case 'operator': return COLORS.kindOperator;
    default:         return COLORS.text;
  }
}
