// KeyboardEvent → エディタのアクション名に解決。
// アクション一覧は LineEditor のメソッドと 1:1 対応。

const ACTIONS = {
  'Enter':      'submit',
  'Backspace':  'deleteBack',
  'Delete':     'deleteForward',
  'ArrowLeft':  'moveLeft',
  'ArrowRight': 'moveRight',
  'ArrowUp':    'historyPrev',
  'ArrowDown':  'historyNext',
  'Home':       'moveHome',
  'End':        'moveEnd',
  'Tab':        'completeNext',
  'Escape':     'completeCancel',
};

const CTRL = {
  'a': 'moveHome',
  'e': 'moveEnd',
  'b': 'moveLeft',
  'f': 'moveRight',
  'h': 'deleteBack',
  'k': 'killToEnd',
  'u': 'killToHead',
  'w': 'killPrevWord',
  'p': 'historyPrev',
  'n': 'historyNext',
};

const META = {
  'b': 'moveWordLeft',
  'f': 'moveWordRight',
};

export function resolveKey(e) {
  if (e.isComposing) return null;
  if (e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = e.key.toLowerCase();
    return CTRL[k] ?? null;
  }
  if (e.altKey || e.metaKey) {
    const k = e.key.toLowerCase();
    return META[k] ?? null;
  }
  // Shift+Tab: 前候補へ
  if (e.key === 'Tab' && e.shiftKey) return 'completePrev';
  return ACTIONS[e.key] ?? null;
}
