// 言語非依存の薄いクライアント。
// OCaml 側の Language_service シグネチャに対応するプレーンな session
// オブジェクト (complete / diagnose / hover / tokens を持つ) を受け取り、
// デバウンスと簡易キャッシュだけを担当する。
//
// 他言語サービス実装でも同じインターフェースで差し替え可能。

const SAME_KEY = (a, b) => a.input === b.input && a.offset === b.offset;

export class LanguageClient {
  constructor(session, { debounceMs = 30 } = {}) {
    this.session = session;
    this.debounceMs = debounceMs;
    this._lastCompleteKey = null;
    this._lastCompleteItems = null;
  }

  // 同期版: Tab 押下など即応が欲しいケース用
  completeSync(input, offset) {
    const key = { input, offset };
    if (this._lastCompleteKey && SAME_KEY(this._lastCompleteKey, key)) {
      return this._lastCompleteItems;
    }
    const items = this.session.complete(input, offset);
    this._lastCompleteKey = key;
    this._lastCompleteItems = items;
    return items;
  }

  diagnose(input) {
    return this.session.diagnose(input);
  }

  hover(input, offset) {
    return this.session.hover(input, offset);
  }

  tokens(input) {
    return this.session.tokens(input);
  }
}

export function createLanguageClient(session, opts) {
  return new LanguageClient(session, opts);
}
