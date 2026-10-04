// 群れでは動かない生き物：マンタ・トビエイ・ウミガメ・ウツボ・クラゲ・イルカ・シャコガイ。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchUW, uwStandard } from '../core/uwmat.js';
import { U, UW_COMMON } from '../core/env.js';
import { dataTexture } from '../world/textures.js';
import { Noise, clamp, smoothstep, mulberry32 } from '../core/noise.js';
import { buildFish } from './fishgeo.js';
import { fishMaterial, writeFishMatrix } from './school.js';

const nz = new Noise(8080);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTex(w, h, fn) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x / (w - 1), y / (h - 1));
      const i = (y * w + x) * 4;
      data[i] = clamp(c[0], 0, 1) * 255;
      data[i + 1] = clamp(c[1], 0, 1) * 255;
      data[i + 2] = clamp(c[2], 0, 1) * 255;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, w, h, { srgb: true, repeat: false });
}

// ---- エイ（マンタ／マダラトビエイ）-------------------------------------------
function rayGeometry(kind) {
  const NU = 28, NV = 12;
  const manta = kind === 'manta';
  const le = (a) => (manta ? 0.36 - 0.5 * Math.pow(a, 1.6) : 0.3 - 0.55 * Math.pow(a, 1.3));
  const te = (a) => (manta ? -0.3 + 0.22 * Math.pow(a, 1.5) : -0.28 + 0.16 * Math.pow(a, 1.4));
  const tipA = 1;
  const pos = [], uvs = [], span = [], idx = [];
  for (const side of [0, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      const u = -1 + (2 * i) / NU;
      const a = Math.min(Math.abs(u), tipA);
      const z0 = le(a), z1 = te(a);
      for (let j = 0; j <= NV; j++) {
        const v = j / NV;
        const z = z0 + (z1 - z0) * v;
        const thick = 0.075 * Math.pow(1 - a, 1.4) * Math.sin(Math.PI * clamp(v, 0, 1)) + 0.004;
        const y = side === 0 ? thick : -thick * 0.55;
        pos.push(u * 1.0, y, z);
        uvs.push((u * 0.5 + 0.5) * 0.5 + side * 0.5, v);
        span.push(Math.abs(u));
      }
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const a = base + i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
        if (side === 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const parts = [g.toNonIndexed()];
  // 尾
  const tailLen = manta ? 0.5 : 1.6;
  const tail = new THREE.CylinderGeometry(0.004, 0.018, tailLen, 5);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, -0.28 - tailLen / 2);
  const tt = tail.toNonIndexed();
  const nT = tt.attributes.position.count;
  tt.setAttribute('aSpan', new THREE.Float32BufferAttribute(new Float32Array(nT).fill(0), 1));
  const tuv = new Float32Array(nT * 2).fill(0.02);
  tt.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
  parts.push(tt);
  // 頭びれ（マンタ）／くちばし（トビエイ）
  if (manta) {
    for (const s of [-1, 1]) {
      const f = new THREE.BoxGeometry(0.025, 0.06, 0.1);
      f.rotateX(0.5);
      f.translate(s * 0.1, -0.02, 0.4);
      const ff = f.toNonIndexed();
      const n = ff.attributes.position.count;
      ff.setAttribute('aSpan', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0.1), 1));
      ff.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(0.02), 2));
      parts.push(ff);
    }
  } else {
    const h = new THREE.SphereGeometry(0.07, 10, 8);
    h.scale(1, 0.6, 1.4);
    h.translate(0, 0.0, 0.33);
    const hh = h.toNonIndexed();
    const n = hh.attributes.position.count;
    hh.setAttribute('aSpan', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0), 1));
    hh.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(0.24), 2));
    parts.push(hh);
  }
  const merged = mergeGeometries(parts);
  // 模様：左半分が背中、右半分がお腹
  const tex = canvasTex(256, 128, (x, y) => {
    const top = x < 0.5;
    const u = top ? x * 2 : (x - 0.5) * 2;
    const su = u * 2 - 1;
    if (manta) {
      if (top) {
        let c = [0.06, 0.07, 0.08];
        // 肩の白い模様
        const sh = smoothstep(0.32, 0.18, Math.hypot(Math.abs(su) - 0.3, (y - 0.25) * 1.3));
        c = [c[0] + sh * 0.6, c[1] + sh * 0.6, c[2] + sh * 0.6];
        return c;
      }
      let c = [0.9, 0.9, 0.88];
      const edge = smoothstep(0.75, 0.95, Math.abs(su)) + smoothstep(0.7, 0.95, y) * 0.6;
      const spot = smoothstep(0.62, 0.7, nz.n2(su * 8, y * 6)) * 0.8;
      c = [c[0] - edge * 0.6 - spot * 0.6, c[1] - edge * 0.6 - spot * 0.6, c[2] - edge * 0.58 - spot * 0.6];
      return c;
    }
    if (top) {
      let c = [0.12, 0.14, 0.17];
      const gx = su * 9, gy = y * 7;
      const d = Math.hypot(gx - Math.round(gx) + nz.n2(gx, gy) * 0.2, gy - Math.round(gy));
      c = d < 0.22 ? [0.9, 0.9, 0.88] : c;
      return c;
    }
    return [0.92, 0.92, 0.9];
  });
  return { geo: merged, tex };
}

function rayMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide });
  return patchUW(m, {
    key: 'ray',
    spec: 0.25,
    shininess: 30,
    envSpec: 0.1,
    vertexHead: 'attribute float aSpan; uniform float uFlap; uniform float uFlapAmp;',
    uniforms: { uFlap: { value: 0 }, uFlapAmp: { value: 0.3 } },
    vertexBegin: /* glsl */ `
      float sa = aSpan;
      transformed.y += sin(uFlap - sa * 1.4) * uFlapAmp * pow(sa, 1.5);
      transformed.y += sin(uFlap * 0.5 - transformed.z * 4.0) * 0.015;
      if (transformed.z < -0.3) transformed.x += sin(uFlap * 0.7 + transformed.z * 3.0) * (-transformed.z - 0.3) * 0.25;
    `,
  });
}

export class Ray {
  constructor(kind, o) {
    const { geo, tex } = rayGeometry(kind);
    this.mat = rayMaterial(tex);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = kind;
    this.kind = kind;
    this.species = kind === 'manta' ? 'manta' : 'eagleray';
    this.o = o; // { center, radius, depth, speed, scale, phase }
    this.t = o.phase || 0;
    this.flap = Math.random() * 10;
    this.pos = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.size = o.scale;
    this.mesh.scale.setScalar(o.scale);
    this.roll = 0;
  }

  path(t, out) {
    const o = this.o;
    const a = t * o.speed / o.radius;
    const r = o.radius * (1 + 0.25 * Math.sin(a * 0.37 + o.phase));
    out.set(
      o.center.x + Math.cos(a) * r + Math.sin(a * 0.53) * o.radius * 0.25,
      o.depth + Math.sin(a * 0.71 + 1.3) * o.dy,
      o.center.z + Math.sin(a) * r * o.squash
    );
    return out;
  }

