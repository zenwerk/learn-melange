import { ReplUI } from './repl/repl.js';
import { restoreThemeFromStorage } from './effects/effect-panel.js';

// EffectManager が初期プロファイルをテーマから解決するより前に、
// <body> のテーマクラスを localStorage から復元する。
restoreThemeFromStorage();

const mount = /** @type {HTMLElement} */ (document.getElementById('terminal-wrap'));
const repl = new ReplUI({ mount });
/** @type {any} */ (window).repl = repl; // デバッグ/検証用
repl.run();
