// エディタ層の Unicode 変換機構。カーソル直前の入力に trigger 文字列が
// 完全一致したら候補を popup に出し、Enter で置換する。
// 言語サービスの補完 (backend.complete) とは独立。

/**
 * @typedef {import('../types.d.ts').TriggerCompletion} TriggerCompletion
 */

/**
 * @typedef {object} TriggerMatch
 * @property {string} trigger
 * @property {readonly TriggerCompletion[]} items
 */

/** @type {Record<string, Array<{ label: string; detail?: string }>>} */
const TRIGGER_TABLE = {
  'x.': [
    { label: '⊗', detail: 'circled times' },
  ],
};

// 最長一致のため length 降順で keys を並べる。CompletionPopup.show の
// 参照等価ガードを効かせるため、items は trigger ごとに 1 回だけ作り凍結する。
const COMPILED = Object.entries(TRIGGER_TABLE)
  .map(([trigger, raw]) => {
    /** @type {readonly TriggerCompletion[]} */
    const items = Object.freeze(raw.map((c) => Object.freeze({
      label: c.label,
      kind: /** @type {const} */ ('trigger'),
      detail: c.detail ?? null,
      triggerLen: trigger.length,
    })));
    return { trigger, items };
  })
  .sort((a, b) => b.trigger.length - a.trigger.length);

/**
 * @param {string} input
 * @param {number} cursor
 * @returns {TriggerMatch | null}
 */
export function findTrigger(input, cursor) {
  for (const { trigger, items } of COMPILED) {
    if (cursor < trigger.length) continue;
    if (input.slice(cursor - trigger.length, cursor) !== trigger) continue;
    return { trigger, items };
  }
  return null;
}
