// サンゴ礁の景観：枝サンゴ・テーブルサンゴ・ノウサンゴ・ウミウチワ・カイメン・イソギンチャク・
// 海草・ウニ・ヒトデ・シャコガイ・転がる岩。すべてコードで形を作り、インスタンスで並べる。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise, mulberry32, smoothstep, clamp } from '../core/noise.js';
import { patchUW } from '../core/uwmat.js';
import { seabedHeight, seabedNormal } from './terrain.js';
import { sampleGrid, gridNormal } from './sdf.js';
import { GARDEN, REEF, RUINS, ISLAND, BOAT } from './layout.js';
import { rockMaterial } from './rocks.js';

const nz = new Noise(555);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UPV = V(0, 1, 0);

// ---- 形づくり --------------------------------------------------------------

function colorize(geo, fn) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function prep(geo) {
  // 結合できるように属性をそろえる
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function cylinderBetween(a, b, r0, r1, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(UPV, dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return prep(g);
}

function branchingCoral(seed) {
  const rand = mulberry32(seed);
  const geos = [];
  let maxY = 0.01;
  const grow = (start, dir, len, r, depth) => {
    const end = start.clone().addScaledVector(dir, len);
    maxY = Math.max(maxY, end.y);
    geos.push(cylinderBetween(start, end, r, r * 0.72));
    if (depth === 0) {
      const tip = new THREE.SphereGeometry(r * 0.75, 6, 4);
      tip.translate(end.x, end.y, end.z);
      geos.push(prep(tip));
      return;
    }
    const kids = 2 + (rand() < 0.4 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const nd = dir.clone();
      const ax = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize();
      nd.applyAxisAngle(ax, 0.35 + rand() * 0.45);
      nd.y = Math.max(nd.y, 0.25) + 0.15;
      nd.normalize();
      grow(end, nd, len * (0.72 + rand() * 0.15), r * 0.72, depth - 1);
    }
  };
  const trunks = 4 + Math.floor(rand() * 3);
  for (let t = 0; t < trunks; t++) {
    const a = rand() * Math.PI * 2;
    const d = new THREE.Vector3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
    grow(V(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05), d, 0.28 + rand() * 0.1, 0.045, 3);
  }
  const g = mergeGeometries(geos);
  g.computeVertexNormals();
  return colorize(g, (x, y) => {
    const t = clamp(y / maxY, 0, 1);
    const v = 0.55 + t * 0.7;
    return [v, v, v];
  });
}

function tableCoral(seed) {
  const n = new Noise(seed);
  const stalk = cylinderBetween(V(0, 0, 0), V(0, 0.36, 0), 0.11, 0.07, 8);
  const plate = new THREE.CylinderGeometry(1, 1, 0.06, 72, 1);
  const p = plate.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    const lobe = 1 + 0.1 * Math.sin(a * 5 + seed) + 0.07 * Math.sin(a * 11 + seed * 2) + 0.05 * n.n2(Math.cos(a) * 3, Math.sin(a) * 3);
    const R = 0.78 * lobe * r;
    const nx = r > 1e-4 ? (x / r) * R : 0;
    const nzz = r > 1e-4 ? (z / r) * R : 0;
    // 縁が少し反り上がり、上面は細かくざらつく
    const lift = R * R * 0.1 + (y > 0 ? n.n2(nx * 9, nzz * 9) * 0.012 : 0);
    p.setXYZ(i, nx, y + 0.39 + lift, nzz);
  }
  plate.computeVertexNormals();
  const g = mergeGeometries([stalk, prep(plate)]);
  return colorize(g, (x, y, z) => {
    const v = 0.7 + Math.min(1, Math.hypot(x, z) * 1.25) * 0.45;
    return [v, v, v];
  });
}

function brainCoral(seed) {
  const g = new THREE.SphereGeometry(1, 56, 30, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const p = g.attributes.position;
  const n = new Noise(seed);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ridge = 1 - Math.abs(n.n3(x * 4.2, y * 4.2, z * 4.2));
    const lump = n.n3(x * 1.3 + 5, y * 1.3, z * 1.3) * 0.08;
    const d = 1 + Math.pow(ridge, 3) * 0.06 + lump;
    x *= d; y *= d; z *= d;
    p.setXYZ(i, x * 0.6, (y - 0.2) * 0.42, z * 0.6);
  }
  g.computeVertexNormals();
  return colorize(prep(g), (x, y, z) => {
    const r = 1 - Math.abs(n.n3(x * 7, y * 7, z * 7));
    const v = 0.72 + Math.pow(r, 3) * 0.5;
    return [v, v, v];
  });
}

function seaFanTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  const rand = mulberry32(12);
  const br = (x, y, a, len, w, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (d <= 0) return;
    br(x2, y2, a - 0.28 - rand() * 0.25, len * 0.8, w * 0.75, d - 1);
    br(x2, y2, a + 0.28 + rand() * 0.25, len * 0.8, w * 0.75, d - 1);
  };
  br(S / 2, S - 4, -Math.PI / 2, 48, 6, 6);
  // 網目
  ctx.lineWidth = 1.3;
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 520; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 2.4;
    const r0 = 30 + rand() * 180;
    const x = S / 2 + Math.cos(a) * r0, y = S - 4 + Math.sin(a) * r0;
    const a2 = a + (rand() - 0.5) * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a2 + 1.57) * 12, y + Math.sin(a2 + 1.57) * 12);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function seaFanGeo() {
  const g = new THREE.PlaneGeometry(1.4, 1.4, 6, 6);
  g.translate(0, 0.7, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.sin(x * 2.2) * 0.08 + y * y * 0.05);
  }
  g.computeVertexNormals();
  return colorize(g, (x, y) => {
    const v = 0.7 + y * 0.35;
    return [v, v, v];
  });
}

