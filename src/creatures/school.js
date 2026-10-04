// 魚の群れ（ボイド）。一つの群れは一種類の魚で、インスタンスでまとめて描く。
import * as THREE from 'three';
import { patchUW } from '../core/uwmat.js';
import { buildFish, FISH_DEFS } from './fishgeo.js';
import { mulberry32 } from '../core/noise.js';

const assets = {};
export function fishAsset(species) {
  if (!assets[species]) assets[species] = buildFish(FISH_DEFS[species]);
  return assets[species];
}

const FISH_VERT = /* glsl */ `
  float fb = aBody;
  float fw = sin(uTime * aFreq + aPhase - fb * 6.5);
  transformed.x += fw * aSwim * (0.012 + 0.12 * fb * fb);
`;

export function fishMaterial(tex, { spec = 0.22, env = 0.1, emissive = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.4,
    metalness: 0,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 0,
  });
  if (emissive) {
    m.emissiveMap = tex;
    m.emissiveIntensity = emissive;
  }
  return patchUW(m, {
    key: emissive ? 'fish-glow' : 'fish',
    spec,
    shininess: 40,
    envSpec: env,
    wrap: 0.3,
    vertexHead: 'attribute float aBody; attribute float aPhase; attribute float aSwim; attribute float aFreq;',
    vertexBegin: FISH_VERT,
  });
}

// 魚を何匹か置ける InstancedMesh（個別の生き物でも使う）
export function makeFishMesh(species, count, matOpts = {}) {
  const asset = fishAsset(species);
  const geo = asset.geo.clone();
  const phase = new Float32Array(count);
  const swim = new Float32Array(count).fill(0.6);
  const freq = new Float32Array(count).fill(8);
  for (let i = 0; i < count; i++) phase[i] = Math.random() * 20;
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 1));
  geo.setAttribute('aFreq', new THREE.InstancedBufferAttribute(freq, 1));
  const mesh = new THREE.InstancedMesh(geo, fishMaterial(asset.tex, matOpts), count);
  mesh.frustumCulled = false;
  mesh.name = 'fish-' + species;
  return mesh;
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// 位置・向き（前方ベクトル）・大きさから行列を作って書き込む
export function writeFishMatrix(mesh, i, px, py, pz, fx, fy, fz, s, roll = 0) {
  _z.set(fx, fy, fz);
  const l = _z.length();
  if (l < 1e-5) _z.set(0, 0, 1);
  else _z.multiplyScalar(1 / l);
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  if (roll) {
    const c = Math.cos(roll), sn = Math.sin(roll);
    const xx = _x.x * c + _y.x * sn, xy = _x.y * c + _y.y * sn, xz = _x.z * c + _y.z * sn;
    const yx = _y.x * c - _x.x * sn, yy = _y.y * c - _x.y * sn, yz = _y.z * c - _x.z * sn;
    _x.set(xx, xy, xz);
    _y.set(yx, yy, yz);
  }
  const e = mesh.instanceMatrix.array;
  const o = i * 16;
  e[o] = _x.x * s; e[o + 1] = _x.y * s; e[o + 2] = _x.z * s; e[o + 3] = 0;
  e[o + 4] = _y.x * s; e[o + 5] = _y.y * s; e[o + 6] = _y.z * s; e[o + 7] = 0;
  e[o + 8] = _z.x * s; e[o + 9] = _z.y * s; e[o + 10] = _z.z * s; e[o + 11] = 0;
  e[o + 12] = px; e[o + 13] = py; e[o + 14] = pz; e[o + 15] = 1;
}

