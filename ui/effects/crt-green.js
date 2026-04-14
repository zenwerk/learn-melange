// @ts-nocheck
// Monochrome Green phosphor プリセット (cool-retro-term Monochrome Green 相当)

import { defineProfile } from './profile-base.js';
import { crtPasses, CRT_DEFAULTS, CRT_PARAM_META } from './crt-passes.js';

export default defineProfile({
  name: 'crt-green',
  description: 'Monochrome Green CRT',
  animated: true,
  defaultParams: {
    ...CRT_DEFAULTS,
    curvature: 0.18,
    scanline: 0.5,
    bloomStrength: 1.0,
    vignette: 0.7,
    flickering: 0.05,
    jitter: 0.0015,
    persistence: 0.62,
    chromaColor: 1.0,
    fontColor: [0.3, 1.0, 0.4],
    bgColor:   [0.02, 0.08, 0.02],
    burnin: 0.15,
  },
  paramMeta: CRT_PARAM_META,
  passes: crtPasses,
});
