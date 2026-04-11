// エフェクトプロファイルはパス記述の配列を返す純関数として定義する。
// passes(params) は RenderGraph に渡される宣言的な pass descriptor 配列を
// 返す。animated=true なら EffectManager が rAF ループで時間 uniform を
// 進める。

export function defineProfile({ name, description, animated = false, defaultParams = {}, passes }) {
  return { name, description, animated, defaultParams, passes };
}
