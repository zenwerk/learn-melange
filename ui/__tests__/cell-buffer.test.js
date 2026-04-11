import { describe, it, expect } from 'vitest';
import { CellBuffer, makeCell, writeCells } from '../terminal/cell-buffer.js';

describe('CellBuffer.set and get', () => {
  it('stores a cell and adds row to dirty', () => {
    const buf = new CellBuffer(5, 10);
    buf.dirty.clear();
    buf.set(2, 3, makeCell('A', null, 1));
    expect(buf.get(2, 3).ch).toBe('A');
    expect(buf.dirty.has(2)).toBe(true);
  });

  it('ignores out-of-range writes', () => {
    const buf = new CellBuffer(3, 3);
    expect(() => buf.set(-1, 0, makeCell('X'))).not.toThrow();
    expect(() => buf.set(10, 0, makeCell('X'))).not.toThrow();
    expect(() => buf.set(0, 10, makeCell('X'))).not.toThrow();
  });
});

describe('CellBuffer.clearRun', () => {
  it('clears a range of cells and marks row dirty', () => {
    const buf = new CellBuffer(3, 5);
    buf.set(1, 0, makeCell('X'));
    buf.set(1, 1, makeCell('Y'));
    buf.set(1, 2, makeCell('Z'));
    buf.dirty.clear();
    buf.clearRun(1, 0, 3);
    expect(buf.get(1, 0).ch).toBe(' ');
    expect(buf.get(1, 1).ch).toBe(' ');
    expect(buf.get(1, 2).ch).toBe(' ');
    expect(buf.dirty.has(1)).toBe(true);
  });
});

describe('CellBuffer.scrollUp', () => {
  it('drops top rows and pads bottom with empties', () => {
    const buf = new CellBuffer(3, 3);
    buf.set(0, 0, makeCell('A'));
    buf.set(1, 0, makeCell('B'));
    buf.set(2, 0, makeCell('C'));
    buf.scrollUp(1);
    expect(buf.get(0, 0).ch).toBe('B');
    expect(buf.get(1, 0).ch).toBe('C');
    expect(buf.get(2, 0).ch).toBe(' ');
  });

  it('n >= rows clears everything', () => {
    const buf = new CellBuffer(2, 2);
    buf.set(0, 0, makeCell('A'));
    buf.set(1, 0, makeCell('B'));
    buf.scrollUp(5);
    expect(buf.get(0, 0).ch).toBe(' ');
    expect(buf.get(1, 0).ch).toBe(' ');
  });
});

describe('CellBuffer.resize', () => {
  it('preserves existing cells in overlap region', () => {
    const buf = new CellBuffer(2, 2);
    buf.set(0, 0, makeCell('A'));
    buf.set(1, 1, makeCell('D'));
    buf.resize(3, 3);
    expect(buf.get(0, 0).ch).toBe('A');
    expect(buf.get(1, 1).ch).toBe('D');
    expect(buf.get(2, 2).ch).toBe(' ');
  });

  it('truncates when shrinking', () => {
    const buf = new CellBuffer(3, 3);
    buf.set(2, 2, makeCell('X'));
    buf.resize(2, 2);
    expect(buf.rows).toBe(2);
    expect(buf.cols).toBe(2);
  });
});

describe('CellBuffer.takeDirtyRows', () => {
  it('returns and clears dirty set', () => {
    const buf = new CellBuffer(3, 3);
    buf.dirty.clear();
    buf.set(0, 0, makeCell('A'));
    buf.set(2, 0, makeCell('B'));
    const rows = buf.takeDirtyRows();
    expect(rows.sort()).toEqual([0, 2]);
    expect(buf.dirty.size).toBe(0);
  });
});

describe('writeCells', () => {
  it('writes ASCII text left-to-right', () => {
    const buf = new CellBuffer(2, 10);
    const { row, col } = writeCells(buf, 0, 0, 'hi', null);
    expect(row).toBe(0);
    expect(col).toBe(2);
    expect(buf.get(0, 0).ch).toBe('h');
    expect(buf.get(0, 1).ch).toBe('i');
  });

  it('writes CJK as 2-wide with sentinel', () => {
    const buf = new CellBuffer(2, 10);
    const { col } = writeCells(buf, 0, 0, 'あ', null);
    expect(col).toBe(2);
    expect(buf.get(0, 0).ch).toBe('あ');
    expect(buf.get(0, 0).width).toBe(2);
    expect(buf.get(0, 1).ch).toBe(null); // sentinel
  });

  it('calls onWrap at end of line', () => {
    const buf = new CellBuffer(2, 4);
    let wrapCount = 0;
    writeCells(buf, 0, 2, 'hello', null, () => {
      wrapCount++;
      return { row: 1, col: 0 };
    });
    expect(wrapCount).toBeGreaterThan(0);
  });
});
