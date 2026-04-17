// @ts-nocheck
// テーマの単一ソース: CSS カスタムプロパティを読み取り、Canvas2D と WebGL 双方が
// 使える形へ正規化する。
//
// - readTheme(): CSS 変数から DEFAULT_THEME 同形のオブジェクトを返す
// - themeToVec3(): 任意の CSS 色表現 (hex/hsl/oklch 等) を [r,g,b] (0-1) へ
// - onThemeChange(): <body> の class 変化を MutationObserver で監視
//
// JSDOM では getComputedStyle が空文字を返すため、フォールバック値を常備する。

/**
 * @typedef {{
 *   background: string, foreground: string, cursor: string,
 *   selection: string, dim: string,
 *   colors: Record<string, string>,
 *   popup: { bg: string, selectedBg: string },
 *   panel: { bg: string, fg: string, border: string, surface: string },
 * }} Theme
 */

/** @type {Theme} */
const FALLBACK = Object.freeze({
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
  popup: { bg: '#1e1e2e', selectedBg: '#313244' },
  panel: {
    bg: 'rgba(20, 20, 28, 0.92)',
    fg: '#d0d4e0',
    border: '#3a3f50',
    surface: '#1a1d28',
  },
});

const VAR_MAP = {
  background: '--term-bg',
  foreground: '--term-fg',
  cursor: '--term-cursor',
  selection: '--term-selection',
  dim: '--term-dim',
};

const COLOR_VAR_MAP = {
  blue: '--term-color-blue',
  yellow: '--term-color-yellow',
  red: '--term-color-red',
  green: '--term-color-green',
  gray: '--term-color-gray',
  magenta: '--term-color-magenta',
  cyan: '--term-color-cyan',
  white: '--term-color-white',
};

/**
 * @param {CSSStyleDeclaration} style
 * @param {string} varName
 * @param {string} fallback
 */
function read(style, varName, fallback) {
  const v = style.getPropertyValue(varName).trim();
  return v || fallback;
}

/**
 * @param {HTMLElement} [root]
 * @returns {Theme}
 */
export function readTheme(root = document.documentElement) {
  const gcs = typeof getComputedStyle === 'function' ? getComputedStyle(root) : null;
  if (!gcs) return FALLBACK;

  /** @type {Record<string,string>} */
  const colors = {};
  for (const [key, varName] of Object.entries(COLOR_VAR_MAP)) {
    colors[key] = read(gcs, varName, FALLBACK.colors[key]);
  }

  return {
    background: read(gcs, VAR_MAP.background, FALLBACK.background),
    foreground: read(gcs, VAR_MAP.foreground, FALLBACK.foreground),
    cursor: read(gcs, VAR_MAP.cursor, FALLBACK.cursor),
    selection: read(gcs, VAR_MAP.selection, FALLBACK.selection),
    dim: read(gcs, VAR_MAP.dim, FALLBACK.dim),
    colors,
    popup: {
      bg: read(gcs, '--term-popup-bg', FALLBACK.popup.bg),
      selectedBg: read(gcs, '--term-popup-selected-bg', FALLBACK.popup.selectedBg),
    },
    panel: {
      bg: read(gcs, '--panel-bg', FALLBACK.panel.bg),
      fg: read(gcs, '--panel-fg', FALLBACK.panel.fg),
      border: read(gcs, '--panel-border', FALLBACK.panel.border),
      surface: read(gcs, '--panel-surface', FALLBACK.panel.surface),
    },
  };
}

// ブラウザの color parser を介して任意色を [r,g,b] (0-1) に正規化する。
// 1x1 canvas を module シングルトンで保持し、毎回の再生成を回避。
let _probe = null;
let _probeCtx = null;

/**
 * @param {string} cssColor
 * @returns {[number, number, number]}
 */
export function themeToVec3(cssColor) {
  if (!_probe) {
    _probe = document.createElement('canvas');
    _probe.width = 1;
    _probe.height = 1;
    _probeCtx = _probe.getContext('2d', { willReadFrequently: true });
  }
  if (!_probeCtx) return [1, 1, 1];
  _probeCtx.clearRect(0, 0, 1, 1);
  _probeCtx.fillStyle = '#000';
  _probeCtx.fillStyle = cssColor;
  _probeCtx.fillRect(0, 0, 1, 1);
  const d = _probeCtx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

/**
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
export function onThemeChange(callback) {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  const body = document.body;
  if (!body) return () => {};
  const obs = new MutationObserver(() => callback());
  obs.observe(body, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}

export const THEME_FALLBACK = FALLBACK;
