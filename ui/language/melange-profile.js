// @ts-nocheck
// OCaml/Melange バックエンド向けの LanguageProfile。
// 純関数のみで構成し、バックエンド (create_session) には依存しないので
// 単体テストが OCaml ビルド成果物なしで走る。

/**
 * @typedef {import('../types.d.ts').CellStyle} CellStyle
 * @typedef {import('../types.d.ts').Segment} Segment
 * @typedef {import('./backend.d.ts').LanguageProfile} LanguageProfile
 */

/** @type {Record<string, CellStyle>} */
const S = {
  greenBold: { fg: 'green', bold: true },
  blue:      { fg: 'blue' },
  yellow:    { fg: 'yellow' },
  red:       { fg: 'red' },
  dim:       { fg: null, dim: true },
};

/** @type {Record<string, CellStyle>} */
const COMPLETION_STYLE = {
  variable: { fg: 'yellow' },
  keyword:  { fg: 'magenta' },
  operator: { fg: 'cyan' },
};

/** @type {LanguageProfile} */
export const melangeProfile = {
  prompt: 'calc> ',
  banner: [
    [{ text: 'Melange Calculator REPL', style: S.greenBold }],
    [{
      text: 'readline: C-a C-e C-b C-f C-h C-k C-u C-w M-b M-f  / history: C-p C-n ↑↓  /' +
            ' complete: Tab S-Tab Esc  / clear: C-l  / zoom: C-= C-- C-0  / effect: :effect / C-S-e / panel: C-S-p',
      style: S.dim,
    }],
    '',
  ],

  formatResult(r) {
    if (r.kind === 'expr') {
      return [{ text: `- : float = ${r.value}`, style: S.blue }];
    }
    if (r.kind === 'binding') {
      return [{ text: `val ${r.name} : float = ${r.value}`, style: S.yellow }];
    }
    return [];
  },

  formatError(r, promptLen) {
    /** @type {Segment[][]} */
    const out = [];
    const col = r.error_column;
    const hasCol = col !== null && col > 0;
    if (hasCol) {
      out.push([{ text: `${' '.repeat(promptLen + col)}^`, style: S.red }]);
    }
    const suffix = hasCol ? ` at column ${col}` : '';
    out.push([{ text: `Error${suffix}: ${r.error_message}`, style: S.red }]);
    return out;
  },

  completionStyleFor(kind) {
    return COMPLETION_STYLE[kind] ?? null;
  },
};
