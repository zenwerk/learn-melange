import { create_session } from 'melange-output/src/main.js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { LocalEchoAddon } from '@gytx/xterm-local-echo';
import '@xterm/xterm/css/xterm.css';

const THEME = Object.freeze({
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
});

const ESC = '\x1b';
const CSI = `${ESC}[`;

const sgr = (code) => (s) => `${CSI}${code}m${s}${CSI}0m`;

// East Asian Width ベースの文字幅判定。全角/ワイド/絵文字は 2 セル、制御文字は 0、
// それ以外は 1 を返す。local-echo はコード単位で列計算しているので、マルチバイト
// 対応のためセル幅を明示的に扱う必要がある。
const isWide = (cp) => (
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0x303e) ||
  (cp >= 0x3041 && cp <= 0x33ff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0xa000 && cp <= 0xa4cf) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x1f300 && cp <= 0x1f64f) ||
  (cp >= 0x1f900 && cp <= 0x1f9ff) ||
  (cp >= 0x20000 && cp <= 0x2fffd) ||
  (cp >= 0x30000 && cp <= 0x3fffd)
);
const charWidthAt = (s, i) => {
  const cp = s.codePointAt(i);
  if (cp === undefined) return 0;
  if (cp < 0x20 || cp === 0x7f) return 0;
  return isWide(cp) ? 2 : 1;
};
const strWidth = (s) => {
  let w = 0;
  for (let i = 0; i < s.length;) {
    const cp = s.codePointAt(i);
    w += (cp < 0x20 || cp === 0x7f) ? 0 : (isWide(cp) ? 2 : 1);
    i += cp > 0xffff ? 2 : 1;
  }
  return w;
};
// i の位置にある code point の UTF-16 長 (1 or 2)
const cpLen = (s, i) => (s.codePointAt(i) > 0xffff ? 2 : 1);

const Ansi = Object.freeze({
  greenBold: sgr('1;32'),
  blue: sgr('94'),
  yellow: sgr('93'),
  red: sgr('91'),
  gray: sgr('90'),
  dim: sgr('2'),
});

// @gytx/xterm-local-echo は readline 風 Emacs キーバインドを持たない。また
// 編集のたびに clearInput → 全行再描画するためちらつく。このクラスは
// (1) handleTermData を差し替えて C-a 等を翻訳し
// (2) 挿入/削除/setInput を ICH/DCH/EL ベースの差分更新に置き換える。
// 副作用としてライブラリの非公開フィールド (input/cursor/activePrompt) と
// 非公開メソッドに依存している。アップグレード時は要再検証。
class LocalEchoEnhancer {
  #term;
  #echo;
  #orig;

