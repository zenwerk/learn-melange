// REPL 全体の組み立て。
// - CellBuffer + TerminalCanvas + LineEditor + History + KeyboardInput を繋ぐ
// - OCaml session (create_session / eval / hints) に式を渡す
// - :effect コマンド / font zoom / effect cycle のフック

import { create_session } from 'melange-output/src/main.js';
import { CellBuffer, makeCell, writeCells } from '../terminal/cell-buffer.js';
import { TerminalCanvas } from '../terminal/terminal-canvas.js';
import { LineEditor } from '../terminal/line-editor.js';
import { History } from '../terminal/history.js';
import { KeyboardInput } from '../terminal/keyboard-input.js';
import { EffectManager } from '../effects/effect-manager.js';
import { EFFECTS, EFFECT_ORDER } from '../effects/index.js';
import { createLanguageClient } from '../language/language-client.js';
import { CompletionPopup } from './completion-popup.js';

const PROMPT = 'calc> ';
const FONT_SIZE_DEFAULT = 14;
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 40;
const TERMINAL_PAD = 12; // style.css #terminal-wrap の padding と合わせること

const style = (fg, extra = null) => ({ fg, ...extra });
const S = Object.freeze({
  greenBold:  style('green', { bold: true }),
  blue:       style('blue'),
  yellow:     style('yellow'),
  red:        style('red'),
  gray:       style('gray'),
  dim:        style(null,   { dim: true }),
});

export class ReplUI {
  constructor({ mount }) {
    this.mount = mount;

    // 一旦 80x24 で仮初期化 (フォント読み込み後にリサイズ)
    this.buffer = new CellBuffer(24, 80);
    this.terminalCanvas = new TerminalCanvas({ buffer: this.buffer, fontSize: FONT_SIZE_DEFAULT });
    this.terminalCanvas.canvas.classList.add('terminal-source');
    mount.appendChild(this.terminalCanvas.canvas);

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.classList.add('terminal-overlay');
    mount.appendChild(this.overlayCanvas);

    this.history = new History();
    this.editor = new LineEditor({
      buffer: this.buffer,
      terminalCanvas: this.terminalCanvas,
      history: this.history,
      onSubmit: (line) => this.#handleSubmit(line),
      onChange: () => this.#handleEditorChange(),
    });

    this.keyboard = new KeyboardInput({
      host: mount,
      onAction: (action) => this.#dispatch(action),
      onInsert: (text) => this.editor.insert(text),
      onCompose: (ev) => this.#handleCompose(ev),
      onRawKey: (e) => this.#handleRawKey(e),
    });

    this.session = create_session();
    this.languageClient = createLanguageClient(this.session);
    this.completionPopup = new CompletionPopup({ buffer: this.buffer });
    this.effects = null; // フォント読み込み後に生成
    this.fontSize = FONT_SIZE_DEFAULT;

    this.cursorRow = 0;
    this.awaitingInput = false;
    this.submitResolve = null;
    this.blinkTimer = null;
  }

