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

const STORAGE_KEY = 'melange-repl:effect';

export class EffectManager {
  #rafHandle = null;
  #renderRequested = false;

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
    this.params = { ...profile.defaultParams };
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
    this.graph.dispose();
  }
}
