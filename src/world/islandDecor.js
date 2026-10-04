// 島の上の緑：こんもりした茂みと、浜のヤシの木。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise, mulberry32 } from '../core/noise.js';
import { patchUW } from '../core/uwmat.js';

const nz = new Noise(616);

function bushGeo(seed) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < 4; i++) {
    let g = new THREE.IcosahedronGeometry(0.6 + rand() * 0.4, 2);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const d = 1 + nz.n3(x * 3 + seed, y * 3, z * 3) * 0.18;
      p.setXYZ(k, x * d, y * d * 0.8, z * d);
    }
    g.translate((rand() - 0.5) * 1.1, 0.3 + rand() * 0.4, (rand() - 0.5) * 1.1);
    g.computeVertexNormals();
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const t = Math.min(1, Math.max(0, (p.getY(k) + 0.2) / 1.6));
    const v = 0.55 + t * 0.6;
    c[k * 3] = v; c[k * 3 + 1] = v; c[k * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function frondTexture() {
  const W = 64, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2, 0);
  ctx.stroke();
  ctx.lineWidth = 3.2;
  for (let y = 8; y < H - 6; y += 7) {
    const t = 1 - y / H;
    const len = (W / 2 - 3) * Math.sin(Math.PI * Math.min(1, t * 1.1)) ;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(W / 2, y);
      ctx.lineTo(W / 2 + s * len, y + 10);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function palmGeo(seed) {
  const rand = mulberry32(seed);
  const H = 7 + rand() * 4;
  const lean = 0.4 + rand() * 0.6;
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(Math.sin(t * 1.2) * lean * H * 0.25, t * H, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 16, 0.18, 7, false);
  // 幹の節
  const p = trunk.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k);
    const ring = 1 + 0.08 * Math.pow(Math.abs(Math.sin(y * 4.5)), 4);
    const taper = 1.15 - (y / H) * 0.4;
    const cx = Math.sin((y / H) * 1.2) * lean * H * 0.25;
    p.setX(k, cx + (p.getX(k) - cx) * ring * taper);
    p.setZ(k, p.getZ(k) * ring * taper);
  }
  trunk.computeVertexNormals();
  trunk.deleteAttribute('uv');
  const tc = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) { tc[k * 3] = 0.42; tc[k * 3 + 1] = 0.33; tc[k * 3 + 2] = 0.24; }
  trunk.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const top = curve.getPoint(1);
  // 葉（反った板にテクスチャ）
  const fronds = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(1.1, 4.2, 1, 8);
    g.translate(0, 2.1, 0);
    const fp = g.attributes.position;
    for (let k = 0; k < fp.count; k++) {
      const y = fp.getY(k);
      const t = y / 4.2;
      fp.setZ(k, -t * t * 2.2);
      fp.setY(k, y * (1 - t * 0.25));
    }
    g.rotateX(-Math.PI / 2 + 0.5 + rand() * 0.4);
    g.rotateY((i / n) * Math.PI * 2 + rand() * 0.3);
    g.translate(top.x, top.y, top.z);
    g.computeVertexNormals();
    const c = new Float32Array(fp.count * 3);
    for (let k = 0; k < fp.count; k++) { c[k * 3] = 0.3; c[k * 3 + 1] = 0.52; c[k * 3 + 2] = 0.2; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    fronds.push(g);
  }
  return { trunk, fronds: mergeGeometries(fronds) };
}

export function buildIslandDecor(islandMesh, beachTest) {
  const group = new THREE.Group();
  group.name = 'island-decor';
  const rand = mulberry32(31);
  const pos = islandMesh.geometry.attributes.position;
  const nrm = islandMesh.geometry.attributes.normal;
  const bushes = [];
  const palms = [];
  for (let i = 0; i < pos.count; i += 3) {
    const y = pos.getY(i);
    if (y < 3) continue;
    const ny = nrm.getY(i);
    const x = pos.getX(i), z = pos.getZ(i);
    if (ny > 0.62 && rand() < 0.3) bushes.push({ x, y, z, s: 1.4 + rand() * 2.8, ny });
    else if (ny > 0.5 && ny <= 0.62 && rand() < 0.08) bushes.push({ x, y, z, s: 0.8 + rand() * 1.2, ny });
    if (ny > 0.75 && rand() < (beachTest(x, z) ? 0.2 : 0.012) && y < 26) palms.push({ x, y, z });
  }
  const leafMat = patchUW(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), {
    key: 'bush',
    wrap: 0.5,
    spec: 0.04,
  });
  const variants = [bushGeo(1), bushGeo(2), bushGeo(3)];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  variants.forEach((geo, vi) => {
    const items = bushes.filter((_, i) => i % variants.length === vi);
    const mesh = new THREE.InstancedMesh(geo, leafMat, items.length);
    items.forEach((b, i) => {
      e.set(0, rand() * 6.28, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(b.x, b.y - 0.45 * b.s, b.z), q, new THREE.Vector3(b.s, b.s * (0.7 + rand() * 0.4), b.s));
      mesh.setMatrixAt(i, m4);
      col.setHSL(0.24 + rand() * 0.07, 0.32 + rand() * 0.18, 0.085 + rand() * 0.06);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  // ヤシ
  const frondTex = frondTexture();
  const trunkMat = patchUW(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { key: 'palm-trunk', spec: 0.05 });
  const frondMat = patchUW(
    new THREE.MeshStandardMaterial({ vertexColors: true, map: frondTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
    {
      key: 'palm-frond',
      wrap: 0.6,
      spec: 0.1,
      vertexBegin: `
        #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        #else
        vec3 ip = vec3(0.0);
        #endif
        float tip = max(position.y - 6.0, 0.0);
        transformed.x += sin(uTime * 1.3 + ip.x * 0.2) * tip * 0.05;
        transformed.z += cos(uTime * 1.1 + ip.z * 0.2) * tip * 0.04;
      `,
    }
  );
  const pv = [palmGeo(5), palmGeo(6), palmGeo(7)];
  pv.forEach((pg, vi) => {
    const items = palms.filter((_, i) => i % pv.length === vi);
    if (!items.length) return;
    const tm = new THREE.InstancedMesh(pg.trunk, trunkMat, items.length);
    const fm = new THREE.InstancedMesh(pg.fronds, frondMat, items.length);
    items.forEach((p, i) => {
      e.set(0, rand() * 6.28, 0);
      q.setFromEuler(e);
      const s = 0.8 + rand() * 0.4;
      m4.compose(new THREE.Vector3(p.x, p.y - 0.3, p.z), q, new THREE.Vector3(s, s, s));
      tm.setMatrixAt(i, m4);
      fm.setMatrixAt(i, m4);
    });
    tm.computeBoundingSphere();
    fm.computeBoundingSphere();
    group.add(tm, fm);
  });
  return { group, counts: { bushes: bushes.length, palms: palms.length } };
}
