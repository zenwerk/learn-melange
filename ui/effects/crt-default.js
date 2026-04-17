// @ts-nocheck
// cool-retro-term 風の既定 CRT プロファイル。
// passes/defaults/meta は crt-passes.js と共有。
//   source → threshold → blurH → blurV → burnin → crt-composite → screen

import { defineProfile } from './profile-base.js';
import { crtPasses, CRT_DEFAULTS, CRT_PARAM_META } from './crt-passes.js';

// fontColor / bgColor を null にすると EffectManager が現在テーマの
// --term-fg / --term-bg から自動解決する (sentinel)。
// crt-amber / crt-green 等の「プロファイル固有色が主役」なプロファイルは
// 従来通り固定 vec3 を持つ。
export default defineProfile({
  name: 'crt-default',
  description: 'cool-retro-term 風のデフォルト CRT (テーマ連動)',
  animated: true,
  defaultParams: { ...CRT_DEFAULTS, fontColor: null, bgColor: null },
  paramMeta: CRT_PARAM_META,
  passes: crtPasses,
});
