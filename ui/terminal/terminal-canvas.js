// @ts-nocheck
// Canvas2D に CellBuffer を描画する。
// 表示はしない (display:none) — WebGL テクスチャ元として使う。
// セルサイズは measureText + ascent/descent から算出。
// テーマは CSS カスタムプロパティを単一ソースとする (theme.js 経由)。

import { readTheme } from './theme.js';
import { BG_POPUP, BG_POPUP_SELECTED } from './cell-style-keys.js';

// 名前付きキー (popup_bg 等 / ANSI 名) は theme を経由して解決する。
// 未知のキーは CSS 色として直接使う (レガシー hex 直指定の受け皿)。
const resolveColor = (key, fallback, theme) => {
  if (!key) return fallback;
  if (key === BG_POPUP) return theme.popup.bg;
  if (key === BG_POPUP_SELECTED) return theme.popup.selectedBg;
  return theme.colors[key] ?? key;
};

const resolveFg = (style, theme) => {
  if (!style) return theme.foreground;
  if (style.dim) return theme.dim;
  return resolveColor(style.fg, theme.foreground, theme);
};

// 特定グリフはモノスペースフォントで明らかに小さく/潰れて見えるため、
// 描画時だけフォントサイズを倍率で拡大する。セル幅・高さは変えない
// (入力時の East Asian Width 推定と整合させる)。
// 範囲は [lo, hi] の閉区間。現状 '⊗' (U+2297) と '☒' (U+2612) のみ。
// 将来的に数学記号全般 (U+2200-U+22FF) など広い範囲を足すことも可。
const MAGNIFIED_RANGES = [
  [0x2297, 0x2297], // ⊗ circled times
  [0x2612, 0x2612], // ☒ ballot box with X
];
const MAGNIFY_FACTOR = 1.3;

