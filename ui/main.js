import { create_session } from 'melange-output/src/main.js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { LocalEchoAddon } from '@gytx/xterm-local-echo';
import '@xterm/xterm/css/xterm.css';

// ---------------------------------------------------------------------------
// 配色: Catppuccin Mocha を xterm theme に対応付け。既存デザインとの連続性。
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// ANSI エスケープユーティリティ
// ---------------------------------------------------------------------------
const ESC = '\x1b';
const CSI = `${ESC}[`;

const sgr = (code) => (s) => `${CSI}${code}m${s}${CSI}0m`;

const Ansi = Object.freeze({
  greenBold: sgr('1;32'),
  blue: sgr('94'),
  yellow: sgr('93'),
  red: sgr('91'),
  gray: sgr('90'),
  dim: sgr('2'),
});

// ---------------------------------------------------------------------------
// LocalEcho 拡張: readline 風 (Emacs) キーバインドと、ちらつき防止のための
// 差分更新パッチ。@gytx/xterm-local-echo は C-a/C-e/C-b/C-f/C-k/C-u/C-w を
// サポートしないため、handleTermData を差し替えて翻訳する。
// 加えて挿入/削除/setInput を ICH/DCH/EL ベースの差分更新に置き換え、
// clearInput → 全行再描画によるちらつきを根絶する。
// ---------------------------------------------------------------------------
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
    };
    this.#install();
  }

  // ----- 公開状態へのアクセサ（local-echo の private を読み書きする） -----
  get #input() { return this.#echo.input; }
  set #input(v) { this.#echo.input = v; }
  get #cursor() { return this.#echo.cursor; }
  set #cursor(v) { this.#echo.cursor = v; }
  get #promptLen() { return this.#echo.activePrompt?.prompt?.length ?? 0; }

  // 折り返しが起こりうる場合のみ true。差分更新パッチは折り返し非対応のため
  // この場合は元の (再描画ベースの) 実装にフォールバックする。
  #wouldWrap(extra = 0) {
    return this.#promptLen + this.#input.length + extra >= this.#term.cols;
  }

  // ----- 編集プリミティブ -----

  // 行内容を newInput に置き換え、カーソルを newCursor 列へ移す（差分更新）。
  #rewriteLine(next, newCursor) {
    if (this.#wouldWrap(Math.max(0, next.length - this.#input.length))) {
      this.#echo.clearInput();
      this.#cursor = newCursor;
      this.#orig.setInput(next, false);
      return;
    }
    const back = next.length - newCursor;
    const moveBack = back > 0 ? `${CSI}${back}D` : '';
    // 行頭→プロンプト直後→行末まで消去→新内容→末尾からカーソル位置へ戻る
    this.#term.write(`\r${CSI}${this.#promptLen + 1}G${CSI}K${next}${moveBack}`);
    this.#input = next;
    this.#cursor = newCursor;
  }

  // C-w: カーソル左の連続空白 + 直前単語を削除
  #killPrevWord() {
    const i = this.#cursor;
    const s = this.#input;
    let j = i;
    while (j > 0 && /\s/.test(s[j - 1])) j--;
    while (j > 0 && !/\s/.test(s[j - 1])) j--;
    this.#rewriteLine(s.slice(0, j) + s.slice(i), j);
  }

  // C-k: カーソル位置から行末まで削除
  #killToEnd() {
    const i = this.#cursor;
    this.#rewriteLine(this.#input.slice(0, i), i);
  }

  // C-u: 行頭からカーソル位置まで削除
  #killToHead() {
    const i = this.#cursor;
    this.#rewriteLine(this.#input.slice(i), 0);
  }

  // ----- キー翻訳テーブル -----
  // 制御文字 → local-echo が解釈できるシーケンス、または内部メソッド呼び出し
  #ctrlMap = new Map([
    [0x01, () => this.#orig.handleTermData(`${CSI}H`)], // C-a → Home
    [0x05, () => this.#orig.handleTermData(`${CSI}F`)], // C-e → End
    [0x02, () => this.#orig.handleTermData(`${CSI}D`)], // C-b → Left
    [0x06, () => this.#orig.handleTermData(`${CSI}C`)], // C-f → Right
    [0x08, () => this.#orig.handleTermData('\x7f')],    // C-h → Backspace
    [0x10, () => this.#orig.handleTermData(`${CSI}A`)], // C-p → Up (history prev)
    [0x0e, () => this.#orig.handleTermData(`${CSI}B`)], // C-n → Down (history next)
    [0x0b, () => this.#killToEnd()],                    // C-k
    [0x15, () => this.#killToHead()],                   // C-u
    [0x17, () => this.#killPrevWord()],                 // C-w
  ]);

  // 入力ストリームを走査して翻訳。3 種類のセグメントに分けて処理する:
  //   1. ESC で始まる連続列 (矢印など) → そのまま元ハンドラへ
  //   2. 制御文字 → 1 文字ずつテーブル参照
  //   3. 通常文字 → 連続部分をまとめて元ハンドラへ
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
        else this.#orig.handleTermData(data[i]); // \r, \t, C-c, C-d 等
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

  // ----- 差分更新オーバーライド -----

  #handleCursorInsert = (text) => {
    if (this.#wouldWrap(text.length)) return this.#orig.handleCursorInsert(text);

    const i = this.#cursor;
    const before = this.#input.slice(0, i);
    const after = this.#input.slice(i);
    this.#input = before + text + after;
    this.#cursor = i + text.length;

    if (after.length === 0) {
      // 末尾追加
      this.#term.write(text);
    } else {
      // 中間挿入: ICH (CSI n @) で空きを作って書き込む
      this.#term.write(`${CSI}${text.length}@${text}`);
    }
  };

  #handleCursorErase = (backspace) => {
    if (this.#wouldWrap()) return this.#orig.handleCursorErase(backspace);

    if (backspace) {
      if (this.#cursor <= 0) return;
      const i = this.#cursor;
      this.#input = this.#input.slice(0, i - 1) + this.#input.slice(i);
      this.#cursor = i - 1;
      // BS で 1 戻る → DCH (CSI P) で 1 文字削除
      this.#term.write(`\b${CSI}P`);
    } else {
      if (this.#cursor >= this.#input.length) return;
      const i = this.#cursor;
      this.#input = this.#input.slice(0, i) + this.#input.slice(i + 1);
      this.#term.write(`${CSI}P`);
    }
  };

  // ヒストリ移動 (↑↓/C-p/C-n) や autocomplete から呼ばれる入力差し替え。
  // clearFirst===false 系（killTo* 経由）は元実装にフォールバックさせない
  // ように、ここではリライト後に内部状態を一致させる。
  #setInput = (newInput, clearFirst = true) => {
    if (!clearFirst || this.#wouldWrap(Math.max(0, newInput.length - this.#input.length))) {
      return this.#orig.setInput(newInput, clearFirst);
    }
    this.#term.write(`\r${CSI}${this.#promptLen + 1}G${CSI}K${newInput}`);
    this.#input = newInput;
    this.#cursor = newInput.length;
  };

  #install() {
    this.#echo.handleTermData = this.#dispatch;
    this.#echo.handleCursorInsert = this.#handleCursorInsert;
    this.#echo.handleCursorErase = this.#handleCursorErase;
    this.#echo.setInput = this.#setInput;
  }
}

// ---------------------------------------------------------------------------
// REPL 本体
// ---------------------------------------------------------------------------

// プロンプトは ASCII のみ。local-echo はプロンプト文字列の文字数でカーソル
// 位置を計算するため、ANSI エスケープシーケンスや曖昧幅文字 (❯ など) を
// 含めると内部カーソルと実カーソルがズレる。色付けは諦めて素のテキスト。
const PROMPT = 'calc> ';

class ReplUI {
  #term;
  #echo;
  #session;

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
      const hints = this.#renderHints('');
      if (hints) await this.#echo.println(hints);

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

// ---- エントリポイント (top-level await) ----
const repl = new ReplUI({ mount: document.getElementById('terminal') });
await repl.run();
