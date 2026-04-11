// 将来 Worker 化した際、postMessage ベースに差し替えるだけで呼び出し元
// (repl.js / language-client.js) が一切変わらないようにするための薄い層。

const OP = Object.freeze({
  EVAL: 'eval',
  COMPLETE: 'complete',
  DIAGNOSE: 'diagnose',
  HOVER: 'hover',
  TOKENS: 'tokens',
});

export class SessionClient {
  constructor(session) {
    this.session = session;
  }

  eval(input) {
    return this.session.request({ op: OP.EVAL, input });
  }

  complete(input, offset) {
    return this.session.request({ op: OP.COMPLETE, input, offset });
  }

  diagnose(input) {
    return this.session.request({ op: OP.DIAGNOSE, input });
  }

  hover(input, offset) {
    return this.session.request({ op: OP.HOVER, input, offset });
  }

  tokens(input) {
    return this.session.request({ op: OP.TOKENS, input });
  }
}

export function createSessionClient(session) {
  return new SessionClient(session);
}
