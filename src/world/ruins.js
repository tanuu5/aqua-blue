// 沈んだ神殿：基壇・大階段・列柱・内陣・門のアーチ・石像の頭・鐘・がれき。
// ローカル座標（原点は遺跡の中心の海底、+Z が南＝ボート側）で組み、最後にまとめて置く。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchUW, uwStandard } from '../core/uwmat.js';
import { mulberry32 } from '../core/noise.js';
import { RUINS } from './layout.js';
import { buildHead } from './statue.js';
import { sampleGrid } from './sdf.js';

const TILE = 4.2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function uvBox(w, h, d, rand) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const ou = rand(), ov = rand();
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / TILE + ou, (uv.getY(k) * dims[f][1]) / TILE + ov);
    }
  }
  return g;
}

// 溝の入った円柱。broken なら上端をぎざぎざに
function columnGeo(r, h, broken, rand) {
  const seg = 48;
  const seed = rand() * 6.28;
  const g = new THREE.CylinderGeometry(r * 0.9, r, h, seg, 6, false);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-4) continue;
    const a = Math.atan2(z, x);
    const flute = 1 - 0.05 * Math.pow(0.5 + 0.5 * Math.cos(a * 16), 2);
    let nx = x * flute, nz = z * flute;
    let ny = y;
    if (broken && y > h - 0.01) ny = h - 0.15 - 0.8 * (0.5 + 0.35 * Math.sin(a * 3 + seed) + 0.15 * Math.sin(a * 7 + seed * 2));
    p.setXYZ(i, nx, ny, nz);
    uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / TILE, (uv.getY(i) * h) / TILE);
  }
  if (broken) {
    // 天面の中心も少し下げる
    for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) < 1e-4 && p.getY(i) > h - 0.01) p.setY(i, h - 0.5);
  }
  g.computeVertexNormals();
  return g;
}

function ruinMaterial(tex, key, tint = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.albedo,
    normalMap: tex.normal,
    color: tint,
    roughness: 0.92,
    metalness: 0,
  });
  m.normalScale.set(1.3, 1.3);
  return patchUW(m, {
    key,
    worldNormal: true,
    spec: 0.05,
    mapFragment: /* glsl */ `
      #include <map_fragment>
      {
        vec3 wn = normalize(vUwNrm);
        float up = smoothstep(0.3, 0.85, wn.y);
        float n = texture2D(map, vMapUv * 0.31 + 0.17).g;
        float moss = up * smoothstep(0.25, 0.6, n + 0.15);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.82, 0.58), moss * 0.85);
        float low = 1.0 - smoothstep(${(RUINS.floor - 0.2).toFixed(2)}, ${(RUINS.floor + 1.6).toFixed(2)}, vUwPos.y);
        diffuseColor.rgb *= 1.0 - low * 0.3;
      }
    `,
  });
}

// 石像用：三平面投影の岩テクスチャを白っぽくした「風化した大理石」
function marbleMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  return patchUW(m, {
    key: 'marble',
    worldNormal: true,
    spec: 0.12,
    uniforms: { tRock: { value: tex.rock.albedo }, tRockN: { value: tex.rock.normal }, tBrick: { value: tex.brick.albedo } },
    fragmentHead: /* glsl */ `
      uniform sampler2D tRock;
      uniform sampler2D tRockN;
      uniform sampler2D tBrick;
      vec3 triT(sampler2D t, vec3 p, float s, vec3 w) {
        return texture2D(t, p.zy * s).rgb * w.x + texture2D(t, p.xz * s).rgb * w.y + texture2D(t, p.xy * s).rgb * w.z;
      }
    `,
    mapFragment: /* glsl */ `
      vec3 tN = normalize(vUwNrm);
      vec3 tw = pow(abs(tN), vec3(4.0));
      tw /= (tw.x + tw.y + tw.z + 1e-5);
      vec3 rc = triT(tRock, vUwPos, 0.45, tw);
      float l = dot(rc, vec3(0.3, 0.5, 0.2));
      vec3 marble = vec3(0.6, 0.58, 0.53) * (0.6 + l * 0.8);
      float up = smoothstep(0.25, 0.85, tN.y);
      float n = triT(tBrick, vUwPos, 0.13, tw).g;
      float moss = up * smoothstep(0.2, 0.55, n);
      marble = mix(marble, marble * vec3(0.45, 0.72, 0.5), moss * 0.85);
      // すき間の黒ずみ
      marble *= 0.75 + 0.25 * smoothstep(0.1, 0.5, l);
      diffuseColor.rgb *= marble;
    `,
    normalFragment: /* glsl */ `
      {
        vec3 tx = texture2D(tRockN, vUwPos.zy * 0.45).xyz * 2.0 - 1.0;
        vec3 ty = texture2D(tRockN, vUwPos.xz * 0.45).xyz * 2.0 - 1.0;
        vec3 tz = texture2D(tRockN, vUwPos.xy * 0.45).xyz * 2.0 - 1.0;
        tx = vec3(tx.xy * 0.5 + tN.zy, abs(tx.z) * tN.x);
        ty = vec3(ty.xy * 0.5 + tN.xz, abs(ty.z) * tN.y);
        tz = vec3(tz.xy * 0.5 + tN.xy, abs(tz.z) * tN.z);
        vec3 nW = normalize(tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z);
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }
    `,
  });
}

