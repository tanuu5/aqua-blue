// ダイバーのモデル（基本形の組み合わせ）とバタ足のアニメーション。
// ローカル座標：+Z が頭の向き、+Y が背中側、+X が左手側（うつ伏せで泳ぐ姿勢）。
import * as THREE from 'three';
import { uwStandard } from '../core/uwmat.js';

const SUIT = 0xf2b51c;
const SUIT_DARK = 0x16181b;

function capsuleZ(r, len, mat, seg = 10) {
  const g = new THREE.CapsuleGeometry(r, len, 5, seg);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  return m;
}

// 先端に向かって広がるフィンの形
function finGeometry() {
  const L = 0.5, w0 = 0.09, w1 = 0.15;
  const shape = new THREE.Shape();
  shape.moveTo(-w0, 0);
  shape.lineTo(w0, 0);
  shape.bezierCurveTo(w0 + 0.02, -L * 0.4, w1, -L * 0.8, w1 * 0.95, -L);
  shape.quadraticCurveTo(0, -L - 0.03, -w1 * 0.95, -L);
  shape.bezierCurveTo(-w1, -L * 0.8, -w0 - 0.02, -L * 0.4, -w0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 6 });
  // xy 平面の形を xz 平面（-Z 方向に伸びる板）へ
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.006, 0);
  // 先に行くほど少し反らせる（あとで曲げる余地を残すため分割数は控えめ）
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const t = Math.max(0, -z / L);
    p.setY(i, p.getY(i) + t * t * 0.03);
  }
  g.computeVertexNormals();
  return g;
}

