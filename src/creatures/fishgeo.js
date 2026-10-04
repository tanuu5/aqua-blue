// 魚の形を数値から作る。体は楕円の輪をつないだ筒、ひれは平たい板。
// ローカル座標：+Z が頭（鼻先 z=+0.5）、尾びれの先が z=-0.5。体長 1 に正規化。
// 属性 aBody（鼻先 0 → 尾の先 1）で泳ぎのうねりをつける。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { dataTexture } from '../world/textures.js';
import { Noise, clamp, smoothstep } from '../core/noise.js';

const TAIL_BASE = 0.82; // 体の長さのうち、尾びれの付け根までの割合
const zAt = (s) => 0.5 - s * TAIL_BASE; // s: 0 鼻先 → 1 尾の付け根

function bodyShape(s, hump = 0) {
  const a = Math.pow(Math.sin(Math.PI * Math.pow(clamp(s, 0, 1), 0.55)), 0.65) * (1 - 0.74 * s) + 0.085 * s;
  return a + hump * Math.exp(-Math.pow((s - 0.14) / 0.08, 2));
}

// 平らな多角形（z, y の点列）を x=0 の板にする
function flatPoly(pts, x = 0, bodyOf = null, uv = [0.97, 0.5]) {
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [], body = [], uvs = [];
  for (const t of tris) {
    for (const k of t) {
      const [z, y] = pts[k];
      pos.push(x, y, z);
      body.push(bodyOf ? bodyOf(z, y) : clamp((0.5 - z), 0, 1));
      uvs.push(uv[0], clamp(uv[1] + y * 0.3, 0.02, 0.98));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

function tailPoly(type, size, yc, ph) {
  const z0 = zAt(1) + 0.01;
  const L = size;
  const h = ph;
  switch (type) {
    case 'fork':
      return [[z0, yc + h], [z0 - L * 0.95, yc + L * 0.75], [z0 - L * 0.8, yc + L * 0.6], [z0 - L * 0.42, yc], [z0 - L * 0.8, yc - L * 0.6], [z0 - L * 0.95, yc - L * 0.75], [z0, yc - h]];
    case 'lunate':
      return [[z0, yc + h], [z0 - L * 1.0, yc + L * 0.95], [z0 - L * 0.7, yc + L * 0.55], [z0 - L * 0.55, yc], [z0 - L * 0.7, yc - L * 0.55], [z0 - L * 1.0, yc - L * 0.95], [z0, yc - h]];
    case 'round':
      return [[z0, yc + h], [z0 - L * 0.5, yc + L * 0.5], [z0 - L * 0.85, yc + L * 0.3], [z0 - L * 0.95, yc], [z0 - L * 0.85, yc - L * 0.3], [z0 - L * 0.5, yc - L * 0.5], [z0, yc - h]];
    case 'shark':
      return [[z0, yc + h], [z0 - L * 0.55, yc + L * 0.9], [z0 - L * 0.75, yc + L * 0.85], [z0 - L * 0.5, yc + L * 0.2], [z0 - L * 0.42, yc - L * 0.05], [z0 - L * 0.5, yc - L * 0.45], [z0 - L * 0.3, yc - L * 0.42], [z0, yc - h]];
    default: // truncate
      return [[z0, yc + h], [z0 - L * 0.75, yc + L * 0.62], [z0 - L * 0.82, yc], [z0 - L * 0.75, yc - L * 0.62], [z0, yc - h]];
  }
}

// 模様のテクスチャ（u: 鼻先→尾、v: 腹→背）。右端の列はひれの色
function patternTexture(fn, finFn) {
  const W = 192, H = 96;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1), v = y / (H - 1);
      let c;
      if (u > 0.94) c = finFn(v);
      else c = fn(u / 0.92, v);
      const i = (y * W + x) * 4;
      data[i] = clamp(c[0], 0, 1) * 255;
      data[i + 1] = clamp(c[1], 0, 1) * 255;
      data[i + 2] = clamp(c[2], 0, 1) * 255;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, W, H, { srgb: true, repeat: false });
}

export function buildFish(def) {
  const H = def.height, Wd = def.width;
  const hump = def.hump || 0;
  const rings = 22, around = 14;
  const pos = [], uvs = [], body = [], idx = [];
  const centerY = (s) => (def.centerLift || 0) * Math.sin(Math.PI * s);
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const sh = bodyShape(s, hump);
    const hh = H * sh * (def.heightMul ? def.heightMul(s) : 1);
    const ww = Wd * Math.pow(sh, 0.9) * (def.widthMul ? def.widthMul(s) : 1);
    const z = zAt(s);
    for (let j = 0; j <= around; j++) {
      const th = (j / around) * Math.PI * 2;
      const y = centerY(s) + Math.cos(th) * hh;
      const x = Math.sin(th) * ww;
      pos.push(x, y, z);
      uvs.push(s * 0.92, 0.5 + Math.cos(th) * 0.5);
      body.push(s * TAIL_BASE);
    }
  }
  const row = around + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 1));
  g.setIndex(idx);
  // 背中の継ぎ目の頂点をまとめてから法線を出す（継ぎ目が見えないように）
  g = mergeVertices(g);
  g.computeVertexNormals();
  g = g.toNonIndexed();
  const parts = [g];

  const bodyAt = (z) => clamp(0.5 - z, 0, 1);
  const topAt = (s) => centerY(s) + H * bodyShape(s, hump) * (def.heightMul ? def.heightMul(s) : 1);
  const botAt = (s) => centerY(s) - H * bodyShape(s, hump) * (def.heightMul ? def.heightMul(s) : 1);

  // 尾びれ
  const tail = def.tail || { type: 'fork', size: 0.2 };
  const ph = H * bodyShape(1, hump) * 0.9;
  parts.push(flatPoly(tailPoly(tail.type, tail.size, centerY(1), ph), 0, (z) => bodyAt(z), [0.97, 0.5]));

  // 背びれ
  for (const d of def.dorsal || []) {
    const pts = [];
    const n = 8;
    for (let k = 0; k <= n; k++) {
      const s = d.s0 + (d.s1 - d.s0) * (k / n);
      pts.push([zAt(s), topAt(s) - 0.004]);
    }
    for (let k = n; k >= 0; k--) {
      const t = k / n;
      const s = d.s0 + (d.s1 - d.s0) * t;
      const hgt = d.h * (d.profile ? d.profile(t) : Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)));
      pts.push([zAt(s) - (d.sweep || 0.03) * hgt / Math.max(d.h, 1e-3), topAt(s) + hgt]);
    }
    parts.push(flatPoly(pts, 0, (z) => bodyAt(z), [0.97, 0.85]));
  }
  // しりびれ
  for (const d of def.anal || []) {
    const pts = [];
    const n = 6;
    for (let k = 0; k <= n; k++) {
      const s = d.s0 + (d.s1 - d.s0) * (k / n);
      pts.push([zAt(s), botAt(s) + 0.004]);
    }
    for (let k = n; k >= 0; k--) {
      const t = k / n;
      const s = d.s0 + (d.s1 - d.s0) * t;
      const hgt = d.h * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
      pts.push([zAt(s) - 0.03 * hgt / Math.max(d.h, 1e-3), botAt(s) - hgt]);
    }
    parts.push(flatPoly(pts, 0, (z) => bodyAt(z), [0.97, 0.2]));
  }
  // 胸びれ（左右）
  if (def.pectoral) {
    const p = def.pectoral;
    const s = p.s;
    const z = zAt(s);
    const yb = centerY(s) - H * bodyShape(s, hump) * 0.25;
    for (const side of [1, -1]) {
      const fin = flatPoly(
        [[z + 0.01, yb + p.len * 0.25], [z - p.len, yb + p.len * 0.1], [z - p.len * 0.85, yb - p.len * 0.35], [z, yb - p.len * 0.12]],
        0,
        (zz) => bodyAt(zz),
        [0.97, 0.45]
      );
      fin.rotateZ(side * (p.angle ?? 0.9));
      const ww = Wd * Math.pow(bodyShape(s, hump), 0.9);
      fin.translate(side * ww * 0.9, 0, 0);
      parts.push(fin);
    }
  }
  // 目
  if (def.eye !== false) {
    const e = def.eye || {};
    const s = e.s ?? 0.12;
    const r = e.r ?? 0.03;
    const sh = bodyShape(s, hump);
    for (const side of [1, -1]) {
      const eye = new THREE.SphereGeometry(r, 8, 6);
      eye.scale(0.45, 1, 1);
      const ww = Wd * Math.pow(sh, 0.9);
      eye.translate(side * ww * 0.92, centerY(s) + H * sh * (e.t ?? 0.3), zAt(s));
      const ne = eye.toNonIndexed();
      const n = ne.attributes.position.count;
      ne.setAttribute('aBody', new THREE.Float32BufferAttribute(new Float32Array(n).fill(s * TAIL_BASE), 1));
      const uv = new Float32Array(n * 2);
      for (let k = 0; k < n; k++) { uv[k * 2] = 0.985; uv[k * 2 + 1] = 0.995; }
      ne.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      parts.push(ne);
    }
  }
  if (def.extra) for (const x of def.extra({ zAt, topAt, botAt, bodyShape, H, Wd })) parts.push(x);

  const merged = mergeGeometries(parts.map((p) => {
    if (p.index) p = p.toNonIndexed();
    if (!p.attributes.normal) p.computeVertexNormals();
    return p;
  }));
  merged.computeBoundingSphere();
  const tex = patternTexture(def.pattern, (v) => (v > 0.985 ? [0.02, 0.02, 0.03] : def.fin(v)));
  return { geo: merged, tex };
}

