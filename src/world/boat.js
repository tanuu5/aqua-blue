// 船長のダイビングボート。白い船体に紺の帯、操舵室、マスト、旗、はしご、いかり綱。
// ローカル座標：+Z が船首、+X が左舷、y=0 が喫水線。
import * as THREE from 'three';
import { uwStandard, patchUW } from '../core/uwmat.js';
import { BOAT } from './layout.js';
import { seabedHeight } from './terrain.js';

function hullGeometry() {
  const L = 12.5, segL = 28, segC = 18;
  const pos = [];
  const col = [];
  const idx = [];
  const halfW = (t) => {
    // t: 0 = 船尾, 1 = 船首
    if (t < 0.7) return 1.95 - (0.7 - t) * 0.35;
    const u = (t - 0.7) / 0.3;
    // 船首は一点に閉じる（すき間があくと中が見えてしまう）
    return 1.95 * Math.sqrt(Math.max(0, 1 - u * u));
  };
  const keel = (t) => -1.15 + Math.max(0, t - 0.75) * 1.6 + Math.max(0, 0.08 - t) * 2;
  // 船べりの高さ。中ほどから船尾は甲板（y = 1.02）と同じ高さにして、甲板の縁にすき間を作らない
  const deck = (t) => 1.02 + Math.pow(Math.max(0, t - 0.6), 2) * 2.2;
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    const z = (t - 0.45) * L;
    const w = halfW(t), k = keel(t), dk = deck(t);
    for (let j = 0; j <= segC; j++) {
      // j: 0 = 左舷の甲板の縁 → 竜骨 → 右舷の縁
      const a = (j / segC) * Math.PI;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const x = w * Math.sign(c) * Math.pow(Math.abs(c), 0.55);
      const y = dk - (dk - k) * Math.pow(sn, 1.6);
      pos.push(x, y, z);
      // 喫水線の少し上に紺の帯、その下は赤い船底塗料
      const stripe = y > 0.25 && y < 0.55;
      const bottom = y < 0.05;
      if (stripe) col.push(0.04, 0.1, 0.22);
      else if (bottom) col.push(0.45, 0.1, 0.08);
      else col.push(0.92, 0.92, 0.9);
    }
  }
  const row = segC + 1;
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segC; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // 船尾の板（トランサム）。中心を甲板の高さに置き、上端まできっちりふさぐ
  const base = pos.length / 3;
  pos.push(0, deck(0), (0 - 0.45) * L);
  col.push(0.92, 0.92, 0.9);
  for (let j = 0; j < segC; j++) idx.push(base, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 高さ Y の甲板の縁（左舷側の [x, z]、船尾 → 船首）。各断面で船体の内側の面が Y を横切る位置をとるので、
  // 甲板は船体にすき間なく収まり、船首で船べりが高くなっても外へはみ出さない
  const deckEdge = (Y) => {
    const out = [];
    for (let i = 0; i <= segL; i++) {
      let x = 0;
      for (let j = 1; j <= segC / 2; j++) {
        const a = (i * row + j - 1) * 3, b = (i * row + j) * 3;
        const y0 = pos[a + 1], y1 = pos[b + 1];
        if (y1 < Y) {
          const f = y0 > y1 ? Math.min(1, Math.max(0, (y0 - Y) / (y0 - y1))) : 0;
          x = pos[a] + (pos[b] - pos[a]) * f;
          break;
        }
      }
      out.push([x, (i / segL - 0.45) * L]);
    }
    return out;
  };
  return { geo: g, halfW, deck, L, deckEdge };
}

