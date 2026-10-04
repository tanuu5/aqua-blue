// 符号付き距離場（SDF）で作る立体：島（アーチ・浜・洞窟つき）とマンタの根の岩の塔。
// Surface Nets でメッシュにし、同じ格子を当たり判定にも使う。
import * as THREE from 'three';
import { Noise, clamp, lerp, smoothstep } from '../core/noise.js';
import { ISLAND, CAVE, REEF } from './layout.js';

const nz = new Noise(9001);

const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
};
const smax = (a, b, k) => -smin(-a, -b, k);

function sdCapsule(px, py, pz, a, b, r) {
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

// 楕円体の近似距離
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x1 = x / r[0], y1 = y / r[1], z1 = z / r[2];
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
}

// ---- 島 -------------------------------------------------------------------
const IC = [ISLAND.x, 0, ISLAND.z];
// アーチは島の西の端から西北西へ伸びる岩の橋。南西（ボート側）から見ると穴の向こうに海が抜ける
const ARCH_A = [ISLAND.x - 50, 14, ISLAND.z + 8];
const ARCH_B = [ISLAND.x - 74, 13, ISLAND.z - 12];
const STACK_A = [ARCH_B[0], -26, ARCH_B[2]];
const STACK_B = [ARCH_B[0] + 1, 14, ARCH_B[2] - 1];
const STACK2_A = [ISLAND.x + 58, -26, ISLAND.z + 18];
const STACK2_B = [ISLAND.x + 58, 14, ISLAND.z + 18];

const E_OUT = [42, -19.5, -22];
const E0 = CAVE.entrance;
const BEND = CAVE.bend;
const CH = CAVE.chamber;
const WIN = CAVE.window;
const W_OUT = [81, -14.5, -104];
const SHAFT_A = [CH[0] + 2, CH[1] + 6, CH[2] - 1];
const SHAFT_B = [CH[0] + 4, 45, CH[2] - 3];

function caveSDF(x, y, z) {
  let c = sdCapsule(x, y, z, E_OUT, E0, 6.2);
  c = smin(c, sdCapsule(x, y, z, E0, BEND, 5.6), 3);
  c = smin(c, sdCapsule(x, y, z, BEND, CH, 6.0), 3);
  c = smin(c, sdEllipsoid(x, y, z, CH, [14, 8.5, 13]), 4);
  c = smin(c, sdCapsule(x, y, z, CH, WIN, 6.4), 3);
  c = smin(c, sdCapsule(x, y, z, WIN, W_OUT, 8.5), 4);
  c = smin(c, sdCapsule(x, y, z, SHAFT_A, SHAFT_B, 3.4), 2.5);
  return c;
}

// y に依存しない量は (x, z) の列ごとに一度だけ計算する
const COL = { rr: 0, rf: 1, top: 0, sector: 0, bh: 0, strataPh: 0, archR: 0 };
export function islandColumn(x, z, c = COL) {
  const dx = x - IC[0], dz = z - IC[2];
  const rr = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  c.rr = rr;
  c.rf = 1 + 0.15 * nz.fbm2(Math.cos(ang) * 1.4 + 10, Math.sin(ang) * 1.4 + 3, 3);
  c.top = 31 + nz.fbm2(dx * 0.028, dz * 0.028, 3) * 8 - smoothstep(18, 46, rr) * 4;
  let da = Math.abs(ang - 1.05);
  da = Math.min(da, Math.PI * 2 - da);
  c.sector = smoothstep(0.55, 0.25, da);
  c.bh = 1.6 - Math.max(rr - 36, 0) * 0.16 - Math.max(rr - 52, 0) * 0.45;
  c.strataPh = nz.n2(x * 0.05, z * 0.05) * 2.5;
  const am = Math.hypot(x - (ARCH_A[0] + ARCH_B[0]) / 2, z - (ARCH_A[2] + ARCH_B[2]) / 2);
  c.archR = 5.2 + 3.2 * smoothstep(3, 15, am);
  return c;
}

