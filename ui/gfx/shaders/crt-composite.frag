#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;   // 元テキスト (inputs[0])
uniform sampler2D uInput1;   // ブルーム結果 (inputs[1])
uniform sampler2D u_prev;    // 前フレーム (inputs[2] = 'prev')
uniform vec2 uResolution;
uniform float uTime;
uniform float uCurvature;
uniform float uScanline;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uNoise;
uniform float uPersistence;
uniform float uChromaAb;
out vec4 outColor;

vec2 barrel(vec2 uv, float k) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return 0.5 + c * (1.0 + k * r2);
}

float scanlineVal(vec2 uv) {
  return 0.5 + 0.5 * cos(uv.y * uResolution.y * 3.14159);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = barrel(vUv, uCurvature);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // 色収差
  vec3 src;
  src.r = texture(uSource, uv + vec2( uChromaAb, 0.0)).r;
  src.g = texture(uSource, uv).g;
  src.b = texture(uSource, uv - vec2( uChromaAb, 0.0)).b;

  vec3 bloom = texture(uInput1, uv).rgb;
  vec3 col = src + bloom * uBloomStrength;

  // スキャンライン (輝度減衰)
  float s = mix(1.0, scanlineVal(uv), uScanline);
  col *= s;

  // ビネット
  float d = length(uv - 0.5);
  col *= 1.0 - uVignette * d * d;

  // ノイズ
  float n = hash(uv * uResolution + uTime * 50.0) - 0.5;
  col += n * uNoise;

  // 前フレーム合成 (phosphor persistence)
  vec3 prev = texture(u_prev, vUv).rgb;
  col = mix(col, prev, uPersistence);

  outColor = vec4(col, 1.0);
}
