// エフェクト無効。パスを積まず、最終パスだけを passthrough にして
// terminal canvas をそのまま screen に出す。

import { defineProfile } from './profile-base.js';
import passthrough from '../gfx/shaders/passthrough.frag?raw';

export default defineProfile({
  name: 'off',
  description: 'エフェクトなし',
  animated: false,
  defaultParams: {},
  build(graph) {
    graph.addPass({
      name: 'passthrough',
      fs: passthrough,
      inputs: ['source'],
      output: 'screen',
    });
  },
});