function tubeSponge(seed) {
  const rand = mulberry32(seed);
  const geos = [];
  const n = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.28, r = rand() * 0.18;
    const h = 0.4 + rand() * 0.7;
    const rad = 0.06 + rand() * 0.05;
    const g = new THREE.CylinderGeometry(rad * 1.15, rad * 0.8, h, 12, 4, true);
    g.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    const lean = (rand() - 0.5) * 0.4;
    g.rotateZ(lean);
    geos.push(prep(g));
  }
  const g = mergeGeometries(geos);
  return colorize(g, (x, y) => {
    const v = 0.7 + y * 0.4;
    return [v, v, v];
  });
}

function barrelSponge() {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = 0.22 + Math.sin(t * 1.9) * 0.3 + t * 0.12;
    pts.push(new THREE.Vector2(r, t * 1.25));
  }
  pts.push(new THREE.Vector2(0.62, 1.27), new THREE.Vector2(0.56, 1.22), new THREE.Vector2(0.48, 1.0));
  const g = new THREE.LatheGeometry(pts, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.07 * Math.pow(Math.max(0, Math.sin(a * 11)), 2) + 0.04 * Math.sin(a * 3 + y * 4);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return colorize(prep(g), (x, y) => {
    const v = 0.55 + y * 0.45;
    return [v, v, v];
  });
}

function anemoneGeo() {
  const rand = mulberry32(3);
  const geos = [];
  const base = new THREE.CylinderGeometry(0.3, 0.38, 0.14, 18);
  base.translate(0, 0.07, 0);
  geos.push(prep(base));
  for (let i = 0; i < 170; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.32;
    const out = new THREE.Vector3(Math.cos(a) * (0.25 + r * 1.2), 1, Math.sin(a) * (0.25 + r * 1.2)).normalize();
    const start = V(Math.cos(a) * r, 0.13, Math.sin(a) * r);
    const len = 0.16 + rand() * 0.12;
    const mid = start.clone().addScaledVector(out, len * 0.55);
    mid.x += (rand() - 0.5) * 0.03;
    mid.z += (rand() - 0.5) * 0.03;
    const end = mid.clone().addScaledVector(out, len * 0.45);
    end.y += 0.02;
    geos.push(cylinderBetween(start, mid, 0.011, 0.009, 5));
    geos.push(cylinderBetween(mid, end, 0.009, 0.005, 5));
  }
  const g = mergeGeometries(geos);
  return colorize(g, (x, y) => {
    const t = clamp((y - 0.13) / 0.28, 0, 1);
    return [0.82 + t * 0.35, 0.68 + t * 0.15, 0.62 + t * 0.2];
  });
}