// ---- 種ごとの形と模様 ----------------------------------------------------------
const nz = new Noise(4321);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const band = (u, c, w) => 1 - smoothstep(w * 0.7, w, Math.abs(u - c));

export const FISH_DEFS = {
  anthias: {
    height: 0.17, width: 0.065,
    tail: { type: 'lunate', size: 0.2 },
    dorsal: [{ s0: 0.22, s1: 0.85, h: 0.07 }],
    anal: [{ s0: 0.6, s1: 0.85, h: 0.06 }],
    pectoral: { s: 0.3, len: 0.12 },
    eye: { s: 0.1, r: 0.032, t: 0.35 },
    pattern: (u, v) => {
      let c = mix([1.0, 0.62, 0.55], [1.0, 0.42, 0.18], v);
      // 目の下の紫の線
      const line = band(v, 0.42 + u * 0.1, 0.05) * (u < 0.3 ? 1 : 0);
      c = mix(c, [0.75, 0.4, 0.9], line);
      return c;
    },
    fin: (v) => mix([1.0, 0.5, 0.3], [1.0, 0.75, 0.3], v),
  },
  damsel: {
    height: 0.22, width: 0.08,
    tail: { type: 'fork', size: 0.18 },
    dorsal: [{ s0: 0.2, s1: 0.85, h: 0.07 }],
    anal: [{ s0: 0.55, s1: 0.85, h: 0.06 }],
    pectoral: { s: 0.3, len: 0.11 },
    eye: { s: 0.1, r: 0.035, t: 0.32 },
    pattern: (u, v) => mix([0.25, 0.55, 1.0], [0.05, 0.25, 0.95], v),
    fin: (v) => [0.15, 0.4, 1.0],
  },
  clown: {
    height: 0.21, width: 0.1,
    tail: { type: 'round', size: 0.17 },
    dorsal: [{ s0: 0.2, s1: 0.5, h: 0.06 }, { s0: 0.52, s1: 0.86, h: 0.07 }],
    anal: [{ s0: 0.6, s1: 0.86, h: 0.07 }],
    pectoral: { s: 0.3, len: 0.12 },
    eye: { s: 0.1, r: 0.035, t: 0.3 },
    pattern: (u) => {
      let c = [1.0, 0.42, 0.04];
      for (const [cc, w] of [[0.16, 0.06], [0.5, 0.08], [0.88, 0.04]]) {
        const edge = band(u, cc, w + 0.02) - band(u, cc, w);
        c = mix(c, [0.02, 0.02, 0.02], edge);
        c = mix(c, [1, 1, 1], band(u, cc, w));
      }
      return c;
    },
    fin: (v) => [1.0, 0.45, 0.05],
  },
  tang: {
    height: 0.3, width: 0.075,
    tail: { type: 'truncate', size: 0.17 },
    dorsal: [{ s0: 0.15, s1: 0.88, h: 0.05 }],
    anal: [{ s0: 0.45, s1: 0.88, h: 0.05 }],
    pectoral: { s: 0.3, len: 0.13 },
    eye: { s: 0.13, r: 0.03, t: 0.25 },
    pattern: (u, v) => {
      let c = [0.12, 0.3, 0.95];
      // 黒い「パレット」模様
      const p = band(v, 0.62 - u * 0.15, 0.17) * smoothstep(0.08, 0.2, u) * (1 - smoothstep(0.85, 1.0, u));
      const hole = band(v, 0.62 - u * 0.15, 0.08) * band(u, 0.45, 0.18);
      c = mix(c, [0.02, 0.02, 0.05], p * (1 - hole));
      c = mix(c, [1.0, 0.85, 0.1], smoothstep(0.92, 1.0, u));
      return c;
    },
    fin: (v) => (v < 0.6 ? [0.1, 0.25, 0.9] : [0.05, 0.05, 0.1]),
  },
  idol: {
    height: 0.42, width: 0.06,
    heightMul: (s) => 1 + 0.15 * Math.sin(Math.PI * s),
    tail: { type: 'lunate', size: 0.18 },
    dorsal: [{ s0: 0.22, s1: 0.55, h: 0.75, sweep: 0.45, profile: (t) => (t < 0.25 ? t * 4 * 0.35 + 0.05 : Math.max(0.05, 1 - (t - 0.25) * 1.3)) }],
    anal: [{ s0: 0.4, s1: 0.75, h: 0.18 }],
    pectoral: { s: 0.3, len: 0.1 },
    eye: { s: 0.17, r: 0.028, t: 0.15 },
    pattern: (u, v) => {
      let c = [0.96, 0.96, 0.92];
      c = mix(c, [1.0, 0.85, 0.15], smoothstep(0.55, 0.75, u));
      c = mix(c, [0.03, 0.03, 0.04], band(u, 0.26, 0.11));
      c = mix(c, [0.03, 0.03, 0.04], band(u, 0.74, 0.1));
      c = mix(c, [0.03, 0.03, 0.04], smoothstep(0.93, 0.97, u));
      c = mix(c, [1.0, 0.6, 0.2], band(u, 0.06, 0.05) * band(v, 0.55, 0.15));
      return c;
    },
    fin: (v) => (v > 0.7 ? [0.95, 0.95, 0.9] : [0.04, 0.04, 0.05]),
  },
  butterfly: {
    height: 0.4, width: 0.06,
    tail: { type: 'truncate', size: 0.14 },
    dorsal: [{ s0: 0.2, s1: 0.85, h: 0.1 }],
    anal: [{ s0: 0.45, s1: 0.85, h: 0.1 }],
    pectoral: { s: 0.3, len: 0.1 },
    eye: { s: 0.12, r: 0.025, t: 0.15 },
    pattern: (u, v) => {
      let c = mix([1.0, 0.92, 0.6], [1.0, 0.82, 0.2], v);
      const lines = Math.pow(Math.max(0, Math.sin((u * 1.2 + v * 0.8) * 40)), 6) * 0.35;
      c = mix(c, [0.5, 0.35, 0.1], lines);
      c = mix(c, [0.03, 0.03, 0.05], band(u, 0.12, 0.05) * smoothstep(0.1, 0.25, v));
      c = mix(c, [0.08, 0.06, 0.05], band(u, 0.78, 0.07) * band(v, 0.78, 0.1));
      return c;
    },
    fin: (v) => [1.0, 0.85, 0.2],
  },
  fusilier: {
    height: 0.15, width: 0.07,
    tail: { type: 'fork', size: 0.22 },
    dorsal: [{ s0: 0.25, s1: 0.75, h: 0.05 }],
    anal: [{ s0: 0.62, s1: 0.82, h: 0.04 }],
    pectoral: { s: 0.3, len: 0.1 },
    eye: { s: 0.1, r: 0.03, t: 0.3 },
    pattern: (u, v) => {
      let c = mix([0.88, 0.9, 0.95], [0.25, 0.55, 0.85], smoothstep(0.35, 0.75, v));
      c = mix(c, [1.0, 0.85, 0.2], band(v, 0.62, 0.05) * smoothstep(0.15, 0.3, u));
      c = mix(c, [1.0, 0.85, 0.2], band(v, 0.45, 0.03) * smoothstep(0.3, 0.45, u));
      return c;
    },
    fin: (v) => (v > 0.85 || v < 0.15 ? [0.15, 0.15, 0.2] : [0.7, 0.75, 0.85]),
  },
  trevally: {
    height: 0.2, width: 0.085,
    tail: { type: 'lunate', size: 0.24 },
    dorsal: [{ s0: 0.3, s1: 0.42, h: 0.08 }, { s0: 0.48, s1: 0.82, h: 0.07, profile: (t) => (t < 0.2 ? t * 5 : 1 - (t - 0.2) * 1.1) }],
    anal: [{ s0: 0.55, s1: 0.82, h: 0.07 }],
    pectoral: { s: 0.28, len: 0.18, angle: 1.2 },
    eye: { s: 0.1, r: 0.034, t: 0.32 },
    pattern: (u, v) => {
      let c = mix([0.92, 0.94, 0.96], [0.42, 0.5, 0.58], smoothstep(0.45, 0.85, v));
      // 側線の小さなうろこ（稜鱗）
      c = mix(c, [0.55, 0.6, 0.62], band(v, 0.52, 0.03) * smoothstep(0.65, 0.8, u));
      return c;
    },
    fin: (v) => (v > 0.8 ? [0.85, 0.88, 0.9] : [0.25, 0.3, 0.35]),
  },
  sweeper: {
    height: 0.24, width: 0.08,
    tail: { type: 'fork', size: 0.18 },
    dorsal: [{ s0: 0.3, s1: 0.5, h: 0.12 }],
    anal: [{ s0: 0.5, s1: 0.85, h: 0.07 }],
    pectoral: { s: 0.3, len: 0.1 },
    eye: { s: 0.1, r: 0.045, t: 0.25 },
    pattern: (u, v) => mix([1.0, 0.8, 0.45], [0.95, 0.55, 0.15], v),
    fin: (v) => [1.0, 0.75, 0.4],
  },
  puffer: {
    height: 0.24, width: 0.21,
    heightMul: (s) => 1 + 0.15 * Math.sin(Math.PI * s),
    tail: { type: 'round', size: 0.16 },
    dorsal: [{ s0: 0.72, s1: 0.86, h: 0.07 }],
    anal: [{ s0: 0.72, s1: 0.86, h: 0.07 }],
    pectoral: { s: 0.3, len: 0.12, angle: 1.3 },
    eye: { s: 0.14, r: 0.055, t: 0.42 },
    pattern: (u, v) => {
      let c = mix([0.96, 0.94, 0.88], [0.62, 0.5, 0.32], smoothstep(0.35, 0.6, v));
      const sp = nz.n2(u * 22, v * 14);
      c = mix(c, [0.2, 0.14, 0.08], smoothstep(0.55, 0.7, sp) * smoothstep(0.35, 0.5, v));
      return c;
    },
    fin: (v) => [0.75, 0.65, 0.45],
    extra: ({ zAt, bodyShape, H, Wd }) => {
      // トゲ（ふくらむと目立つ）
      const out = [];
      for (let i = 0; i < 70; i++) {
        const s = 0.12 + (i % 10) * 0.07;
        const th = (Math.floor(i / 10) / 7) * Math.PI * 2 + s * 3;
        const sh = bodyShape(s) * (1 + 0.15 * Math.sin(Math.PI * s));
        const y = Math.cos(th) * H * sh, x = Math.sin(th) * Wd * sh;
        const n = new THREE.Vector3(x / Wd, y / H, 0).normalize();
        const g = new THREE.ConeGeometry(0.008, 0.05, 4);
        g.translate(0, 0.025, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, -0.5).normalize()));
        g.translate(x, y, zAt(s));
        const ng = g.toNonIndexed();
        const cnt = ng.attributes.position.count;
        ng.setAttribute('aBody', new THREE.Float32BufferAttribute(new Float32Array(cnt).fill(s * 0.8), 1));
        const uv = new Float32Array(cnt * 2);
        for (let k = 0; k < cnt; k++) { uv[k * 2] = 0.97; uv[k * 2 + 1] = 0.5; }
        ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        out.push(ng);
      }
      return out;
    },
  },
  napoleon: {
    height: 0.27, width: 0.13,
    hump: 0.07,
    tail: { type: 'round', size: 0.17 },
    dorsal: [{ s0: 0.25, s1: 0.88, h: 0.06 }],
    anal: [{ s0: 0.58, s1: 0.88, h: 0.07 }],
    pectoral: { s: 0.3, len: 0.13, angle: 1.0 },
    eye: { s: 0.12, r: 0.022, t: 0.25 },
    pattern: (u, v) => {
      let c = mix([0.45, 0.68, 0.6], [0.2, 0.45, 0.5], v);
      const maze = Math.abs(nz.n2(u * 30, v * 18));
      c = mix(c, [0.12, 0.28, 0.3], smoothstep(0.08, 0.0, maze) * 0.8);
      c = mix(c, [0.55, 0.75, 0.55], band(u, 0.06, 0.06) * 0.5);
      return c;
    },
    fin: (v) => [0.25, 0.5, 0.48],
  },
  whitetip: {
    height: 0.1, width: 0.1,
    heightMul: (s) => (s < 0.15 ? 0.75 + s * 1.7 : 1),
    tail: { type: 'shark', size: 0.26 },
    dorsal: [{ s0: 0.36, s1: 0.5, h: 0.11, sweep: 0.08, profile: (t) => (t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) * 1.4)) }, { s0: 0.76, s1: 0.82, h: 0.04 }],
    anal: [{ s0: 0.76, s1: 0.82, h: 0.035 }],
    pectoral: { s: 0.3, len: 0.2, angle: 1.35 },
    eye: { s: 0.08, r: 0.012, t: 0.2 },
    pattern: (u, v) => mix([0.95, 0.95, 0.92], [0.42, 0.45, 0.48], smoothstep(0.38, 0.55, v)),
    fin: (v) => (v > 0.9 ? [0.95, 0.95, 0.95] : [0.4, 0.43, 0.46]),
  },
  whaleshark: {
    height: 0.085, width: 0.12,
    heightMul: (s) => (s < 0.12 ? 0.85 : 1) * (1 + 0.25 * Math.sin(Math.PI * s)),
    widthMul: (s) => (s < 0.2 ? 1.25 - s : 1),
    tail: { type: 'shark', size: 0.24 },
    dorsal: [{ s0: 0.42, s1: 0.56, h: 0.08, sweep: 0.06, profile: (t) => (t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) * 1.4)) }, { s0: 0.78, s1: 0.83, h: 0.03 }],
    anal: [{ s0: 0.78, s1: 0.83, h: 0.03 }],
    pectoral: { s: 0.28, len: 0.16, angle: 1.3 },
    eye: { s: 0.06, r: 0.008, t: 0.0 },
    pattern: (u, v) => {
      let c = mix([0.88, 0.9, 0.9], [0.18, 0.24, 0.32], smoothstep(0.32, 0.5, v));
      if (v > 0.38) {
        const gx = u * 46, gy = v * 22;
        const cx = Math.floor(gx) + 0.5, cy = Math.floor(gy) + 0.5;
        const d = Math.hypot(gx - cx, gy - cy);
        c = mix(c, [0.82, 0.85, 0.85], smoothstep(0.32, 0.22, d));
        // 白い縦じま
        c = mix(c, [0.7, 0.74, 0.76], Math.pow(Math.max(0, Math.cos(u * 46 * Math.PI)), 30) * 0.6);
      }
      return c;
    },
    fin: (v) => [0.2, 0.26, 0.33],
  },
};
