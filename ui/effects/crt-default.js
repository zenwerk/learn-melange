// @ts-nocheck
// cool-retro-term 風の既定 CRT プロファイル。
// passes/defaults/meta は crt-passes.js と共有。
//   source → threshold → blurH → blurV → burnin → crt-composite → screen

import { defineProfile } from './profile-base.js';
import { crtPasses, CRT_DEFAULTS, CRT_PARAM_META } from './crt-passes.js';

export default defineProfile({
  name: 'crt-default',
  description: 'cool-retro-term 風のデフォルト CRT',
  animated: true,
  defaultParams: { ...CRT_DEFAULTS },
  paramMeta: CRT_PARAM_META,
  passes: crtPasses,
});