export function buildRuins(tex, colliders) {
  const rand = mulberry32(2024);
  const O = V(RUINS.x, RUINS.floor, RUINS.z);
  const group = new THREE.Group();
  group.name = 'ruins';
  const blockGeos = [];
  const colGeos = [];
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const one = V(1, 1, 1);

  const place = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    tmpE.set(rx, ry, rz);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(V(O.x + x, O.y + y, O.z + z), tmpQ, one);
    geo.applyMatrix4(tmpM);
    return tmpM.clone();
  };

  // 箱（y は箱の中心）
  // 向きの同じ面どうしが同じ平面で重なるとちらつくので、並べ方で避ける
  // （ぴったり突き合わせるか、数 cm 以上ずらす）
  const box = (x, y, z, w, h, d, { rx = 0, ry = 0, rz = 0, collide = true, list = blockGeos } = {}) => {
    const g = uvBox(w, h, d, rand);
    const m = place(g, x, y, z, rx, ry, rz);
    list.push(g);
    if (collide) colliders.addBox(m, V(w / 2, h / 2, d / 2), 'ruins');
  };

  const column = (x, base, z, h, { r = 0.78, broken = false, capital = !broken } = {}) => {
    // 台座
    box(x, base + 0.25, z, r * 2.6, 0.5, r * 2.6);
    const g = columnGeo(r, h, broken, rand);
    place(g, x, base + 0.5, z, 0, rand() * 6, 0);
    colGeos.push(g);
    if (capital) {
      const ech = new THREE.CylinderGeometry(r * 1.35, r * 0.92, 0.45, 24);
      ech.translate(0, 0.225, 0);
      place(ech, x, base + 0.5 + h, z);
      colGeos.push(ech);
      box(x, base + 0.5 + h + 0.45 + 0.2, z, r * 2.8, 0.4, r * 2.8);
    }
    const top = base + 0.5 + h + (capital ? 0.85 : 0);
    colliders.addCapsule(V(O.x + x, O.y + base, O.z + z), V(O.x + x, O.y + top - 0.3, O.z + z), r + 0.05, 'ruins');
    return top;
  };

  // ---- 下の広場（2 段の基壇＋敷石）----
  box(0, 0.35, 2, 38, 0.7, 34);
  for (let ix = -6; ix <= 5; ix++) {
    for (let iz = -5; iz <= 5; iz++) {
      const x = ix * 3 + 1.5, z = 2 + iz * 3;
      if (Math.abs(x) > 17.5 || Math.abs(z - 2) > 15.6) continue;
      const edge = Math.abs(x) > 14 || Math.abs(z - 2) > 12;
      if (rand() < (edge ? 0.3 : 0.07)) continue;
      const tilt = edge ? (rand() - 0.5) * 0.12 : (rand() - 0.5) * 0.02;
      box(x, 1.05 + (rand() - 0.5) * 0.06, z, 2.9, 0.7, 2.9, { rx: tilt, rz: (rand() - 0.5) * 0.04, collide: false, list: colGeos });
    }
  }
  colliders.addBox(new THREE.Matrix4().makeTranslation(O.x, O.y + 0.7, O.z + 2), V(17.5, 0.7, 15.5), 'ruins');

  // ---- 上の基壇（内陣のある高台）----
  const P2 = { z0: -21, z1: -1, x: 10, top: 5.9 };
  box(0, P2.top / 2, (P2.z0 + P2.z1) / 2, P2.x * 2, P2.top, P2.z1 - P2.z0);
  // 縁の飾り石（基壇の正面より 5 cm 張り出す）
  box(0, P2.top + 0.15, P2.z1 - 0.25, P2.x * 2 + 0.4, 0.3, 0.6);
  // 大階段（15 段）
  for (let i = 0; i < 15; i++) {
    const topY = 1.4 + 0.3 * (i + 1);
    const z0 = 6.5 - (i + 1) * 0.5;
    box(0, (1.4 + topY) / 2, z0 + 0.25, 8, topY - 1.4, 0.5, { collide: false, list: colGeos });
  }
  // 階段の当たり判定は斜面の箱で（奥＝ -z に向かって上る。上面は段の角と角の中ほどを通す）
  {
    const len = Math.hypot(7.5, 4.5);
    const ang = Math.atan2(4.5, 7.5);
    const m = new THREE.Matrix4().compose(
      V(O.x, O.y + 1.4 + 2.4 - 0.5 * Math.cos(ang), O.z + 2.75 - 0.5 * Math.sin(ang)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(ang, 0, 0)),
      one
    );
    colliders.addBox(m, V(4, 0.5, len / 2), 'ruins');
  }
  // 階段わきの低い壁（階段と同じく奥へ上る）。下の端の柱は壁より少し太くして、横の面が重ならないようにする
  for (const s of [-1, 1]) {
    const ang = Math.atan2(4.5, 7.5);
    box(s * 4.45, 1.4 + 2.6, 2.75, 0.9, 1.1, 8.6, { rx: ang });
    box(s * 4.45, 1.4 + 0.6, 6.4, 1.0, 1.2, 0.9);
  }

  // ---- 列柱 ----
  const tops = {};
  tops.l1 = column(-7.5, 1.4, 12, 7.5);
  tops.l2 = column(-7.5, 1.4, 6.5, 7.5);
  column(-7.5, P2.top, -4, 6.5);
  column(-7.5, P2.top, -9.5, 6.5);
  column(-7.5, P2.top, -15, 4.2, { broken: true });
  column(7.5, 1.4, 12, 3.1, { broken: true });
  column(7.5, P2.top, -4, 6.5);
  column(7.5, P2.top, -9.5, 3.8, { broken: true });
  column(7.5, P2.top, -15, 6.5);
  column(-7.5, P2.top, -20, 6.5);
  // 梁（アーキトレーブ）
  box(-7.5, tops.l1 + 0.5, 9.25, 1.6, 1.0, 7.4);
  box(-7.5, P2.top + 7.85 + 0.5, -6.75, 1.6, 1.0, 7.4);
  // 倒れた円柱（ドラム）
  for (let i = 0; i < 4; i++) {
    const g = columnGeo(0.78, 1.5, false, rand);
    g.translate(0, -0.75, 0);
    const x = 9 + i * 1.7 + rand() * 0.4, z = 7.5 + i * 1.3;
    place(g, x, 1.4 + 0.75, z, Math.PI / 2, 0.6 + rand() * 0.3, 0);
    colGeos.push(g);
    colliders.addSphere(O.x + x, O.y + 1.4 + 0.75, O.z + z, 0.95, 'ruins');
  }
  {
    const g = columnGeo(0.78, 7.0, false, rand);
    g.translate(0, -3.5, 0);
    place(g, -12.5, 1.4 + 0.78, 9.5, Math.PI / 2, -0.5, 0);
    colGeos.push(g);
    const a = new THREE.Vector3(0, -3.3, 0).applyEuler(new THREE.Euler(Math.PI / 2, -0.5, 0));
    colliders.addCapsule(
      V(O.x - 12.5 + a.x, O.y + 2.18 + a.y, O.z + 9.5 + a.z),
      V(O.x - 12.5 - a.x, O.y + 2.18 - a.y, O.z + 9.5 - a.z),
      0.8,
      'ruins'
    );
  }

  // ---- 内陣（入口のある部屋、屋根は崩れている）----
  // 壁どうしは重ねずに突き合わせる（面が重なるとちらつく）
  const wallH = 5;
  const wy = P2.top + wallH / 2;
  box(0, wy, -19, 10.8, wallH, 0.8); // 奥の壁（x: -5.4〜5.4、z: -19.4〜-18.6）
  // 横の壁は少し細くして外側の面を 3 cm 引っ込め、端は前後の壁に 3 cm 差し込む。
  // 上の面も前後の壁とそろえず、40 cm 低くする（差し込んだところで上の面が重ならないように）
  box(-5, P2.top + 2.3, -15, 0.74, 4.6, 7.26); // 左の壁
  box(5, P2.top + 1.1, -15, 0.74, 2.2, 7.26); // 右の壁は崩れて低い
  box(-3.5, wy, -11, 3.8, wallH, 0.8); // 正面の壁（入口の左右、x: -5.4〜-1.6）
  box(3.5, wy, -11, 3.8, wallH, 0.8);
  box(0, P2.top + 4.56, -11, 3.26, 1.12, 0.76); // まぐさ石（左右の壁に少し差し込み、上は壁より 12 cm 高い）
  box(0, P2.top + wallH + 0.4, -15, 0.8, 0.8, 9, { rz: 0.0 }); // 残った梁
  box(2.5, P2.top + 1.4, -14, 0.7, 0.7, 7, { rx: 0.0, rz: 0.55, collide: false }); // 落ちた梁
  // 祭壇
  box(0, P2.top + 0.55, -17, 2.4, 1.1, 1.4);
  box(0, P2.top + 1.18, -17, 2.8, 0.16, 1.7);

  // ---- 門のアーチ（右半分は崩れ落ちている）----
  // 柱とアーチの石は厚みを少しずつ変え、隣どうしの表と裏の面が同じ平面に来ないようにする
  const GZ = 17;
  box(-4.4, 1.4 + 3, GZ, 1.5, 6, 1.7);
  box(4.4, 1.4 + 2.2, GZ, 1.5, 4.4, 1.7);
  const R = 4.4, cy = 1.4 + 6;
  for (let i = 0; i < 9; i++) {
    const a0 = Math.PI - (i / 9) * Math.PI;
    const a1 = Math.PI - ((i + 1) / 9) * Math.PI;
    const am = (a0 + a1) / 2;
    if (i >= 5) {
      // 落ちた石
      const fx = 3 + rand() * 4, fz = GZ + (rand() - 0.5) * 5;
      box(fx, 1.4 + 0.45, fz, 1.5, 0.9, 1.4, { rx: rand() * 0.6, ry: rand() * 3, rz: rand() * 0.6, collide: false });
      continue;
    }
    box(Math.cos(am) * R, cy + Math.sin(am) * R, GZ, 1.5, 1.6, i % 2 ? 1.5 : 1.6, { rz: am - Math.PI / 2 });
  }

  // ---- 西側の低い壁（ウツボの棲む穴がある）----
  const WX = -17.2;
  for (let k = 0; k <= 10; k++) {
    const z = 1.9 + (k - 4) * 2.2;
    if (k === 4) continue;
    const h = 1.6 + rand() * 1.2;
    box(WX, 1.4 + h / 2, z, 2.4, h, 2.1);
  }
  box(WX, 1.4 + 1.8, 1.9, 2.4, 1.2, 2.1);
  box(WX - 0.98, 1.4 + 0.6, 1.9, 0.36, 1.2, 2.0); // 穴の奥（外側と前後の面を少し引っ込める）
  const morayHole = V(O.x + WX + 1.2, O.y + 1.4 + 0.55, O.z + 1.9);
  const holeBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.15, 2.0),
    uwStandard({ color: 0x030405, roughness: 1 }, { key: 'dark' })
  );
  holeBack.position.set(O.x + WX - 0.75, O.y + 1.4 + 0.6, O.z + 1.9);
  group.add(holeBack);

  // ---- がれき ----
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = 14 + rand() * 16;
    const x = Math.cos(a) * r, z = 2 + Math.sin(a) * r * 0.9;
    const s = 0.4 + rand() * 1.0;
    // ウツボの穴の前と大階段の上はあけておく
    if (Math.hypot(x - (-15.5), z - 1.9) < 4.5) continue;
    if (Math.abs(x) < 6 && z > -2 && z < 18) continue;
    const onPlaza = Math.abs(x) < 17 && Math.abs(z - 2) < 15;
    const y = (onPlaza ? 1.4 : 0) + s * 0.3;
    box(x, y, z, s * (1 + rand()), s, s * (0.8 + rand()), { rx: (rand() - 0.5) * 0.8, ry: rand() * 3, rz: (rand() - 0.5) * 0.8, collide: s > 0.9 });
  }

  const blockMat = ruinMaterial(tex.brick, 'ruin-block');
  const colTex = { albedo: tex.rock.albedo, normal: tex.rock.normal };
  const colMat = ruinMaterial(colTex, 'ruin-column', 0xe0d6c4);
  const blocks = new THREE.Mesh(mergeGeometries(blockGeos), blockMat);
  const cols = new THREE.Mesh(mergeGeometries(colGeos.map((g) => g.index ? g.toNonIndexed() : g)), colMat);
  blocks.name = 'ruin-blocks';
  cols.name = 'ruin-columns';
  group.add(blocks, cols);

  // ---- 石像の頭 ----
  const head = buildHead();
  const headMesh = new THREE.Mesh(head.geo, marbleMaterial(tex));
  headMesh.name = 'statue-head';
  const hp = V(O.x + 14, O.y + 1.4 + 1.75, O.z + 3.5);
  headMesh.position.copy(hp);
  headMesh.rotation.set(-0.12, -0.75, 0.22, 'YXZ');
  headMesh.updateMatrixWorld(true);
  group.add(headMesh);
  const inv = new THREE.Matrix4().copy(headMesh.matrixWorld).invert();
  const tv = new THREE.Vector3();
  colliders.addCustom(
    (x, y, z) => {
      tv.set(x, y, z).applyMatrix4(inv);
      return sampleGrid(head.grid, tv.x, tv.y, tv.z);
    },
    hp.x - 4, hp.z - 4, hp.x + 4, hp.z + 4,
    'statue'
  );

  // ---- 倒れた鐘 ----
  // 釣鐘の形：丸い肩から裾へ少し広がる（t=0 が頭、t=1 が口）
  const prof = [new THREE.Vector2(0.001, 2.25), new THREE.Vector2(0.35, 2.22), new THREE.Vector2(0.6, 2.1)];
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    const r = 0.68 + 0.12 * t + 0.32 * Math.pow(t, 6);
    prof.push(new THREE.Vector2(r, 2.1 - t * 2.1));
  }
  prof.push(new THREE.Vector2(1.1, 0.02), new THREE.Vector2(1.05, 0.0), new THREE.Vector2(0.95, 0.06));
  const bellGeo = new THREE.LatheGeometry(prof, 32);
  bellGeo.translate(0, -1.1, 0);
  const bellMat = patchUW(
    new THREE.MeshStandardMaterial({ color: 0x4f7f6c, roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide }),
    { key: 'bell', spec: 0.5, shininess: 40, envSpec: 0.35 }
  );
  const bell = new THREE.Mesh(bellGeo, bellMat);
  bell.name = 'bell';
  bell.position.set(O.x - 12.5, O.y + 1.4 + 0.95, O.z - 2);
  bell.rotation.set(0.15, 0.4, 1.35);
  group.add(bell);
  colliders.addSphere(bell.position.x, bell.position.y, bell.position.z, 1.15, 'bell');

  return {
    group,
    statue: headMesh,
    morayHole,
    points: {
      altar: V(O.x, O.y + P2.top + 1.6, O.z - 17),
      bell: V(O.x - 12.5, O.y + 1.4 + 1.2, O.z + 0.2),
      statueFront: V(O.x + 10.5, O.y + 1.4 + 2.2, O.z + 6.5),
      stairsBottom: V(O.x, O.y + 2.5, O.z + 10),
    },
  };
}
