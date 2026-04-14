#include "common.glsl"

// Burn-in (phosphor residual) パス
//   uSource  = 現フレーム (inputs[0])
//   uInput1  = 前フレームの burn-in 値 (inputs[1] = 'burninPrev')
in vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uInput1;
uniform float uBurnin;
uniform float uBurninDecay;
out vec4 outColor;

void main() {
  if (uBurnin <= 0.0) { outColor = vec4(0.0); return; }
  vec3 src = texture(uSource, vUv).rgb;
  vec3 prev = texture(uInput1, vUv).rgb;
  vec3 decayed = max(prev - vec3(uBurninDecay), vec3(0.0));
  outColor = vec4(max(decayed, src * uBurnin), 1.0);
}
