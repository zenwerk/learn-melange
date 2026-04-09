// エフェクトプロファイル定義の薄い shim。
// プロファイルは RenderGraph に addPass を積む build() と、
// 既定パラメータ defaultParams を持つ。animated=true なら EffectManager が
// rAF ループを回してノイズ/時間 uniform を進める。

export function defineProfile({ name, description, animated = false, defaultParams = {}, build }) {
  return { name, description, animated, defaultParams, build };
}
