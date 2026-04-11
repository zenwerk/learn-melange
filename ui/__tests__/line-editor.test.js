import { describe, it, expect } from 'vitest';
import { CellBuffer } from '../terminal/cell-buffer.js';
import { LineEditor } from '../terminal/line-editor.js';

// LineEditor needs a minimal TerminalCanvas-shaped stub for setCursor
const makeStub = () => ({
  cursor: { row: 0, col: 0, visible: true, blinkOn: true },
  setCursor(row, col) { this.cursor.row = row; this.cursor.col = col; },
});

const makeEditor = () => {
  const buffer = new CellBuffer(5, 40);
  const canvas = makeStub();
  const history = { push() {}, resetCursor() {}, prev() { return null; }, next() { return null; } };
  const ed = new LineEditor({
    buffer, terminalCanvas: canvas, history,
    onSubmit: () => {}, onChange: () => {},
  });
  return { ed, buffer, canvas };
};

describe('LineEditor.begin and insert', () => {
  it('starts empty with a prompt', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    expect(ed.value()).toBe('');
    expect(ed.cursorOffset()).toBe(0);
  });

  it('insert appends characters', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('abc');
    expect(ed.value()).toBe('abc');
    expect(ed.cursorOffset()).toBe(3);
  });

  it('insert in middle', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('ac');
    ed.moveLeft();
    ed.insert('b');
    expect(ed.value()).toBe('abc');
    expect(ed.cursorOffset()).toBe(2);
  });
});

describe('LineEditor.begin with restored state', () => {
  it('restores input and cursor', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 1, { input: 'hello', cursor: 3 });
    expect(ed.value()).toBe('hello');
    expect(ed.cursorOffset()).toBe(3);
  });

  it('clamps cursor to input length', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 1, { input: 'hi', cursor: 99 });
    expect(ed.cursorOffset()).toBe(2);
  });

  it('clamps cursor to 0 for negative', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 1, { input: 'hi', cursor: -5 });
    expect(ed.cursorOffset()).toBe(0);
  });
});

describe('LineEditor deletion', () => {
  it('deleteBack removes char before cursor', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('abc');
    ed.deleteBack();
    expect(ed.value()).toBe('ab');
    expect(ed.cursorOffset()).toBe(2);
  });

  it('deleteBack at start is a no-op', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('a');
    ed.moveLeft();
    ed.deleteBack();
    expect(ed.value()).toBe('a');
  });

  it('deleteForward removes char after cursor', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('abc');
    ed.moveHome();
    ed.deleteForward();
    expect(ed.value()).toBe('bc');
  });

  it('killToEnd kills from cursor to end', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('abcde');
    ed.moveHome();
    ed.moveRight();
    ed.moveRight();
    ed.killToEnd();
    expect(ed.value()).toBe('ab');
  });

  it('killToHead kills from start to cursor', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('abcde');
    ed.moveHome();
    ed.moveRight();
    ed.moveRight();
    ed.killToHead();
    expect(ed.value()).toBe('cde');
    expect(ed.cursorOffset()).toBe(0);
  });
});

describe('LineEditor word motion', () => {
  it('moveWordLeft jumps to previous word', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('foo bar baz');
    ed.moveWordLeft();
    expect(ed.cursorOffset()).toBe(8); // at start of 'baz'
  });

  it('killPrevWord removes last word', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('foo bar');
    ed.killPrevWord();
    expect(ed.value()).toBe('foo ');
  });
});

describe('LineEditor cursor edges', () => {
  it('moveLeft stops at 0', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.moveLeft();
    expect(ed.cursorOffset()).toBe(0);
  });

  it('moveRight stops at end', () => {
    const { ed } = makeEditor();
    ed.begin('> ', 0);
    ed.insert('ab');
    ed.moveRight();
    expect(ed.cursorOffset()).toBe(2);
  });
});
