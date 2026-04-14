// @ts-nocheck
// IBM 3278 風プリセット: 明るい緑単色、強いスキャンライン、bloom 強め。

import { defineProfile } from './profile-base.js';
import { crtPasses, CRT_DEFAULTS, CRT_PARAM_META } from './crt-passes.js';

export default defineProfile({
  name: 'crt-ibm3278',
  description: 'IBM 3278 terminal',
  animated: true,
  defaultParams: {
    ...CRT_DEFAULTS,
    curvature: 0.15,
    scanline: 0.6,
    bloomStrength: 1.4,
    bloomThreshold: 0.2,
    vignette: 0.6,
    flickering: 0.03,
    persistence: 0.7,
    chromaColor: 1.0,
    fontColor: [0.6, 1.0, 0.7],
    bgColor:   [0.0, 0.03, 0.01],
    burnin: 0.25,
  },
  paramMeta: CRT_PARAM_META,
  passes: crtPasses,
});
