// @ts-nocheck
// EffectManager の paramMeta を読んで UI を自動生成する設定パネル。
// - テーマセレクタ + プロファイルセレクタ + パラメータスライダー/カラー/セレクト。
// - 値変更は EffectManager.updateParam 経由でリアルタイム反映。
// - スタイルは CSS 変数駆動 (style.css の .effect-panel*)。

import { EFFECT_ORDER } from './index.js';

const PANEL_ID = 'effect-panel';

export const THEME_ORDER = ['melange', 'amber', 'green-phosphor'];
const THEME_STORAGE_KEY = 'melange-repl:theme';

/** <body> のテーマクラスから現在のテーマ名を読み出す。未設定なら 'melange' */
export function currentTheme() {
  if (typeof document === 'undefined' || !document.body) return 'melange';
  for (const name of THEME_ORDER) {
    if (name === 'melange') continue;
    if (document.body.classList.contains(`theme-${name}`)) return name;
  }
  return 'melange';
}

/** テーマを <body> の class に適用し localStorage に保存する */
export function applyTheme(name) {
  if (typeof document === 'undefined' || !document.body) return;
  for (const n of THEME_ORDER) {
    document.body.classList.remove(`theme-${n}`);
  }
  if (name && name !== 'melange') {
    document.body.classList.add(`theme-${name}`);
  }
  try { localStorage.setItem(THEME_STORAGE_KEY, name); } catch {}
}

/** 起動時: localStorage からテーマ名を読んで <body> に適用 */
export function restoreThemeFromStorage() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEME_ORDER.includes(saved)) applyTheme(saved);
  } catch {}
}

/** vec3 (0-1) → #rrggbb */
function rgbToHex(rgb) {
  const c = (v) => {
    const n = Math.max(0, Math.min(255, Math.round(v * 255)));
    return n.toString(16).padStart(2, '0');
  };
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/** #rrggbb → vec3 (0-1) */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export class EffectPanel {
  constructor({ effects, mount = document.body }) {
    this.effects = effects;
    this.mount = mount;
    this.root = null;
    this.controls = new Map();
  }

  toggle() {
    if (this.root && this.root.style.display !== 'none') this.hide();
    else this.show();
  }

  show() {
    if (!this.root) this.#build();
    this.#rebuildControls();
    this.root.style.display = 'block';
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
  }

  dispose() {
    this.root?.remove();
    this.root = null;
    this.controls.clear();
  }

  #build() {
    const root = document.createElement('div');
    root.id = PANEL_ID;
    root.className = 'effect-panel';

    const header = document.createElement('div');
    header.className = 'effect-panel__header';

    const title = document.createElement('strong');
    title.textContent = 'CRT Effects';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'effect-panel__close';
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    root.appendChild(header);

    // テーマセレクタ
    const themeLabel = document.createElement('label');
    themeLabel.textContent = 'Theme';
    themeLabel.className = 'effect-panel__label';
    root.appendChild(themeLabel);

    this.themeSelect = document.createElement('select');
    this.themeSelect.className = 'effect-panel__select';
    for (const name of THEME_ORDER) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.themeSelect.appendChild(opt);
    }
    this.themeSelect.value = currentTheme();
    this.themeSelect.addEventListener('change', () => {
      applyTheme(this.themeSelect.value);
    });
    root.appendChild(this.themeSelect);

    // プロファイルセレクタ
    const profLabel = document.createElement('label');
    profLabel.textContent = 'Profile';
    profLabel.className = 'effect-panel__label';
    root.appendChild(profLabel);

    this.profileSelect = document.createElement('select');
    this.profileSelect.className = 'effect-panel__select';
    for (const name of EFFECT_ORDER) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.profileSelect.appendChild(opt);
    }
    this.profileSelect.addEventListener('change', () => {
      this.effects.set(this.profileSelect.value);
      this.#rebuildControls();
    });
    root.appendChild(this.profileSelect);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset to defaults';
    resetBtn.className = 'effect-panel__reset';
    resetBtn.addEventListener('click', () => {
      this.effects.resetParams();
      this.#syncControlValues();
    });
    root.appendChild(resetBtn);

    this.controlContainer = document.createElement('div');
    root.appendChild(this.controlContainer);

    this.mount.appendChild(root);
    this.root = root;
  }

  #rebuildControls() {
    this.profileSelect.value = this.effects.current() ?? '';
    this.themeSelect.value = currentTheme();
    this.controlContainer.innerHTML = '';
    this.controls.clear();

    const meta = this.effects.getParamMeta();
    const params = this.effects.getParams();
    for (const [key, m] of Object.entries(meta)) {
      const row = this.#buildRow(key, m, params[key]);
      if (row) this.controlContainer.appendChild(row);
    }
  }

  #syncControlValues() {
    const params = this.effects.getParams();
    for (const [key, entry] of this.controls) {
      entry.set(params[key]);
    }
  }

  #buildRow(key, meta, initialValue) {
    const row = document.createElement('div');
    row.className = 'effect-panel__row';

    const label = document.createElement('label');
    label.className = 'effect-panel__row-label';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = meta.label ?? key;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'effect-panel__row-value';
    label.appendChild(nameSpan);
    label.appendChild(valueSpan);
    row.appendChild(label);

    if (meta.type === 'number') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(meta.min ?? 0);
      input.max = String(meta.max ?? 1);
      input.step = String(meta.step ?? 0.01);
      input.value = String(initialValue ?? 0);
      input.className = 'effect-panel__range';
      valueSpan.textContent = Number(input.value).toFixed(3);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        valueSpan.textContent = v.toFixed(3);
        this.effects.updateParam(key, v);
      });
      row.appendChild(input);
      this.controls.set(key, {
        el: input,
        set: (v) => {
          input.value = String(v);
          valueSpan.textContent = Number(v).toFixed(3);
        },
      });
      return row;
    }

    if (meta.type === 'select') {
      const select = document.createElement('select');
      select.className = 'effect-panel__row-select';
      for (const opt of meta.options ?? []) {
        const o = document.createElement('option');
        o.value = String(opt.value);
        o.textContent = opt.label;
        select.appendChild(o);
      }
      select.value = String(initialValue);
      valueSpan.textContent = '';
      select.addEventListener('change', () => {
        this.effects.updateParam(key, Number(select.value));
      });
      row.appendChild(select);
      this.controls.set(key, {
        el: select,
        set: (v) => { select.value = String(v); },
      });
      return row;
    }

    if (meta.type === 'color') {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = rgbToHex(initialValue ?? [1, 1, 1]);
      input.className = 'effect-panel__color';
      valueSpan.textContent = input.value;
      input.addEventListener('input', () => {
        valueSpan.textContent = input.value;
        this.effects.updateParam(key, hexToRgb(input.value));
      });
      row.appendChild(input);
      this.controls.set(key, {
        el: input,
        set: (v) => {
          input.value = rgbToHex(v);
          valueSpan.textContent = input.value;
        },
      });
      return row;
    }

    return null;
  }
}
