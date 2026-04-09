#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uResolution;
out vec4 outColor;

void main() {
  vec2 px = 1.0 / uResolution;
  // 9-tap gaussian 水平
  float w[5];
  w[0] = 0.227027;
  w[1] = 0.1945946;
  w[2] = 0.1216216;
  w[3] = 0.054054;
  w[4] = 0.016216;
  vec3 col = texture(uSource, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    float o = float(i) * px.x;
    col += texture(uSource, vUv + vec2(o, 0.0)).rgb * w[i];
    col += texture(uSource, vUv - vec2(o, 0.0)).rgb * w[i];
  }
  outColor = vec4(col, 1.0);
}