function grassTuft(seed) {
  const rand = mulberry32(seed);
  const geos = [];
  for (let b = 0; b < 7; b++) {
    const g = new THREE.PlaneGeometry(0.035, 1, 1, 5);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    const h = 0.35 + rand() * 0.45;
    const bend = (rand() - 0.5) * 0.5;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setXYZ(i, p.getX(i) * (1 - y * 0.5) + bend * y * y * h, y * h, bend * 0.3 * y * h);
    }
    g.rotateY(rand() * Math.PI);
    g.translate((rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2);
    geos.push(prep(g));
  }
  const g = mergeGeometries(geos);
  g.computeVertexNormals();
  return colorize(g, (x, y) => {
    const v = 0.55 + y * 0.8;
    return [v, v, v];
  });
}

function urchinGeo() {
  const rand = mulberry32(8);
  const geos = [prep(new THREE.SphereGeometry(0.07, 10, 8))];
  for (let i = 0; i < 46; i++) {
    const d = new THREE.Vector3(rand() - 0.5, rand() * 0.9 - 0.1, rand() - 0.5).normalize();
    geos.push(cylinderBetween(d.clone().multiplyScalar(0.06), d.clone().multiplyScalar(0.06 + 0.12 + rand() * 0.08), 0.006, 0.0015, 3));
  }
  const g = mergeGeometries(geos);
  g.translate(0, 0.05, 0);
  return colorize(g, () => [1, 1, 1]);
}

function starfishGeo() {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 0.13 : 0.045;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.015, 0);
  return colorize(prep(g), () => [1, 1, 1]);
}

function boulderGeo(seed) {
  let g = new THREE.IcosahedronGeometry(1, 4);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const n = new Noise(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + n.fbm3(x * 1.2, y * 1.2, z * 1.2, 3) * 0.32;
    p.setXYZ(i, x * d, y * d * 0.72, z * d);
  }
  g.computeVertexNormals();
  return g;
}

// ---- マテリアル -------------------------------------------------------------

const SWAY = /* glsl */ `
{
  #ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
  #else
  vec3 ip = vec3(0.0);
  #endif
  float h = max(position.y, 0.0);
  float s = sin(uTime * 1.3 + ip.x * 0.35 + ip.z * 0.27) + 0.5 * sin(uTime * 2.1 + ip.z * 0.6);
  transformed.x += s * h * h * SWAY_AMT;
  transformed.z += cos(uTime * 1.1 + ip.x * 0.3) * h * h * SWAY_AMT * 0.6;
}
`;

function coralMat(key, { sway = 0, map = null, alphaTest = 0, side = THREE.FrontSide, spec = 0.08, rough = 0.85, wrap = 0.2 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, map, alphaTest, side });
  return patchUW(m, {
    key,
    spec,
    wrap,
    vertexBegin: sway ? SWAY.replace(/SWAY_AMT/g, sway.toFixed(3)) : '',
  });
}

// ---- 配置 -------------------------------------------------------------------

