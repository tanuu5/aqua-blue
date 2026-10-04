// コースティクスを毎フレーム GPU で作る。
// 周期的な波の水面で屈折した光が、少し下の平面にどれだけ集まるかを
// 「変形した格子の面積比」から求める。結果は平均 1 の明るさ倍率。
import * as THREE from 'three';
import { U } from '../core/env.js';

const VERT = /* glsl */ `
attribute vec2 aOff;
uniform float uTime;
uniform float uAmp;
uniform float uDepth;
varying float vI;

// 周期的な波（整数の波数なのでタイル状につながる）。勾配 g とヘッセ行列 H を返す
void waves(vec2 p, float t, out vec2 g, out vec3 H) {
  g = vec2(0.0);
  H = vec3(0.0);
  vec2 k; float s, a;
#define W(KX, KY, A, SP, PH) k = vec2(KX, KY) * 6.2831853; s = dot(k, p) + t * SP + PH; a = A; g += k * cos(s) * a; H -= vec3(k.x * k.x, k.x * k.y, k.y * k.y) * sin(s) * a;
  W(1.0, 2.0, 0.020, 1.05, 0.0)
  W(-2.0, 1.0, 0.018, 1.25, 1.7)
  W(3.0, -1.0, 0.010, 1.6, 0.4)
  W(-1.0, -3.0, 0.009, 1.8, 2.3)
  W(4.0, 3.0, 0.0052, 2.2, 4.1)
  W(-3.0, 4.0, 0.0048, 2.5, 0.9)
  W(5.0, -2.0, 0.0032, 3.0, 3.3)
  W(2.0, 5.0, 0.0030, 2.8, 5.2)
  W(-6.0, -1.0, 0.0018, 3.4, 1.1)
  W(1.0, -6.0, 0.0018, 3.3, 2.6)
#undef W
}

void main() {
  vec2 p = position.xy + aOff;
  vec2 g; vec3 H;
  waves(p, uTime, g, H);
  g *= uAmp;
  H *= uAmp;
  // 小さな傾きでは屈折による横ずれは傾きに比例する（空気→水で約 0.25 倍）
  float c = 0.25 * uDepth;
  vec2 np = p + g * c;
  float det = (1.0 + c * H.x) * (1.0 + c * H.z) - (c * H.y) * (c * H.y);
  vI = 1.0 / max(abs(det), 0.2);
  gl_Position = vec4(np * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
varying float vI;
void main() {
  gl_FragColor = vec4(min(vI, 9.0), 0.0, 0.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  float c = texture2D(tSrc, vUv).r * 0.3;
  c += (texture2D(tSrc, vUv + uDir).r + texture2D(tSrc, vUv - uDir).r) * 0.23;
  c += (texture2D(tSrc, vUv + uDir * 2.0).r + texture2D(tSrc, vUv - uDir * 2.0).r) * 0.12;
  gl_FragColor = vec4(c, 0.0, 0.0, 1.0);
}
`;

export class Caustics {
  constructor(renderer, size = 512) {
    this.renderer = renderer;
    this.size = size;
    const raw = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    };
    this.rtRaw = new THREE.WebGLRenderTarget(size, size, raw);
    this.rtTmp = new THREE.WebGLRenderTarget(size, size, raw);
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(tri, this.blurMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
    });
    const N = 256;
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    let k = 0;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        pos[k++] = i / N;
        pos[k++] = j / N;
        pos[k++] = 0;
      }
    }
    const idx = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i;
        idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1);
      }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const offs = [];
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) offs.push(x, y);
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(offs), 2));
    geo.instanceCount = 9;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmp: { value: 1.0 }, uDepth: { value: 0.7 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    U.uCaustTex.value = this.rt.texture;
  }

  update(time) {
    const r = this.renderer;
    this.mat.uniforms.uTime.value = time * 0.9;
    const prev = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rtRaw);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    r.render(this.scene, this.cam);
    // 格子の頂点ごとの明るさのむらをならす
    const b = this.blurMat.uniforms;
    b.tSrc.value = this.rtRaw.texture;
    b.uDir.value.set(1 / this.size, 0);
    r.setRenderTarget(this.rtTmp);
    r.render(this.quadScene, this.cam);
    b.tSrc.value = this.rtTmp.texture;
    b.uDir.value.set(0, 1 / this.size);
    r.setRenderTarget(this.rt);
    r.render(this.quadScene, this.cam);
    r.setRenderTarget(prev);
    r.setClearColor(prevClear, prevAlpha);
  }
}