function islandBase(x, y, z, c) {
  let r = y < 0 ? lerp(46, 57, clamp(-y / 30, 0, 1)) : 46 - y * 0.05 - Math.max(y - 21, 0) * 0.9;
  r *= c.rf;
  let d = (c.rr - r) * 0.72;
  d = smax(d, y - c.top, 5);
  // 浜（南東側のなだらかな砂の斜面）
  if (c.sector > 0) {
    const db = (y - c.bh) * 0.85 + (1 - c.sector) * 30;
    d = smin(d, db, 4);
  }
  // アーチ：島から伸びる岩の橋と、その先の岩柱
  d = smin(d, sdCapsule(x, y, z, ARCH_A, ARCH_B, c.archR), 4);
  d = smin(d, sdCapsule(x, y, z, STACK_A, STACK_B, 8 - (y > 0 ? y * 0.12 : 0)), 5);
  d = smin(d, sdCapsule(x, y, z, STACK2_A, STACK2_B, 6 - (y > 0 ? y * 0.2 : 0)), 3);
  return d;
}

export function islandSDF(x, y, z, col) {
  const c = col || islandColumn(x, z);
  let d = islandBase(x, y, z, c);
  let cave = caveSDF(x, y, z);
  // 表面から遠ければ細かいノイズは省く（生成を速くするため）
  if (cave > 9 && (d > 9 || d < -9)) return d;
  const n = nz.fbm3(x * 0.055, y * 0.055, z * 0.055, 3) * 4.2 + nz.n3(x * 0.17, y * 0.17, z * 0.17) * 1.1;
  const strata = Math.sin(y * 1.15 + c.strataPh) * 0.45 * smoothstep(-4, 4, y);
  d += n + strata;
  if (cave < 12) {
    cave += nz.fbm3(x * 0.12 + 5, y * 0.12, z * 0.12, 2) * 1.6;
    d = smax(d, -cave, 2.2);
  }
  return d;
}

// 浜（島の南東側）かどうか
export function isBeach(x, z) {
  const ang = Math.atan2(z - IC[2], x - IC[0]);
  let da = Math.abs(ang - 1.05);
  da = Math.min(da, Math.PI * 2 - da);
  const rr = Math.hypot(x - IC[0], z - IC[2]);
  return da < 0.5 && rr > 28;
}

export const ISLAND_BOX = { min: [6, -36, -118], max: [172, 46, 28], cell: 1.15 };

// ---- マンタの根（岩の塔と、西側を囲む岩壁）-------------------------------
export const PINNACLES = [
  { x: REEF.x - 4, z: REEF.z - 2, r0: 11, top: -9, r1: 4.6, s: 1 },
  { x: REEF.x + 17, z: REEF.z + 14, r0: 7.5, top: -13.5, r1: 3.4, s: 2 },
  { x: REEF.x - 19, z: REEF.z + 19, r0: 7, top: -15, r1: 3.2, s: 3 },
  { x: REEF.x + 9, z: REEF.z - 22, r0: 9.5, top: -12, r1: 4.4, s: 4 },
  { x: REEF.x - 25, z: REEF.z - 13, r0: 7, top: -14, r1: 3, s: 5 },
  { x: REEF.x + 27, z: REEF.z - 8, r0: 5.5, top: -18, r1: 2.6, s: 6 },
  { x: REEF.x - 9, z: REEF.z + 30, r0: 5.5, top: -17.5, r1: 2.4, s: 7 },
];
const RIDGE = [
  [REEF.x + 30, -24.5, REEF.z + 33],
  [REEF.x + 8, -23.5, REEF.z + 42],
  [REEF.x - 17, -22.5, REEF.z + 36],
  [REEF.x - 35, -22, REEF.z + 15],
  [REEF.x - 41, -22.5, REEF.z - 11],
  [REEF.x - 31, -23.5, REEF.z - 36],
  [REEF.x - 10, -24.5, REEF.z - 46],
];
// 塔 4 番には穴（くぐれるアーチ）
const HOLE_A = [REEF.x + 9 - 10, -21, REEF.z - 22 + 3];
const HOLE_B = [REEF.x + 9 + 10, -20, REEF.z - 22 - 3];

