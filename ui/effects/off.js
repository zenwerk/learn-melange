// @ts-nocheck
// エフェクト無効。passthrough パス 1 本で terminal canvas をそのまま screen に出す。

import { defineProfile } from './profile-base.js';
import passthrough from '../gfx/shaders/passthrough.frag?raw';

export default defineProfile({
  name: 'off',
  description: 'エフェクトなし',
  animated: false,
  defaultParams: {},
  passes: () => [
    {
      name: 'passthrough',
      fs: passthrough,
      inputs: ['source'],
      output: 'screen',
    },
  ],
});
