// Melange 側の session.request({op, ...}) 単一エンドポイントを薄く型付き
// メソッドに展開するクライアント。将来 Worker 化した際も、ここを
// postMessage ベースに差し替えれば呼び出し元 (repl.js / language-client.js)
// は一切変更不要になる。

export class SessionClient {
  constructor(session) {
    this.session = session;
  }

  eval(input) {
    return this.session.request({ op: 'eval', input });
  }

  complete(input, offset) {
    return this.session.request({ op: 'complete', input, offset });
  }

  diagnose(input) {
    return this.session.request({ op: 'diagnose', input });
  }

  hover(input, offset) {
    return this.session.request({ op: 'hover', input, offset });
  }

  tokens(input) {
    return this.session.request({ op: 'tokens', input });
  }
}

export function createSessionClient(session) {
  return new SessionClient(session);
}
