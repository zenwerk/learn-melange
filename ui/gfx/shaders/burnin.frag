#version 300 es
precision highp float;
// Burn-in (phosphor residual) パス
// 入力:
//   uSource  - 現フレームの生テキスト (inputs[0] = 'source')
//   uInput1  - 前フレームの burn-in 値 (inputs[1] = 'burninPrev')
// 出力:
//   毎フレーム、source の輝度を蓄積しつつ、前フレームからゆっくり減衰させる。
in vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uInput1;
uniform float uBurnin;        // 蓄積係数 (0 で無効)
uniform float uBurninDecay;   // 1 フレームでの減衰率 (0.0〜0.1 程度)
out vec4 outColor;

void main() {
  vec3 src = texture(uSource, vUv).rgb;
  vec3 prev = texture(uInput1, vUv).rgb;
  // 前フレーム値を指数減衰させた上で、現フレーム輝度を加算
  vec3 decayed = max(prev - vec3(uBurninDecay), vec3(0.0));
  vec3 accum = max(decayed, src * uBurnin);
  outColor = vec4(accum, 1.0);
}