  update(dt) {
    this.t += dt;
    const p = this.path(this.t, this.pos);
    const ahead = this.path(this.t + 0.6, new THREE.Vector3());
    const f = ahead.sub(p).normalize();
    const turn = new THREE.Vector3().crossVectors(this.fwd, f).y;
    this.fwd.lerp(f, 1 - Math.exp(-dt * 3)).normalize();
    this.roll += (clamp(-turn * 18, -0.6, 0.6) - this.roll) * (1 - Math.exp(-dt * 2));
    const rate = this.kind === 'manta' ? 1.2 : 1.8;
    this.flap += dt * rate * (1.1 + Math.max(0, f.y) * 2);
    this.mat.userData.uw.uFlap.value = this.flap;
    this.mat.userData.uw.uFlapAmp.value = this.kind === 'manta' ? 0.32 : 0.36;
    this.mesh.position.copy(p);
    const m = new THREE.Matrix4();
    m.lookAt(this.fwd, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.mesh.quaternion.setFromRotationMatrix(m);
    this.mesh.rotateZ(this.roll);
  }

  forEach(fn) {
    fn(this.pos.x, this.pos.y, this.pos.z, this.size * 1.4);
  }
}

// ---- ウミガメ ---------------------------------------------------------------
export class Turtle {
  constructor(world, o) {
    this.world = world;
    this.o = o; // { center, radius, scale }
    this.species = 'turtle';
    const shellTex = canvasTex(128, 128, (x, y) => {
      const su = x * 2 - 1, sv = y * 2 - 1;
      // 甲羅の板（六角形っぽい区切り）
      const gx = su * 2.2, gy = sv * 2.6 + (Math.floor(su * 2.2 + 10) % 2) * 0.5;
      const fx = gx - Math.round(gx), fy = gy - Math.round(gy);
      const edge = smoothstep(0.38, 0.47, Math.max(Math.abs(fx), Math.abs(fy) * 0.9));
      const rays = Math.sin(Math.atan2(fy, fx) * 9) * 0.5 + 0.5;
      let c = [0.36 + rays * 0.12, 0.3 + rays * 0.08, 0.16];
      c = [c[0] * (1 - edge * 0.6), c[1] * (1 - edge * 0.6), c[2] * (1 - edge * 0.5)];
      return c;
    });
    const skinTex = canvasTex(64, 64, (x, y) => {
      const n = Math.abs(nz.n2(x * 14, y * 14));
      const e = smoothstep(0.06, 0.0, n);
      return [0.48 - e * 0.25, 0.45 - e * 0.22, 0.38 - e * 0.2];
    });
    const shellMat = uwStandard({ map: shellTex, roughness: 0.6 }, { key: 'turtle', spec: 0.3, shininess: 30, envSpec: 0.1 });
    const skinMat = uwStandard({ map: skinTex, roughness: 0.7 }, { key: 'turtle', spec: 0.15 });
    const bellyMat = uwStandard({ color: 0xd8c89a, roughness: 0.7 }, { key: 'turtle', spec: 0.1 });
    const g = (this.root = new THREE.Group());
    g.name = 'turtle';
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), shellMat);
    shell.scale.set(0.82, 0.42, 1);
    g.add(shell);
    const plast = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 10), bellyMat);
    plast.scale.set(0.8, 0.12, 0.95);
    plast.position.y = -0.02;
    g.add(plast);
    const head = new THREE.Group();
    head.position.set(0, 0.0, 0.5);
    g.add(head);
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.12, 4, 10), skinMat);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = 0.04;
    head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), skinMat);
    skull.scale.set(0.85, 0.75, 1.15);
    skull.position.set(0, 0.03, 0.17);
    head.add(skull);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), uwStandard({ color: 0x050505 }, { key: 'turtle', spec: 1, shininess: 80 }));
      eye.position.set(s * 0.085, 0.06, 0.22);
      head.add(eye);
    }
    this.head = head;
    const flipper = (len, w) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, -w * 0.5);
      sh.quadraticCurveTo(len * 0.5, -w * 0.7, len, -w * 0.15);
      sh.quadraticCurveTo(len * 0.6, w * 0.6, 0, w * 0.5);
      const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
      fg.translate(0, 0, -0.015);
      fg.rotateX(Math.PI / 2);
      return new THREE.Mesh(fg, skinMat);
    };
    this.flippers = [];
    for (const s of [-1, 1]) {
      const fr = new THREE.Group();
      fr.position.set(s * 0.33, -0.02, 0.22);
      const fm = flipper(0.62, 0.2);
      fm.scale.x = s;
      fm.rotation.y = s * 0.45;
      fr.add(fm);
      g.add(fr);
      const bk = new THREE.Group();
      bk.position.set(s * 0.25, -0.03, -0.38);
      const bm = flipper(0.26, 0.14);
      bm.scale.x = s;
      bm.rotation.y = s * 1.9;
      bk.add(bm);
      g.add(bk);
      this.flippers.push({ s, fr, bk });
    }
    g.scale.setScalar(o.scale);
    this.size = o.scale;
    this.pos = o.center.clone();
    this.pos.y = -5;
    this.vel = new THREE.Vector3(0.3, 0, 0);
    this.target = o.center.clone();
    this.state = 'cruise';
    this.timer = 0;
    this.breathT = 30 + Math.random() * 40;
    this.stroke = 0;
    this.fwd = new THREE.Vector3(1, 0, 0);
    this.rand = mulberry32(o.seed || 3);
  }

  pickTarget() {
    const R = this.rand, o = this.o;
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * o.radius;
    const x = o.center.x + Math.cos(a) * r, z = o.center.z + Math.sin(a) * r;
    const floor = this.world.solidFloor(x, z);
    this.target.set(x, floor + 1.2 + R() * 3, z);
  }

  update(dt, ctx) {
    this.timer -= dt;
    this.breathT -= dt;
    if (this.state === 'cruise' && this.breathT < 0) {
      this.state = 'breathe';
      this.target.set(this.pos.x + this.fwd.x * 10, -0.35, this.pos.z + this.fwd.z * 10);
    }
    if (this.state === 'breathe' && this.pos.y > -0.6) {
      this.state = 'cruise';
      this.breathT = 70 + this.rand() * 50;
      this.pickTarget();
    }
    if (this.state === 'cruise' && (this.timer < 0 || this.pos.distanceTo(this.target) < 2)) {
      this.pickTarget();
      this.timer = 25;
    }
    const to = new THREE.Vector3().subVectors(this.target, this.pos);
    const d = to.length();
    const speed = this.state === 'breathe' ? 0.75 : 0.5;
    const desired = to.multiplyScalar(speed / Math.max(d, 0.01));
    // プレイヤーが近いと少し距離をとる
    const away = new THREE.Vector3().subVectors(this.pos, ctx.playerPos);
    const ad = away.length();
    if (ad < 3) desired.addScaledVector(away.normalize(), (3 - ad) * 0.4);
    this.vel.lerp(desired, 1 - Math.exp(-dt * 0.6));
    // 地形をよける
    const ahead = this.pos.clone().addScaledVector(this.vel, 1.5);
    const sd = this.world.solidDistance(ahead.x, ahead.y, ahead.z);
    if (sd < 1.2) this.vel.addScaledVector(this.world.solidNormal(ahead.x, ahead.y, ahead.z), (1.2 - sd) * dt * 3);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.min(this.pos.y, -0.35);
    const sp = this.vel.length();
    if (sp > 0.05) this.fwd.lerp(this.vel.clone().normalize(), 1 - Math.exp(-dt * 1.5)).normalize();
    this.stroke += dt * (1.0 + sp * 1.3);
    const st = Math.sin(this.stroke);
    for (const F of this.flippers) {
      F.fr.rotation.z = F.s * (st * 0.55 + 0.1);
      F.fr.rotation.y = F.s * Math.cos(this.stroke) * 0.25;
      F.bk.rotation.z = F.s * Math.sin(this.stroke + 1) * 0.15;
    }
    this.head.rotation.y = Math.sin(this.stroke * 0.3) * 0.15;
    this.root.position.copy(this.pos);
    this.root.position.y += st * 0.03;
    const m = new THREE.Matrix4().lookAt(this.fwd, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.root.quaternion.setFromRotationMatrix(m);
  }

  forEach(fn) {
    fn(this.pos.x, this.pos.y, this.pos.z, this.size * 0.9);
  }
}

