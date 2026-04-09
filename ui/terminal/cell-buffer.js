// row × col のテキストセルバッファ。
// 全角文字は左セルに { ch, width: 2 } を入れ、右セルに { ch: null, width: 0 } 哨兵を置く。
// 行単位の dirty フラグで差分描画を駆動する。

export const makeCell = (ch = ' ', style = null, width = 1) => ({ ch, style, width });
const EMPTY = () => makeCell(' ', null, 1);

export class CellBuffer {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, EMPTY),
    );
    this.dirty = new Set();
    for (let r = 0; r < rows; r++) this.dirty.add(r);
  }

  resize(rows, cols) {
    const next = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const old = this.grid[r]?.[c];
        return old ? { ...old } : EMPTY();
      }),
    );
    this.grid = next;
    this.rows = rows;
    this.cols = cols;
    this.markAllDirty();
  }

  clear() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) this.grid[r][c] = EMPTY();
      this.dirty.add(r);
    }
  }

  // 1 セルを書き込む (全角判定は呼び出し側が行う)。
  set(row, col, cell) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
    this.grid[row][col] = cell;
    this.dirty.add(row);
  }

  get(row, col) {
    return this.grid[row]?.[col];
  }

  // row の col..col+width-1 を消去 (幅 >1 のセル更新前に使う)
  clearRun(row, col, width) {
    for (let i = 0; i < width && col + i < this.cols; i++) {
      this.grid[row][col + i] = EMPTY();
    }
    this.dirty.add(row);
  }

  // 一番上 n 行を捨てて下に空行を足す。
  scrollUp(n = 1) {
    if (n <= 0) return;
    if (n >= this.rows) {
      this.clear();
      return;
    }
    this.grid.splice(0, n);
    for (let i = 0; i < n; i++) {
      this.grid.push(Array.from({ length: this.cols }, EMPTY));
    }
    this.markAllDirty();
  }

  markAllDirty() {
    this.dirty.clear();
    for (let r = 0; r < this.rows; r++) this.dirty.add(r);
  }

  // dirty な行番号を返し、フラグをクリア。
  takeDirtyRows() {
    const rows = [...this.dirty].sort((a, b) => a - b);
    this.dirty.clear();
    return rows;
  }
}