export function buildBoat(colliders) {
  const group = new THREE.Group();
  group.name = 'boat';
  const hullMat = uwStandard({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide }, { key: 'boat', spec: 0.35, shininess: 40, envSpec: 0.12 });
  const white = uwStandard({ color: 0xe8e8e4, roughness: 0.5 }, { key: 'boat', spec: 0.3, shininess: 30, envSpec: 0.1 });
  const navy = uwStandard({ color: 0x14243c, roughness: 0.5 }, { key: 'boat', spec: 0.3, shininess: 30 });
  const wood = uwStandard({ color: 0x8a6a48, roughness: 0.8 }, { key: 'boat', spec: 0.1 });
  const glass = uwStandard({ color: 0x0d1f2a, roughness: 0.1 }, { key: 'boat', spec: 1.2, shininess: 80, envSpec: 0.8 });
  const steel = uwStandard({ color: 0xa8adb2, roughness: 0.35, metalness: 0.6 }, { key: 'boat', spec: 0.8, shininess: 50, envSpec: 0.3 });
  const rust = uwStandard({ color: 0x4a3a30, roughness: 0.9, metalness: 0.3 }, { key: 'boat', spec: 0.1 });

  const hull = hullGeometry();
  const hullMesh = new THREE.Mesh(hull.geo, hullMat);
  group.add(hullMesh);

  // 甲板。形は xy 平面に描いて、表（+z 向き）が上を向くように -90 度倒す。
  // 倒すと形の y は -z になるので、y には -z を入れておく（逆に倒すと裏が上を向き、上から見ると消える）
  const deckShape = new THREE.Shape();
  const edge = hull.deckEdge(1.02);
  edge.forEach(([x, z], i) => (i === 0 ? deckShape.moveTo(x, -z) : deckShape.lineTo(x, -z)));
  for (let i = edge.length - 1; i >= 0; i--) {
    const [x, z] = edge[i];
    if (x > 1e-4) deckShape.lineTo(-x, -z); // 船首の先（x = 0）は左右で同じ点なので二度は置かない
  }
  const deckGeo = new THREE.ShapeGeometry(deckShape);
  deckGeo.rotateX(-Math.PI / 2);
  const deckMesh = new THREE.Mesh(deckGeo, wood);
  deckMesh.position.y = 1.02;
  group.add(deckMesh);

  // 船室と操舵室
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.9, 4.2), white);
  cabin.position.set(0, 1.02 + 0.95, 0.4);
  group.add(cabin);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 4.8), navy);
  cabinRoof.position.set(0, 1.02 + 1.95, 0.25);
  group.add(cabinRoof);
  for (const s of [-1, 1]) {
    for (const z of [-0.6, 0.6, 1.7]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.7), glass);
      win.position.set(s * 1.51, 2.15, z);
      group.add(win);
    }
  }
  const front = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.04), glass);
  front.position.set(0, 2.25, 2.51);
  group.add(front);
  const wheel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.0), white);
  wheel.position.set(0, 1.02 + 1.95 + 0.6, -0.1);
  group.add(wheel);
  const wheelRoof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.5), navy);
  wheelRoof.position.set(0, 1.02 + 1.95 + 1.26, -0.15);
  group.add(wheelRoof);
  for (const s of [-1, 1]) {
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 1.2), glass);
    w2.position.set(s * 1.11, 3.65, -0.1);
    group.add(w2);
  }
  const w3 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.04), glass);
  w3.position.set(0, 3.65, 0.91);
  group.add(w3);

  // マストと旗
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 8), steel);
  mast.position.set(0, 4.2 + 1.7 - 0.3, -0.6);
  group.add(mast);
  const flagGeo = new THREE.PlaneGeometry(0.9, 0.55, 8, 4);
  flagGeo.translate(0.45, 0, 0);
  const flagMat = patchUW(new THREE.MeshStandardMaterial({ color: 0xc8282a, roughness: 0.8, side: THREE.DoubleSide }), {
    key: 'flag',
    vertexBegin: 'transformed.z += sin(uTime * 6.0 - position.x * 6.0) * 0.08 * position.x;',
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0, 7.0, -0.6);
  flag.rotation.y = Math.PI / 2;
  group.add(flag);
  // ダイバー旗（白と青）を小さく
  const alpha = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), uwStandard({ color: 0x2a5bd7, side: THREE.DoubleSide }, { key: 'boat' }));
  alpha.position.set(0, 6.3, -0.6 + 0.3);
  alpha.rotation.y = Math.PI / 2;
  group.add(alpha);

  // 手すり
  const railPts = [];
  for (let i = 1; i <= 18; i++) {
    const t = i / 19;
    const z = (t - 0.45) * hull.L;
    for (const s of [-1, 1]) railPts.push([s * hull.halfW(t) * 0.94, z, t]);
  }
  for (const [x, z, t] of railPts) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 5), steel);
    post.position.set(x, hull.deck(t) + 0.4, z);
    group.add(post);
  }
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 1; i <= 18; i++) {
      const t = i / 19;
      pts.push(new THREE.Vector3(s * hull.halfW(t) * 0.94, hull.deck(t) + 0.8, (t - 0.45) * hull.L));
    }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.03, 5, false), steel);
    group.add(rail);
  }

  // 船尾のはしご（ここから乗り降りする）
  const ladder = new THREE.Group();
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.06), steel);
    side.position.set(s * 0.32, -0.3, 0);
    ladder.add(side);
  }
  for (let i = 0; i < 6; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.64, 6), steel);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, -1.4 + i * 0.42, 0);
    ladder.add(rung);
  }
  ladder.position.set(0.9, 0, -0.45 * hull.L - 0.15);
  ladder.rotation.x = -0.12;
  group.add(ladder);

  // 船底の舵とスクリュー
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.6), rust);
  rudder.position.set(0, -1.1, -0.45 * hull.L + 0.4);
  group.add(rudder);
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 3), steel);
  prop.rotation.x = Math.PI / 2;
  prop.position.set(0, -0.95, -0.45 * hull.L + 1.0);
  group.add(prop);

  group.position.set(BOAT.x, 0, BOAT.z);
  group.rotation.y = BOAT.yaw;
  group.updateMatrixWorld(true);

  // いかり綱：船首から海底へ垂れる鎖
  const bow = new THREE.Vector3(0, 1.2, 0.55 * hull.L - 0.4).applyMatrix4(group.matrixWorld);
  const fwd = new THREE.Vector3(Math.sin(BOAT.yaw), 0, Math.cos(BOAT.yaw));
  const ax = bow.x + fwd.x * 14, az = bow.z + fwd.z * 14;
  const ay = seabedHeight(ax, az) + 0.3;
  const chainPts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = bow.x + (ax - bow.x) * t;
    const z = bow.z + (az - bow.z) * t;
    const sag = Math.sin(t * Math.PI) * 2.2;
    const y = bow.y + (ay - bow.y) * Math.pow(t, 0.7) - sag;
    chainPts.push(new THREE.Vector3(x, Math.max(y, ay), z));
  }
  const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts), 80, 0.035, 5, false), rust);
  chain.name = 'anchor-chain';
  const anchor = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), rust);
  anchor.add(shank);
  for (const s of [-1, 1]) {
    const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.35), rust);
    fluke.position.set(s * 0.3, -0.6, 0);
    fluke.rotation.z = s * 0.5;
    anchor.add(fluke);
  }
  anchor.position.set(ax, ay + 0.2, az);
  anchor.rotation.set(1.2, 0.3, 0.2);

  // 当たり判定（船体をカプセル 3 本で）
  const wp = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(group.matrixWorld);
  colliders.addCapsule(wp(0, -0.2, -0.45 * hull.L + 1.2), wp(0, -0.2, 0.55 * hull.L - 2.2), 1.6, 'boat');
  colliders.addCapsule(wp(0, 1.4, -0.45 * hull.L + 1.2), wp(0, 1.4, 0.55 * hull.L - 2.2), 1.8, 'boat');
  colliders.addCapsule(wp(0, -0.6, 0.55 * hull.L - 2.2), wp(0, 0.2, 0.55 * hull.L - 0.3), 0.8, 'boat');

  const ladderWorld = new THREE.Vector3(0.9, -0.8, -0.45 * hull.L - 0.6).applyMatrix4(group.matrixWorld);
  return { group, chain, anchor, ladderWorld, update: (t) => {
    group.rotation.z = Math.sin(t * 0.7) * 0.025;
    group.rotation.x = Math.sin(t * 0.53 + 1) * 0.015;
    group.position.y = Math.sin(t * 0.9) * 0.06;
  } };
}
