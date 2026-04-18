import { describe, it, expect } from 'vitest';
import { melangeProfile } from '../language/melange-profile.js';

describe('melangeProfile', () => {
  describe('prompt', () => {
    it('は "calc> "', () => {
      expect(melangeProfile.prompt).toBe('calc> ');
    });
  });

  describe('banner', () => {
    it('は複数行を含む', () => {
      expect(melangeProfile.banner.length).toBeGreaterThan(0);
    });

    it('の最初の行は "Melange Calculator REPL" を含む', () => {
      const first = melangeProfile.banner[0];
      expect(Array.isArray(first)).toBe(true);
      expect(first[0].text).toContain('Melange Calculator REPL');
    });
  });

  describe('formatResult', () => {
    it('expr kind は OCaml 型注釈構文で整形する', () => {
      const segs = melangeProfile.formatResult({
        success: true, kind: 'expr', name: null, value: 3,
        error_message: null, error_column: null,
      });
      expect(segs).toEqual([{ text: '- : float = 3', style: { fg: 'blue' } }]);
    });

    it('binding kind は val 構文で整形する', () => {
      const segs = melangeProfile.formatResult({
        success: true, kind: 'binding', name: 'x', value: 42,
        error_message: null, error_column: null,
      });
      expect(segs).toEqual([{ text: 'val x : float = 42', style: { fg: 'yellow' } }]);
    });

    it('未知 kind は空配列', () => {
      const segs = melangeProfile.formatResult({
        success: true, kind: 'unknown', name: null, value: null,
        error_message: null, error_column: null,
      });
      expect(segs).toEqual([]);
    });
  });

  describe('formatError', () => {
    it('column > 0 のときは caret 行 + message 行を返す', () => {
      const lines = melangeProfile.formatError({
        success: false, kind: 'error', name: null, value: null,
        error_message: 'unexpected token', error_column: 3,
      }, 6);
      expect(lines.length).toBe(2);
      // caret 行: promptLen(6) + column(3) 個のスペース + '^'
      expect(lines[0]).toEqual([{ text: `${' '.repeat(9)}^`, style: { fg: 'red' } }]);
      expect(lines[1]).toEqual([{ text: 'Error at column 3: unexpected token', style: { fg: 'red' } }]);
    });

    it('column が null のときは message 行のみ (suffix なし)', () => {
      const lines = melangeProfile.formatError({
        success: false, kind: 'error', name: null, value: null,
        error_message: 'generic failure', error_column: null,
      }, 6);
      expect(lines.length).toBe(1);
      expect(lines[0]).toEqual([{ text: 'Error: generic failure', style: { fg: 'red' } }]);
    });
  });

  describe('completionStyleFor', () => {
    it('variable は yellow', () => {
      expect(melangeProfile.completionStyleFor('variable')).toEqual({ fg: 'yellow' });
    });
    it('keyword は magenta', () => {
      expect(melangeProfile.completionStyleFor('keyword')).toEqual({ fg: 'magenta' });
    });
    it('operator は cyan', () => {
      expect(melangeProfile.completionStyleFor('operator')).toEqual({ fg: 'cyan' });
    });
    it('未知 kind は null (popup 側でデフォルトスタイルにフォールバック)', () => {
      expect(melangeProfile.completionStyleFor('macro')).toBeNull();
      expect(melangeProfile.completionStyleFor('function')).toBeNull();
    });
  });
});