export class School {
  // o: { species, count, size:[a,b], home:Vector3, radius, yMin, yMax, speed:[a,b], neighbor, sep, align, coh,
  //      flee, fleeR, swirl, wander, homeMove(t) }
  constructor(world, o) {
    this.world = world;
    this.o = Object.assign(
      { size: [1, 1], radius: 6, speed: [0.4, 1.4], neighbor: 2.2, sep: 0.6, align: 1.2, coh: 0.9, flee: 3, fleeR: 3, swirl: 0, wander: 0.4, homePull: 0.8, avoid: 6, glow: 0 },
      o
    );
    const N = (this.n = o.count);
    this.species = o.species;
    this.mesh = makeFishMesh(o.species, N, { spec: o.spec, env: o.env, emissive: o.glow });
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.scale = new Float32Array(N);
    this.avoid = new Float32Array(N * 3);
    this.home = o.home.clone();
    this.rand = mulberry32(o.seed || Math.floor(Math.random() * 1e9));
    const R = this.rand;
    for (let i = 0; i < N; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * this.o.radius * 0.7;
      this.pos[i * 3] = this.home.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = this.home.y + (R() - 0.5) * 2;
      this.pos[i * 3 + 2] = this.home.z + Math.sin(a) * r;
      const va = R() * Math.PI * 2;
      this.vel[i * 3] = Math.cos(va) * this.o.speed[0];
      this.vel[i * 3 + 2] = Math.sin(va) * this.o.speed[0];
      this.scale[i] = this.o.size[0] + R() * (this.o.size[1] - this.o.size[0]);
    }
    this.frame = 0;
    this.t = R() * 100;
    this.aSwim = this.mesh.geometry.attributes.aSwim;
    this.aFreq = this.mesh.geometry.attributes.aFreq;
    this.size = (this.o.size[0] + this.o.size[1]) / 2;
    this.visible = true;
  }

