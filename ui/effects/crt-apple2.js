// @ts-nocheck
// Apple ][ 風プリセット: やや強い bloom、弱めの曲面、紫がかった黒背景。

import { defineProfile } from './profile-base.js';
import { crtPasses, CRT_DEFAULTS, CRT_PARAM_META } from './crt-passes.js';

export default defineProfile({
  name: 'crt-apple2',
  description: 'Apple ][ era CRT',
  animated: true,
  defaultParams: {
    ...CRT_DEFAULTS,
    curvature: 0.1,
    scanline: 0.4,
    bloomStrength: 1.3,
    bloomThreshold: 0.2,
    vignette: 0.4,
    flickering: 0.03,
    persistence: 0.5,
    chromaAb: 0.003,
    chromaColor: 1.0,
    fontColor: [0.9, 0.95, 1.0],
    bgColor:   [0.02, 0.02, 0.05],
    hSync: 0.001,
    sweepStrength: 0.05,
    sweepSpeed: 0.12,
  },
  paramMeta: CRT_PARAM_META,
  passes: crtPasses,
});
