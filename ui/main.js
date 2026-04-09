import { ReplUI } from './repl/repl.js';

const mount = document.getElementById('terminal-wrap');
await new ReplUI({ mount }).run();