export class Diver {
  constructor() {
    const suit = uwStandard({ color: SUIT, roughness: 0.55 }, { key: 'diver', spec: 0.35, shininess: 30, envSpec: 0.08 });
    const dark = uwStandard({ color: SUIT_DARK, roughness: 0.5 }, { key: 'diver', spec: 0.3, shininess: 26, envSpec: 0.06 });
    const metal = uwStandard({ color: 0x9aa1a8, roughness: 0.35, metalness: 0.5 }, { key: 'diver', spec: 0.7, shininess: 50, envSpec: 0.22 });
    const glass = uwStandard({ color: 0x0b1c26, roughness: 0.1 }, { key: 'diver', spec: 1.2, shininess: 90, envSpec: 0.9 });
    const finMat = uwStandard({ color: 0xf4c21e, roughness: 0.45, side: THREE.DoubleSide }, { key: 'diver', spec: 0.4, shininess: 30, envSpec: 0.1 });
    const skin = uwStandard({ color: 0xd9a582, roughness: 0.7 }, { key: 'diver', spec: 0.1 });
    this.mats = { suit, dark, metal, glass, finMat, skin };

    this.root = new THREE.Group();
    this.root.name = 'diver';
    const body = (this.body = new THREE.Group());
    this.root.add(body);

    // 胴体
    const torso = capsuleZ(0.165, 0.4, suit, 12);
    torso.scale.set(1.12, 0.88, 1);
    torso.position.set(0, 0, 0.08);
    body.add(torso);
    // 脇の黒いパネル
    for (const s of [1, -1]) {
      const side = capsuleZ(0.1, 0.36, dark, 8);
      side.scale.set(0.55, 0.95, 1);
      side.position.set(s * 0.13, -0.02, 0.06);
      body.add(side);
    }
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.158, 14, 10), suit);
    pelvis.scale.set(1.08, 0.84, 1.15);
    pelvis.position.set(0, -0.01, -0.2);
    body.add(pelvis);
    // ベルト・ハーネス
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.022, 6, 20), dark);
    belt.scale.set(1.1, 0.88, 1);
    belt.position.set(0, 0, -0.1);
    body.add(belt);
    for (const s of [1, -1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.36), dark);
      strap.position.set(s * 0.085, 0.152, 0.1);
      strap.rotation.z = s * 0.15;
      body.add(strap);
    }

    // 首と頭
    const neck = capsuleZ(0.058, 0.08, dark, 8);
    neck.position.set(0, 0.03, 0.33);
    body.add(neck);
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.05, 0.42);
    head.rotation.x = 0.08;
    body.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 12), dark);
    hood.scale.set(0.92, 1.0, 1.08);
    hood.position.set(0, 0.0, 0.05);
    head.add(hood);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), skin);
    face.scale.set(0.9, 0.85, 0.6);
    face.position.set(0, -0.04, 0.12);
    head.add(face);
    const maskFrame = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.075, 0.05), dark);
    maskFrame.position.set(0, -0.005, 0.15);
    head.add(maskFrame);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.02), glass);
    lens.position.set(0, -0.005, 0.176);
    head.add(lens);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.012, 5, 18), dark);
    strap.rotation.y = Math.PI / 2;
    strap.rotation.x = 0.2;
    strap.position.set(0, 0.0, 0.06);
    head.add(strap);
    const reg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.05, 10), dark);
    reg.rotation.x = Math.PI / 2;
    reg.position.set(0, -0.085, 0.15);
    head.add(reg);
    this.regulator = new THREE.Object3D();
    this.regulator.position.set(0, -0.1, 0.16);
    head.add(this.regulator);

    // タンク
    const tank = new THREE.Group();
    tank.position.set(0, 0.2, -0.04);
    body.add(tank);
    const cyl = capsuleZ(0.088, 0.5, metal, 14);
    tank.add(cyl);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8), metal);
    valve.rotation.x = Math.PI / 2;
    valve.position.set(0, 0, 0.36);
    tank.add(valve);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.018, 10), dark);
    knob.position.set(0, 0.035, 0.37);
    tank.add(knob);
    for (const z of [-0.12, 0.12]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 5, 18), dark);
      band.position.z = z;
      tank.add(band);
    }
    // ホース
    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, 0.2, 0.36),
      new THREE.Vector3(-0.1, 0.16, 0.44),
      new THREE.Vector3(-0.12, 0.02, 0.5),
      new THREE.Vector3(-0.04, -0.06, 0.55),
    ]);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 12, 0.012, 5, false), dark);
    body.add(hose);

    // 腕
    this.arms = [];
    for (const s of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.19, 0.01, 0.25);
      body.add(shoulder);
      const ua = capsuleZ(0.052, 0.2, suit, 8);
      ua.position.z = -0.14;
      shoulder.add(ua);
      const elbow = new THREE.Group();
      elbow.position.z = -0.28;
      shoulder.add(elbow);
      const fa = capsuleZ(0.045, 0.19, dark, 8);
      fa.position.z = -0.12;
      elbow.add(fa);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), dark);
      hand.scale.set(0.75, 0.55, 1.3);
      hand.position.z = -0.27;
      elbow.add(hand);
      this.arms.push({ s, shoulder, elbow });
    }

    // 脚とフィン
    this.legs = [];
    const finGeo = finGeometry();
    for (const s of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.085, -0.02, -0.3);
      body.add(hip);
      const thigh = capsuleZ(0.074, 0.32, suit, 10);
      thigh.scale.set(1, 0.95, 1);
      thigh.position.z = -0.21;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.z = -0.42;
      hip.add(knee);
      const shin = capsuleZ(0.056, 0.3, dark, 8);
      shin.position.z = -0.2;
      knee.add(shin);
      const shinStripe = capsuleZ(0.058, 0.12, suit, 8);
      shinStripe.position.z = -0.1;
      knee.add(shinStripe);
      const ankle = new THREE.Group();
      ankle.position.set(0, -0.01, -0.4);
      knee.add(ankle);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.2), dark);
      pocket.position.set(0, -0.015, -0.07);
      ankle.add(pocket);
      const fin = new THREE.Group();
      fin.position.set(0, -0.03, -0.15);
      ankle.add(fin);
      const blade = new THREE.Mesh(finGeo, finMat);
      fin.add(blade);
      this.legs.push({ s, hip, knee, ankle, fin });
    }

    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });

    // 潜水ライト（頭につける）
    this.light = new THREE.SpotLight(0xe6f6ff, 0, 30, 0.52, 0.6, 1.25);
    this.light.position.set(0, 0.06, 0.2);
    this.lightTarget = new THREE.Object3D();
    this.lightTarget.position.set(0, -0.3, 4);
    head.add(this.light);
    head.add(this.lightTarget);
    this.light.target = this.lightTarget;

    this.phase = 0;
    this.kick = 0;
    this.time = 0;
  }

  // speed: 0〜1.6 程度（泳ぐ速さ）、turn: 旋回の速さ、hover: 静止時のゆらぎ
  update(dt, { speed = 0, turn = 0, rising = 0, aim = false } = {}) {
    this.time += dt;
    const targetKick = Math.min(1.25, speed);
    this.kick += (targetKick - this.kick) * (1 - Math.exp(-dt * 4));
    const k = this.kick;
    const rate = 1.4 + k * 3.2;
    this.phase += dt * rate * Math.PI * 2 * 0.5;
    const idle = 1 - Math.min(1, k * 2.5);

    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const ph = this.phase + i * Math.PI;
      const amp = 0.05 + k * 0.17;
      L.hip.rotation.x = Math.sin(ph) * amp - 0.04;
      L.hip.rotation.y = L.s * 0.05;
      L.knee.rotation.x = 0.1 + (0.5 + 0.5 * Math.sin(ph + 1.3)) * (0.05 + k * 0.24);
      L.ankle.rotation.x = 0.02 - Math.cos(ph) * (0.04 + k * 0.1);
      // フィンは脚の動きに遅れてしなる
      L.fin.rotation.x = -Math.cos(ph - 0.5) * (0.05 + k * 0.16);
    }
    for (const A of this.arms) {
      const t = this.time;
      if (aim) {
        A.shoulder.rotation.set(-0.1, A.s * 2.65, 0);
        A.elbow.rotation.set(0.25, 0, 0);
      } else {
        const scull = Math.sin(t * 1.6 + A.s) * 0.18 * idle;
        A.shoulder.rotation.set(-0.3 - idle * 0.25, -A.s * (0.16 + idle * 0.3 + scull), 0);
        A.elbow.rotation.set(-0.15 - idle * 0.35, -A.s * scull * 0.5, 0);
      }
    }
    // 体のうねりと呼吸
    this.body.rotation.x = Math.sin(this.phase * 2) * 0.012 * k - rising * 0.15;
    this.body.position.y = Math.sin(this.time * 1.3) * 0.02 * idle;
    this.body.rotation.z = -turn * 0.25;
    this.head.rotation.x = 0.08 + idle * 0.08;
  }

  setLight(on) {
    this.light.intensity = on ? 70 : 0;
  }
}
