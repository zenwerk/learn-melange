import { describe, it, expect } from 'vitest';
import { findTrigger } from '../terminal/triggers.js';

describe('findTrigger', () => {
  it('カーソル直前が "x." にマッチする', () => {
    const m = findTrigger('x.', 2);
    expect(m).not.toBeNull();
    expect(m.trigger).toBe('x.');
    expect(m.items.length).toBe(1);
    expect(m.items[0]).toMatchObject({
      label: '⊗',
      kind: 'trigger',
      detail: 'circled times',
      triggerLen: 2,
    });
  });

  it('文字列中にマッチしたらカーソル直前で判定する', () => {
    const m = findTrigger('foo x.', 6);
    expect(m?.trigger).toBe('x.');
  });

  it('カーソルが trigger の途中ならマッチしない', () => {
    expect(findTrigger('x.', 1)).toBeNull();
  });

  it('カーソル直前が trigger でないときは null', () => {
    expect(findTrigger('abc', 3)).toBeNull();
    expect(findTrigger('x..', 3)).toBeNull(); // 末尾は '..' なので 'x.' にマッチしない
  });

  it('入力が空ならマッチしない', () => {
    expect(findTrigger('', 0)).toBeNull();
  });

  it('cursor が入力長を超えても例外を出さず判定する', () => {
    // slice は長さ超過でも空文字に丸まるので、マッチしないだけで済む
    expect(findTrigger('x.', 99)).toBeNull();
  });

  it('同一入力・同一 cursor の複数回呼び出しは同一 items 参照を返す', () => {
    // CompletionPopup.show の参照等価 no-op ガードの前提条件。
    const a = findTrigger('x.', 2);
    const b = findTrigger('x.', 2);
    expect(a?.items).toBe(b?.items);
  });
});
