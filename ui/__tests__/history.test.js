import { describe, it, expect } from 'vitest';
import { History } from '../terminal/history.js';

describe('History.push', () => {
  it('stores entries', () => {
    const h = new History();
    h.push('a');
    h.push('b');
    expect(h.entries).toEqual(['a', 'b']);
  });

  it('skips empty lines', () => {
    const h = new History();
    h.push('');
    expect(h.entries).toEqual([]);
  });

  it('dedupes consecutive duplicates', () => {
    const h = new History();
    h.push('a');
    h.push('a');
    expect(h.entries).toEqual(['a']);
  });

  it('respects max size', () => {
    const h = new History({ max: 3 });
    h.push('a');
    h.push('b');
    h.push('c');
    h.push('d');
    expect(h.entries).toEqual(['b', 'c', 'd']);
  });
});

describe('History.prev / next navigation', () => {
  it('prev walks backward, returns null at start', () => {
    const h = new History();
    h.push('a');
    h.push('b');
    h.push('c');
    expect(h.prev('')).toBe('c');
    expect(h.prev('c')).toBe('b');
    expect(h.prev('b')).toBe('a');
    expect(h.prev('a')).toBe(null);
  });

  it('next walks forward and returns draft at the end', () => {
    const h = new History();
    h.push('a');
    h.push('b');
    h.prev('draft'); // draft captured, pointer now at 'b'
    h.prev('b');     // pointer at 'a'
    expect(h.next('a')).toBe('b');
    expect(h.next('b')).toBe('draft');
  });

  it('next returns null when at the end', () => {
    const h = new History();
    h.push('a');
    expect(h.next('anything')).toBe(null);
  });
});

describe('History.resetCursor', () => {
  it('resets position to end with new draft', () => {
    const h = new History();
    h.push('a');
    h.prev('');     // pointer moves back
    h.resetCursor('new-draft');
    expect(h.index).toBe(1);
    expect(h.draft).toBe('new-draft');
  });
});