  update(dt, ctx) {
    const o = this.o;
    const N = this.n, P = this.pos, Vv = this.vel;
    this.t += dt;
    this.frame++;
    if (o.homeMove) o.homeMove(this.t, this.home);
    // 遠くにいるときは計算を間引く
    const pp = ctx.playerPos;
    const dHome = Math.hypot(this.home.x - pp.x, this.home.z - pp.z);
    const far = dHome > 110;
    this.mesh.visible = dHome < 130;
    if (far && this.frame % 4 !== 0) return;
    const step = far ? dt * 4 : dt;
    const R2 = o.neighbor * o.neighbor;
    const sepD2 = (o.neighbor * 0.45) ** 2;
    const minS = o.speed[0], maxS = o.speed[1];
    const hx = this.home.x, hy = this.home.y, hz = this.home.z;
    const world = this.world;
    const slot = this.frame % 3;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const px = P[i3], py = P[i3 + 1], pz = P[i3 + 2];
      const vx = Vv[i3], vy = Vv[i3 + 1], vz = Vv[i3 + 2];
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const j3 = j * 3;
        const dx = P[j3] - px, dy = P[j3 + 1] - py, dz = P[j3 + 2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) continue;
        n++;
        ax += Vv[j3]; ay += Vv[j3 + 1]; az += Vv[j3 + 2];
        cx += dx; cy += dy; cz += dz;
        if (d2 < sepD2) {
          const k = 1 / Math.max(d2, 0.01);
          sx -= dx * k; sy -= dy * k; sz -= dz * k;
        }
      }
      let fx = sx * o.sep * 0.1, fy = sy * o.sep * 0.1, fz = sz * o.sep * 0.1;
      if (n > 0) {
        fx += (ax / n - vx) * o.align + (cx / n) * o.coh;
        fy += (ay / n - vy) * o.align + (cy / n) * o.coh;
        fz += (az / n - vz) * o.align + (cz / n) * o.coh;
      }
      // 住みかへ戻る力
      const hdx = hx - px, hdy = hy - py, hdz = hz - pz;
      const hd = Math.sqrt(hdx * hdx + hdz * hdz);
      if (hd > o.radius * 0.6) {
        const k = ((hd - o.radius * 0.6) / o.radius) * o.homePull;
        fx += (hdx / hd) * k * 2;
        fz += (hdz / hd) * k * 2;
      }
      fy += hdy * 0.15;
      if (py < o.yMin(px, pz)) fy += (o.yMin(px, pz) - py) * 2;
      if (py > o.yMax) fy -= (py - o.yMax) * 2;
      // 渦（ギンガメアジのトルネード）
      if (o.swirl) {
        const rx = px - hx, rz = pz - hz;
        const rl = Math.hypot(rx, rz) + 0.01;
        fx += (-rz / rl) * o.swirl;
        fz += (rx / rl) * o.swirl;
        fx -= (rx / rl) * (rl - o.radius * 0.5) * 0.15;
        fz -= (rz / rl) * (rl - o.radius * 0.5) * 0.15;
      }
      // ゆらぎ
      const w = o.wander;
      fx += Math.sin(this.t * 0.7 + i * 1.7) * w;
      fy += Math.sin(this.t * 0.5 + i * 2.3) * w * 0.3;
      fz += Math.cos(this.t * 0.6 + i * 1.3) * w;
      // 障害物（3 フレームに一度、前方を調べる）
      if (!far && i % 3 === slot) {
        const lx = px + vx * 0.9, ly = py + vy * 0.9, lz = pz + vz * 0.9;
        const d = world.solidDistance(lx, ly, lz);
        if (d < 1.2) {
          const nn = world.solidNormal(lx, ly, lz);
          const k = (1.2 - d) * o.avoid;
          this.avoid[i3] = nn.x * k; this.avoid[i3 + 1] = nn.y * k; this.avoid[i3 + 2] = nn.z * k;
        } else {
          this.avoid[i3] *= 0.3; this.avoid[i3 + 1] *= 0.3; this.avoid[i3 + 2] *= 0.3;
        }
      }
      fx += this.avoid[i3]; fy += this.avoid[i3 + 1]; fz += this.avoid[i3 + 2];
      // ダイバーから逃げる
      const ex = px - pp.x, ey = py - pp.y, ez = pz - pp.z;
      const ed = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (ed < o.fleeR) {
        const k = ((o.fleeR - ed) / o.fleeR) * o.flee * (1 + ctx.playerSpeed * 0.5);
        fx += (ex / (ed + 0.01)) * k * 3;
        fy += (ey / (ed + 0.01)) * k * 1.5;
        fz += (ez / (ed + 0.01)) * k * 3;
      }
      let nvx = vx + fx * step, nvy = vy + fy * step, nvz = vz + fz * step;
      let sp = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz);
      const cap = ed < o.fleeR ? maxS * 1.8 : maxS;
      if (sp > cap) { nvx *= cap / sp; nvy *= cap / sp; nvz *= cap / sp; sp = cap; }
      if (sp < minS) { const k = minS / Math.max(sp, 1e-4); nvx *= k; nvy *= k; nvz *= k; sp = minS; }
      nvy *= 0.96;
      Vv[i3] = nvx; Vv[i3 + 1] = nvy; Vv[i3 + 2] = nvz;
      P[i3] = px + nvx * step;
      P[i3 + 1] = py + nvy * step;
      P[i3 + 2] = pz + nvz * step;
      if (P[i3 + 1] > -0.4) P[i3 + 1] = -0.4;
      writeFishMatrix(this.mesh, i, P[i3], P[i3 + 1], P[i3 + 2], nvx, nvy * 0.6, nvz, this.scale[i]);
      this.aSwim.array[i] = 0.35 + Math.min(1.2, sp / maxS) * 0.75;
      this.aFreq.array[i] = 5 + (sp / maxS) * 9 / Math.max(0.4, Math.sqrt(this.scale[i] * 3));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aSwim.needsUpdate = true;
    this.aFreq.needsUpdate = true;
  }

  // 写真判定・レーダー用
  forEach(fn) {
    if (!this.mesh.visible) return;
    const P = this.pos;
    for (let i = 0; i < this.n; i++) fn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], this.scale[i]);
  }
}
