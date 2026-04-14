#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;          // 元テキスト (inputs[0])
uniform sampler2D uInput1;          // ブルーム結果 (inputs[1])
uniform sampler2D u_prev;           // 前フレーム (inputs[2] = 'prev')
uniform sampler2D u_burninCurrent;  // burn-in 蓄積 (inputs[3], 任意)
uniform float uBurninMix;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCurvature;
uniform float uScanline;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uNoise;
uniform float uPersistence;
uniform float uChromaAb;
uniform float uFlickering;
uniform vec3  uFontColor;
uniform vec3  uBgColor;
uniform float uChromaColor;
uniform float uJitter;
uniform float uHSync;
uniform float uRasterMode;
uniform float uSweepSpeed;
uniform float uSweepStrength;
out vec4 outColor;

vec2 barrel(vec2 uv, float k) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return 0.5 + c * (1.0 + k * r2);
}

float scanlineVal(vec2 uv) {
  return 0.5 + 0.5 * cos(uv.y * uResolution.y * 3.14159);
}

// Rasterization mode 別のマスク値 (1.0=フル輝度, 0付近=暗部)
// mode 0: なし  1: 水平スキャンライン  2: ピクセルグリッド  3: RGB サブピクセル (色別マスク)
vec3 rasterMask(vec2 uv, float mode) {
  int m = int(mode + 0.5);
  if (m == 1) {
    return vec3(scanlineVal(uv));
  }
  if (m == 2) {
    float sx = 0.5 + 0.5 * cos(uv.x * uResolution.x * 3.14159);
    float sy = 0.5 + 0.5 * cos(uv.y * uResolution.y * 3.14159);
    return vec3(min(sx, sy));
  }
  if (m == 3) {
    float cx = uv.x * uResolution.x;
    float phase = mod(cx, 3.0);
    vec3 rgb = vec3(
      phase < 1.0 ? 1.0 : 0.3,
      (phase >= 1.0 && phase < 2.0) ? 1.0 : 0.3,
      phase >= 2.0 ? 1.0 : 0.3
    );
    float sy = 0.5 + 0.5 * cos(uv.y * uResolution.y * 3.14159);
    return rgb * mix(1.0, sy, 0.5);
  }
  return vec3(1.0);
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

  // Jitter: 走査毎ランダム UV 揺らぎ
  if (uJitter > 0.0) {
    uv.x += (hash(vec2(uv.y * 100.0, uTime * 73.0)) - 0.5) * uJitter;
  }

  // Horizontal sync: 水平 sin 波歪み (間欠的)
  if (uHSync > 0.0) {
    float gate = hash(vec2(floor(uTime * 2.0), 0.37));
    uv.x += sin((uv.y + uTime * 1.5) * 100.0) * uHSync * gate;
  }

  // 色収差
  vec3 src;
  src.r = texture(uSource, uv + vec2( uChromaAb, 0.0)).r;
  src.g = texture(uSource, uv).g;
  src.b = texture(uSource, uv - vec2( uChromaAb, 0.0)).b;

  vec3 bloom = texture(uInput1, uv).rgb;
  vec3 col = src + bloom * uBloomStrength;

  // Burn-in: 蓄積された前残光を min/加算合成
  if (uBurninMix > 0.0) {
    vec3 burn = texture(u_burninCurrent, uv).rgb;
    col = max(col, burn * uBurninMix);
  }

  // Rasterization (scanline/grid/subpixel)
  vec3 rm = rasterMask(uv, uRasterMode);
  col *= mix(vec3(1.0), rm, uScanline);

  // CRT リフレッシュスウィープ: 下→上の走査線
  // サイクルの 70% で走査、残り 30% は待機。走査線通過後は phosphor decay
  // 風に徐々に元の輝度へ。待機中は走査線が画面外なのでエフェクトは消える。
  if (uSweepStrength > 0.0) {
    float cycle = fract(uTime * uSweepSpeed);
    float scanRatio = 0.7;
    float sweepPos = clamp(cycle / scanRatio, 0.0, 1.0);
    float beamY = 1.0 - sweepPos;
    float below = max(uv.y - beamY, 0.0);
    float sweep = exp(-below * 8.0) * step(0.0, uv.y - beamY + 0.005);
    col += vec3(sweep * uSweepStrength);
  }

  // ビネット
  float d = length(uv - 0.5);
  col *= 1.0 - uVignette * d * d;

  // Static noise (距離フォールオフ付き、画面端でやや強く)
  float n = hash(uv * uResolution + uTime * 50.0) - 0.5;
  float edgeFall = 1.0 + 1.5 * d * d;
  col += n * uNoise * edgeFall;

  // Flickering (フレーム全体の明滅)
  if (uFlickering > 0.0) {
    col *= 1.0 + (hash(vec2(uTime * 37.0, 0.0)) - 0.5) * uFlickering;
  }

  // Chroma color: グレースケール輝度を font/bg 色にマッピング
  if (uChromaColor > 0.0) {
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 phosphor = mix(uBgColor, uFontColor, clamp(luma, 0.0, 1.0));
    col = mix(col, phosphor, uChromaColor);
  }

  // 前フレーム合成 (phosphor persistence)
  vec3 prev = texture(u_prev, vUv).rgb;
  col = mix(col, prev, uPersistence);

  outColor = vec4(col, 1.0);
}
