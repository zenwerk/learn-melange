// @ts-nocheck
// エフェクトプロファイルはパス記述の配列を返す純関数として定義する。
// passes(params) は RenderGraph に渡される宣言的な pass descriptor 配列を
// 返す。animated=true なら EffectManager が rAF ループで時間 uniform を
// 進める。
//
// paramMeta は UI パネル自動生成用のヒント。
//   { key: { label, min, max, step, type: 'number'|'color'|'select', options? } }
// 省略された場合は defaultParams から簡易推定する。

export function defineProfile({
  name,
  description,
  animated = false,
  defaultParams = {},
  paramMeta = {},
  passes,
}) {
  return { name, description, animated, defaultParams, paramMeta, passes };
}
