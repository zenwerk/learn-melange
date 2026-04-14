// @ts-nocheck
// Amber phosphor 端末風プリセット (cool-retro-term Default Amber 相当)

import { defineProfile } from './profile-base.js';
import { crtPasses, CRT_DEFAULTS, CRT_PARAM_META } from './crt-passes.js';

export default defineProfile({
  name: 'crt-amber',
  description: 'Amber CRT monitor',
  animated: true,
  defaultParams: {
    ...CRT_DEFAULTS,
    curvature: 0.18,
    scanline: 0.45,
    bloomStrength: 1.1,
    vignette: 0.7,
    flickering: 0.05,
    jitter: 0.002,
    persistence: 0.6,
    chromaColor: 1.0,
    fontColor: [1.0, 0.7, 0.2],
    bgColor:   [0.12, 0.05, 0.0],
    burnin: 0.15,
  },
  paramMeta: CRT_PARAM_META,
  passes: crtPasses,
});
