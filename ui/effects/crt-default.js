// @ts-nocheck
// cool-retro-term 風の既定 CRT プロファイル。
//   source → threshold → blurH → blurV → crt-composite(source, bloom, prev) → screen

import { defineProfile } from './profile-base.js';
import thresholdFs from '../gfx/shaders/threshold.frag?raw';
import blurFs from '../gfx/shaders/blur.frag?raw';
import compositeFs from '../gfx/shaders/crt-composite.frag?raw';

export default defineProfile({
  name: 'crt-default',
  description: 'cool-retro-term 風のデフォルト CRT',
  animated: true,
  defaultParams: {
    curvature: 0.12,
    scanline: 0.35,
    bloomStrength: 0.9,
    bloomThreshold: 0.25,
    vignette: 0.55,
    noise: 0.06,
    persistence: 0.55,
    chromaAb: 0.002,
  },
  passes: (p) => [
    {
      name: 'threshold',
      fs: thresholdFs,
      inputs: ['source'],
      output: 'brightA',
      uniforms: { uThreshold: p.bloomThreshold },
    },
    {
      name: 'blurH',
      fs: blurFs,
      inputs: ['brightA'],
      output: 'brightB',
      uniforms: { uAxis: [1, 0] },
    },
    {
      name: 'blurV',
      fs: blurFs,
      inputs: ['brightB'],
      output: 'brightA',
      uniforms: { uAxis: [0, 1] },
    },
    {
      name: 'composite',
      fs: compositeFs,
      inputs: ['source', 'brightA', 'prev'],
      output: 'screen',
      uniforms: {
        uCurvature: p.curvature,
        uScanline: p.scanline,
        uBloomStrength: p.bloomStrength,
        uVignette: p.vignette,
        uNoise: p.noise,
        uPersistence: p.persistence,
        uChromaAb: p.chromaAb,
      },
    },
  ],
});
