// @ts-nocheck
// CRT プロファイル各種で共有する passes 関数 + defaults/meta。
// プリセットは defaultParams の値が異なるだけで、同一シェーダー/同一パイプラインを
// 共有する。RenderGraph の program cache が効くのでプロファイル切替も高速。

import thresholdFs from '../gfx/shaders/threshold.frag?raw';
import blurFs from '../gfx/shaders/blur.frag?raw';
import compositeFs from '../gfx/shaders/crt-composite.frag?raw';
import burninFs from '../gfx/shaders/burnin.frag?raw';

export const CRT_DEFAULTS = {
  curvature: 0.12,
  scanline: 0.35,
  bloomStrength: 0.9,
  bloomThreshold: 0.25,
  vignette: 0.55,
  noise: 0.06,
  persistence: 0.55,
  chromaAb: 0.002,
  flickering: 0.04,
  jitter: 0.0,
  hSync: 0.0,
  rasterMode: 1,
  fontColor: [0.80, 0.83, 0.95],
  bgColor:   [0.067, 0.067, 0.106],
  chromaColor: 0.0,
  burnin: 0.0,
  burninDecay: 0.02,
  sweepSpeed: 0.08,
  sweepStrength: 0.0,
};

export const CRT_PARAM_META = {
  curvature:      { label: 'Curvature',        type: 'number', min: 0,   max: 0.5,  step: 0.01 },
  scanline:       { label: 'Scanline',         type: 'number', min: 0,   max: 1,    step: 0.01 },
  bloomStrength:  { label: 'Bloom Strength',   type: 'number', min: 0,   max: 3,    step: 0.01 },
  bloomThreshold: { label: 'Bloom Threshold',  type: 'number', min: 0,   max: 1,    step: 0.01 },
  vignette:       { label: 'Vignette',         type: 'number', min: 0,   max: 1.5,  step: 0.01 },
  noise:          { label: 'Static Noise',     type: 'number', min: 0,   max: 0.3,  step: 0.005 },
  persistence:    { label: 'Persistence',      type: 'number', min: 0,   max: 0.95, step: 0.01 },
  chromaAb:       { label: 'Chromatic Aberr.', type: 'number', min: 0,   max: 0.02, step: 0.0005 },
  flickering:     { label: 'Flickering',       type: 'number', min: 0,   max: 0.3,  step: 0.005 },
  jitter:         { label: 'Jitter',           type: 'number', min: 0,   max: 0.02, step: 0.0005 },
  hSync:          { label: 'Horizontal Sync',  type: 'number', min: 0,   max: 0.02, step: 0.0005 },
  rasterMode:     { label: 'Rasterization',    type: 'select',
                    options: [
                      { value: 0, label: 'None' },
                      { value: 1, label: 'Scanlines' },
                      { value: 2, label: 'Pixel Grid' },
                      { value: 3, label: 'RGB Subpixel' },
                    ] },
  fontColor:      { label: 'Font Color',       type: 'color' },
  bgColor:        { label: 'Background',       type: 'color' },
  chromaColor:    { label: 'Phosphor Tint',    type: 'number', min: 0,   max: 1,    step: 0.01 },
  burnin:         { label: 'Burn-in',          type: 'number', min: 0,   max: 1,    step: 0.01 },
  burninDecay:    { label: 'Burn-in Decay',    type: 'number', min: 0,   max: 0.2,  step: 0.005 },
  sweepSpeed:     { label: 'Sweep Speed',      type: 'number', min: 0,   max: 0.3,  step: 0.01 },
  sweepStrength:  { label: 'Sweep Strength',   type: 'number', min: 0,   max: 0.3,  step: 0.005 },
};

export function crtPasses(p) {
  return [
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
      name: 'burnin',
      fs: burninFs,
      inputs: ['source', 'burninPrev'],
      output: 'burninCurrent',
      feedbackAs: 'burninPrev',
      uniforms: {
        uBurnin: p.burnin,
        uBurninDecay: p.burninDecay,
      },
    },
    {
      name: 'composite',
      fs: compositeFs,
      inputs: ['source', 'brightA', 'prev', 'burninCurrent'],
      output: 'screen',
      uniforms: {
        uCurvature: p.curvature,
        uScanline: p.scanline,
        uBloomStrength: p.bloomStrength,
        uVignette: p.vignette,
        uNoise: p.noise,
        uPersistence: p.persistence,
        uChromaAb: p.chromaAb,
        uFlickering: p.flickering,
        uJitter: p.jitter,
        uHSync: p.hSync,
        uRasterMode: p.rasterMode,
        uFontColor: p.fontColor,
        uBgColor: p.bgColor,
        uChromaColor: p.chromaColor,
        uBurninMix: p.burnin,
        uSweepSpeed: p.sweepSpeed,
        uSweepStrength: p.sweepStrength,
      },
    },
  ];
}
