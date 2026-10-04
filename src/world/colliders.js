// 小物（遺跡・ボート・岩など）の当たり判定。すべて距離関数で表し、空間ハッシュで近いものだけ調べる。
import * as THREE from 'three';

const CELL = 16;
const key = (ix, iz) => ix * 73856093 + iz * 19349663;

export class Colliders {
  constructor() {
    this.items = [];
    this.hash = new Map();
    this._near = [];
    this._stamp = 0;
  }

  _insert(item, minX, minZ, maxX, maxZ) {
    item.stamp = 0;
    this.items.push(item);
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const k = key(ix, iz);
        let arr = this.hash.get(k);
        if (!arr) this.hash.set(k, (arr = []));
        arr.push(item);
      }
    }
    return item;
  }

  addSphere(x, y, z, r, tag = null) {
    return this._insert({ type: 0, x, y, z, r, tag }, x - r, z - r, x + r, z + r);
  }

  addCapsule(a, b, r, tag = null) {
    const it = { type: 1, ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r, tag };
    return this._insert(it, Math.min(a.x, b.x) - r, Math.min(a.z, b.z) - r, Math.max(a.x, b.x) + r, Math.max(a.z, b.z) + r);
  }

  // 回転した箱。matrix は箱のローカル→ワールド、half は半分の大きさ
  addBox(matrix, half, tag = null, round = 0) {
    const inv = new THREE.Matrix4().copy(matrix).invert();
    const e = inv.elements;
    const it = { type: 2, e: Float32Array.from(e), hx: half.x, hy: half.y, hz: half.z, round, tag };
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      corners.push(new THREE.Vector3(sx * half.x, sy * half.y, sz * half.z).applyMatrix4(matrix));
    }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const c of corners) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
    }
    return this._insert(it, minX, minZ, maxX, maxZ);
  }

  // 任意の距離関数（局所的なもの）
  addCustom(fn, minX, minZ, maxX, maxZ, tag = null) {
    return this._insert({ type: 3, fn, tag }, minX, minZ, maxX, maxZ);
  }

  near(x, z) {
    const arr = this.hash.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    return arr || null;
  }

  static itemDist(it, x, y, z) {
    switch (it.type) {
      case 0: {
        const dx = x - it.x, dy = y - it.y, dz = z - it.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) - it.r;
      }
      case 1: {
        const pax = x - it.ax, pay = y - it.ay, paz = z - it.az;
        const bax = it.bx - it.ax, bay = it.by - it.ay, baz = it.bz - it.az;
        let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
        h = h < 0 ? 0 : h > 1 ? 1 : h;
        const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) - it.r;
      }
      case 2: {
        const e = it.e;
        const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
        const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const qx = Math.abs(lx) - it.hx + it.round, qy = Math.abs(ly) - it.hy + it.round, qz = Math.abs(lz) - it.hz + it.round;
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
        return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - it.round;
      }
      default:
        return it.fn(x, y, z);
    }
  }

  distance(x, y, z) {
    const arr = this.near(x, z);
    if (!arr) return 1e3;
    let d = 1e3;
    for (let i = 0; i < arr.length; i++) {
      const v = Colliders.itemDist(arr[i], x, y, z);
      if (v < d) d = v;
    }
    return d;
  }
}
