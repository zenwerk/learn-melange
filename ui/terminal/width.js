// East Asian Width ベースのセル幅計算。combining mark, ZWJ, 制御文字は 0 幅。
// サロゲートペア (code point) と全角文字を区別して扱うためのヘルパ群。

const isCombining = (cp) => (
  (cp >= 0x0300 && cp <= 0x036f) ||
  (cp >= 0x0483 && cp <= 0x0489) ||
  (cp >= 0x0591 && cp <= 0x05bd) || cp === 0x05bf ||
  (cp >= 0x05c1 && cp <= 0x05c2) || (cp >= 0x05c4 && cp <= 0x05c5) || cp === 0x05c7 ||
  (cp >= 0x0610 && cp <= 0x061a) || (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670 ||
  (cp >= 0x06d6 && cp <= 0x06dc) || (cp >= 0x06df && cp <= 0x06e4) ||
  (cp >= 0x06e7 && cp <= 0x06e8) || (cp >= 0x06ea && cp <= 0x06ed) ||
  (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) ||
  (cp >= 0x2060 && cp <= 0x206f) ||
  (cp >= 0x3099 && cp <= 0x309a) ||
  (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xfe20 && cp <= 0xfe2f) ||
  cp === 0xfeff ||
  (cp >= 0xe0100 && cp <= 0xe01ef)
);

const isWide = (cp) => (
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0x303e) ||
  (cp >= 0x3041 && cp <= 0x33ff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0xa000 && cp <= 0xa4cf) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x1f300 && cp <= 0x1f64f) ||
  (cp >= 0x1f900 && cp <= 0x1f9ff) ||
  (cp >= 0x20000 && cp <= 0x2fffd) ||
  (cp >= 0x30000 && cp <= 0x3fffd)
);

export const cpWidth = (cp) => {
  if (cp < 0x20 || cp === 0x7f || isCombining(cp)) return 0;
  return isWide(cp) ? 2 : 1;
};

export const strWidth = (s) => {
  let w = 0;
  for (const ch of s) w += cpWidth(ch.codePointAt(0));
  return w;
};

export const strWidthRange = (s, start, end) => {
  let w = 0;
  for (let i = start; i < end;) {
    const cp = s.codePointAt(i);
    w += cpWidth(cp);
    i += cp > 0xffff ? 2 : 1;
  }
  return w;
};

// 低サロゲート中間を指していたら直前の高サロゲートへスナップ
export const cpStart = (s, i) => {
  const c = s.charCodeAt(i);
  return (c >= 0xdc00 && c <= 0xdfff) ? i - 1 : i;
};

// i 位置の code point の UTF-16 長
export const cpLen = (s, i) => (s.codePointAt(i) > 0xffff ? 2 : 1);
