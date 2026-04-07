import { create_session } from 'melange-output/src/main.js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { LocalEchoAddon } from '@gytx/xterm-local-echo';
import '@xterm/xterm/css/xterm.css';

// Catppuccin Mocha カラーを xterm テーマに反映。既存のデザインとの連続性のため。
const theme = {
  background: '#11111b',
  foreground: '#cdd6f4',
  cursor: '#a6e3a1',
  cursorAccent: '#11111b',
  selectionBackground: '#45475a',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

const term = new Terminal({
  theme,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', 'Consolas', monospace",
  fontSize: 14,
  cursorBlink: true,
  convertEol: true,
  allowProposedApi: true,
});

const fit = new FitAddon();
// enableIncompleteInput を切ることで Enter を必ず完了として扱う。複数行編集は今は不要。
const localEcho = new LocalEchoAddon({
  historySize: 200,
  enableAutocomplete: false,
  enableIncompleteInput: false,
});

term.loadAddon(fit);
term.loadAddon(localEcho);
term.open(document.getElementById('terminal'));
fit.fit();
window.addEventListener('resize', () => fit.fit());

// ---- readline 風キーバインド層 ----
// local-echo は C-a/C-e/C-b/C-f/C-k/C-u/C-w を解釈しないため、
// handleTermData に入る前に「対応するシーケンスへ翻訳」または
// 「内部状態 (input/cursor) を直接操作してから setInput で再描画」する。
// local-echo は Home/End (ESC[H, ESC[F)、← → (ESC[D, ESC[C)、
// Alt-b/Alt-f (ESC b / ESC f) は解釈できる。
const ORIG_HANDLE = localEcho.handleTermData.bind(localEcho);

// 共通: 入力全体を差分更新で書き換え、カーソルを指定列に置く。
// 行頭へ戻る → プロンプト直後へ → 行末まで消去 → 新内容 → カーソル移動
function rewriteLine(next, newCursor) {
  const promptLen = (localEcho.activePrompt && localEcho.activePrompt.prompt
    ? localEcho.activePrompt.prompt.length
    : 0);
  if (promptLen + Math.max(localEcho.input.length, next.length) >= term.cols) {
    // 折り返しの可能性があるなら安全に元実装へ
    localEcho.clearInput();
    localEcho.cursor = newCursor;
    localEcho.setInput(next, false);
    return;
  }
  let seq = `\r\x1b[${promptLen + 1}G\x1b[K${next}`;
  // カーソルを末尾から newCursor へ戻す
  const back = next.length - newCursor;
  if (back > 0) seq += `\x1b[${back}D`;
  term.write(seq);
  localEcho.input = next;
  localEcho.cursor = newCursor;
}

// 単語境界で削る (C-w): カーソル左の連続空白 + 直前単語を削除
function killPrevWord() {
  const i = localEcho.cursor;
  const s = localEcho.input;
  let j = i;
  while (j > 0 && /\s/.test(s[j - 1])) j--;
  while (j > 0 && !/\s/.test(s[j - 1])) j--;
  rewriteLine(s.slice(0, j) + s.slice(i), j);
}

function killToEnd() {
  const i = localEcho.cursor;
  rewriteLine(localEcho.input.slice(0, i), i);
}

function killToHead() {
  const i = localEcho.cursor;
  rewriteLine(localEcho.input.slice(i), 0);
}

// 入力を 1 文字ずつ走査し、Ctrl 系 1 バイトを翻訳する。
// ESC で始まる連続シーケンス（矢印キー等）はまとめて元ハンドラに渡す。
// 通常文字（連続入力・貼り付け）はバッチで元ハンドラに渡す。
function translateAndDispatch(data) {
  let i = 0;
  while (i < data.length) {
    const code = data.charCodeAt(i);
    if (code === 0x1b) {
      // ESC シーケンス: 次の ESC か末尾までを 1 単位として渡す
      let j = i + 1;
      while (j < data.length && data.charCodeAt(j) !== 0x1b) j++;
      ORIG_HANDLE(data.slice(i, j));
      i = j;
      continue;
    }
    if (code < 0x20 || code === 0x7f) {
      // 制御文字: 1 文字ずつ翻訳
      switch (code) {
        case 0x01: ORIG_HANDLE('\x1b[H'); break;   // C-a
        case 0x05: ORIG_HANDLE('\x1b[F'); break;   // C-e
        case 0x02: ORIG_HANDLE('\x1b[D'); break;   // C-b
        case 0x06: ORIG_HANDLE('\x1b[C'); break;   // C-f
        case 0x08: ORIG_HANDLE('\x7f'); break;     // C-h
        case 0x10: ORIG_HANDLE('\x1b[A'); break;   // C-p
        case 0x0e: ORIG_HANDLE('\x1b[B'); break;   // C-n
        case 0x0b: killToEnd(); break;              // C-k
        case 0x15: killToHead(); break;             // C-u
        case 0x17: killPrevWord(); break;           // C-w
        default:   ORIG_HANDLE(data[i]);            // \r, \t, C-c, C-d など
      }
      i++;
      continue;
    }
    // 通常文字: 連続部分をまとめる
    let j = i + 1;
    while (j < data.length) {
      const c = data.charCodeAt(j);
      if (c === 0x1b || c < 0x20 || c === 0x7f) break;
      j++;
    }
    ORIG_HANDLE(data.slice(i, j));
    i = j;
  }
}

localEcho.handleTermData = translateAndDispatch;

// 差分更新版の挿入。元の handleCursorInsert は clearInput → setInput で
// 行全体を消して描き直すためフレームごとに点滅する。
// ここでは「カーソル位置に ICH (ESC[n@) で空白を作り、文字を write」する
// 単純な戦略で、行は折り返さない前提（プロンプト+入力が cols 内）。
const ORIG_INSERT = localEcho.handleCursorInsert.bind(localEcho);
localEcho.handleCursorInsert = function (text) {
  // 折り返しが起こりうる長さなら安全側で元実装にフォールバック
  const promptLen = (localEcho.activePrompt && localEcho.activePrompt.prompt
    ? localEcho.activePrompt.prompt.length
    : 0);
  const newLen = promptLen + localEcho.input.length + text.length;
  if (newLen >= term.cols) {
    return ORIG_INSERT(text);
  }
  const i = localEcho.cursor;
  const before = localEcho.input.slice(0, i);
  const after = localEcho.input.slice(i);
  localEcho.input = before + text + after;
  localEcho.cursor = i + text.length;
  if (after.length === 0) {
    // 末尾追加: そのまま書く
    term.write(text);
  } else {
    // 中間挿入: ICH で文字数分の空きを作って書き込む
    term.write(`\x1b[${text.length}@${text}`);
  }
};

// 差分更新版の setInput。元実装は clearInput → 全行再描画でちらつくため、
// ヒストリ移動 (↑↓/C-p/C-n) の入れ替えを 1 回の write で済ませる。
// 折り返しが起きうる場合は元実装にフォールバック。
const ORIG_SET_INPUT = localEcho.setInput.bind(localEcho);
localEcho.setInput = function (newInput, clearFirst) {
  if (clearFirst === undefined) clearFirst = true;
  const promptLen = (localEcho.activePrompt && localEcho.activePrompt.prompt
    ? localEcho.activePrompt.prompt.length
    : 0);
  const oldLen = promptLen + localEcho.input.length;
  const newLen = promptLen + newInput.length;
  if (oldLen >= term.cols || newLen >= term.cols || !clearFirst) {
    return ORIG_SET_INPUT(newInput, clearFirst);
  }
  // 行頭へ戻り、プロンプト分だけ右へ動かし、そこから先を消して新入力を書く
  // CHA (\x1b[<n>G) で 1 始まり列指定、EL (\x1b[K) で行末まで消去
  term.write(`\r\x1b[${promptLen + 1}G\x1b[K${newInput}`);
  localEcho.input = newInput;
  localEcho.cursor = newInput.length;
};

// 差分更新版の 1 文字削除 (Backspace / C-h)。
// 元実装は clearInput → setInput で点滅する。
const ORIG_ERASE = localEcho.handleCursorErase.bind(localEcho);
localEcho.handleCursorErase = function (backspace) {
  const promptLen = (localEcho.activePrompt && localEcho.activePrompt.prompt
    ? localEcho.activePrompt.prompt.length
    : 0);
  if (promptLen + localEcho.input.length >= term.cols) {
    return ORIG_ERASE(backspace);
  }
  if (backspace) {
    if (localEcho.cursor <= 0) return;
    const i = localEcho.cursor;
    localEcho.input = localEcho.input.slice(0, i - 1) + localEcho.input.slice(i);
    localEcho.cursor = i - 1;
    // 1 文字戻る → DCH (1 文字削除) で右側を詰める
    term.write('\b\x1b[P');
  } else {
    // Delete (前方削除)
    if (localEcho.cursor >= localEcho.input.length) return;
    const i = localEcho.cursor;
    localEcho.input = localEcho.input.slice(0, i) + localEcho.input.slice(i + 1);
    term.write('\x1b[P');
  }
};

// ---- ANSI エスケープ: xterm への色付き出力で使う ----
const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const color = {
  green: (s) => `${ESC}32m${s}${RESET}`,     // prompt
  greenBold: (s) => `${ESC}1;32m${s}${RESET}`,
  blue: (s) => `${ESC}94m${s}${RESET}`,      // result
  yellow: (s) => `${ESC}93m${s}${RESET}`,    // binding
  red: (s) => `${ESC}91m${s}${RESET}`,       // error
  gray: (s) => `${ESC}90m${s}${RESET}`,      // hints
  dim: (s) => `${ESC}2m${s}${RESET}`,
};

// プロンプトは ASCII のみ。local-echo はプロンプト文字列の文字数でカーソル位置を
// 計算するため、ANSI エスケープシーケンスや曖昧幅文字 (❯ など) を含めると
// 内部カーソルと実カーソルがズレる。色付けは諦めて素のテキストを渡す。
const PROMPT_TEXT = 'calc> ';
const PROMPT = PROMPT_TEXT;

const session = create_session();

function formatResult(result) {
  if (result.success) {
    if (result.kind === 'expr') {
      return color.blue(`- : float = ${result.value}`);
    } else if (result.kind === 'binding') {
      return color.yellow(`val ${result.name} : float = ${result.value}`);
    }
  }
  const lines = [];
  if (result.error_column !== null && result.error_column > 0) {
    const padding = ' '.repeat(PROMPT_TEXT.length + result.error_column);
    lines.push(color.red(`${padding}^`));
  }
  const col =
    result.error_column !== null && result.error_column > 0
      ? ` at column ${result.error_column}`
      : '';
  lines.push(color.red(`Error${col}: ${result.error_message}`));
  return lines.join('\r\n');
}

function renderHints(text) {
  const tokens = session.hints(text);
  if (tokens.length === 0) return '';
  const label = color.dim('next:');
  const body = tokens.map((t) => color.gray(`[${t}]`)).join(' ');
  return `${label} ${body}`;
}

async function banner() {
  await localEcho.println(color.greenBold('Melange Calculator REPL'));
  await localEcho.println(
    color.dim('readline keys: C-a C-e C-b C-f C-h C-k C-u C-w M-b M-f  / history: C-p C-n up/down')
  );
  await localEcho.println('');
}

// 入力前に「次に来うるトークン」を 1 行だけ表示する。
// 入力中のライブ更新はプロンプト行と干渉して残骸が出やすいため諦める。
async function printHintsLine(text) {
  const rendered = renderHints(text);
  if (rendered) await localEcho.println(rendered);
}

async function replLoop() {
  await banner();
  while (true) {
    await printHintsLine('');
    let line;
    try {
      line = await localEcho.read(PROMPT);
    } catch {
      continue;
    }

    const text = line.trim();
    if (!text) continue;

    const result = session.eval(text);
    await localEcho.println(formatResult(result));
  }
}

replLoop();