// ---- ウツボ（壁の穴から顔を出す）---------------------------------------------
export class Moray {
  constructor(hole, outDir) {
    this.species = 'moray';
    this.hole = hole.clone();
    this.out = outDir.clone().normalize();
    const tex = canvasTex(128, 32, (x, y) => {
      const n = nz.n2(x * 40, y * 10);
      const m = smoothstep(0.1, 0.4, n);
      return [0.55 - m * 0.3, 0.52 - m * 0.25, 0.22 - m * 0.1];
    });
    const mat = uwStandard({ map: tex, roughness: 0.45 }, { key: 'moray', spec: 0.5, shininess: 40, envSpec: 0.1 });
    const g = (this.root = new THREE.Group());
    g.name = 'moray';
    // 体：穴の奥から伸びる筒
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 1.2, 12, 6), mat);
    body.rotation.x = Math.PI / 2;
    body.position.z = -0.6;
    g.add(body);
    const head = (this.head = new THREE.Group());
    g.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), mat);
    skull.scale.set(0.85, 1.0, 1.7);
    skull.position.z = 0.08;
    head.add(skull);
    const jaw = (this.jaw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mat));
    jaw.scale.set(0.8, 0.5, 1.7);
    jaw.position.set(0, -0.05, 0.1);
    head.add(jaw);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), uwStandard({ color: 0x101010 }, { key: 'moray', spec: 1, shininess: 80 }));
      eye.position.set(s * 0.06, 0.045, 0.16);
      head.add(eye);
    }
    // 穴の向きに合わせる
    const m = new THREE.Matrix4().lookAt(this.out, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    g.quaternion.setFromRotationMatrix(m);
    g.scale.setScalar(1.5);
    this.ext = 0.4;
    this.t = 0;
    this.pos = new THREE.Vector3();
  }

  update(dt, ctx) {
    this.t += dt;
    const near = ctx.playerPos.distanceTo(this.hole) < 1.6;
    const want = near ? -0.2 : 0.35 + Math.sin(this.t * 0.4) * 0.08;
    this.ext += (want - this.ext) * (1 - Math.exp(-dt * (near ? 6 : 1)));
    this.root.position.copy(this.hole).addScaledVector(this.out, this.ext - 0.25);
    this.head.rotation.y = Math.sin(this.t * 0.7) * 0.25;
    this.head.rotation.x = Math.sin(this.t * 0.5) * 0.1;
    // 口をぱくぱく（呼吸）
    this.jaw.rotation.x = 0.1 + Math.max(0, Math.sin(this.t * 2.2)) * 0.35;
    this.head.getWorldPosition(this.pos);
  }

  forEach(fn) {
    if (this.ext > 0.05) fn(this.pos.x, this.pos.y, this.pos.z, 0.5);
  }
}

