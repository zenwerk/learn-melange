import { describe, it, expect } from 'vitest';
import { resolveKey } from '../terminal/readline-keys.js';

const ev = (props) => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...props,
});

describe('resolveKey: plain keys', () => {
  it('Enter → submit', () => {
    expect(resolveKey(ev({ key: 'Enter' }))).toBe('submit');
  });
  it('Backspace → deleteBack', () => {
    expect(resolveKey(ev({ key: 'Backspace' }))).toBe('deleteBack');
  });
  it('ArrowLeft → moveLeft', () => {
    expect(resolveKey(ev({ key: 'ArrowLeft' }))).toBe('moveLeft');
  });
  it('Tab → completeNext', () => {
    expect(resolveKey(ev({ key: 'Tab' }))).toBe('completeNext');
  });
  it('Shift+Tab → completePrev', () => {
    expect(resolveKey(ev({ key: 'Tab', shiftKey: true }))).toBe('completePrev');
  });
  it('Escape → completeCancel', () => {
    expect(resolveKey(ev({ key: 'Escape' }))).toBe('completeCancel');
  });
});

describe('resolveKey: Ctrl bindings', () => {
  it('Ctrl+A → moveHome', () => {
    expect(resolveKey(ev({ key: 'a', ctrlKey: true }))).toBe('moveHome');
  });
  it('Ctrl+E → moveEnd', () => {
    expect(resolveKey(ev({ key: 'e', ctrlKey: true }))).toBe('moveEnd');
  });
  it('Ctrl+W → killPrevWord', () => {
    expect(resolveKey(ev({ key: 'w', ctrlKey: true }))).toBe('killPrevWord');
  });
  it('Ctrl+P → historyPrev', () => {
    expect(resolveKey(ev({ key: 'p', ctrlKey: true }))).toBe('historyPrev');
  });
  it('Ctrl is case-insensitive', () => {
    expect(resolveKey(ev({ key: 'A', ctrlKey: true }))).toBe('moveHome');
  });
});

describe('resolveKey: Meta/Alt bindings', () => {
  it('Alt+B → moveWordLeft', () => {
    expect(resolveKey(ev({ key: 'b', altKey: true }))).toBe('moveWordLeft');
  });
  it('Alt+F → moveWordRight', () => {
    expect(resolveKey(ev({ key: 'f', altKey: true }))).toBe('moveWordRight');
  });
});

describe('resolveKey: edge cases', () => {
  it('returns null during IME composition', () => {
    expect(resolveKey(ev({ key: 'Enter', isComposing: true }))).toBe(null);
  });
  it('returns null for unmapped keys', () => {
    expect(resolveKey(ev({ key: 'F1' }))).toBe(null);
  });
  it('returns null for Ctrl with unmapped letter', () => {
    expect(resolveKey(ev({ key: 'z', ctrlKey: true }))).toBe(null);
  });
});
