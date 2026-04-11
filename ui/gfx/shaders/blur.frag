#include "common.glsl"

in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec2 uAxis;  // (1,0) = 水平, (0,1) = 垂直
out vec4 outColor;

void main() {
  outColor = gaussian9(uSource, vUv, uAxis, 1.0 / uResolution);
}