const shouldMagnify = (ch) => {
  if (!ch) return false;
  const cp = ch.codePointAt(0);
  for (const [lo, hi] of MAGNIFIED_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
};

export class TerminalCanvas {
  constructor({
    buffer,
    fontFamily = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    fontSize = 14,
    theme = null,
    dpr = window.devicePixelRatio || 1,
  }) {
    this.buffer = buffer;
    this.fontFamily = fontFamily;
    this.fontSize = fontSize;
    this.theme = theme ?? readTheme();
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
    this.normalFont = `${this.fontSize}px ${this.fontFamily}`;
    this.magnifiedFont = `${this.fontSize * MAGNIFY_FACTOR}px ${this.fontFamily}`;
    ctx.font = this.normalFont;
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
    this.magnifyPadX = Math.ceil(this.cellWidth * (MAGNIFY_FACTOR - 1) / 2);
  }

  #applySize() {
    const wPx = this.buffer.cols * this.cellWidth;
    const hPx = this.buffer.rows * this.cellHeight;
    this.canvas.width = Math.max(1, Math.floor(wPx * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(hPx * this.dpr));
    this.canvas.style.width = `${wPx}px`;
    this.canvas.style.height = `${hPx}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.font = this.normalFont;
    this.ctx.textBaseline = 'alphabetic';
    this.buffer.markAllDirty();
  }

  setFontSize(size) {
    if (size === this.fontSize) return;
    this.fontSize = size;
    this.#measure();
    this.#applySize();
  }

  setTheme(theme) {
    this.theme = theme;
    this.buffer.markAllDirty();
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

  // 状態が変化したときだけ true を返す。呼び出し側が render 要求を
  // スキップできるようにするための戻り値。
  setBlink(on) {
    if (this.cursor.blinkOn === on) return false;
    this.cursor.blinkOn = on;
    this.buffer.dirty.add(this.cursor.row);
    return true;
  }

  // dirty 行だけ背景 → 文字 → カーソルを描画する。
  draw() {
    const dirty = this.buffer.takeDirtyRows();
    if (dirty.length === 0) return;
    const { ctx, cellWidth: cw, cellHeight: ch, theme, buffer, magnifyPadX } = this;
    const magnifiedCols = [];

    for (const r of dirty) {
      // 行全体の背景を塗り直す。グリフが上下にはみ出して残骸が残らないよう、
      // 前後行にわずかにオーバーラップさせてクリアする。
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, r * ch - 1, buffer.cols * cw, ch + 2);

      const row = buffer.grid[r];
      magnifiedCols.length = 0;
      // Pass1: 通常セル。拡大セルは col を記録して Pass2 に回す
      // (拡大グリフの左右はみ出し分を通常セル描画で消さないため)。
      for (let c = 0; c < buffer.cols; c++) {
        const cell = row[c];
        if (!cell || cell.ch === null) continue;

        // セル個別の背景色 (補完ポップアップ等で使用)
        const bgColor = resolveColor(cell.style?.bg, null, theme);
        if (bgColor) {
          const cellW = cw * (cell.width === 2 ? 2 : 1);
          ctx.fillStyle = bgColor;
          ctx.fillRect(c * cw, r * ch, cellW, ch);
        }

        if (cell.ch === ' ') continue;
        if (shouldMagnify(cell.ch)) { magnifiedCols.push(c); continue; }

        ctx.fillStyle = resolveFg(cell.style, theme);
        const cellW = cw * (cell.width === 2 ? 2 : 1);
        this.#clipRect(c * cw, r * ch, cellW, ch, () => {
          this.#drawGlyph(cell.ch, c * cw, r * ch, cellW, false);
        });
      }
      // Pass2: 拡大セル。左右に magnifyPadX を取った広い clip で描画し、
      // 隣セルの端にわずかに被せる (後描きなので上書きされる側が拡大グリフ)。
      for (const c of magnifiedCols) {
        const cell = row[c];
        const cellW = cw * (cell.width === 2 ? 2 : 1);
        ctx.fillStyle = resolveFg(cell.style, theme);
        this.#clipRect(c * cw - magnifyPadX, r * ch, cellW + magnifyPadX * 2, ch, () => {
          this.#drawGlyph(cell.ch, c * cw, r * ch, cellW, true);
        });
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
          const mag = shouldMagnify(cell.ch);
          const padX = mag ? this.magnifyPadX : 0;
          ctx.fillStyle = theme.background;
          this.#clipRect(col * cw - padX, row * ch, cw * width + padX * 2, ch, () => {
            this.#drawGlyph(cell.ch, col * cw, row * ch, cw * width, mag);
          });
        }
      }
    }
  }

  // 矩形 clip で fn を実行し、ctx 状態を save/restore で確実に戻す。
  // fn 内で font/textAlign/textBaseline を変更しても呼び出し後には復元される。
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {() => void} fn
   */
  #clipRect(x, y, w, h, fn) {
    const { ctx } = this;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      fn();
    } finally {
      ctx.restore();
    }
  }

  // セル (x, y, cellW) にグリフを描く。magnify=true なら拡大フォントでセル中心に、
  // false なら通常フォントで ascent ベースラインに描く。
  // fillStyle / clip は呼び出し側で設定済みで、呼び出し側が ctx.save/restore で
  // 包んでいる前提なので ctx 状態の手動リセットは不要。
  #drawGlyph(ch, x, y, cellW, magnify) {
    const { ctx } = this;
    if (magnify) {
      ctx.font = this.magnifiedFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, x + cellW / 2, y + this.cellHeight / 2);
      return;
    }
    ctx.fillText(ch, x, y + this.ascent);
  }

  // 親要素のピクセルサイズから rows/cols を計算 (FitAddon 相当)
  computeGrid(pxWidth, pxHeight) {
    const cols = Math.max(1, Math.floor(pxWidth / this.cellWidth));
    const rows = Math.max(1, Math.floor(pxHeight / this.cellHeight));
    return { rows, cols };
  }
}
