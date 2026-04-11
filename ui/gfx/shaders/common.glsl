#version 300 es
precision highp float;

// 全シェーダ共通のヘッダ。各 .frag の先頭で #include "common.glsl" する。
// include は ui/gfx/gl.js の preprocessShader が文字列置換で展開する。
// #version は GLSL の規約でファイル先頭 (空白・コメントより前) に必要なため、
// このファイルの最初の 2 行は絶対に動かさないこと。

// 9-tap Gaussian weights (sigma ≈ 2)
const float GAUSSIAN_W[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

// 1D Gaussian ブラー。axis は vec2(1,0) で水平、vec2(0,1) で垂直。
// pixelSize は通常 1.0 / uResolution を渡す。
vec4 gaussian9(sampler2D src, vec2 uv, vec2 axis, vec2 pixelSize) {
  vec2 o = axis * pixelSize;
  vec3 col = texture(src, uv).rgb * GAUSSIAN_W[0];
  for (int i = 1; i < 5; i++) {
    float f = float(i);
    col += texture(src, uv + o * f).rgb * GAUSSIAN_W[i];
    col += texture(src, uv - o * f).rgb * GAUSSIAN_W[i];
  }
  return vec4(col, 1.0);
}