// ---- ミズクラゲ ------------------------------------------------------------
export class Jellies {
  constructor(center, count = 9) {
    this.species = 'jelly';
    this.group = new THREE.Group();
    this.group.name = 'jellies';
    const bellGeo = new THREE.SphereGeometry(0.2, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.45);
    bellGeo.scale(1, 0.55, 1);
    const ringGeo = new THREE.TorusGeometry(0.035, 0.009, 6, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uTint: { value: new THREE.Color(0.75, 0.85, 1.0) } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vWp; varying vec3 vV;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWp = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        ${UW_COMMON}
        uniform vec3 uTint;
        varying vec3 vN; varying vec3 vWp; varying vec3 vV;
        void main() {
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float a = 0.08 + pow(f, 2.0) * 0.55;
          vec3 c = uTint * (0.35 + f * 0.9) * exp(uLightAbsorb * min(vWp.y, 0.0) * 0.6);
          c = uwFog(c, vWp, 1.0);
          gl_FragColor = vec4(c * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const ringMat = mat.clone();
    ringMat.uniforms = { ...U, uTint: { value: new THREE.Color(1.0, 0.6, 0.8) } };
    const tentMat = new THREE.LineBasicMaterial({ color: 0x9fc6e0, transparent: true, opacity: 0.35 });
    this.items = [];
    const R = mulberry32(4);
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const bell = new THREE.Mesh(bellGeo, mat);
      g.add(bell);
      for (let k = 0; k < 4; k++) {
        const ring = new THREE.Mesh(ringGeo, ringMat);
        const a = (k / 4) * Math.PI * 2 + 0.4;
        ring.position.set(Math.cos(a) * 0.06, 0.04, Math.sin(a) * 0.06);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
      }
      const pts = [];
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        pts.push(Math.cos(a) * 0.19, -0.005, Math.sin(a) * 0.19, Math.cos(a) * 0.17, -0.1 - R() * 0.06, Math.sin(a) * 0.17);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(lg, tentMat));
      const s = 0.8 + R() * 0.7;
      g.scale.setScalar(s);
      const p = V(center.x + (R() - 0.5) * 30, -1.5 - R() * 5, center.z + (R() - 0.5) * 30);
      this.group.add(g);
      this.items.push({ g, p, s, ph: R() * 10, drift: V(R() - 0.5, 0, R() - 0.5).multiplyScalar(0.08) });
    }
    this.center = center.clone();
  }

  update(dt) {
    for (const it of this.items) {
      it.ph += dt;
      const pulse = Math.max(0, Math.sin(it.ph * 1.6));
      it.g.scale.set(it.s * (1 - pulse * 0.12), it.s * (1 + pulse * 0.1), it.s * (1 - pulse * 0.12));
      it.p.addScaledVector(it.drift, dt);
      it.p.y += (pulse * 0.12 - 0.035) * dt;
      if (it.p.y < -7) it.p.y = -7;
      if (it.p.y > -1) it.p.y = -1;
      if (it.p.distanceTo(this.center) > 22) it.drift.multiplyScalar(-1);
      it.g.position.copy(it.p);
    }
  }

  forEach(fn) {
    for (const it of this.items) fn(it.p.x, it.p.y, it.p.z, 0.3 * it.s);
  }
}

// ---- イルカ（入り江をぐるりと回る群れ。ときどき跳ねる）--------------------------
function dolphinDef() {
  return {
    height: 0.1, width: 0.1,
    heightMul: (s) => (s < 0.1 ? 0.6 + s * 4 : 1) * (1 - 0.15 * s),
    tail: { type: 'truncate', size: 0.001 },
    dorsal: [{ s0: 0.42, s1: 0.58, h: 0.09, sweep: 0.1, profile: (t) => (t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) * 1.6)) }],
    anal: [],
    pectoral: { s: 0.25, len: 0.12, angle: 1.4 },
    eye: { s: 0.1, r: 0.01, t: 0.0 },
    pattern: (u, v) => mix3([0.86, 0.87, 0.88], [0.36, 0.4, 0.45], smoothstep(0.32, 0.55, v)),
    fin: () => [0.36, 0.4, 0.45],
    extra: ({ zAt }) => {
      // 尾びれ（水平）
      const z0 = zAt(1);
      const pts = [[z0, 0.01], [z0 - 0.14, 0.12], [z0 - 0.17, 0.09], [z0 - 0.1, 0.0], [z0 - 0.17, -0.09], [z0 - 0.14, -0.12], [z0, -0.01]];
      const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const pos = [], body = [], uvs = [];
      for (const t of tris) for (const k of t) {
        pos.push(pts[k][1], 0, pts[k][0]);
        body.push(clamp(0.5 - pts[k][0], 0, 1));
        uvs.push(0.97, 0.5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 1));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      // くちばし
      const beak = new THREE.CylinderGeometry(0.012, 0.03, 0.08, 8);
      beak.rotateX(Math.PI / 2);
      beak.translate(0, -0.015, 0.52);
      const b = beak.toNonIndexed();
      const n = b.attributes.position.count;
      b.setAttribute('aBody', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0), 1));
      b.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(0.5), 2));
      return [g, b];
    },
  };
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Dolphins {
  constructor(count = 3) {
    this.species = 'dolphin';
    const { geo, tex } = buildFish(dolphinDef());
    const mat = fishMaterial(tex, { spec: 0.6, env: 0.3 });
    // 縦にうねる（尾びれを上下に打つ）
    mat.onBeforeCompile = ((orig) => (shader) => {
      orig(shader);
      shader.vertexShader = shader.vertexShader.replace(
        'transformed.x += fw * aSwim * (0.012 + 0.12 * fb * fb);',
        'transformed.y += fw * aSwim * (0.008 + 0.1 * fb * fb);'
      );
    })(mat.onBeforeCompile);
    mat.customProgramCacheKey = () => 'uw:fish-vertical';
    const g = geo.clone();
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(count).map(() => Math.random() * 6), 1));
    g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(0.9), 1));
    g.setAttribute('aFreq', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(6), 1));
    this.mesh = new THREE.InstancedMesh(g, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'dolphins';
    this.n = count;
    this.t = 40;
    this.pos = [];
    for (let i = 0; i < count; i++) this.pos.push(new THREE.Vector3());
    this.size = 2.4;
    this.jump = new Float32Array(count).fill(-1);
    this.jumpCool = new Float32Array(count).map(() => 5 + Math.random() * 10);
    this.splashes = [];
  }

  pathAt(t, i, out) {
    // 入り江を大きく回る（半径 85 m、1 周およそ 2 分）
    const a = t * 0.05 + i * 0.03;
    const r = 85 + Math.sin(a * 3 + i) * 12;
    out.set(Math.cos(a) * r + 10, 0, Math.sin(a) * r * 0.85 + 10);
    out.y = -1.6 - Math.sin(t * 0.9 + i * 2) * 1.0 - i * 0.6;
    return out;
  }

  update(dt) {
    this.t += dt;
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const p = this.pathAt(this.t, i, tmp);
      const q = this.pathAt(this.t + 0.3, i, tmp2);
      // ジャンプ
      this.jumpCool[i] -= dt;
      if (this.jumpCool[i] < 0 && this.jump[i] < 0) {
        this.jump[i] = 0;
        this.jumpCool[i] = 9 + Math.random() * 14;
      }
      let jy = 0, jvy = 0;
      if (this.jump[i] >= 0) {
        this.jump[i] += dt;
        const T = 1.6;
        const u = this.jump[i] / T;
        if (u >= 1) {
          this.jump[i] = -1;
          this.splashes.push(p.clone());
        } else {
          jy = Math.sin(u * Math.PI) * 4.2;
          jvy = Math.cos(u * Math.PI) * 3;
          if (Math.abs(u - 0.08) < dt / T) this.splashes.push(p.clone());
        }
      }
      p.y += jy;
      this.pos[i].copy(p);
      const fx = q.x - p.x, fz = q.z - p.z;
      writeFishMatrix(this.mesh, i, p.x, p.y, p.z, fx, (q.y - (p.y - jy)) * 0.3 + jvy * 0.15, fz, this.size);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  forEach(fn) {
    for (const p of this.pos) fn(p.x, p.y, p.z, this.size * 0.5);
  }
}