  constructor(term, echo) {
    this.#term = term;
    this.#echo = echo;
    this.#orig = {
      handleTermData: echo.handleTermData.bind(echo),
      handleCursorInsert: echo.handleCursorInsert.bind(echo),
      handleCursorErase: echo.handleCursorErase.bind(echo),
      setInput: echo.setInput.bind(echo),
      setCursor: echo.setCursor.bind(echo),
      handleCursorMove: echo.handleCursorMove.bind(echo),
    };
    this.#install();
  }

  #promptLen() {
    return this.#echo.activePrompt?.prompt?.length ?? 0;
  }

  // 差分更新パッチは行折り返しに対応していない。プロンプト+入力のセル幅が
  // cols を超えうる場合のみ true を返し、呼び出し側は元実装にフォールバック。
  // extraWidth は挿入予定のセル幅 (コード単位数ではない)。
  #wouldWrap(extraWidth = 0) {
    return this.#promptLen() + strWidth(this.#echo.input) + extraWidth >= this.#term.cols;
  }

  // 共通プリミティブ: 行を空にして next を書き込み、カーソルを末尾に置く。
  #writeLineBody(next) {
    this.#term.write(`\r${CSI}${this.#promptLen() + 1}G${CSI}K${next}`);
    this.#echo.input = next;
    this.#echo.cursor = next.length;
  }

  // 行内容を next に置き換え、カーソルを newCursor (UTF-16 index) に配置する。
  #rewriteLine(next, newCursor) {
    const delta = Math.max(0, strWidth(next) - strWidth(this.#echo.input));
    if (this.#wouldWrap(delta)) {
      this.#echo.clearInput();
      this.#echo.cursor = newCursor;
      this.#orig.setInput(next, false);
      return;
    }
    this.#writeLineBody(next);
    const back = strWidth(next.slice(newCursor));
    if (back > 0) this.#term.write(`${CSI}${back}D`);
    this.#echo.cursor = newCursor;
  }

  #killPrevWord() {
    const i = this.#echo.cursor;
    const s = this.#echo.input;
    let j = i;
    while (j > 0 && /\s/.test(s[j - 1])) j--;
    while (j > 0 && !/\s/.test(s[j - 1])) j--;
    this.#rewriteLine(s.slice(0, j) + s.slice(i), j);
  }

  #killToEnd() {
    const i = this.#echo.cursor;
    this.#rewriteLine(this.#echo.input.slice(0, i), i);
  }

  #killToHead() {
    this.#rewriteLine(this.#echo.input.slice(this.#echo.cursor), 0);
  }

  // 制御文字 → local-echo が解釈できるシーケンス、または内部メソッド呼び出し
  #ctrlMap = new Map([
    [0x01, () => this.#orig.handleTermData(`${CSI}H`)], // C-a → Home
    [0x05, () => this.#orig.handleTermData(`${CSI}F`)], // C-e → End
    [0x02, () => this.#orig.handleTermData(`${CSI}D`)], // C-b → Left
    [0x06, () => this.#orig.handleTermData(`${CSI}C`)], // C-f → Right
    [0x08, () => this.#orig.handleTermData('\x7f')],    // C-h → Backspace
    [0x10, () => this.#orig.handleTermData(`${CSI}A`)], // C-p → Up
    [0x0e, () => this.#orig.handleTermData(`${CSI}B`)], // C-n → Down
    [0x0b, () => this.#killToEnd()],                    // C-k
    [0x15, () => this.#killToHead()],                   // C-u
    [0x17, () => this.#killPrevWord()],                 // C-w
  ]);

  #dispatch = (data) => {
    let i = 0;
    while (i < data.length) {
      const code = data.charCodeAt(i);

      if (code === 0x1b) {
        let j = i + 1;
        while (j < data.length && data.charCodeAt(j) !== 0x1b) j++;
        this.#orig.handleTermData(data.slice(i, j));
        i = j;
        continue;
      }

      if (code < 0x20 || code === 0x7f) {
        const action = this.#ctrlMap.get(code);
        if (action) action();
        else this.#orig.handleTermData(data[i]);
        i++;
        continue;
      }

      let j = i + 1;
      while (j < data.length) {
        const c = data.charCodeAt(j);
        if (c === 0x1b || c < 0x20 || c === 0x7f) break;
        j++;
      }
      this.#orig.handleTermData(data.slice(i, j));
      i = j;
    }
  };

  #handleCursorInsert = (text) => {
    const textW = strWidth(text);
    if (this.#wouldWrap(textW)) return this.#orig.handleCursorInsert(text);

    const i = this.#echo.cursor;
    const after = this.#echo.input.slice(i);
    this.#echo.input = this.#echo.input.slice(0, i) + text + after;
    this.#echo.cursor = i + text.length;

    // 中間挿入は ICH (CSI n @) で "セル幅ぶん" の空きを作ってから書き込む。
    // n は文字数ではなくセル幅である点に注意 (全角は 2 セル)。
    const seq = after.length === 0 ? text : `${CSI}${textW}@${text}`;
    this.#term.write(seq);
  };

  #handleCursorErase = (backspace) => {
    if (this.#wouldWrap()) return this.#orig.handleCursorErase(backspace);

    const s = this.#echo.input;
    if (backspace) {
      if (this.#echo.cursor <= 0) return;
      // 直前 code point (サロゲートペア対応) とそのセル幅を取得
      let i = this.#echo.cursor - 1;
      if (i > 0 && s.charCodeAt(i) >= 0xdc00 && s.charCodeAt(i) <= 0xdfff) i--;
      const w = charWidthAt(s, i);
      this.#echo.input = s.slice(0, i) + s.slice(this.#echo.cursor);
      this.#echo.cursor = i;
      // カーソルを w セル戻してから w セル分削除
      this.#term.write(`${CSI}${w}D${CSI}${w}P`);
    } else {
      if (this.#echo.cursor >= s.length) return;
      const i = this.#echo.cursor;
      const w = charWidthAt(s, i);
      const n = cpLen(s, i);
      this.#echo.input = s.slice(0, i) + s.slice(i + n);
      this.#term.write(`${CSI}${w}P`);
    }
  };

  // 履歴移動 (↑↓/C-p/C-n) や autocomplete 経由の入力差し替え。
  // killTo* 内部からの呼び出し (clearFirst=false) は元実装に任せる。
  #setInput = (newInput, clearFirst = true) => {
    if (!clearFirst) return this.#orig.setInput(newInput, false);
    if (this.#wouldWrap(Math.max(0, strWidth(newInput) - strWidth(this.#echo.input)))) {
      return this.#orig.setInput(newInput, true);
    }
    this.#writeLineBody(newInput);
  };

  // setCursor を差し替え: UTF-16 index 差分ではなくセル幅差分で左右移動し、
  // サロゲートペアを越えて不正な位置に止まらないよう正規化する。
  // (折り返し時はフォールバック)
  #setCursor = (newCursor) => {
    const s = this.#echo.input;
    if (newCursor < 0) newCursor = 0;
    if (newCursor > s.length) newCursor = s.length;
    // サロゲートペアの中間を指していたら後方へスナップ
    if (newCursor > 0 && newCursor < s.length) {
      const c = s.charCodeAt(newCursor);
      if (c >= 0xdc00 && c <= 0xdfff) newCursor--;
    }
    if (this.#wouldWrap()) return this.#orig.setCursor(newCursor);

    const prevW = strWidth(s.slice(0, this.#echo.cursor));
    const newW = strWidth(s.slice(0, newCursor));
    if (newW > prevW) this.#term.write(`${CSI}${newW - prevW}C`);
    else if (newW < prevW) this.#term.write(`${CSI}${prevW - newW}D`);
    this.#echo.cursor = newCursor;
  };

  // handleCursorMove を差し替え: dir は "文字 (code point) 数" として扱い、
  // サロゲートペアを 1 歩で飛び越える。
  #handleCursorMove = (dir) => {
    const s = this.#echo.input;
    let i = this.#echo.cursor;
    if (dir > 0) {
      for (let k = 0; k < dir && i < s.length; k++) i += cpLen(s, i);
    } else if (dir < 0) {
      for (let k = 0; k < -dir && i > 0; k++) {
        i--;
        if (i > 0 && s.charCodeAt(i) >= 0xdc00 && s.charCodeAt(i) <= 0xdfff) i--;
      }
    }
    this.#setCursor(i);
  };

  #install() {
    this.#echo.handleTermData = this.#dispatch;
    this.#echo.handleCursorInsert = this.#handleCursorInsert;
    this.#echo.handleCursorErase = this.#handleCursorErase;
    this.#echo.setInput = this.#setInput;
    this.#echo.setCursor = this.#setCursor;
    this.#echo.handleCursorMove = this.#handleCursorMove;
  }
}

// プロンプトは ASCII のみ。local-echo はプロンプト文字列の文字数でカーソル
// 位置を計算するため、ANSI エスケープや曖昧幅文字 (❯ 等) を含めると
// 内部カーソルと実カーソルがズレる。
const PROMPT = 'calc> ';

class ReplUI {
  #term;
  #echo;
  #session;
  #initialHints;

  constructor({ mount }) {
    this.#term = new Terminal({
      theme: THEME,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 14,
      cursorBlink: true,
      convertEol: true,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    this.#echo = new LocalEchoAddon({
      historySize: 200,
      enableAutocomplete: false,
      enableIncompleteInput: false,
    });

    this.#term.loadAddon(fit);
    this.#term.loadAddon(this.#echo);
    this.#term.open(mount);
    fit.fit();
    window.addEventListener('resize', () => fit.fit());

    new LocalEchoEnhancer(this.#term, this.#echo);

    this.#session = create_session();
    this.#initialHints = this.#renderHints('');
  }

  #formatResult(result) {
    if (result.success) {
      return result.kind === 'expr'
        ? Ansi.blue(`- : float = ${result.value}`)
        : Ansi.yellow(`val ${result.name} : float = ${result.value}`);
    }

    const lines = [];
    const col = result.error_column;
    if (col !== null && col > 0) {
      lines.push(Ansi.red(`${' '.repeat(PROMPT.length + col)}^`));
    }
    const colSuffix = col !== null && col > 0 ? ` at column ${col}` : '';
    lines.push(Ansi.red(`Error${colSuffix}: ${result.error_message}`));
    return lines.join('\r\n');
  }

  #renderHints(text) {
    const tokens = this.#session.hints(text);
    if (tokens.length === 0) return '';
    const body = tokens.map((t) => Ansi.gray(`[${t}]`)).join(' ');
    return `${Ansi.dim('next:')} ${body}`;
  }

  async #banner() {
    await this.#echo.println(Ansi.greenBold('Melange Calculator REPL'));
    await this.#echo.println(
      Ansi.dim(
        'readline keys: C-a C-e C-b C-f C-h C-k C-u C-w M-b M-f  / history: C-p C-n up/down'
      )
    );
    await this.#echo.println('');
  }

  async run() {
    await this.#banner();
    while (true) {
      if (this.#initialHints) await this.#echo.println(this.#initialHints);

      let line;
      try {
        line = await this.#echo.read(PROMPT);
      } catch {
        continue;
      }

      const text = line.trim();
      if (!text) continue;

      const result = this.#session.eval(text);
      await this.#echo.println(this.#formatResult(result));
    }
  }
}

const repl = new ReplUI({ mount: document.getElementById('terminal') });
await repl.run();
