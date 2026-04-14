#version 300 es
precision highp float;

// GLSL 仕様: #version はファイル先頭 (空白・コメントより前) 必須。

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

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
