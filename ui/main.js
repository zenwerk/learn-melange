import { ReplUI } from './repl/repl.js';

const mount = document.getElementById('terminal-wrap');
const repl = new ReplUI({ mount });
window.repl = repl; // デバッグ/検証用
repl.run();
