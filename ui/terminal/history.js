// 入力履歴バッファ。上キー/C-p で遡り、下/C-n で進む。
// 編集中の draft (未コミットの現在行) を index = entries.length に仮想配置する。

export class History {
  constructor({ max = 200 } = {}) {
    this.max = max;
    this.entries = [];
    this.index = 0; // entries.length を指すと draft を表示
    this.draft = '';
  }

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

  resetCursor(draft = '') {
    this.index = this.entries.length;
    this.draft = draft;
  }

  // 現在値を受け取り、前の履歴を返す (無ければ null)
  prev(current) {
    if (this.entries.length === 0) return null;
    if (this.index === this.entries.length) this.draft = current;
    if (this.index === 0) return null;
    this.index--;
    return this.entries[this.index];
  }

  next(_current) {
    if (this.index >= this.entries.length) return null;
    this.index++;
    if (this.index === this.entries.length) return this.draft;
    return this.entries[this.index];
  }
}
