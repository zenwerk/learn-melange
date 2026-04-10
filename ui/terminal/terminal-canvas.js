// Canvas2D に CellBuffer を描画する。
// 表示はしない (display:none) — WebGL テクスチャ元として使う。
// セルサイズは measureText + ascent/descent から算出。

export const DEFAULT_THEME = Object.freeze({
  background: '#11111b',
  foreground: '#cdd6f4',
  cursor: '#a6e3a1',
  selection: '#45475a',
  dim: '#585b70',
  colors: {
    blue: '#89b4fa',
    yellow: '#f9e2af',
    red: '#f38ba8',
    green: '#a6e3a1',
    gray: '#6c7086',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#cdd6f4',
  },
});

const resolveFg = (style, theme) => {
  if (!style) return theme.foreground;
  if (style.dim) return theme.dim;
  if (style.fg && theme.colors[style.fg]) return theme.colors[style.fg];
  return theme.foreground;
};

export class TerminalCanvas {
  constructor({
    buffer,
    fontFamily = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    fontSize = 14,
    theme = DEFAULT_THEME,
    dpr = window.devicePixelRatio || 1,
  }) {
    this.buffer = buffer;
    this.fontFamily = fontFamily;
    this.fontSize = fontSize;
    this.theme = theme;
    this.dpr = dpr;

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'none';
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    this.cursor = { row: 0, col: 0, visible: true, blinkOn: true };
    this.#measure();
    this.#applySize();
  }

  // ピクセル: cellWidth / cellHeight / ascent をフォントから算出。
  #measure() {
    const ctx = this.ctx;
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText('M');
    this.cellWidth = Math.ceil(m.width);
    const ascent = m.actualBoundingBoxAscent || this.fontSize * 0.8;
    const descent = m.actualBoundingBoxDescent || this.fontSize * 0.2;
    // セル上端にグリフが密着すると CRT バレル歪みで上端が切れるため、
    // 上に 2px の余白を確保して描画位置を下げる。
    const pad = 2;
    this.ascent = ascent + pad;
    this.cellHeight = Math.ceil((ascent + descent) * 1.25) + pad;
  }

  #applySize() {
    const wPx = this.buffer.cols * this.cellWidth;
    const hPx = this.buffer.rows * this.cellHeight;
    this.canvas.width = Math.max(1, Math.floor(wPx * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(hPx * this.dpr));
    this.canvas.style.width = `${wPx}px`;
    this.canvas.style.height = `${hPx}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    this.ctx.textBaseline = 'alphabetic';
    this.buffer.markAllDirty();
  }

  setFontSize(size) {
    if (size === this.fontSize) return;
    this.fontSize = size;
    this.#measure();
    this.#applySize();
  }

  resizeBuffer(rows, cols) {
    this.buffer.resize(rows, cols);
    this.#applySize();
  }

  setCursor(row, col, visible = true) {
    this.cursor.row = row;
    this.cursor.col = col;
    this.cursor.visible = visible;
    this.buffer.dirty.add(row);
  }

  setBlink(on) {
    if (this.cursor.blinkOn === on) return;
    this.cursor.blinkOn = on;
    this.buffer.dirty.add(this.cursor.row);
  }

  // dirty 行だけ背景 → 文字 → カーソルを描画する。
  draw() {
    const dirty = this.buffer.takeDirtyRows();
    if (dirty.length === 0) return;
    const { ctx, cellWidth: cw, cellHeight: ch, ascent, theme, buffer } = this;

    for (const r of dirty) {
      // 行全体の背景を塗り直す。グリフが上下にはみ出して残骸が残らないよう、
      // 前後行にわずかにオーバーラップさせてクリアする。
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, r * ch - 1, buffer.cols * cw, ch + 2);

      const row = buffer.grid[r];
      for (let c = 0; c < buffer.cols; c++) {
        const cell = row[c];
        if (!cell || cell.ch === null) continue;

        // セル個別の背景色 (補完ポップアップ等で使用)
        const bg = cell.style?.bg;
        if (bg) {
          const cellW = cw * (cell.width === 2 ? 2 : 1);
          ctx.fillStyle = theme.colors[bg] ?? bg;
          ctx.fillRect(c * cw, r * ch, cellW, ch);
        }

        if (cell.ch === ' ') continue;
        ctx.fillStyle = resolveFg(cell.style, theme);
        // セル矩形に clip してグリフの上下はみ出しを切り落とす
        ctx.save();
        ctx.beginPath();
        const cellW = cw * (cell.width === 2 ? 2 : 1);
        ctx.rect(c * cw, r * ch, cellW, ch);
        ctx.clip();
        ctx.fillText(cell.ch, c * cw, r * ch + ascent);
        ctx.restore();
      }
    }

    // カーソル: dirty 行に含まれる場合のみ再描画
    if (this.cursor.visible && dirty.includes(this.cursor.row)) {
      const { row, col, blinkOn } = this.cursor;
      if (blinkOn) {
        const cell = buffer.grid[row]?.[col];
        const width = cell && cell.width === 2 ? 2 : 1;
        ctx.fillStyle = theme.cursor;
        ctx.fillRect(col * cw, row * ch, cw * width, ch);
        if (cell && cell.ch && cell.ch !== ' ' && cell.ch !== null) {
          ctx.fillStyle = theme.background;
          ctx.save();
          ctx.beginPath();
          ctx.rect(col * cw, row * ch, cw * width, ch);
          ctx.clip();
          ctx.fillText(cell.ch, col * cw, row * ch + ascent);
          ctx.restore();
        }
      }
    }
  }

  // 親要素のピクセルサイズから rows/cols を計算 (FitAddon 相当)
  computeGrid(pxWidth, pxHeight) {
    const cols = Math.max(1, Math.floor(pxWidth / this.cellWidth));
    const rows = Math.max(1, Math.floor(pxHeight / this.cellHeight));
    return { rows, cols };
  }
}
