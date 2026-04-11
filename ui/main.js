import { ReplUI } from './repl/repl.js';

const mount = /** @type {HTMLElement} */ (document.getElementById('terminal-wrap'));
const repl = new ReplUI({ mount });
/** @type {any} */ (window).repl = repl; // デバッグ/検証用
repl.run();
