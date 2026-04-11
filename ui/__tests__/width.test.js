import { describe, it, expect } from 'vitest';
import { cpWidth, strWidth, strWidthRange, cpStart, cpLen } from '../terminal/width.js';

describe('cpWidth', () => {
  it('ASCII printable = 1', () => {
    expect(cpWidth(0x41)).toBe(1); // A
    expect(cpWidth(0x20)).toBe(1); // space
    expect(cpWidth(0x7e)).toBe(1); // ~
  });

  it('control and DEL = 0', () => {
    expect(cpWidth(0x00)).toBe(0);
    expect(cpWidth(0x1f)).toBe(0);
    expect(cpWidth(0x7f)).toBe(0);
  });

  it('CJK ideograph = 2', () => {
    expect(cpWidth(0x4e00)).toBe(2); // 一
    expect(cpWidth(0x3042)).toBe(2); // あ
    expect(cpWidth(0x30a2)).toBe(2); // ア
  });

  it('emoji (BMP range) = 2', () => {
    expect(cpWidth(0x1f600)).toBe(2); // 😀
  });

  it('combining mark = 0', () => {
    expect(cpWidth(0x0301)).toBe(0); // combining acute
  });
});

describe('strWidth', () => {
  it('ASCII string', () => {
    expect(strWidth('hello')).toBe(5);
  });

  it('mixed ASCII and CJK', () => {
    expect(strWidth('abあい')).toBe(6); // 1+1+2+2
  });

  it('empty string', () => {
    expect(strWidth('')).toBe(0);
  });

  it('combining marks are zero width', () => {
    expect(strWidth('e\u0301')).toBe(1); // é as e + combining acute
  });
});

describe('strWidthRange', () => {
  it('slice of ASCII', () => {
    expect(strWidthRange('hello', 0, 3)).toBe(3);
    expect(strWidthRange('hello', 2, 5)).toBe(3);
  });

  it('slice containing CJK', () => {
    expect(strWidthRange('aあb', 0, 2)).toBe(3); // a + あ
  });
});

describe('cpStart / cpLen', () => {
  it('ASCII char: len 1', () => {
    expect(cpLen('hello', 0)).toBe(1);
    expect(cpStart('hello', 2)).toBe(2);
  });

  it('surrogate pair: len 2', () => {
    // 😀 is U+1F600, surrogate pair \uD83D\uDE00
    const emoji = '😀';
    expect(cpLen(emoji, 0)).toBe(2);
  });

  it('cpStart snaps back from low surrogate', () => {
    const s = 'x😀y';
    // index 1 = high surrogate, index 2 = low surrogate
    expect(cpStart(s, 2)).toBe(1); // snap to high surrogate
    expect(cpStart(s, 1)).toBe(1); // already high surrogate
  });
});
