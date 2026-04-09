// 画面いっぱいの透明 <textarea> を生成し、キー/IME イベントを受ける。
// overlay canvas は pointer-events: none なので、クリック・タップは textarea
// へ届きフォーカスを取り戻せる。

import { resolveKey } from './readline-keys.js';

export class KeyboardInput {
  constructor({ host, onAction, onInsert, onCompose, onRawKey }) {
    this.host = host;
    this.onAction = onAction;
    this.onInsert = onInsert;
    this.onCompose = onCompose;
    this.onRawKey = onRawKey;

    this.textarea = document.createElement('textarea');
    const ta = this.textarea;
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('aria-label', 'Terminal input');
    ta.className = 'terminal-input';
    host.appendChild(ta);

    this.#bind();
    setTimeout(() => ta.focus(), 0);
    host.addEventListener('pointerdown', () => ta.focus());
  }

  #bind() {
    const ta = this.textarea;

    ta.addEventListener('keydown', (e) => {
      // 先に raw key フックを呼ぶ (font-zoom / effect cycle 用)。
      if (this.onRawKey?.(e)) {
        e.preventDefault();
        return;
      }
      const action = resolveKey(e);
      if (action) {
        e.preventDefault();
        this.onAction?.(action);
      }
    });

    ta.addEventListener('input', (e) => {
      if (e.isComposing) return;
      const data = ta.value;
      ta.value = '';
      if (data) this.onInsert?.(data);
    });

    ta.addEventListener('compositionstart', () => {
      this.onCompose?.({ phase: 'start' });
    });
    ta.addEventListener('compositionupdate', (e) => {
      this.onCompose?.({ phase: 'update', text: e.data ?? '' });
    });
    ta.addEventListener('compositionend', (e) => {
      ta.value = '';
      this.onCompose?.({ phase: 'end', text: e.data ?? '' });
    });
  }
}
