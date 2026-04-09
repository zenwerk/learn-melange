// readline 風の 1 行エディタ。ANSI は介在せず CellBuffer を直接書き換える。
// IME の composing 文字列は現在カーソル位置に下線付きで仮表示する。

import { cpStart, cpLen, cpWidth, strWidth, strWidthRange } from './width.js';
import { makeCell } from './cell-buffer.js';

const UNDERLINE_STYLE = { underline: true, dim: true };

export class LineEditor {
  constructor({ buffer, terminalCanvas, history, onSubmit }) {
    this.buffer = buffer;
    this.canvas = terminalCanvas;
    this.history = history;
    this.onSubmit = onSubmit;

    this.prompt = '';
    this.input = '';
    this.cursor = 0; // UTF-16 index
    this.composing = '';
    this.row = 0;
    this.promptCol = 0;
  }

  // 現在行に prompt を書き、エディタを待機状態にする。
  begin(prompt, row) {
    this.prompt = prompt;
    this.input = '';
    this.cursor = 0;
    this.composing = '';
    this.row = row;
    // 行を消す
    for (let c = 0; c < this.buffer.cols; c++) {
      this.buffer.set(row, c, makeCell(' ', null, 1));
    }
    // prompt を書く
    let col = 0;
    for (const ch of prompt) {
      this.buffer.set(row, col, makeCell(ch, { fg: 'green', bold: true }, 1));
      col += 1;
    }
    this.promptCol = col;
    this.#renderInput();
    this.#placeCursor();
  }

  value() {
    return this.input;
  }

  // ----- アクション -----

  insert(text) {
    if (!text) return;
    this.input = this.input.slice(0, this.cursor) + text + this.input.slice(this.cursor);
    this.cursor += text.length;
    this.history.resetCursor(this.input);
    this.#renderInput();
    this.#placeCursor();
  }

  deleteBack() {
    if (this.cursor <= 0) return;
    const i = cpStart(this.input, this.cursor - 1);
    this.input = this.input.slice(0, i) + this.input.slice(this.cursor);
    this.cursor = i;
    this.history.resetCursor(this.input);
    this.#renderInput();
    this.#placeCursor();
  }

  deleteForward() {
    if (this.cursor >= this.input.length) return;
    const n = cpLen(this.input, this.cursor);
    this.input = this.input.slice(0, this.cursor) + this.input.slice(this.cursor + n);
    this.history.resetCursor(this.input);
    this.#renderInput();
    this.#placeCursor();
  }

  moveLeft() {
    if (this.cursor <= 0) return;
    this.cursor = cpStart(this.input, this.cursor - 1);
    this.#placeCursor();
  }

  moveRight() {
    if (this.cursor >= this.input.length) return;
    this.cursor += cpLen(this.input, this.cursor);
    this.#placeCursor();
  }

  moveHome() {
    this.cursor = 0;
    this.#placeCursor();
  }

  moveEnd() {
    this.cursor = this.input.length;
    this.#placeCursor();
  }

  moveWordLeft() {
    const s = this.input;
    let i = this.cursor;
    while (i > 0 && /\s/.test(s[i - 1])) i--;
    while (i > 0 && !/\s/.test(s[i - 1])) i--;
    this.cursor = i;
    this.#placeCursor();
  }

  moveWordRight() {
    const s = this.input;
    let i = this.cursor;
    while (i < s.length && /\s/.test(s[i])) i++;
    while (i < s.length && !/\s/.test(s[i])) i++;
    this.cursor = i;
    this.#placeCursor();
  }

  killToEnd() {
    this.input = this.input.slice(0, this.cursor);
    this.history.resetCursor(this.input);
    this.#renderInput();
    this.#placeCursor();
  }

  killToHead() {
    this.input = this.input.slice(this.cursor);
    this.cursor = 0;
    this.history.resetCursor(this.input);
    this.#renderInput();
    this.#placeCursor();
  }

  killPrevWord() {
    const s = this.input;
    let i = this.cursor;
    while (i > 0 && /\s/.test(s[i - 1])) i--;
    while (i > 0 && !/\s/.test(s[i - 1])) i--;
    this.input = s.slice(0, i) + s.slice(this.cursor);
    this.cursor = i;
    this.history.resetCursor(this.input);
    this.#renderInput();
    this.#placeCursor();
  }

  historyPrev() {
    const r = this.history.prev(this.input);
    if (r === null) return;
    this.#replace(r);
  }

  historyNext() {
    const r = this.history.next(this.input);
    if (r === null) return;
    this.#replace(r);
  }

  submit() {
    const line = this.input;
    this.history.push(line);
    // カーソルを行末に置いて composing を消す
    this.composing = '';
    this.#renderInput();
    this.onSubmit?.(line);
  }

  // IME 変換中文字列を現在カーソル位置に仮表示
  setComposing(text) {
    this.composing = text;
    this.#renderInput();
    this.#placeCursor();
  }

  endComposing(committed) {
    this.composing = '';
    if (committed) this.insert(committed);
    else {
      this.#renderInput();
      this.#placeCursor();
    }
  }

  // ----- 内部 -----

  #replace(text) {
    this.input = text;
    this.cursor = text.length;
    this.#renderInput();
    this.#placeCursor();
  }

  // 入力 + composing を buffer の row の promptCol 以降に書く。
  #renderInput() {
    const row = this.row;
    const cols = this.buffer.cols;
    // prompt 以降を一度空白で埋める
    for (let c = this.promptCol; c < cols; c++) {
      this.buffer.set(row, c, makeCell(' ', null, 1));
    }
    // 入力 + composing を結合
    const before = this.input.slice(0, this.cursor);
    const after = this.input.slice(this.cursor);
    let col = this.promptCol;
    col = this.#writeText(row, col, before, null);
    if (this.composing) col = this.#writeText(row, col, this.composing, UNDERLINE_STYLE);
    this.#writeText(row, col, after, null);
    this.buffer.dirty.add(row);
  }

  #writeText(row, col, text, style) {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      const w = cpWidth(cp);
      if (w === 0) continue;
      if (col + w > this.buffer.cols) break;
      this.buffer.set(row, col, makeCell(ch, style, w));
      if (w === 2) this.buffer.set(row, col + 1, makeCell(null, style, 0));
      col += w;
    }
    return col;
  }

  #placeCursor() {
    // カーソル列 = promptCol + strWidthRange(input, 0, cursor) + (composing 幅がカーソル前にある)
    const prefixW = strWidthRange(this.input, 0, this.cursor);
    const composingW = strWidth(this.composing);
    const col = this.promptCol + prefixW + composingW;
    this.canvas.setCursor(this.row, Math.min(col, this.buffer.cols - 1));
  }
}