  async run() {
    // Web フォント待ち (失敗しても monospace で続行)
    try { await document.fonts.ready; } catch { /* noop */ }
    this.terminalCanvas.setFontSize(this.fontSize);
    this.#relayout();

    // エフェクトマネージャ初期化 (overlay canvas サイズは relayout で整った)
    this.effects = new EffectManager({
      terminalCanvas: this.terminalCanvas,
      overlayCanvas: this.overlayCanvas,
    });
    this.effects.loadInitial();

    window.addEventListener('resize', () => this.#relayout());

    // カーソル点滅 (500ms)
    this.blinkTimer = setInterval(() => {
      this.terminalCanvas.setBlink(!this.terminalCanvas.cursor.blinkOn);
      this.effects?.requestRender();
    }, 500);

    await this.#banner();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const line = await this.#readLine(PROMPT);
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith(':effect')) {
        this.#handleEffectCommand(trimmed);
        continue;
      }
      const result = this.session.eval(trimmed);
      this.#printResult(result);
    }
  }

  // ------------- 出力 -------------

  #println(segments) {
    const parts = Array.isArray(segments) ? segments : [segments];
    let row = this.cursorRow;
    let col = 0;
    const onWrap = () => { this.#newline(); return { row: this.cursorRow, col: 0 }; };
    for (const seg of parts) {
      const text = typeof seg === 'string' ? seg : seg.text;
      const st   = typeof seg === 'string' ? null : seg.style;
      ({ row, col } = writeCells(this.buffer, row, col, text, st, onWrap));
    }
    this.#newline();
  }

  #newline() {
    this.cursorRow++;
    if (this.cursorRow >= this.buffer.rows) {
      this.buffer.scrollUp(1);
      this.cursorRow = this.buffer.rows - 1;
    }
    // カーソル行を空にしておく
    for (let c = 0; c < this.buffer.cols; c++) {
      this.buffer.set(this.cursorRow, c, makeCell(' ', null, 1));
    }
    this.effects?.requestRender();
  }

  // ------------- 入力 -------------

  async #readLine(prompt) {
    return new Promise((resolve) => {
      this.submitResolve = resolve;
      this.editor.begin(prompt, this.cursorRow);
      this.awaitingInput = true;
      this.effects?.requestRender();
    });
  }

  #handleSubmit(line) {
    this.awaitingInput = false;
    this.completionPopup.hide();
    // エディタが最後に書いた行の 1 つ先へ
    this.#newline();
    const r = this.submitResolve;
    this.submitResolve = null;
    r?.(line);
  }

  #dispatch(action) {
    if (!this.awaitingInput) return;

    if (action === 'completeNext' || action === 'completePrev') {
      this.#handleCompleteNav(action === 'completeNext' ? +1 : -1);
      return;
    }
    if (action === 'completeCancel') {
      this.completionPopup.hide();
      this.effects?.requestRender();
      return;
    }
    // ポップアップが出ている状態で Enter → 候補を確定、元の submit は行わない
    if (action === 'submit' && this.completionPopup.isVisible()) {
      const item = this.completionPopup.currentItem();
      this.completionPopup.hide();
      if (item) {
        this.editor.acceptCompletion(item);
      }
      this.effects?.requestRender();
      return;
    }

    if (!this.editor[action]) return;
    this.editor[action]();
    // カーソル移動だけのアクション (moveLeft/moveRight/moveHome/moveEnd/...) でも
    // ポップアップが出ていれば閉じる (カーソルが離れると候補が無効になるため)
    if (
      this.completionPopup.isVisible() &&
      (action.startsWith('move') || action.startsWith('history'))
    ) {
      this.completionPopup.hide();
    }
    this.effects?.requestRender();
  }

  #handleCompleteNav(delta) {
    if (this.completionPopup.isVisible()) {
      this.completionPopup.moveSelection(delta);
      this.effects?.requestRender();
    } else {
      this.#triggerCompletion();
    }
  }

  #handleEditorChange() {
    if (this.completionPopup.isVisible()) {
      this.completionPopup.hide();
      this.effects?.requestRender();
    }
  }

  #triggerCompletion() {
    const input = this.editor.value();
    const offset = this.editor.cursorOffset();
    const items = this.languageClient.completeSync(input, offset);
    if (!items || items.length === 0) return;

    const row = this.editor.row + 1; // 入力行の下に表示
    const col = this.editor.prefixStartCol();
    this.completionPopup.show(items, row, col);
    this.effects?.requestRender();
  }

  #handleCompose(ev) {
    if (!this.awaitingInput) return;
    if (ev.phase === 'update') this.editor.setComposing(ev.text);
    else if (ev.phase === 'end') this.editor.endComposing(ev.text);
    else if (ev.phase === 'start') this.editor.setComposing('');
    this.effects?.requestRender();
  }

  #handleRawKey(e) {
    if (!(e.ctrlKey || e.metaKey)) return false;
    const k = e.key;
    const code = e.code;

    // Ctrl+L: 画面クリア
    if (!e.shiftKey && (k === 'l' || k === 'L' || code === 'KeyL')) {
      this.#clearScreen();
      return true;
    }
    // Ctrl+Shift+E: effect cycle
    if ((k === 'E' || k === 'e' || code === 'KeyE') && e.shiftKey) {
      const next = this.effects?.cycle();
      if (next) this.#println([{ text: `effect: ${next}`, style: S.dim }]);
      return true;
    }
    // Font zoom
    const isPlus  = k === '+' || k === '=' || k === ';' || code === 'Equal' || code === 'Semicolon';
    const isMinus = k === '-' || k === '_' || code === 'Minus';
    const isZero  = k === '0' || code === 'Digit0';
    if (isPlus)  { this.#zoom(+1); return true; }
    if (isMinus) { this.#zoom(-1); return true; }
    if (isZero)  { this.#setFontSize(FONT_SIZE_DEFAULT); return true; }
    return false;
  }

  #clearScreen() {
    this.completionPopup.hide();
    this.buffer.clear();
    this.cursorRow = 0;
    if (this.awaitingInput) {
      this.editor.begin(PROMPT, this.cursorRow);
    }
    this.effects?.requestRender();
  }

  #zoom(delta) { this.#setFontSize(this.fontSize + delta); }

  #setFontSize(size) {
    const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
    if (clamped === this.fontSize) return;
    this.fontSize = clamped;
    this.terminalCanvas.setFontSize(clamped);
    this.completionPopup.hide();
    this.#relayout();
  }

  // ------------- レイアウト -------------

  #relayout() {
    const cw = this.mount.clientWidth - TERMINAL_PAD * 2;
    const ch = this.mount.clientHeight - TERMINAL_PAD * 2;
    if (cw <= 0 || ch <= 0) return;
    const { rows, cols } = this.terminalCanvas.computeGrid(cw, ch);
    if (rows !== this.buffer.rows || cols !== this.buffer.cols) {
      this.terminalCanvas.resizeBuffer(rows, cols);
      if (this.cursorRow >= rows) this.cursorRow = rows - 1;
    }
    // overlay canvas サイズは terminal canvas の pixel size に合わせる
    this.overlayCanvas.width = this.terminalCanvas.canvas.width;
    this.overlayCanvas.height = this.terminalCanvas.canvas.height;
    if (this.effects) this.effects.resize(this.overlayCanvas.width, this.overlayCanvas.height);
    // 入力中なら editor を再スタート
    if (this.awaitingInput) this.editor.begin(PROMPT, this.cursorRow);
    this.effects?.requestRender();
  }

  // ------------- バナー & フォーマット -------------

  async #banner() {
    this.#println([{ text: 'Melange Calculator REPL', style: S.greenBold }]);
    this.#println([{
      text: 'readline: C-a C-e C-b C-f C-h C-k C-u C-w M-b M-f  / history: C-p C-n ↑↓  /' +
            ' complete: Tab S-Tab Esc  / clear: C-l  / zoom: C-= C-- C-0  / effect: :effect / C-S-e',
      style: S.dim,
    }]);
    this.#println('');
  }

  #printResult(result) {
    if (result.success) {
      if (result.kind === 'expr') {
        this.#println([{ text: `- : float = ${result.value}`, style: S.blue }]);
      } else {
        this.#println([{ text: `val ${result.name} : float = ${result.value}`, style: S.yellow }]);
      }
      return;
    }
    const col = result.error_column;
    if (col !== null && col > 0) {
      this.#println([{
        text: `${' '.repeat(PROMPT.length + col)}^`,
        style: S.red,
      }]);
    }
    const colSuffix = col !== null && col > 0 ? ` at column ${col}` : '';
    this.#println([{
      text: `Error${colSuffix}: ${result.error_message}`,
      style: S.red,
    }]);
  }

  #handleEffectCommand(line) {
    const parts = line.split(/\s+/);
    if (parts.length === 1) {
      this.#println([{
        text: `current: ${this.effects?.current()} / available: ${EFFECT_ORDER.join(', ')}`,
        style: S.dim,
      }]);
      return;
    }
    const name = parts[1];
    if (!EFFECTS.has(name)) {
      this.#println([{ text: `unknown effect: ${name}`, style: S.red }]);
      return;
    }
    this.effects?.set(name);
    this.#println([{ text: `effect: ${name}`, style: S.dim }]);
  }
}
