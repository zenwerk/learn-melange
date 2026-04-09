#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform float uThreshold;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUv).rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, luma - uThreshold);
  outColor = vec4(c * k / max(luma, 1e-4), 1.0);
}
