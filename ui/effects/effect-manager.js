// @ts-nocheck
// TerminalCanvas と overlay canvas を繋ぎ、プロファイル切替/レンダーループを司る。
// - プロファイルが返すパス記述配列を RenderGraph.setPasses に渡す。
//   コンパイル済みシェーダはキャッシュされるので切替コストは小さい。
// - animated=true なら rAF ループを回し続ける。
//   false なら requestRender() 経由でオンデマンド実行。
// - localStorage に現在プロファイル名を保存。

import { createContext } from '../gfx/gl.js';
import { RenderGraph } from '../gfx/render-graph.js';
import { EFFECTS, EFFECT_ORDER } from './index.js';
import { readTheme, themeToVec3, onThemeChange } from '../terminal/theme.js';

const STORAGE_KEY = 'melange-repl:effect';

// プロファイルが defaultParams に null を入れると「テーマ値から自動解決」の合図。
// テーブル形式: キー → theme からソース色を引くアクセサ。
// 新しいテーマ連動キーを足すときはここだけ拡張する。
const THEMED_PARAM_SOURCES = {
  fontColor: (theme) => theme.foreground,
  bgColor:   (theme) => theme.background,
};
const THEMED_PARAM_KEYS = Object.keys(THEMED_PARAM_SOURCES);

export class EffectManager {
  #rafHandle = null;
  #renderRequested = false;
  #themeUnsub = null;

  constructor({ terminalCanvas, overlayCanvas }) {
    this.terminalCanvas = terminalCanvas;
    this.overlayCanvas = overlayCanvas;
    this.gl = createContext(overlayCanvas);
    this.graph = new RenderGraph(this.gl, {
      width: overlayCanvas.width,
      height: overlayCanvas.height,
    });
    this.currentName = null;
    this.currentProfile = null;
    this.params = {};
    this.startTime = performance.now() / 1000;

    this.#themeUnsub = onThemeChange(() => this.#onThemeChanged());
  }

  // defaultParams の null sentinel を theme 値 (vec3) で埋める。
  // プロファイル固有色 (crt-amber の琥珀色 vec3 等) は null でないため影響しない。
  #fillThemedSentinels(params, theme) {
    for (const key of THEMED_PARAM_KEYS) {
      if (params[key] === null) {
        params[key] = themeToVec3(THEMED_PARAM_SOURCES[key](theme));
      }
    }
    return params;
  }

  // MutationObserver は style 適用前に発火しうるため 1 フレーム待ってから読む。
  #onThemeChanged() {
    requestAnimationFrame(() => {
      const theme = readTheme();
      this.terminalCanvas.setTheme(theme);
      if (this.currentProfile) {
        const defaults = this.currentProfile.defaultParams ?? {};
        for (const key of THEMED_PARAM_KEYS) {
          if (defaults[key] === null) {
            this.params[key] = themeToVec3(THEMED_PARAM_SOURCES[key](theme));
          }
        }
        this.graph.updatePassUniforms(this.currentProfile.passes(this.params));
      }
      this.requestRender();
    });
  }

  list() {
    return EFFECT_ORDER.slice();
  }

  current() {
    return this.currentName;
  }

  set(name) {
    const profile = EFFECTS.get(name);
    if (!profile) return false;
    this.currentProfile = profile;
    this.currentName = name;
    this.params = this.#fillThemedSentinels({ ...profile.defaultParams }, readTheme());
    this.graph.setPasses(profile.passes(this.params));
    localStorage.setItem(STORAGE_KEY, name);
    this.#updateLoop();
    this.requestRender();
    return true;
  }

  cycle() {
    const idx = EFFECT_ORDER.indexOf(this.currentName);
    const next = EFFECT_ORDER[(idx + 1) % EFFECT_ORDER.length];
    this.set(next);
    return next;
  }

  // 個別パラメータをライブ更新する。UI スライダーから呼ぶことを想定。
  updateParam(key, value) {
    if (!this.currentProfile) return false;
    this.params[key] = value;
    this.graph.updatePassUniforms(this.currentProfile.passes(this.params));
    this.requestRender();
    return true;
  }

  updateParams(partial) {
    if (!this.currentProfile) return false;
    Object.assign(this.params, partial);
    this.graph.updatePassUniforms(this.currentProfile.passes(this.params));
    this.requestRender();
    return true;
  }

  getParams() {
    return { ...this.params };
  }

  getParamMeta() {
    return this.currentProfile?.paramMeta ?? {};
  }

  resetParams() {
    if (!this.currentProfile) return false;
    this.params = this.#fillThemedSentinels(
      { ...this.currentProfile.defaultParams },
      readTheme(),
    );
    this.graph.updatePassUniforms(this.currentProfile.passes(this.params));
    this.requestRender();
    return true;
  }

  resize(width, height) {
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.graph.resize(width, height);
    this.requestRender();
  }

  requestRender() {
    if (this.currentProfile?.animated) return; // rAF ループ側がやる
    if (this.#renderRequested) return;
    this.#renderRequested = true;
    requestAnimationFrame(() => {
      this.#renderRequested = false;
      this.#renderOnce();
    });
  }

  #renderOnce() {
    // TerminalCanvas の dirty を反映させる
    this.terminalCanvas.draw();
    const t = performance.now() / 1000 - this.startTime;
    this.graph.render(this.terminalCanvas.canvas, t);
  }

  #updateLoop() {
    if (this.currentProfile?.animated && this.#rafHandle == null) {
      const loop = () => {
        this.#renderOnce();
        this.#rafHandle = requestAnimationFrame(loop);
      };
      this.#rafHandle = requestAnimationFrame(loop);
    } else if (!this.currentProfile?.animated && this.#rafHandle != null) {
      cancelAnimationFrame(this.#rafHandle);
      this.#rafHandle = null;
    }
  }

  loadInitial() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && EFFECTS.has(saved)) this.set(saved);
    else this.set('crt-default');
  }

  dispose() {
    if (this.#rafHandle != null) cancelAnimationFrame(this.#rafHandle);
    this.#themeUnsub?.();
    this.#themeUnsub = null;
    this.graph.dispose();
  }
}
