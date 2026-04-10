// readline 風の 1 行エディタ。ANSI は介在せず CellBuffer を直接書き換える。
// IME の composing 文字列はカーソル位置に下線付きで仮表示する。

import { cpStart, cpLen, strWidth, strWidthRange } from './width.js';
import { makeCell, writeCells } from './cell-buffer.js';

const UNDERLINE_STYLE = { underline: true, dim: true };
const PROMPT_STYLE = { fg: 'green', bold: true };

// カーソル直前に連続する識別子文字 ([A-Za-z0-9_]) の開始位置を返す。
// 最初の文字は [A-Za-z_] でなければならず、そうでない場合は offset を返す。
// OCaml 側 Calc_language_service.find_prefix_start と挙動を揃えること。
function findPrefixStart(input, offset) {
  const isCont = (ch) => /[A-Za-z0-9_]/.test(ch);
  const isStart = (ch) => /[A-Za-z_]/.test(ch);
  let i = offset;
  while (i > 0 && isCont(input[i - 1])) i--;
  if (i < offset && isStart(input[i])) return i;
  return offset;
}

export class LineEditor {
  constructor({ buffer, terminalCanvas, history, onSubmit, onChange }) {
    this.buffer = buffer;
    this.canvas = terminalCanvas;
    this.history = history;
    this.onSubmit = onSubmit;
    this.onChange = onChange; // (input, cursor) => void — 編集のたびに呼ぶ

    this.prompt = '';
    this.input = '';
    this.cursor = 0; // UTF-16 index
    this.composing = '';
    this.row = 0;
    this.promptCol = 0;
  }

  begin(prompt, row) {
    this.prompt = prompt;
    this.input = '';
    this.cursor = 0;
    this.composing = '';
    this.row = row;
    this.#clearLine();
    const { col } = writeCells(this.buffer, row, 0, prompt, PROMPT_STYLE);
    this.promptCol = col;
    this.#commit();
  }

  value() {
    return this.input;
  }

  // カーソルが CellBuffer 上のどの列にあるか (プロンプト + 入力幅)。
  // 補完ポップアップのアンカー座標を決めるために repl 側が使う。
  cursorCol() {
    return this.promptCol + strWidthRange(this.input, 0, this.cursor);
  }

  // カーソル直前の識別子接頭辞の開始位置 (buffer 上の列)。
  prefixStartCol() {
    const start = findPrefixStart(this.input, this.cursor);
    return this.promptCol + strWidthRange(this.input, 0, start);
  }

  cursorOffset() {
    return this.cursor;
  }

  // ----- 編集アクション -----

  insert(text) {
    if (!text) return;
    this.input = this.input.slice(0, this.cursor) + text + this.input.slice(this.cursor);
    this.cursor += text.length;
    this.history.resetCursor(this.input);
    this.#commit();
  }

  deleteBack() {
    if (this.cursor <= 0) return;
    const i = cpStart(this.input, this.cursor - 1);
    this.input = this.input.slice(0, i) + this.input.slice(this.cursor);
    this.cursor = i;
    this.history.resetCursor(this.input);
    this.#commit();
  }

  deleteForward() {
    if (this.cursor >= this.input.length) return;
    const n = cpLen(this.input, this.cursor);
    this.input = this.input.slice(0, this.cursor) + this.input.slice(this.cursor + n);
    this.history.resetCursor(this.input);
    this.#commit();
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
    this.cursor = this.#wordBoundaryLeft(this.cursor);
    this.#placeCursor();
  }

  moveWordRight() {
    this.cursor = this.#wordBoundaryRight(this.cursor);
    this.#placeCursor();
  }

  killToEnd() {
    this.input = this.input.slice(0, this.cursor);
    this.history.resetCursor(this.input);
    this.#commit();
  }

  killToHead() {
    this.input = this.input.slice(this.cursor);
    this.cursor = 0;
    this.history.resetCursor(this.input);
    this.#commit();
  }

  killPrevWord() {
    const i = this.#wordBoundaryLeft(this.cursor);
    this.input = this.input.slice(0, i) + this.input.slice(this.cursor);
    this.cursor = i;
    this.history.resetCursor(this.input);
    this.#commit();
  }

  historyPrev() {
    const r = this.history.prev(this.input);
    if (r !== null) this.#replace(r);
  }

  historyNext() {
    const r = this.history.next(this.input);
    if (r !== null) this.#replace(r);
  }

  submit() {
    const line = this.input;
    this.history.push(line);
    this.composing = '';
    this.#renderInput();
    this.onSubmit?.(line);
  }

  // カーソル左にある「接頭辞 (識別子文字の連続)」を item.label で置き換える。
  // 識別子でない補完 (演算子 "+" 等) の場合は接頭辞なしで単純挿入。
  acceptCompletion(item) {
    if (!item) return;
    const start = findPrefixStart(this.input, this.cursor);
    this.input = this.input.slice(0, start) + item.label + this.input.slice(this.cursor);
    this.cursor = start + item.label.length;
    this.history.resetCursor(this.input);
    this.#commit();
  }

  setComposing(text) {
    this.composing = text;
    this.#commit();
  }

  endComposing(committed) {
    this.composing = '';
    if (committed) this.insert(committed);
    else this.#commit();
  }

  // ----- 内部 -----

  #replace(text) {
    this.input = text;
    this.cursor = text.length;
    this.#commit();
  }

  #commit() {
    this.#renderInput();
    this.#placeCursor();
    this.onChange?.(this.input, this.cursor);
  }

  #clearLine() {
    for (let c = 0; c < this.buffer.cols; c++) {
      this.buffer.set(this.row, c, makeCell(' ', null, 1));
    }
  }

  // 入力 + composing を buffer の row の promptCol 以降に書く。
  #renderInput() {
    const row = this.row;
    for (let c = this.promptCol; c < this.buffer.cols; c++) {
      this.buffer.set(row, c, makeCell(' ', null, 1));
    }
    const before = this.input.slice(0, this.cursor);
    const after = this.input.slice(this.cursor);
    let col = this.promptCol;
    ({ col } = writeCells(this.buffer, row, col, before, null));
    if (this.composing) {
      ({ col } = writeCells(this.buffer, row, col, this.composing, UNDERLINE_STYLE));
    }
    writeCells(this.buffer, row, col, after, null);
    this.buffer.dirty.add(row);
  }

  #placeCursor() {
    const prefixW = strWidthRange(this.input, 0, this.cursor);
    const composingW = strWidth(this.composing);
    const col = this.promptCol + prefixW + composingW;
    this.canvas.setCursor(this.row, Math.min(col, this.buffer.cols - 1));
  }

  // 空白 → 非空白の境界を左/右に探す
  #wordBoundaryLeft(from) {
    const s = this.input;
    let i = from;
    while (i > 0 && /\s/.test(s[i - 1])) i--;
    while (i > 0 && !/\s/.test(s[i - 1])) i--;
    return i;
  }

  #wordBoundaryRight(from) {
    const s = this.input;
    let i = from;
    while (i < s.length && /\s/.test(s[i])) i++;
    while (i < s.length && !/\s/.test(s[i])) i++;
    return i;
  }
}
