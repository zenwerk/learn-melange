// @ts-nocheck
// EffectManager の paramMeta を読んで UI を自動生成する設定パネル。
// - プロファイルセレクタ + パラメータスライダー/カラー/セレクト。
// - 値変更は EffectManager.updateParam 経由でリアルタイム反映。

import { EFFECT_ORDER } from './index.js';

const PANEL_ID = 'effect-panel';

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
    this.visible = false;
    this.controls = new Map(); // key -> { el, set(value) }
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  show() {
    if (!this.root) this.#build();
    this.#rebuildControls();
    this.root.style.display = 'block';
    this.visible = true;
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
    this.visible = false;
  }

  #build() {
    const root = document.createElement('div');
    root.id = PANEL_ID;
    Object.assign(root.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      width: '280px',
      maxHeight: 'calc(100vh - 32px)',
      overflowY: 'auto',
      background: 'rgba(20, 20, 28, 0.92)',
      color: '#d0d4e0',
      padding: '12px 14px',
      border: '1px solid #3a3f50',
      borderRadius: '8px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '11px',
      zIndex: '1000',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      display: 'none',
    });

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';

    const title = document.createElement('strong');
    title.textContent = 'CRT Effects';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
      background: 'transparent', color: 'inherit', border: 'none',
      cursor: 'pointer', fontSize: '16px', lineHeight: '1',
    });
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    root.appendChild(header);

    // プロファイルセレクタ
    const profLabel = document.createElement('label');
    profLabel.textContent = 'Profile';
    profLabel.style.display = 'block';
    profLabel.style.marginBottom = '2px';
    root.appendChild(profLabel);

    this.profileSelect = document.createElement('select');
    Object.assign(this.profileSelect.style, {
      width: '100%', marginBottom: '10px',
      background: '#1a1d28', color: '#d0d4e0', border: '1px solid #3a3f50',
      padding: '4px',
    });
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
    Object.assign(resetBtn.style, {
      width: '100%', marginBottom: '10px',
      background: '#2a2f3e', color: '#d0d4e0',
      border: '1px solid #3a3f50', padding: '4px', cursor: 'pointer',
    });
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
    row.style.marginBottom = '8px';

    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.justifyContent = 'space-between';
    label.style.marginBottom = '2px';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = meta.label ?? key;
    const valueSpan = document.createElement('span');
    valueSpan.style.opacity = '0.7';
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
      input.style.width = '100%';
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
      select.style.width = '100%';
      Object.assign(select.style, {
        background: '#1a1d28', color: '#d0d4e0', border: '1px solid #3a3f50',
      });
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
      input.style.width = '100%';
      input.style.height = '24px';
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
