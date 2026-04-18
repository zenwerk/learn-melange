// REPL 全体の組み立て。
//
// ---- 副作用 → 描画の不変量 ----
// CellBuffer を変更するすべての処理は #withRender の配下で実行される。
// #withRender は finally で effects.requestRender() を 1 回呼ぶので、内部
// 関数 (#println / #newline / #handleXxx / ...) は個別に requestRender を
// 呼ばないこと。エントリポイントは以下の 4 種類:
//   1. KeyboardInput のコールバック (onAction/onInsert/onCompose/onRawKey)
//   2. window resize
//   3. blink timer (setInterval)
//   4. run() のメインループ内 eval/printResult
// 新しいエントリポイントを追加する際は必ず #withRender で包むこと。

import { CellBuffer, writeCells } from '../terminal/cell-buffer.js';
import { TerminalCanvas } from '../terminal/terminal-canvas.js';
import { LineEditor } from '../terminal/line-editor.js';
import { History } from '../terminal/history.js';
import { KeyboardInput } from '../terminal/keyboard-input.js';
import { EffectManager } from '../effects/effect-manager.js';
import { EffectPanel } from '../effects/effect-panel.js';
import { EFFECTS, EFFECT_ORDER } from '../effects/index.js';
import { LanguageClient } from '../language/language-client.js';
import { CompletionPopup } from './completion-popup.js';

/**
 * @typedef {import('../types.d.ts').CellStyle} CellStyle
 * @typedef {import('../types.d.ts').Segment} Segment
 * @typedef {import('../types.d.ts').ActionName} ActionName
 * @typedef {import('../types.d.ts').ComposeEvent} ComposeEvent
 * @typedef {import('../types.d.ts').EvalResultObj} EvalResultObj
 * @typedef {import('../language/backend.d.ts').LanguageBackend} LanguageBackend
 * @typedef {import('../language/backend.d.ts').LanguageProfile} LanguageProfile
 */

const FONT_SIZE_DEFAULT = 14;
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 40;
const TERMINAL_PAD = 12; // style.css #terminal-wrap の padding と合わせること

const DIM = { fg: null, dim: true };
const RED = { fg: 'red' };

export class ReplUI {
  /** @param {{ mount: HTMLElement, backend: LanguageBackend, profile: LanguageProfile }} opts */
  constructor({ mount, backend, profile }) {
    this.mount = mount;
    this.backend = backend;
    this.profile = profile;

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

    // onRawKey は戻り値 (bool) を返すため withRender は内部で呼ぶ。
    this.keyboard = new KeyboardInput({
      host: mount,
      onAction: (action) => this.#withRender(() => this.#handleAction(action)),
      onInsert: (text) => this.#withRender(() => this.editor.insert(text)),
      onCompose: (ev) => this.#withRender(() => this.#handleCompose(ev)),
      onRawKey: (e) => this.#handleRawKey(e),
    });

    this.languageClient = new LanguageClient(backend);
    this.completionPopup = new CompletionPopup({ buffer: this.buffer, profile });
    this.effects = null; // フォント読み込み後に生成
    this.fontSize = FONT_SIZE_DEFAULT;

    this.cursorRow = 0;
    this.awaitingInput = false;
    /** @type {((line: string) => void) | null} */
    this.submitResolve = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.blinkTimer = null;
    /** @type {(() => void) | null} */
    this.onResize = null;
  }

