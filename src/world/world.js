// 世界を組み立てる（地形・島・岩・空・海面・コースティクス・光の焼き込み）。
import * as THREE from 'three';
import { U } from '../core/env.js';
import { getTextures } from './textures.js';
import { buildSeabed, seabedHeightFast } from './terrain.js';
import { Colliders } from './colliders.js';
import { buildIsland, buildReef } from './rocks.js';
import { buildSky } from './sky.js';
import { buildWater } from './water.js';
import { Caustics } from './caustics.js';
import { bakeMaps, STATIC_LAYER, SUN_LAYER, BOAT_SUN_LAYER } from './bake.js';
import { sampleGrid, isBeach } from './sdf.js';
import { buildIslandDecor } from './islandDecor.js';
import { buildRuins } from './ruins.js';
import { buildBoat } from './boat.js';
import { buildReefLife } from './reef.js';
import { MarineSnow, Bubbles } from './particles.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.grids = [];
    this.colliders = new Colliders();
    this._g = new THREE.Vector3();
  }

  addStatic(obj, sunCaster = false) {
    obj.traverse((o) => {
      o.layers.enable(STATIC_LAYER);
      if (sunCaster) o.layers.enable(SUN_LAYER);
    });
    this.scene.add(obj);
    return obj;
  }

  addSunCaster(obj) {
    obj.traverse((o) => o.layers.enable(SUN_LAYER));
    this.scene.add(obj);
    return obj;
  }

  async build(progressFn = () => {}) {
    let t0 = performance.now();
    const times = [];
    const progress = (p, msg) => {
      const t = performance.now();
      times.push(`${Math.round(t - t0)}ms`);
      t0 = t;
      progressFn(p, msg);
    };
    this.buildTimes = times;
    progress(0.05, 'テクスチャを描いています…');
    await tick();
    this.tex = getTextures();
    progress(0.2, '海底を広げています…');
    await tick();
    this.seabed = this.addStatic(buildSeabed(this.tex));
    progress(0.35, '島を削り出しています…');
    await tick();
    const island = buildIsland(this.tex);
    this.island = this.addStatic(island.mesh, true);
    this.grids.push(island.grid);
    this.decor = buildIslandDecor(this.island, isBeach);
    this.addSunCaster(this.decor.group);
    progress(0.6, '岩の塔を積んでいます…');
    await tick();
    const reef = buildReef(this.tex);
    this.reef = this.addStatic(reef.mesh);
    this.grids.push(reef.grid);
    progress(0.66, '神殿を沈めています…');
    await tick();
    this.ruins = buildRuins(this.tex, this.colliders);
    this.addStatic(this.ruins.group);
    this.boat = buildBoat(this.colliders);
    // ボートの影は島の粗いマップには入れず、ボート専用の細かいマップに焼く
    this.addStatic(this.boat.group);
    this.boat.group.traverse((o) => o.layers.enable(BOAT_SUN_LAYER));
    this.addStatic(this.boat.chain);
    this.addStatic(this.boat.anchor);
    progress(0.7, 'サンゴを育てています…');
    await tick();
    this.reefLife = buildReefLife(this, this.tex);
    this.addStatic(this.reefLife.group);
    progress(0.76, '空と海面を張っています…');
    await tick();
    this.sky = buildSky();
    this.scene.add(this.sky);
    this.water = buildWater();
    this.scene.add(this.water);
    this.caustics = new Caustics(this.renderer);
    this.snow = new MarineSnow();
    this.scene.add(this.snow.points);
    this.bubbles = new Bubbles();
    this.scene.add(this.bubbles.points);
    progress(0.8, '光を焼き込んでいます…');
    await tick();
    this.baked = bakeMaps(this.renderer, this.scene, { boat: this.boat.group });
    progress(1, '');
    console.log('[world] build times', times.join(' / '));
  }

  // 固い地形までの距離（負なら中）。海底・島・岩の塔をまとめて見る
  solidDistance(x, y, z) {
    const h = seabedHeightFast(x, z);
    let d = y - h;
    if (d < 4) {
      // 斜面では鉛直の差より実際の距離は短い
      const gx = seabedHeightFast(x + 0.5, z) - seabedHeightFast(x - 0.5, z);
      const gz = seabedHeightFast(x, z + 0.5) - seabedHeightFast(x, z - 0.5);
      d /= Math.sqrt(1 + gx * gx + gz * gz);
    }
    for (const g of this.grids) {
      const v = sampleGrid(g, x, y, z);
      if (v < d) d = v;
    }
    const c = this.colliders.distance(x, y, z);
    return c < d ? c : d;
  }

  // その場所の海底の高さ（岩の塔や島は見ない）
  solidFloor(x, z) {
    return seabedHeightFast(x, z);
  }

  // 距離の勾配（外向きの法線）
  solidNormal(x, y, z, out = this._g) {
    const e = 0.15;
    const dx = this.solidDistance(x + e, y, z) - this.solidDistance(x - e, y, z);
    const dy = this.solidDistance(x, y + e, z) - this.solidDistance(x, y - e, z);
    const dz = this.solidDistance(x, y, z + e) - this.solidDistance(x, y, z - e);
    out.set(dx, dy, dz);
    const l = out.length();
    if (l < 1e-6) out.set(0, 1, 0);
    else out.multiplyScalar(1 / l);
    return out;
  }

  // 球の中心を地形の外へ押し出す。押し出した法線を返す（当たっていなければ null）
  pushOut(p, r, vel = null) {
    let hit = null;
    for (let it = 0; it < 3; it++) {
      const d = this.solidDistance(p.x, p.y, p.z);
      if (d >= r) break;
      const n = this.solidNormal(p.x, p.y, p.z);
      p.addScaledVector(n, r - d + 0.002);
      if (vel) {
        const vn = vel.dot(n);
        if (vn < 0) vel.addScaledVector(n, -vn);
      }
      hit = n;
    }
    return hit;
  }

  // 点 a から b へ球を滑らせ、ぶつかる手前までの割合（0〜1）を返す
  sweep(a, b, r) {
    const dir = this._sweepDir || (this._sweepDir = new THREE.Vector3());
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-5) return 1;
    dir.multiplyScalar(1 / len);
    let t = 0;
    for (let i = 0; i < 24 && t < len; i++) {
      const d = this.solidDistance(a.x + dir.x * t, a.y + dir.y * t, a.z + dir.z * t) - r;
      if (d < 0.02) return Math.max(0, t / len);
      t += Math.max(d, 0.05);
    }
    return 1;
  }

  update(dt, time, camera) {
    U.uTime.value = time;
    const uw = camera.position.y < 0 ? 1 : 0;
    U.uUnderwater.value = uw;
    this.water.userData.setUnderwater(uw === 1);
    this.caustics.update(time);
    this.boat.update(time);
    if (this.baked && this.baked.boatSunBase) {
      // 揺れているボートの点を、影を焼いたときの姿勢に戻してから影のマップを引く
      const g = this.boat.group;
      g.updateMatrixWorld();
      U.uBoatSunMatrix.value.copy(g.matrixWorld).invert().premultiply(this.baked.boatSunBase);
    }
    const h = this.renderer.getDrawingBufferSize(this._size || (this._size = new THREE.Vector2())).y;
    this.snow.update(camera, h);
    this.bubbles.update(dt, camera, h);
  }
}