export function buildReefLife(world, tex) {
  const group = new THREE.Group();
  group.name = 'reef-life';
  const rand = mulberry32(99);
  const islandGrid = world.grids[0];
  const reefGrid = world.grids[1];
  const tmpN = new THREE.Vector3();
  const free = (x, y, z, r = 0.6) => {
    if (sampleGrid(islandGrid, x, y, z) < r) return false;
    if (sampleGrid(reefGrid, x, y, z) < r * 0.5) return false;
    if (world.colliders.distance(x, y, z) < r) return false;
    return true;
  };
  const seabedAt = (x, z) => {
    const y = seabedHeight(x, z);
    return { p: V(x, y, z), n: seabedNormal(x, z, new THREE.Vector3()) };
  };
  // 岩の塔の表面の点（上向きの面）
  const reefSurface = (minUp = 0.3) => {
    for (let tries = 0; tries < 40; tries++) {
      const p = V(REEF.x + (rand() - 0.5) * 92, -10 - rand() * 16, REEF.z + (rand() - 0.5) * 92);
      for (let k = 0; k < 4; k++) {
        const d = sampleGrid(reefGrid, p.x, p.y, p.z);
        if (d > 50) break;
        gridNormal(reefGrid, p.x, p.y, p.z, tmpN);
        p.addScaledVector(tmpN, -d);
      }
      const d = sampleGrid(reefGrid, p.x, p.y, p.z);
      if (Math.abs(d) > 0.15) continue;
      gridNormal(reefGrid, p.x, p.y, p.z, tmpN);
      if (tmpN.y < minUp) continue;
      if (p.y < seabedHeight(p.x, p.z) + 0.3) continue;
      return { p, n: tmpN.clone() };
    }
    return null;
  };

  const placements = {};
  const add = (kind, p, n, scale, color, yRot = rand() * Math.PI * 2, tilt = 0.6) => {
    (placements[kind] ||= []).push({ p, n, scale, color, yRot, tilt });
  };

  // 場所ごとの密度（サンゴの庭が最も濃い）
  const density = (x, z) => {
    const g = 1 - smoothstep(25, 75, Math.hypot(x - GARDEN.x, z - GARDEN.z));
    const slope = 0.28 * (1 - smoothstep(18, 55, Math.abs(x))) * smoothstep(-95, -60, z);
    const ruins = 0.3 * (1 - smoothstep(30, 60, Math.hypot(x - RUINS.x, z - RUINS.z))) * smoothstep(24, 34, Math.hypot(x - RUINS.x, z - RUINS.z));
    const reef = 0.45 * (1 - smoothstep(30, 70, Math.hypot(x - REEF.x, z - REEF.z)));
    const drop = 0.25 * smoothstep(110, 135, z) * (1 - smoothstep(150, 175, z));
    const isl = 0.25 * (1 - smoothstep(60, 80, Math.hypot(x - ISLAND.x, z - ISLAND.z))) * smoothstep(52, 60, Math.hypot(x - ISLAND.x, z - ISLAND.z));
    const patch = smoothstep(-0.2, 0.5, nz.fbm2(x * 0.03, z * 0.03, 3));
    return Math.max(g, slope, ruins, reef, drop, isl) * (0.35 + 0.65 * patch);
  };

  const P = {
    staghorn: [0x8e6fb8, 0xc58fb0, 0xd7b48a, 0x7fa6c8, 0xa3c27a, 0xe0a07a],
    table: [0xb59a76, 0x9cb08a, 0xa88a66, 0x8f9a6e],
    brain: [0xc6a65a, 0x8fa26a, 0xb07e5c, 0xa8b07a, 0x7e9a8a],
    fan: [0xd2483a, 0xe07a3a, 0x9a4fb0, 0xe0c060],
    tube: [0x9c5ac0, 0xe08a3a, 0xd8c04a, 0x5a8ad0],
    barrel: [0x8a4a3a, 0xa0583e, 0x7a5a6a],
    urchin: [0x1a1418, 0x2a1a30],
    star: [0xe06a3a, 0x3a6ad0, 0xd84a6a, 0xe0b040],
  };
  const pick = (arr) => new THREE.Color(arr[Math.floor(rand() * arr.length)]);

  // サンゴの根（岩の上にサンゴが群がった塊）を中心に、まとまって置く
  const placeCoral = (p, n, scaleMul, kindBias) => {
    const r = rand();
    if (r < 0.3 * kindBias.staghorn) add('staghorn', p, n, (0.7 + rand() * 1.0) * scaleMul, pick(P.staghorn));
    else if (r < 0.42) add('brain', p, n, (0.5 + rand() * 1.1) * scaleMul, pick(P.brain));
    else if (r < 0.5) add('table', p, n, (0.8 + rand() * 1.2) * scaleMul, pick(P.table));
    else if (r < 0.62) add('tube', p, n, (0.7 + rand() * 0.8) * scaleMul, pick(P.tube));
    else if (r < 0.7) add('fan', p, n, (0.7 + rand() * 0.8) * scaleMul, pick(P.fan), rand() * 6.28, 0.15);
    else if (r < 0.76) add('barrel', p, n, (0.6 + rand() * 0.7) * scaleMul, pick(P.barrel));
    else if (r < 0.86) add('staghorn', p, n, (0.6 + rand() * 0.9) * scaleMul, pick(P.staghorn));
    else if (r < 0.94) add('urchin', p, n, 0.8 + rand() * 0.6, pick(P.urchin));
    else add('star', p, n, 0.8 + rand() * 0.6, pick(P.star));
  };
  const clusters = [];
  for (let i = 0; i < 2600 && clusters.length < 150; i++) {
    const x = (rand() - 0.5) * 360, z = -175 + rand() * 335;
    if (rand() > density(x, z) * 1.3) continue;
    const s = seabedAt(x, z);
    if (s.n.y < 0.8) continue;
    if (!free(x, s.p.y + 1.5, z, 3.5)) continue;
    if (Math.hypot(x - BOAT.x, z - BOAT.z) < 7) continue;
    if (clusters.some((c) => Math.hypot(c.x - x, c.z - z) < 7)) continue;
    clusters.push({ x, z, y: s.p.y });
  }
  for (const c of clusters) {
    // 土台の岩
    const bs = 1.2 + rand() * 1.6;
    add('boulder', V(c.x, c.y - bs * 0.25, c.z), UPV.clone(), bs, null, rand() * 6.28, 0);
    const top = c.y - bs * 0.25;
    const cnt = 10 + Math.floor(rand() * 18);
    for (let k = 0; k < cnt; k++) {
      // 岩の上半分の表面か、そのまわりの砂地
      if (rand() < 0.55) {
        const a = rand() * Math.PI * 2;
        const el = 0.25 + rand() * 1.1;
        const nx = Math.cos(a) * Math.cos(el), ny = Math.sin(el), nzz = Math.sin(a) * Math.cos(el);
        const p = V(c.x + nx * bs * 0.82, top + ny * bs * 0.6, c.z + nzz * bs * 0.82);
        placeCoral(p, V(nx, ny + 0.4, nzz).normalize(), 0.9, { staghorn: 1 });
      } else {
        const a = rand() * Math.PI * 2, rr = bs * (0.9 + rand() * 1.6);
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        const s = seabedAt(x, z);
        if (s.n.y < 0.7 || !free(x, s.p.y + 0.3, z, 0.6)) continue;
        placeCoral(s.p, s.n, 1, { staghorn: 1 });
      }
    }
  }
  // 砂地にはまばらに
  for (let i = 0; i < 5000; i++) {
    const x = (rand() - 0.5) * 360, z = -175 + rand() * 335;
    if (rand() > density(x, z) * 0.35) continue;
    const s = seabedAt(x, z);
    if (s.n.y < 0.75) continue;
    if (!free(s.p.x, s.p.y + 0.3, s.p.z, 1.0)) continue;
    if (Math.hypot(x - BOAT.x, z - BOAT.z) < 6) continue;
    placeCoral(s.p, s.n, 0.9, { staghorn: 1 });
  }
  // 岩の塔に貼りつける（ウミウチワとカイメンとサンゴ）
  for (let i = 0; i < 420; i++) {
    const s = reefSurface(0.25);
    if (!s) continue;
    const r = rand();
    if (r < 0.32) add('fan', s.p, s.n, 0.8 + rand() * 1.1, pick(P.fan), rand() * 6.28, 0.2);
    else if (r < 0.55) add('tube', s.p, s.n, 0.7 + rand() * 0.8, pick(P.tube));
    else if (r < 0.78) add('staghorn', s.p, s.n, 0.6 + rand() * 0.8, pick(P.staghorn));
    else add('brain', s.p, s.n, 0.5 + rand() * 0.8, pick(P.brain));
  }
  // 大きな岩：あちこちに（当たり判定つき）
  for (let i = 0; i < 260; i++) {
    const x = (rand() - 0.5) * 380, z = -185 + rand() * 350;
    const rocky = Math.max(
      1 - smoothstep(20, 80, Math.hypot(x - REEF.x, z - REEF.z)),
      smoothstep(140, 185, Math.max(-z, Math.abs(x))),
      0.35
    );
    if (rand() > rocky) continue;
    const s = seabedAt(x, z);
    if (!free(s.p.x, s.p.y + 1, s.p.z, 2.5)) continue;
    if (Math.hypot(x - RUINS.x, z - RUINS.z) < 28) continue;
    add('boulder', s.p.clone().addScaledVector(s.n, -0.4), s.n, 0.8 + rand() * 2.4, null);
  }
  // 海草の原（ボートの西）
  const meadow = { x: GARDEN.x - 28, z: GARDEN.z + 16, r: 20 };
  for (let i = 0; i < 2600; i++) {
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * meadow.r;
    const x = meadow.x + Math.cos(a) * rr, z = meadow.z + Math.sin(a) * rr * 0.8;
    if (nz.fbm2(x * 0.08, z * 0.08, 2) < -0.25) continue;
    const s = seabedAt(x, z);
    add('grass', s.p, s.n, 0.8 + rand() * 0.6, new THREE.Color().setHSL(0.24 + rand() * 0.06, 0.45, 0.32 + rand() * 0.1), rand() * 6.28, 0.3);
  }
  // イソギンチャク（カクレクマノミのすみか）
  const anemones = [];
  const anemoneSpots = [
    [GARDEN.x + 9, GARDEN.z - 14], [GARDEN.x - 14, GARDEN.z - 6], [GARDEN.x + 18, GARDEN.z + 9],
    [GARDEN.x - 6, GARDEN.z + 22], [GARDEN.x + 26, GARDEN.z - 26], [GARDEN.x - 30, GARDEN.z - 22],
  ];
  for (const [x, z] of anemoneSpots) {
    const s = seabedAt(x, z);
    add('anemone', s.p, s.n, 1.4 + rand() * 0.6, new THREE.Color().setHSL(0.85 + rand() * 0.1, 0.35, 0.68), rand() * 6.28, 0.4);
    anemones.push(s.p.clone().add(V(0, 0.45, 0)));
  }

  // ---- インスタンス化 ----
  const geos = {
    staghorn: [branchingCoral(1), branchingCoral(2), branchingCoral(3)],
    table: [tableCoral(4), tableCoral(5)],
    brain: [brainCoral(6), brainCoral(7)],
    fan: [seaFanGeo()],
    tube: [tubeSponge(8), tubeSponge(9), tubeSponge(10)],
    barrel: [barrelSponge()],
    urchin: [urchinGeo()],
    star: [starfishGeo()],
    grass: [grassTuft(11), grassTuft(12)],
    anemone: [anemoneGeo()],
    boulder: [boulderGeo(13), boulderGeo(14), boulderGeo(15)],
  };
  const fanTex = seaFanTexture();
  const mats = {
    staghorn: coralMat('coral', {}),
    table: coralMat('coral', {}),
    brain: coralMat('coral', {}),
    fan: coralMat('fan', { sway: 0.05, map: fanTex, alphaTest: 0.4, side: THREE.DoubleSide, wrap: 0.6 }),
    tube: coralMat('sponge', { side: THREE.DoubleSide }),
    barrel: coralMat('sponge', { side: THREE.DoubleSide }),
    urchin: coralMat('coral', { spec: 0.3 }),
    star: coralMat('coral', {}),
    grass: coralMat('grass', { sway: 0.22, side: THREE.DoubleSide, wrap: 0.6 }),
    anemone: coralMat('anemone', { sway: 0.5, wrap: 0.5 }),
    boulder: rockMaterial(tex, 'rock-boulder'),
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (const kind of Object.keys(placements)) {
    const list = placements[kind];
    const variants = geos[kind];
    const buckets = variants.map(() => []);
    list.forEach((it, i) => buckets[i % variants.length].push(it));
    variants.forEach((geo, vi) => {
      const items = buckets[vi];
      if (!items.length) return;
      const mesh = new THREE.InstancedMesh(geo, mats[kind], items.length);
      items.forEach((it, i) => {
        // 面の向きに少しだけ合わせて立てる
        nrm.copy(it.n).lerp(UPV, 1 - it.tilt).normalize();
        q.setFromUnitVectors(UPV, nrm);
        q2.setFromAxisAngle(UPV, it.yRot);
        q.multiply(q2);
        const s = it.scale;
        sc.set(s, s, s);
        if (kind === 'boulder') sc.set(s * (0.8 + rand() * 0.5), s * (0.6 + rand() * 0.5), s * (0.8 + rand() * 0.5));
        m4.compose(it.p, q, sc);
        mesh.setMatrixAt(i, m4);
        if (it.color) mesh.setColorAt(i, it.color);
        if (kind === 'boulder') world.colliders.addSphere(it.p.x, it.p.y + s * 0.2, it.p.z, s * 0.85, 'rock');
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = kind;
      group.add(mesh);
    });
  }

  return { group, anemones, clusters, counts: Object.fromEntries(Object.entries(placements).map(([k, v]) => [k, v.length])) };
}