// ---- シャコガイ ---------------------------------------------------------------
// 波打つ縁の二枚の殻が上向きに少し開き、そのすき間から色あざやかな外套膜がのぞく
function clamValve(side, L, W, H) {
  const NA = 40, NB = 12;
  const pos = [], idx = [];
  for (let i = 0; i <= NA; i++) {
    const a = (i / NA) * Math.PI;
    const z = Math.cos(a) * L * 0.5;
    const sa = Math.pow(Math.sin(a), 0.75);
    // 縁のぎざぎざ（5 つの大きな波）
    const rim = 0.86 + 0.14 * Math.cos(a * 10);
    for (let j = 0; j <= NB; j++) {
      const b = j / NB;
      const th = -Math.PI / 2 + b * (Math.PI / 2 + 0.25) * rim;
      const rib = 1 + 0.05 * Math.pow(Math.abs(Math.sin(a * 5)), 0.6) * b;
      const x = side * Math.cos(th) * sa * W * 0.5 * rib;
      const y = (Math.sin(th) + 1) * sa * H * 0.5 * rib;
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < NA; i++) {
    for (let j = 0; j < NB; j++) {
      const a = i * (NB + 1) + j, b = a + 1, c = a + NB + 1, d = c + 1;
      if (side > 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildClam(scale = 1, seed = 1) {
  const R = mulberry32(seed);
  const g = new THREE.Group();
  g.name = 'clam';
  const L = 1.0, W = 0.62, H = 0.52;
  const shellMat = uwStandard({ color: 0xcfc6ae, roughness: 0.75, side: THREE.DoubleSide }, { key: 'clam', spec: 0.15 });
  const hue = R();
  const base = hue < 0.35 ? [0.08, 0.32, 0.85] : hue < 0.7 ? [0.15, 0.6, 0.45] : [0.45, 0.25, 0.75];
  const mantleTex = canvasTex(128, 64, (x, y) => {
    const n = nz.n2(x * 14 + seed * 3, y * 7);
    const n2 = nz.n2(x * 40 + seed, y * 20);
    const spot = smoothstep(0.35, 0.55, n2);
    const band = 0.5 + 0.5 * Math.sin(x * 30 + n * 3);
    return [base[0] * (0.6 + band * 0.6) + spot * 0.5, base[1] * (0.6 + band * 0.6) + spot * 0.45, base[2] * (0.7 + band * 0.4) + spot * 0.3];
  });
  const mantleMat = uwStandard(
    { map: mantleTex, roughness: 0.35, emissive: new THREE.Color(base[0], base[1], base[2]).multiplyScalar(0.25) },
    { key: 'clam', spec: 0.7, shininess: 60, envSpec: 0.2 }
  );
  const valves = [];
  for (const s of [-1, 1]) {
    const v = new THREE.Mesh(clamValve(s, L, W, H), shellMat);
    const pivot = new THREE.Group();
    pivot.add(v);
    pivot.rotation.z = -s * 0.12;
    g.add(pivot);
    valves.push({ s, pivot });
  }
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 12), mantleMat);
  mantle.scale.set(W * 0.9, H * 0.9, L * 0.9);
  mantle.position.y = H * 0.5;
  g.add(mantle);
  g.scale.setScalar(scale);
  let open = 0.12;
  return {
    group: g,
    mantle,
    // 近づくと少し閉じる（驚いて身をすくめる）
    update: (dt, near) => {
      const want = near ? 0.0 : 0.09;
      open += (want - open) * Math.min(1, dt * (near ? 5 : 0.6));
      for (const vv of valves) vv.pivot.rotation.z = -vv.s * open;
      mantle.scale.y = H * (0.8 + open * 1.5);
    },
  };
}
