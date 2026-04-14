// @ts-nocheck
// 名前付きテクスチャを中継する簡易レンダリンググラフ。
//
// 規約:
//   - 入力テクスチャ 'source' は毎フレーム TerminalCanvas からアップロード。
//   - 入力テクスチャ 'prev' は「前フレームの最終出力」。プロファイルは自由にサンプルできる。
//   - プロファイルが output: 'screen' と書いたパスは最終パス扱い。
//     実際には内部の 'final' テクスチャに描画され、RenderGraph が末尾で 'final' を
//     default framebuffer にブリットする。これにより prev フィードバックが自然に回る。
//   - シェーダー中の uniform 命名規則:
//       uSource    — inputs[0] (最初の入力)
//       uInput1..  — inputs[1..]
//       u_<name>   — 名前ベースでも参照可 (例: u_prev)
//       uTime      — 秒
//       uResolution— vec2(width, height)
//
// プロファイルは passes 配列 (descriptor) として宣言的に渡される。
// コンパイル済みプログラムは fs ソースをキーにキャッシュされ、プロファイル
// 切替時も同じシェーダは再利用される。

import {
  createProgram, createTexture, createFramebuffer, uploadCanvas,
} from './gl.js';
import { createFullscreenQuad, QUAD_VS } from './fullscreen-quad.js';

const BLIT_FS = /* glsl */`#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
out vec4 outColor;
void main() { outColor = texture(uSource, vUv); }
`;

