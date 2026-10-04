// 自前のポストエフェクト：
//  1. シーン → HDR（深度テクスチャつき、MSAA）
//  2. 水中の光の筋（レイマーチ、半分の解像度）
//  3. 合成（光の筋・水中のゆらぎ）
//  4. ブルーム（縮小と拡大の連鎖）
//  5. トーンマッピング・ビネット・フェード → 画面
import * as THREE from 'three';
import { U, UW_COMMON } from './env.js';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const GOD_FRAG = /* glsl */ `
${UW_COMMON}
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uDensity;
uniform float uFrame;
uniform float uMaxDist;
uniform vec3 uCamPos;
varying vec2 vUv;
#define STEPS STEP_COUNT

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  float d = texture2D(tDepth, vUv).r;
  vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 vp = uInvProj * ndc;
  vp.xyz /= vp.w;
  vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
  vec3 ro = uCamPos;
  vec3 rd = wp - ro;
  float tMax = length(rd);
  rd /= max(tMax, 1e-4);
  tMax = min(tMax, uMaxDist);
  if (rd.y > 1e-4) tMax = min(tMax, -ro.y / rd.y);
  float jitter = ign(gl_FragCoord.xy + vec2(uFrame * 5.588, uFrame * 3.17));
  vec3 acc = vec3(0.0);
  // 手前ほど細かく刻む（遠くは霧に埋もれるので粗くてよい）
  for (int i = 0; i < STEPS; i++) {
    float u = (float(i) + jitter) / float(STEPS);
    float t = tMax * u * u;
    float stepL = tMax * (2.0 * u + 1e-3) / float(STEPS);
    vec3 p = ro + rd * t;
    float under;
    vec3 c = (uOccMatrix * vec4(p, 1.0)).xyz;
    float vis = 1.0;
    if (c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0) {
      vis = uwSat((texture2D(uOccTex, c.xy).r - c.z) * uOccRange * 0.5 + 1.0);
    }
    vec2 s = p.xz - uLightDirUW.xz * (p.y / uLightDirUW.y);
    float pat = texture2D(uCaustTex, s * 0.05, 1.2).r;
    pat = max(pat - 1.1, 0.0);
    float depth = max(-p.y, 0.0);
    vec3 att = exp(-uLightAbsorb * depth - uAbsorb * t);
    acc += att * (vis * pat) * stepL;
  }
  float mu = max(dot(rd, -uLightDirUW), 0.0);
  float phase = 0.25 + 1.4 * pow(mu, 5.0) + 0.6 * pow(mu, 30.0);
  acc *= uDensity * phase;
  gl_FragColor = vec4(acc * uSunColor, -vp.z);
}
`;