  // 副作用ハンドラを包む薄いラッパ。例外が出ても finally で必ず
  // requestRender を呼ぶので、描画の呼び忘れが構造的に発生しない。
  /**
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  #withRender(fn) {
    try {
      return fn();
    } finally {
      this.effects?.requestRender();
    }
  }

  async run() {
    try { await document.fonts.ready; } catch { /* noop */ }
    this.terminalCanvas.setFontSize(this.fontSize);
    // 初期 relayout は effects 未生成で withRender を通らない。
    // 直後の effects.loadInitial() → set() → requestRender() が初回描画を担う。
    this.#relayout();

    this.effects = new EffectManager({
      terminalCanvas: this.terminalCanvas,
      overlayCanvas: this.overlayCanvas,
    });
    this.effects.loadInitial();
    this.effectPanel = new EffectPanel({ effects: this.effects });

    this.onResize = () => this.#withRender(() => this.#relayout());
    window.addEventListener('resize', this.onResize);

    // カーソル点滅 (500ms)。setBlink の戻り値が false (変化なし) の
    // ときは render 要求をスキップする。
    this.blinkTimer = setInterval(() => {
      if (this.terminalCanvas.setBlink(!this.terminalCanvas.cursor.blinkOn)) {
        this.effects?.requestRender();
      }
    }, 500);

    this.#withRender(() => this.#banner());
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const line = await this.#readLine(this.profile.prompt);
      const trimmed = line.trim();
      if (!trimmed) continue;

      this.#withRender(() => {
        if (trimmed.startsWith(':effect')) {
          this.#handleEffectCommand(trimmed);
          return;
        }
        const result = this.backend.eval(trimmed);
        this.#printResult(result);
      });
    }
  }

  dispose() {
    if (this.blinkTimer != null) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = null;
    }
    this.effectPanel?.dispose();
    this.effects?.dispose();
  }

  // ------------- 出力 -------------

  /** @param {string | Segment | (string | Segment)[]} segments */
  #println(segments) {
    const parts = Array.isArray(segments) ? segments : [segments];
    let row = this.cursorRow;
    let col = 0;
    const onWrap = () => { this.#newline(); return { row: this.cursorRow, col: 0 }; };
    for (const seg of parts) {
      const text = typeof seg === 'string' ? seg : seg.text;
      const st   = typeof seg === 'string' ? null : (seg.style ?? null);
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
    this.buffer.clearRun(this.cursorRow, 0, this.buffer.cols);
  }

  // 入力中の割り込みメッセージ。editor が占めていた行をクリアして
  // メッセージを書き、次の行で editor を同じ入力内容のまま再開する。
  /** @param {Segment[]} segments */
  #printAboveInput(segments) {
    if (!this.awaitingInput) {
      this.#println(segments);
      return;
    }
    const savedInput = this.editor.value();
    const savedCursor = this.editor.cursorOffset();
    const row = this.editor.row;
    this.buffer.clearRun(row, 0, this.buffer.cols);
    this.cursorRow = row;
    this.#println(segments);
    this.editor.begin(this.profile.prompt, this.cursorRow, { input: savedInput, cursor: savedCursor });
  }

  // ------------- 入力 -------------

  /**
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  #readLine(prompt) {
    return new Promise((resolve) => {
      this.submitResolve = resolve;
      this.#withRender(() => {
        this.editor.begin(prompt, this.cursorRow);
        this.awaitingInput = true;
      });
    });
  }

  /** @param {string} line */
  #handleSubmit(line) {
    this.awaitingInput = false;
    this.completionPopup.hide();
    this.#newline();
    const r = this.submitResolve;
    this.submitResolve = null;
    r?.(line);
  }

  /** @param {ActionName} action */
  #handleAction(action) {
    if (!this.awaitingInput) return;

    if (action === 'completeNext' || action === 'completePrev') {
      this.#handleCompleteNav(action === 'completeNext' ? +1 : -1);
      return;
    }
    if (action === 'completeCancel') {
      this.completionPopup.hide();
      return;
    }
    // ポップアップ表示中の Enter → 候補確定。元の submit は行わない。
    if (action === 'submit' && this.completionPopup.isVisible()) {
      const item = this.completionPopup.currentItem();
      this.completionPopup.hide();
      if (item) {
        this.editor.acceptCompletion(item);
      }
      return;
    }

    if (!this.editor[action]) return;
    this.editor[action]();
    // カーソル移動/history でも、ポップアップが出ていれば閉じる
    // (カーソルが離れると候補が無効になるため)。
    if (
      this.completionPopup.isVisible() &&
      (action.startsWith('move') || action.startsWith('history'))
    ) {
      this.completionPopup.hide();
    }
  }

  /** @param {number} delta */
  #handleCompleteNav(delta) {
    if (this.completionPopup.isVisible()) {
      this.completionPopup.moveSelection(delta);
    } else {
      this.#triggerCompletion();
    }
  }

  #handleEditorChange() {
    if (this.completionPopup.isVisible()) {
      this.completionPopup.hide();
    }
  }

  #triggerCompletion() {
    const input = this.editor.value();
    const offset = this.editor.cursorOffset();
    const items = this.languageClient.completeSync(input, offset);
    if (!items || items.length === 0) return;

    const row = this.editor.row + 1;
    const col = this.editor.prefixStartCol();
    this.completionPopup.show(items, row, col);
  }

  /** @param {ComposeEvent} ev */
  #handleCompose(ev) {
    if (!this.awaitingInput) return;
    if (ev.phase === 'update') this.editor.setComposing(ev.text ?? '');
    else if (ev.phase === 'end') this.editor.endComposing(ev.text ?? '');
    else if (ev.phase === 'start') this.editor.setComposing('');
  }

  // onRawKey は戻り値 bool を返す必要があるため、処理した場合のみ
  // 内側で withRender を呼ぶ。
  /**
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  #handleRawKey(e) {
    if (!(e.ctrlKey || e.metaKey)) return false;
    const k = e.key;
    const code = e.code;

    // Ctrl+L: 画面クリア
    if (!e.shiftKey && (k === 'l' || k === 'L' || code === 'KeyL')) {
      this.#withRender(() => this.#clearScreen());
      return true;
    }
    // Ctrl+Shift+E: effect cycle
    if ((k === 'E' || k === 'e' || code === 'KeyE') && e.shiftKey) {
      this.#withRender(() => {
        const next = this.effects?.cycle();
        if (next) this.#printAboveInput([{ text: `effect: ${next}`, style: DIM }]);
      });
      return true;
    }
    // Ctrl+Shift+P: effect settings panel 開閉
    if ((k === 'P' || k === 'p' || code === 'KeyP') && e.shiftKey) {
      this.effectPanel?.toggle();
      return true;
    }
    // Font zoom
    const isPlus  = k === '+' || k === '=' || k === ';' || code === 'Equal' || code === 'Semicolon';
    const isMinus = k === '-' || k === '_' || code === 'Minus';
    const isZero  = k === '0' || code === 'Digit0';
    if (isPlus)  { this.#withRender(() => this.#zoom(+1)); return true; }
    if (isMinus) { this.#withRender(() => this.#zoom(-1)); return true; }
    if (isZero)  { this.#withRender(() => this.#setFontSize(FONT_SIZE_DEFAULT)); return true; }
    return false;
  }

  #clearScreen() {
    this.completionPopup.hide();
    this.buffer.clear();
    this.cursorRow = 0;
    if (this.awaitingInput) {
      this.editor.begin(this.profile.prompt, this.cursorRow);
    }
  }

  /** @param {number} delta */
  #zoom(delta) { this.#setFontSize(this.fontSize + delta); }

  /** @param {number} size */
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
    this.overlayCanvas.width = this.terminalCanvas.canvas.width;
    this.overlayCanvas.height = this.terminalCanvas.canvas.height;
    if (this.effects) this.effects.resize(this.overlayCanvas.width, this.overlayCanvas.height);
    if (this.awaitingInput) this.editor.begin(this.profile.prompt, this.cursorRow);
  }

  // ------------- バナー & フォーマット -------------

  #banner() {
    for (const line of this.profile.banner) this.#println(line);
  }

  /** @param {EvalResultObj} result */
  #printResult(result) {
    if (result.success) {
      this.#println(this.profile.formatResult(result));
      return;
    }
    for (const line of this.profile.formatError(result, this.profile.prompt.length)) {
      this.#println(line);
    }
  }

  /** @param {string} line */
  #handleEffectCommand(line) {
    const parts = line.split(/\s+/);
    if (parts.length === 1) {
      this.#println([{
        text: `current: ${this.effects?.current()} / available: ${EFFECT_ORDER.join(', ')}`,
        style: DIM,
      }]);
      return;
    }
    const name = parts[1];
    if (!EFFECTS.has(name)) {
      this.#println([{ text: `unknown effect: ${name}`, style: RED }]);
      return;
    }
    this.effects?.set(name);
    this.#println([{ text: `effect: ${name}`, style: DIM }]);
  }
}