export class RenderGraph {
  constructor(gl, { width, height }) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.quad = createFullscreenQuad(gl);
    this.passes = [];
    this.textures = new Map();
    this.programCache = new Map(); // fs source -> { program, locs }
    this.#ensureTexture('source', { withFbo: false });
    this.#ensureTexture('prev', { withFbo: true });
    this.#ensureTexture('final', { withFbo: true });
    this.blitProgram = createProgram(gl, QUAD_VS, BLIT_FS);
    this.blitLoc = gl.getUniformLocation(this.blitProgram, 'uSource');
  }

  #ensureTexture(name, { withFbo = true } = {}) {
    const gl = this.gl;
    if (this.textures.has(name)) return this.textures.get(name);
    const tex = createTexture(gl, { width: this.width, height: this.height });
    const fbo = withFbo ? createFramebuffer(gl, tex) : null;
    const entry = { tex, fbo, w: this.width, h: this.height };
    this.textures.set(name, entry);
    return entry;
  }

  // fs ソースをキーにプログラムを取得 or コンパイル。同じシェーダは
  // プロファイル切替を跨いで再利用されるので、OFF ↔ CRT の繰り返しで
  // リンクコストが発生しない。
  #getOrCompile(fs) {
    const cached = this.programCache.get(fs);
    if (cached) return cached;
    const gl = this.gl;
    const program = createProgram(gl, QUAD_VS, fs);
    const locs = {};
    const nUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nUniforms; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const n = info.name.replace(/\[0\]$/, '');
      locs[n] = gl.getUniformLocation(program, n);
    }
    const entry = { program, locs };
    this.programCache.set(fs, entry);
    return entry;
  }

  // 宣言的にパス配列をセットする。descriptor は
  // { name, fs, inputs, output, uniforms } の形。プロファイル切替時の
  // 差分更新や将来のパラメータ live update の窓口。
  setPasses(descriptors) {
    this.passes = descriptors.map((d) => {
      const { program, locs } = this.#getOrCompile(d.fs);
      if (d.output && d.output !== 'screen') this.#ensureTexture(d.output);
      if (d.feedbackAs) this.#ensureTexture(d.feedbackAs);
      const inputs = d.inputs ?? [];
      for (const inp of inputs) this.#ensureTexture(inp, { withFbo: inp !== 'source' });
      return {
        name: d.name,
        program,
        locs,
        inputs,
        output: d.output,
        feedbackAs: d.feedbackAs ?? null,
        uniforms: d.uniforms ?? {},
      };
    });
  }

  // uniforms だけを差し替える軽量 update。pass 構成(name/fs/inputs/output)が
  // 変わった場合は setPasses へフォールバックする。UI スライダーからの
  // ライブ更新用。
  updatePassUniforms(descriptors) {
    if (descriptors.length !== this.passes.length) {
      this.setPasses(descriptors);
      return;
    }
    for (let i = 0; i < descriptors.length; i++) {
      if (this.passes[i].name !== descriptors[i].name) {
        this.setPasses(descriptors);
        return;
      }
    }
    for (let i = 0; i < descriptors.length; i++) {
      this.passes[i].uniforms = descriptors[i].uniforms ?? {};
    }
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return;
    const gl = this.gl;
    this.width = width;
    this.height = height;
    for (const [name, entry] of this.textures) {
      gl.deleteTexture(entry.tex);
      if (entry.fbo) gl.deleteFramebuffer(entry.fbo);
      const tex = createTexture(gl, { width, height });
      const fbo = entry.fbo ? createFramebuffer(gl, tex) : null;
      this.textures.set(name, { tex, fbo, w: width, h: height });
    }
  }

  render(sourceCanvas, time, globalUniforms = {}) {
    const gl = this.gl;
    const sourceEntry = this.textures.get('source');
    uploadCanvas(gl, sourceEntry.tex, sourceCanvas);

    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    for (const pass of this.passes) {
      gl.useProgram(pass.program);
      for (let i = 0; i < pass.inputs.length; i++) {
        const inpName = pass.inputs[i];
        const entry = this.textures.get(inpName);
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        if (i === 0 && pass.locs['uSource']) gl.uniform1i(pass.locs['uSource'], 0);
        const byName = pass.locs[`u_${inpName}`];
        if (byName) gl.uniform1i(byName, i);
        const canonical = pass.locs[`uInput${i}`];
        if (canonical) gl.uniform1i(canonical, i);
      }
      if (pass.locs['uTime']) gl.uniform1f(pass.locs['uTime'], time);
      if (pass.locs['uResolution']) gl.uniform2f(pass.locs['uResolution'], this.width, this.height);
      const merged = { ...pass.uniforms, ...globalUniforms };
      for (const [k, v] of Object.entries(merged)) {
        const loc = pass.locs[k];
        if (loc == null) continue;
        if (typeof v === 'number') gl.uniform1f(loc, v);
        else if (Array.isArray(v)) {
          if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
          else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
          else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
        }
      }
      // 'screen' を指定するパスは実際には 'final' へ描画する
      const outName = pass.output === 'screen' ? 'final' : pass.output;
      if (outName) {
        const out = this.textures.get(outName);
        gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      this.quad.draw();
    }

    // final → default framebuffer に blit
    this.#blitFinalToScreen();
    // 次フレームの 'prev' は今フレームの 'final'
    this.#promoteFinalToPrev();
    // 一般フィードバック: output ↔ feedbackAs をスワップ
    this.#swapFeedbackTextures();
  }

  #swapFeedbackTextures() {
    for (const pass of this.passes) {
      if (!pass.feedbackAs) continue;
      const outName = pass.output === 'screen' ? 'final' : pass.output;
      if (!outName || outName === 'final') continue; // final は #promoteFinalToPrev が面倒を見る
      const outEntry = this.textures.get(outName);
      const fbEntry = this.textures.get(pass.feedbackAs);
      this.textures.set(outName, fbEntry);
      this.textures.set(pass.feedbackAs, outEntry);
    }
  }

  #blitFinalToScreen() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.blitProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('final').tex);
    gl.uniform1i(this.blitLoc, 0);
    this.quad.draw();
  }

  #promoteFinalToPrev() {
    const prev = this.textures.get('prev');
    const final = this.textures.get('final');
    this.textures.set('prev', final);
    this.textures.set('final', prev);
  }

  dispose() {
    const gl = this.gl;
    this.passes = [];
    for (const { program } of this.programCache.values()) {
      gl.deleteProgram(program);
    }
    this.programCache.clear();
    gl.deleteProgram(this.blitProgram);
    for (const entry of this.textures.values()) {
      gl.deleteTexture(entry.tex);
      if (entry.fbo) gl.deleteFramebuffer(entry.fbo);
    }
    this.textures.clear();
  }
}
