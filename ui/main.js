import { ReplUI } from './repl/repl.js';
import { restoreThemeFromStorage } from './effects/effect-panel.js';

// EffectManager 構築前にテーマを適用する必要があるため先に呼ぶ
// (crt-default の fontColor sentinel が現在テーマから解決されるため)。
restoreThemeFromStorage();

const mount = /** @type {HTMLElement} */ (document.getElementById('terminal-wrap'));
const repl = new ReplUI({ mount });
/** @type {any} */ (window).repl = repl; // デバッグ/検証用
repl.run();