export function reefSDF(x, y, z) {
  let d = 1e9;
  for (const p of PINNACLES) {
    const t = clamp((y + 30) / (p.top + 30), 0, 1);
    const bulge = 1 + 0.22 * nz.n2(y * 0.16 + p.s * 7.1, p.s * 3.3);
    const r = lerp(p.r0, p.r1, Math.pow(t, 0.7)) * bulge;
    const dd = (Math.hypot(x - p.x, z - p.z) - r) * 0.8;
    d = smin(d, smax(dd, y - p.top, 2.0), 3.5);
  }
  for (let i = 0; i < RIDGE.length - 1; i++) {
    const a = RIDGE[i], b = RIDGE[i + 1];
    const rr = 7 + 2.2 * nz.n2(x * 0.04 + i, z * 0.04);
    d = smin(d, sdCapsule(x, y, z, a, b, rr), 5);
  }
  if (d > 8) return d;
  d += nz.fbm3(x * 0.09 + 3, y * 0.09, z * 0.09, 3) * 2.8;
  d += (Math.abs(nz.n3(x * 0.22, y * 0.22, z * 0.22)) - 0.3) * 1.3;
  d += Math.sin(y * 1.5 + nz.n2(x * 0.08, z * 0.08) * 2.4) * 0.35;
  d = smax(d, -(sdCapsule(x, y, z, HOLE_A, HOLE_B, 3.3) + nz.n3(x * 0.2, y * 0.2, z * 0.2)), 1.5);
  return d;
}

export const REEF_BOX = { min: [-150, -36, -78], max: [-46, -3, 28], cell: 0.9 };

// ---- 格子の生成・サンプリング ---------------------------------------------
export function buildGrid(fn, box, colFn = null) {
  const { min, max, cell } = box;
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nzz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const data = new Float32Array(nx * ny * nzz);
  for (let k = 0; k < nzz; k++) {
    const z = min[2] + k * cell;
    for (let ii = 0; ii < nx; ii++) {
      const x = min[0] + ii * cell;
      const col = colFn ? colFn(x, z) : null;
      let idx = ii + nx * ny * k;
      for (let j = 0; j < ny; j++, idx += nx) {
        data[idx] = fn(x, min[1] + j * cell, z, col);
      }
    }
  }
  // 箱の外周（底面以外）は「外側」にして、メッシュが閉じるようにする。底面は海底に埋まる
  for (let k = 0; k < nzz; k++) {
    for (let j = 1; j < ny; j++) {
      for (let ii = 0; ii < nx; ii++) {
        if (ii === 0 || ii === nx - 1 || k === 0 || k === nzz - 1 || j === ny - 1) {
          const idx = ii + nx * (j + ny * k);
          data[idx] = Math.max(data[idx], 0.5);
        }
      }
    }
  }
  return { min, cell, nx, ny, nz: nzz, data };
}

export function sampleGrid(g, x, y, z) {
  const fx = (x - g.min[0]) / g.cell, fy = (y - g.min[1]) / g.cell, fz = (z - g.min[2]) / g.cell;
  if (fx < 0 || fy < 0 || fz < 0 || fx >= g.nx - 1 || fy >= g.ny - 1 || fz >= g.nz - 1) return 1e3;
  const ix = fx | 0, iy = fy | 0, iz = fz | 0;
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const nx = g.nx, nxy = g.nx * g.ny, d = g.data;
  const i0 = ix + nx * iy + nxy * iz;
  const c000 = d[i0], c100 = d[i0 + 1], c010 = d[i0 + nx], c110 = d[i0 + nx + 1];
  const c001 = d[i0 + nxy], c101 = d[i0 + nxy + 1], c011 = d[i0 + nxy + nx], c111 = d[i0 + nxy + nx + 1];
  const c00 = c000 + (c100 - c000) * tx, c10 = c010 + (c110 - c010) * tx;
  const c01 = c001 + (c101 - c001) * tx, c11 = c011 + (c111 - c011) * tx;
  const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
  return c0 + (c1 - c0) * tz;
}

export function gridNormal(g, x, y, z, out) {
  const e = g.cell * 0.5;
  const dx = sampleGrid(g, x + e, y, z) - sampleGrid(g, x - e, y, z);
  const dy = sampleGrid(g, x, y + e, z) - sampleGrid(g, x, y - e, z);
  const dz = sampleGrid(g, x, y, z + e) - sampleGrid(g, x, y, z - e);
  const l = Math.hypot(dx, dy, dz) || 1;
  out.x = dx / l; out.y = dy / l; out.z = dz / l;
  return out;
}

