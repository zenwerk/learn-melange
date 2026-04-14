// @ts-nocheck
// Vintage プリセット: 強い歪みと jitter、ノイズ多め。

import { defineProfile } from './profile-base.js';
import { crtPasses, CRT_DEFAULTS, CRT_PARAM_META } from './crt-passes.js';

export default defineProfile({
  name: 'crt-vintage',
  description: 'Vintage noisy CRT',
  animated: true,
  defaultParams: {
    ...CRT_DEFAULTS,
    curvature: 0.22,
    scanline: 0.55,
    bloomStrength: 1.0,
    vignette: 0.85,
    noise: 0.12,
    flickering: 0.1,
    jitter: 0.004,
    hSync: 0.003,
    persistence: 0.5,
    chromaAb: 0.005,
    chromaColor: 0.8,
    fontColor: [0.85, 0.9, 1.0],
    bgColor:   [0.05, 0.05, 0.08],
    burnin: 0.2,
    sweepStrength: 0.04,
  },
  paramMeta: CRT_PARAM_META,
  passes: crtPasses,
});
