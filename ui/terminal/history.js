// 入力履歴バッファ。上キー/C-p で遡り、下/C-n で進む。
// 編集中の draft (未コミットの現在行) を index = entries.length に仮想配置する。

export class History {
  /**
   * @param {{ max?: number }} [opts]
   */
  constructor({ max = 200 } = {}) {
    this.max = max;
    /** @type {string[]} */
    this.entries = [];
    this.index = 0; // entries.length を指すと draft を表示
    this.draft = '';
  }

  /** @param {string} line */
  push(line) {
    if (!line) return;
    if (this.entries[this.entries.length - 1] === line) {
      this.index = this.entries.length;
      return;
    }
    this.entries.push(line);
    if (this.entries.length > this.max) this.entries.shift();
    this.index = this.entries.length;
    this.draft = '';
  }

  /** @param {string} [draft] */
  resetCursor(draft = '') {
    this.index = this.entries.length;
    this.draft = draft;
  }

  // 現在値を受け取り、前の履歴を返す (無ければ null)
  /**
   * @param {string} current
   * @returns {string | null}
   */
  prev(current) {
    if (this.entries.length === 0) return null;
    if (this.index === this.entries.length) this.draft = current;
    if (this.index === 0) return null;
    this.index--;
    return this.entries[this.index];
  }

  /**
   * @param {string} _current
   * @returns {string | null}
   */
  // eslint-disable-next-line no-unused-vars
  next(_current) {
    if (this.index >= this.entries.length) return null;
    this.index++;
    if (this.index === this.entries.length) return this.draft;
    return this.entries[this.index];
  }
}