function dist2(P, a, b) {
  const x = P[a * 3] - P[b * 3], y = P[a * 3 + 1] - P[b * 3 + 1], z = P[a * 3 + 2] - P[b * 3 + 2];
  return x * x + y * y + z * z;
}

// Surface Nets：符号が変わるセルごとに 1 頂点、符号が変わる辺ごとに 1 四角形
export function surfaceNets(g) {
  const { nx, ny, nz: nzz, data, min, cell } = g;
  const cx = nx - 1, cy = ny - 1, cz = nzz - 1;
  const vidx = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const idx = [];
  const v = new Float32Array(8);
  const nxy = nx * ny;
  const offs = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cornerPos = [];
  for (let i = 0; i < 8; i++) cornerPos.push([i & 1, (i >> 1) & 1, (i >> 2) & 1]);
  for (let z = 0; z < cz; z++) {
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        const base = x + nx * y + nxy * z;
        let mask = 0;
        for (let i = 0; i < 8; i++) {
          v[i] = data[base + offs[i]];
          if (v[i] < 0) mask |= 1 << i;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e][0], b = EDGES[e][1];
          if ((v[a] < 0) === (v[b] < 0)) continue;
          const t = v[a] / (v[a] - v[b]);
          const pa = cornerPos[a], pb = cornerPos[b];
          sx += pa[0] + (pb[0] - pa[0]) * t;
          sy += pa[1] + (pb[1] - pa[1]) * t;
          sz += pa[2] + (pb[2] - pa[2]) * t;
          cnt++;
        }
        const ci = x + cx * (y + cy * z);
        vidx[ci] = pos.length / 3;
        pos.push(min[0] + (x + sx / cnt) * cell, min[1] + (y + sy / cnt) * cell, min[2] + (z + sz / cnt) * cell);
        // 面：セルの最小コーナーから各軸方向に伸びる辺
        for (let axis = 0; axis < 3; axis++) {
          const cornerB = 1 << axis;
          if ((mask & 1) === ((mask >> cornerB) & 1)) continue;
          const ja = (axis + 1) % 3, ka = (axis + 2) % 3;
          const c = [x, y, z];
          if (c[ja] === 0 || c[ka] === 0) continue;
          const stepJ = ja === 0 ? 1 : ja === 1 ? cx : cx * cy;
          const stepK = ka === 0 ? 1 : ka === 1 ? cx : cx * cy;
          const q0 = ci, q1 = ci - stepJ, q2 = ci - stepJ - stepK, q3 = ci - stepK;
          const a0 = vidx[q0], a1 = vidx[q1], a2 = vidx[q2], a3 = vidx[q3];
          if (a0 < 0 || a1 < 0 || a2 < 0 || a3 < 0) continue;
          if (mask & 1) {
            idx.push(a0, a1, a2, a0, a2, a3);
          } else {
            idx.push(a0, a3, a2, a0, a2, a1);
          }
        }
      }
    }
  }
  const P = new Float32Array(pos);
  const N = new Float32Array(P.length);
  const tmp = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < P.length; i += 3) {
    gridNormal(g, P[i], P[i + 1], P[i + 2], tmp);
    N[i] = tmp.x; N[i + 1] = tmp.y; N[i + 2] = tmp.z;
  }
  // 四角形の分け方は短い対角線を選び、三角形の向きは勾配（外向き）にそろえる
  for (let q = 0; q < idx.length; q += 6) {
    const a = idx[q], b = idx[q + 1], c = idx[q + 2], d = idx[q + 5];
    const d1 = dist2(P, a, c), d2 = dist2(P, b, d);
    if (d2 < d1) {
      idx[q] = a; idx[q + 1] = b; idx[q + 2] = d;
      idx[q + 3] = b; idx[q + 4] = c; idx[q + 5] = d;
    }
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = N[a] + N[b] + N[c], ny = N[a + 1] + N[b + 1] + N[c + 1], nzv = N[a + 2] + N[b + 2] + N[c + 2];
    if (fx * nx + fy * ny + fz * nzv < 0) {
      const tt = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = tt;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