// 光の筋のざらつきを、深度の近い隣とだけ混ぜてならす
const GODBLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tSrc, vUv);
  vec3 acc = c.rgb * 0.3;
  float wsum = 0.3;
  for (int i = 1; i <= 3; i++) {
    float fi = float(i);
    float wk = 0.3 - fi * 0.07;
    vec4 a = texture2D(tSrc, vUv + uDir * fi);
    vec4 b = texture2D(tSrc, vUv - uDir * fi);
    float wa = wk / (abs(a.a - c.a) / max(c.a, 0.1) * 30.0 + 1.0);
    float wb = wk / (abs(b.a - c.a) / max(c.a, 0.1) * 30.0 + 1.0);
    acc += a.rgb * wa + b.rgb * wb;
    wsum += wa + wb;
  }
  gl_FragColor = vec4(acc / wsum, c.a);
}
`;

const COMP_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tGod;
uniform sampler2D tDepth;
uniform vec2 uGodSize;
uniform float uNear;
uniform float uFar;
uniform float uUnderwater;
uniform float uTime;
uniform float uWobble;
varying vec2 vUv;

float viewZ(float d) {
  return (uNear * uFar) / max(uFar - d * (uFar - uNear), 1e-4);
}

// 半分の解像度の光の筋を、深度が近いサンプルを重く見て引き伸ばす
vec3 godUpsample(vec2 uv) {
  float z = viewZ(texture2D(tDepth, uv).r);
  vec2 tc = uv * uGodSize - 0.5;
  vec2 f = fract(tc);
  vec2 base = (floor(tc) + 0.5) / uGodSize;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec4 s = texture2D(tGod, base + vec2(float(i), float(j)) / uGodSize);
      float bw = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      float dz = abs(s.a - z) / max(z, 0.1);
      float w = (bw + 1e-3) / (dz * 40.0 + 0.05);
      acc += s.rgb * w;
      wsum += w;
    }
  }
  return acc / max(wsum, 1e-5);
}

void main() {
  vec2 uv = vUv;
  if (uUnderwater > 0.5) {
    uv += vec2(sin(uv.y * 23.0 + uTime * 1.7) , cos(uv.x * 19.0 + uTime * 1.4)) * 0.0009 * uWobble;
  }
  vec3 c = texture2D(tScene, uv).rgb;
  if (uUnderwater > 0.5) c += godUpsample(uv);
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
}
`;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 pf(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  rq = (rq * rq) / (4.0 * uKnee + 1e-4);
  float w = max(rq, br - uThreshold) / max(br, 1e-4);
  return c * w;
}
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb
         + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(pf(c * 0.25), 1.0);
}
`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uScale;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 * uScale, 1.0);
}
`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tComp;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform float uVignette;
uniform float uSat;
uniform vec3 uFadeColor;
uniform float uFade;
uniform float uTime;
uniform float uUnderwater;
varying vec2 vUv;
vec3 aces(vec3 x) {
  x = max(x, vec3(0.0));
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tComp, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c *= uExposure;
  vec2 q = vUv - 0.5;
  float vig = 1.0 - smoothstep(0.35, 0.95, length(q * vec2(1.25, 1.0)) * 1.25);
  c *= mix(1.0 - uVignette, 1.0, vig);
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = toSRGB(c);
  c = mix(c, uFadeColor, uFade);
  c += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

function fsMat(frag, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: FS_VERT,
    fragmentShader: frag,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.quality = { scale: 1, godSteps: 28, msaa: 4, bloom: true, maxPx: 3.6e6 };
    this.quad = new THREE.Mesh(new THREE.BufferGeometry(), null);
    const tri = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
    this.quad.geometry.setAttribute('position', new THREE.BufferAttribute(tri, 3));
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene();
    this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.frame = 0;

    this.godMat = this.makeGodMat(this.quality.godSteps);
    this.godBlurMat = fsMat(GODBLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.compMat = fsMat(COMP_FRAG, {
      tScene: { value: null },
      tGod: { value: null },
      tDepth: { value: null },
      uGodSize: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 3000 },
      uUnderwater: U.uUnderwater,
      uTime: U.uTime,
      uWobble: { value: 1 },
    });
    this.preMat = fsMat(PREFILTER_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1.0 },
      uKnee: { value: 0.5 },
    });
    this.downMat = fsMat(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = fsMat(UP_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uScale: { value: 1 },
    });
    this.upMat.blending = THREE.AdditiveBlending;
    this.upMat.transparent = true;
    this.finalMat = fsMat(FINAL_FRAG, {
      tComp: { value: null },
      tBloom: { value: null },
      uExposure: { value: 1.0 },
      uBloom: { value: 0.14 },
      uVignette: { value: 0.35 },
      uSat: { value: 1.08 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uFade: { value: 0 },
      uTime: U.uTime,
      uUnderwater: U.uUnderwater,
    });
    this.targets = null;
    this.size = new THREE.Vector2();
  }

  makeGodMat(steps) {
    return fsMat(
      GOD_FRAG,
      {
        ...U,
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uDensity: { value: 0.05 },
        uFrame: { value: 0 },
        uMaxDist: { value: 75 },
        uCamPos: { value: new THREE.Vector3() },
      },
      { STEP_COUNT: steps }
    );
  }

  setQuality(q) {
    const godChanged = q.godSteps !== undefined && q.godSteps !== this.quality.godSteps;
    Object.assign(this.quality, q);
    if (!godChanged) delete q.godSteps;
    if (q.godSteps !== undefined) {
      const old = this.godMat;
      this.godMat = this.makeGodMat(this.quality.godSteps);
      this.godMat.uniforms.uDensity.value = old.uniforms.uDensity.value;
      old.dispose();
    }
    this.disposeTargets();
  }

  disposeTargets() {
    if (!this.targets) return;
    const t = this.targets;
    t.scene.depthTexture.dispose();
    t.scene.dispose();
    t.god.dispose();
    t.god2.dispose();
    t.comp.dispose();
    t.mips.forEach((m) => m.dispose());
    this.targets = null;
  }

  ensureTargets(w, h) {
    // 画素数に上限を設け、超える分は内部の解像度を下げて最後に引き伸ばす
    const s = this.quality.scale * Math.min(1, Math.sqrt(this.quality.maxPx / Math.max(1, w * h)));
    const W = Math.max(2, Math.floor(w * s)), H = Math.max(2, Math.floor(h * s));
    if (this.targets && this.targets.w === W && this.targets.h === H) return this.targets;
    this.disposeTargets();
    const hf = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const dt = new THREE.DepthTexture(W, H);
    dt.type = THREE.UnsignedIntType;
    const scene = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: dt,
      samples: this.quality.msaa,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const god = new THREE.WebGLRenderTarget(Math.ceil(W / 2), Math.ceil(H / 2), hf);
    const god2 = new THREE.WebGLRenderTarget(Math.ceil(W / 2), Math.ceil(H / 2), hf);
    const comp = new THREE.WebGLRenderTarget(W, H, hf);
    const mips = [];
    let mw = Math.ceil(W / 2), mh = Math.ceil(H / 2);
    for (let i = 0; i < 6; i++) {
      mips.push(new THREE.WebGLRenderTarget(Math.max(1, mw), Math.max(1, mh), hf));
      mw = Math.ceil(mw / 2);
      mh = Math.ceil(mh / 2);
    }
    this.targets = { w: W, h: H, scene, god, god2, comp, mips };
    return this.targets;
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qScene, this.qCam);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const t = this.ensureTargets(this.size.x, this.size.y);
    this.frame++;

    r.setRenderTarget(t.scene);
    r.clear();
    r.render(scene, camera);

    const underwater = U.uUnderwater.value > 0.5;
    if (underwater) {
      const g = this.godMat.uniforms;
      g.tDepth.value = t.scene.depthTexture;
      g.uInvProj.value.copy(camera.projectionMatrixInverse);
      g.uCamWorld.value.copy(camera.matrixWorld);
      g.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      g.uFrame.value = this.frame % 64;
      this.pass(this.godMat, t.god);
      const b = this.godBlurMat.uniforms;
      b.tSrc.value = t.god.texture;
      b.uDir.value.set(1 / t.god.width, 0);
      this.pass(this.godBlurMat, t.god2);
      b.tSrc.value = t.god2.texture;
      b.uDir.value.set(0, 1 / t.god.height);
      this.pass(this.godBlurMat, t.god);
    }
    const cu = this.compMat.uniforms;
    cu.tScene.value = t.scene.texture;
    cu.tGod.value = t.god.texture;
    cu.tDepth.value = t.scene.depthTexture;
    cu.uGodSize.value.set(t.god.width, t.god.height);
    cu.uNear.value = camera.near;
    cu.uFar.value = camera.far;
    this.pass(this.compMat, t.comp);

    let bloomTex = null;
    if (this.quality.bloom) {
      const m = t.mips;
      this.preMat.uniforms.tSrc.value = t.comp.texture;
      this.preMat.uniforms.uTexel.value.set(1 / t.w, 1 / t.h);
      this.pass(this.preMat, m[0]);
      for (let i = 1; i < m.length; i++) {
        this.downMat.uniforms.tSrc.value = m[i - 1].texture;
        this.downMat.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height);
        this.pass(this.downMat, m[i]);
      }
      r.autoClear = false;
      for (let i = m.length - 1; i > 0; i--) {
        this.upMat.uniforms.tSrc.value = m[i].texture;
        this.upMat.uniforms.uTexel.value.set(1 / m[i].width, 1 / m[i].height);
        this.upMat.uniforms.uScale.value = 1.0;
        this.pass(this.upMat, m[i - 1]);
      }
      r.autoClear = true;
      bloomTex = m[0].texture;
    }
    this.finalMat.uniforms.tComp.value = t.comp.texture;
    this.finalMat.uniforms.tBloom.value = bloomTex || t.comp.texture;
    if (!bloomTex) this.finalMat.uniforms.uBloom.value = 0;
    this.pass(this.finalMat, null);
  }
}
