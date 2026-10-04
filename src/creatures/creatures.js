// 生き物をそれぞれの場所に住まわせ、毎フレーム動かす。写真とレーダーのための位置も返す。
import * as THREE from 'three';
import { School, makeFishMesh, writeFishMatrix } from './school.js';
import { Ray, Turtle, Moray, Jellies, Dolphins, buildClam } from './special.js';
import { GARDEN, REEF, RUINS, CAVE, BOAT } from '../world/layout.js';
import { mulberry32 } from '../core/noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Creatures {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'creatures';
    this.providers = [];
    this.schools = [];
    this.specials = [];
    this.clams = [];
    this.rand = mulberry32(2025);
    this.build();
  }

  addSchool(o) {
    const s = new School(this.world, o);
    this.group.add(s.mesh);
    this.schools.push(s);
    this.providers.push(s);
    return s;
  }

  addSpecial(c, obj) {
    this.group.add(obj);
    this.specials.push(c);
    this.providers.push(c);
    return c;
  }

  build() {
    const W = this.world;
    const R = this.rand;
    const floor = (x, z) => W.solidFloor(x, z);
    const above = (lo) => (x, z) => floor(x, z) + lo;
    const clusters = W.reefLife.clusters;
    const near = (x, z, maxD = 80) =>
      clusters
        .map((c) => ({ c, d: Math.hypot(c.x - x, c.z - z) }))
        .filter((e) => e.d < maxD)
        .sort((a, b) => a.d - b.d)
        .map((e) => e.c);
    const gardenClusters = near(GARDEN.x, GARDEN.z, 70);

    // ---- サンゴの庭 ----
    for (let i = 0; i < 4; i++) {
      const c = gardenClusters[i * 3] || { x: GARDEN.x + i * 8, z: GARDEN.z, y: -9 };
      this.addSchool({
        species: 'anthias', count: 34, size: [0.08, 0.12], home: V(c.x, c.y + 2.2, c.z), radius: 4.5,
        yMin: above(0.9), yMax: c.y + 5, speed: [0.25, 0.9], neighbor: 1.4, coh: 1.6, homePull: 1.6, flee: 2.5, fleeR: 2.2, wander: 0.5, seed: 10 + i,
      });
    }
    for (let i = 0; i < 5; i++) {
      const c = gardenClusters[i * 3 + 1] || { x: GARDEN.x - i * 6, z: GARDEN.z + 5, y: -9 };
      this.addSchool({
        species: 'damsel', count: 14, size: [0.06, 0.08], home: V(c.x, c.y + 1.4, c.z), radius: 2.2,
        yMin: above(0.5), yMax: c.y + 2.8, speed: [0.2, 0.8], neighbor: 0.8, flee: 1.5, fleeR: 1.6, homePull: 2, wander: 0.7, seed: 20 + i,
      });
    }
    W.reefLife.anemones.forEach((a, i) => {
      this.addSchool({
        species: 'clown', count: 2 + (i % 2), size: [0.08, 0.1], home: a.clone(), radius: 0.7,
        yMin: () => a.y - 0.25, yMax: a.y + 0.6, speed: [0.12, 0.45], neighbor: 0.5, flee: 0, fleeR: 0, homePull: 4, wander: 0.5, seed: 30 + i,
      });
    });
    for (let i = 0; i < 2; i++) {
      const cx = GARDEN.x + (i ? -18 : 14), cz = GARDEN.z + (i ? -8 : 12);
      this.addSchool({
        species: 'tang', count: 7, size: [0.2, 0.28], home: V(cx, -6.5, cz), radius: 9,
        yMin: above(1.0), yMax: -3, speed: [0.5, 1.4], neighbor: 2.5, flee: 2, fleeR: 3.5, wander: 0.6, seed: 40 + i,
        homeMove: (t, h) => h.set(cx + Math.cos(t * 0.03 + i) * 16, -6.5, cz + Math.sin(t * 0.03 + i) * 16),
      });
    }
    for (let i = 0; i < 4; i++) {
      const c = gardenClusters[i * 4 + 2] || { x: GARDEN.x, z: GARDEN.z - i * 6, y: -9 };
      this.addSchool({
        species: 'butterfly', count: 2, size: [0.14, 0.17], home: V(c.x, c.y + 1.5, c.z), radius: 7,
        yMin: above(0.7), yMax: c.y + 3.5, speed: [0.3, 0.9], neighbor: 1.6, coh: 2.5, flee: 1.5, fleeR: 2.5, wander: 0.8, seed: 50 + i,
      });
    }
    this.addSchool({
      species: 'idol', count: 3, size: [0.17, 0.2], home: V(GARDEN.x + 4, -6.5, GARDEN.z - 18), radius: 12,
      yMin: above(1), yMax: -4, speed: [0.3, 0.9], neighbor: 2, flee: 1.5, fleeR: 3, wander: 0.7, seed: 60,
    });
    this.puffers = [];
    this.puffers.push(
      this.addSchool({
        species: 'puffer', count: 1, size: [0.3, 0.3], home: V(GARDEN.x - 8, -7.5, GARDEN.z - 4), radius: 8,
        yMin: above(0.6), yMax: -5, speed: [0.15, 0.5], flee: 0.6, fleeR: 2.5, wander: 0.6, seed: 61, avoid: 8,
      })
    );
    this.turtles = [];
    for (let i = 0; i < 2; i++) {
      const t = new Turtle(W, { center: V(GARDEN.x - 20 + i * 18, 0, GARDEN.z + 10 - i * 14), radius: 28, scale: 1.05 + i * 0.15, seed: 70 + i });
      this.addSpecial(t, t.root);
      this.turtles.push(t);
    }
    this.jellies = new Jellies(V(BOAT.x + 6, 0, BOAT.z - 8), 9);
    this.addSpecial(this.jellies, this.jellies.group);
    // シャコガイ（ひとつは特別な「記憶」が入っている）
    const clamSpots = [
      [GARDEN.x + 12, GARDEN.z - 6, 1.0], [GARDEN.x - 9, GARDEN.z + 13, 0.9], [GARDEN.x + 24, GARDEN.z + 18, 0.8],
      [GARDEN.x - 24, GARDEN.z - 18, 1.0], [GARDEN.x + 3, GARDEN.z + 30, 1.6],
    ];
    clamSpots.forEach(([x, z, s], i) => {
      const c = buildClam(s, i + 1);
      c.group.position.set(x, floor(x, z) - 0.05, z);
      c.group.rotation.y = R() * 6;
      this.group.add(c.group);
      this.clams.push({ x, y: floor(x, z) + 0.25 * s, z, s, c });
    });
    this.providers.push({ species: 'clam', forEach: (fn) => this.clams.forEach((c) => fn(c.x, c.y, c.z, 0.5 * c.s)) });
    this.bigClam = this.clams[4];

    // ---- マンタの根 ----
    this.addSchool({
      species: 'fusilier', count: 110, size: [0.22, 0.3], home: V(REEF.x + 8, -13, REEF.z + 5), radius: 20,
      yMin: () => -20, yMax: -6, speed: [1.0, 2.4], neighbor: 2.4, sep: 0.8, align: 1.6, coh: 1.0, flee: 3, fleeR: 4.5, wander: 0.4, seed: 80,
      homeMove: (t, h) => h.set(REEF.x + 8 + Math.cos(t * 0.05) * 14, -13 + Math.sin(t * 0.07) * 2, REEF.z + 5 + Math.sin(t * 0.05) * 14),
    });
    this.addSchool({
      species: 'trevally', count: 80, size: [0.5, 0.7], home: V(REEF.x + 16, -17, REEF.z - 16), radius: 8,
      yMin: () => -23, yMax: -10, speed: [0.9, 2.0], neighbor: 2.2, sep: 1.2, align: 1.2, coh: 0.6, swirl: 1.3, flee: 2, fleeR: 4,
      wander: 0.2, seed: 81, env: 0.6, spec: 0.9,
    });
    this.addSchool({
      species: 'anthias', count: 30, size: [0.08, 0.12], home: V(REEF.x - 4, -8.5, REEF.z - 2), radius: 4,
      yMin: () => -10.5, yMax: -6, speed: [0.25, 0.9], neighbor: 1.2, flee: 2.5, fleeR: 2.2, wander: 0.5, seed: 82,
    });
    this.addSchool({
      species: 'anthias', count: 26, size: [0.08, 0.12], home: V(REEF.x + 9, -11.5, REEF.z - 22), radius: 4,
      yMin: () => -13.5, yMax: -8.5, speed: [0.25, 0.9], neighbor: 1.2, flee: 2.5, fleeR: 2.2, wander: 0.5, seed: 83,
    });
    this.mantas = [];
    for (let i = 0; i < 2; i++) {
      const m = new Ray('manta', {
        center: V(REEF.x - 4, 0, REEF.z - 2), radius: 15 + i * 9, depth: -13 - i * 3, dy: 2.5, speed: 1.6 + i * 0.2,
        scale: 2.0 - i * 0.25, phase: i * 3.1, squash: 0.85,
      });
      this.addSpecial(m, m.mesh);
      this.mantas.push(m);
    }

    // ---- 沈んだ神殿 ----
    const ruinsFloor = RUINS.floor;
    this.addSchool({
      species: 'napoleon', count: 1, size: [1.5, 1.5], home: V(RUINS.x, ruinsFloor + 5, RUINS.z), radius: 16,
      yMin: () => ruinsFloor + 2.5, yMax: ruinsFloor + 9, speed: [0.35, 0.8], flee: 0.5, fleeR: 3, wander: 0.5, seed: 90, avoid: 10,
      homeMove: (t, h) => h.set(RUINS.x + Math.cos(t * 0.04) * 10, ruinsFloor + 5, RUINS.z + Math.sin(t * 0.04) * 10),
    });
    for (let i = 0; i < 2; i++) {
      const r = new Ray('eagle', {
        center: V(RUINS.x, 0, RUINS.z), radius: 20 + i * 8, depth: ruinsFloor + 9 + i * 3, dy: 2, speed: 2.0, scale: 1.1, phase: i * 2.2, squash: 0.8,
      });
      this.addSpecial(r, r.mesh);
    }
    this.addSchool({
      species: 'idol', count: 3, size: [0.17, 0.2], home: V(RUINS.x - 6, ruinsFloor + 4, RUINS.z + 6), radius: 10,
      yMin: () => ruinsFloor + 2.2, yMax: ruinsFloor + 8, speed: [0.3, 0.9], flee: 1.5, fleeR: 3, wander: 0.7, seed: 91,
    });
    this.puffers.push(
      this.addSchool({
        species: 'puffer', count: 1, size: [0.32, 0.32], home: V(RUINS.x + 8, ruinsFloor + 3.5, RUINS.z + 10), radius: 6,
        yMin: () => ruinsFloor + 2.2, yMax: ruinsFloor + 6, speed: [0.15, 0.5], flee: 0.6, fleeR: 2.5, wander: 0.6, seed: 92, avoid: 8,
      })
    );
    this.addSchool({
      species: 'anthias', count: 24, size: [0.08, 0.12], home: V(RUINS.x - 7.5, ruinsFloor + 11, RUINS.z + 9), radius: 4,
      yMin: () => ruinsFloor + 9.5, yMax: ruinsFloor + 14, speed: [0.25, 0.9], neighbor: 1.2, flee: 2.5, fleeR: 2.2, wander: 0.5, seed: 93,
    });
    const hole = W.ruins.morayHole;
    this.moray = new Moray(hole, V(1, 0, 0));
    this.addSpecial(this.moray, this.moray.root);

    // ---- 青の洞窟 ----
    const ch = CAVE.chamber;
    this.addSchool({
      species: 'sweeper', count: 150, size: [0.07, 0.1], home: V(ch[0] - 2, ch[1] - 1, ch[2] - 6), radius: 6,
      yMin: () => ch[1] - 6, yMax: ch[1] + 2, speed: [0.2, 0.9], neighbor: 0.9, sep: 1.0, align: 1.4, coh: 1.4, flee: 2.5, fleeR: 2.2,
      wander: 0.35, seed: 100, avoid: 10, glow: 0.18,
    });
    this.addSchool({
      species: 'whitetip', count: 2, size: [1.5, 1.7], home: V(ch[0] + 2, ch[1] - 6.5, ch[2] + 2), radius: 5,
      yMin: () => ch[1] - 7.8, yMax: ch[1] - 5.5, speed: [0.25, 0.5], neighbor: 3, sep: 2, align: 0.2, coh: 0.1, flee: 0.3, fleeR: 2.5,
      wander: 0.3, seed: 101, avoid: 12,
    });

    // ---- 外洋の崖：ジンベエザメ ----
    this.whaleshark = makeFishMesh('whaleshark', 1, { spec: 0.2, env: 0.1 });
    this.whaleshark.geometry.attributes.aSwim.array[0] = 0.5;
    this.whaleshark.geometry.attributes.aFreq.array[0] = 2.2;
    this.group.add(this.whaleshark);
    this.ws = { t: 0, pos: V(0, -14, 158), fwd: V(1, 0, 0) };
    this.providers.push({
      species: 'whaleshark',
      forEach: (fn) => fn(this.ws.pos.x, this.ws.pos.y, this.ws.pos.z, 3.5),
    });

    // ---- イルカ ----
    this.dolphins = new Dolphins(3);
    this.addSpecial(this.dolphins, this.dolphins.mesh);
  }

  update(dt, ctx) {
    for (const s of this.schools) s.update(dt, ctx);
    for (const c of this.specials) c.update(dt, ctx);
    for (const c of this.clams) {
      const near = Math.hypot(c.x - ctx.playerPos.x, c.y - ctx.playerPos.y, c.z - ctx.playerPos.z) < 2.2;
      c.c.update(dt, near);
    }
    // ハリセンボン：近づくとふくらむ
    for (const p of this.puffers) {
      const px = p.pos[0], py = p.pos[1], pz = p.pos[2];
      const d = Math.hypot(px - ctx.playerPos.x, py - ctx.playerPos.y, pz - ctx.playerPos.z);
      p.inflate = p.inflate || 0;
      const want = d < 2.3 ? 1 : 0;
      p.inflate += (want - p.inflate) * (1 - Math.exp(-dt * (want ? 6 : 0.5)));
      const s = p.o.size[0] * (1 + p.inflate * 0.75);
      p.scale[0] = s;
      p.o.speed = p.inflate > 0.5 ? [0.02, 0.1] : [0.15, 0.5];
      writeFishMatrix(p.mesh, 0, px, py, pz, p.vel[0], p.vel[1] * 0.6, p.vel[2], s);
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    // ジンベエザメ：崖ぞいをゆっくり往復
    const ws = this.ws;
    ws.t += dt;
    const a = ws.t * 0.012;
    const tx = Math.sin(a) * 115;
    const tz = 160 + Math.cos(a * 2) * 8;
    const ty = -15 + Math.sin(a * 3) * 3;
    const nx = tx - ws.pos.x, ny = ty - ws.pos.y, nz = tz - ws.pos.z;
    const l = Math.hypot(nx, ny, nz);
    if (l > 1e-3) ws.fwd.lerp(V(nx / l, ny / l, nz / l), 1 - Math.exp(-dt * 0.5)).normalize();
    ws.pos.set(tx, ty, tz);
    writeFishMatrix(this.whaleshark, 0, tx, ty, tz, ws.fwd.x, ws.fwd.y * 0.5, ws.fwd.z, 8);
    this.whaleshark.instanceMatrix.needsUpdate = true;
    this.whaleshark.visible = Math.hypot(tx - ctx.playerPos.x, tz - ctx.playerPos.z) < 140;
  }

  // 近くの生き物の位置（レーダー用）
  nearby(p, radius, max = 60) {
    const out = [];
    const r2 = radius * radius;
    for (const pr of this.providers) {
      let count = 0;
      pr.forEach((x, y, z) => {
        if (out.length >= max || count > 6) return;
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz < r2) {
          out.push({ x, y, z, species: pr.species });
          count++;
        }
      });
    }
    return out;
  }
}
