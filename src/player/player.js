// プレイヤー：泳ぎ（慣性・浮上・当たり判定）と、三人称／カメラ構え時の一人称の視点。
import * as THREE from 'three';
import { Diver } from './diver.js';
import { BOUNDS } from '../world/layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const SURFACE_Y = -0.62;

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.diver = new Diver();
    world.scene.add(this.diver.root);
    this.pos = new THREE.Vector3(0, -3, 60);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.12;
    this.camDist = 4.2;
    this.camDistTarget = 4.2;
    this.camPos = new THREE.Vector3();
    this.camReady = false;
    this.bodyQuat = new THREE.Quaternion();
    this.radius = 0.42;
    this.lightOn = false;
    this.aim = false;
    this.aimBlend = 0;
    this.zoom = 1;
    this.surfaced = false;
    this.speed = 0;
    this.dashing = false;
    this.turn = 0;
    this.prevYawDir = 0;
    this.baseFov = 62;
    this.frozen = false;
    this.outOfBounds = 0;
    this.bodyFwd = new THREE.Vector3(0, 0, -1);
    this._t = { v: new THREE.Vector3(), w: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion() };
    this.headWorld = new THREE.Vector3();
    this.regWorld = new THREE.Vector3();
  }

  spawn(x, y, z, yaw = 0, pitch = -0.1) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.bodyFwd.copy(f);
    this._t.m.lookAt(f, new THREE.Vector3(), UP);
    this.bodyQuat.setFromRotationMatrix(this._t.m);
    this.camReady = false;
    this.aim = false;
    this.aimBlend = 0;
    this.zoom = 1;
  }

  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, input, { canMove = true, canLook = true, speedMul = 1 } = {}) {
    const t = this._t;
    // ---- 視点 ----
    if (canLook) {
      const lk = input.look(dt);
      const zf = this.aim ? 1 / this.zoom : 1;
      this.yaw -= lk.dx * zf;
      this.pitch = clamp(this.pitch - lk.dy * zf, -1.4, 1.4);
    }
    // ---- 構え（カメラ）----
    this.aim = canMove && input.aim;
    this.aimBlend += ((this.aim ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-dt * 10));
    if (this.aim) {
      this.zoom = clamp(this.zoom * Math.pow(1.12, input.zoom), 1, 3.2);
    } else {
      this.zoom += (1 - this.zoom) * (1 - Math.exp(-dt * 6));
      this.camDistTarget = clamp(this.camDistTarget + input.zoom * 0.4, 2.6, 7);
    }

    // ---- 泳ぎ ----
    const fwd = this.lookDir(t.v);
    const right = t.w.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    let mv = { x: 0, y: 0 }, vert = 0;
    if (canMove) {
      mv = input.move;
      vert = input.vertical;
    }
    wish.addScaledVector(fwd, mv.y).addScaledVector(right, mv.x).addScaledVector(UP, vert);
    if (wish.lengthSq() > 1) wish.normalize();
    this.dashing = canMove && input.dash && wish.lengthSq() > 0.05 && !this.aim;
    let top = (this.dashing ? 4.3 : 2.4) * speedMul;
    if (this.aim) top *= 0.45;
    // 水面では前後左右だけ（浮いている）
    if (this.surfaced && wish.y > 0) wish.y = 0;
    const accel = wish.lengthSq() > 0.01 ? 2.4 : 1.3;
    const k = 1 - Math.exp(-dt * accel);
    this.vel.x += (wish.x * top - this.vel.x) * k;
    this.vel.y += (wish.y * top - this.vel.y) * k;
    this.vel.z += (wish.z * top - this.vel.z) * k;
    // 何もしないとゆっくり沈みも浮きもしない（中性浮力）。水面付近では少し浮く
    if (this.pos.y > -1.6 && vert >= 0 && !(mv.y > 0 && fwd.y < -0.2)) this.vel.y += 0.6 * dt;

    this.pos.addScaledVector(this.vel, dt);

    // ---- 水面 ----
    if (this.pos.y > SURFACE_Y) {
      this.pos.y = SURFACE_Y;
      if (this.vel.y > 0) this.vel.y = 0;
    }
    const wasSurfaced = this.surfaced;
    this.surfaced = this.pos.y >= SURFACE_Y - 0.08;
    if (this.surfaced && vert < 0) this.surfaced = false;
    this.justSurfaced = this.surfaced && !wasSurfaced;
    this.justDived = !this.surfaced && wasSurfaced;

    // ---- 当たり判定（胴体と、脚の先）----
    this.world.pushOut(this.pos, this.radius, this.vel);
    const legs = t.w.copy(this.pos).addScaledVector(this.bodyFwd, -0.85);
    const before = legs.clone();
    this.world.pushOut(legs, 0.28, null);
    if (legs.distanceToSquared(before) > 1e-8) this.pos.add(legs.sub(before).multiplyScalar(0.7));

    // ---- 遊べる範囲（潮に押し戻される）----
    let ob = 0;
    const B = BOUNDS;
    if (this.pos.x < B.minX) { this.vel.x += (B.minX - this.pos.x) * 2.5 * dt; ob = 1; }
    if (this.pos.x > B.maxX) { this.vel.x -= (this.pos.x - B.maxX) * 2.5 * dt; ob = 1; }
    if (this.pos.z < B.minZ) { this.vel.z += (B.minZ - this.pos.z) * 2.5 * dt; ob = 1; }
    if (this.pos.z > B.maxZ) { this.vel.z -= (this.pos.z - B.maxZ) * 2.5 * dt; ob = 1; }
    this.pos.x = clamp(this.pos.x, B.minX - 12, B.maxX + 12);
    this.pos.z = clamp(this.pos.z, B.minZ - 12, B.maxZ + 12);
    this.outOfBounds = ob;

    this.speed = this.vel.length();

    // ---- 体の向き ----
    let dir = t.v;
    if (this.aimBlend > 0.5) {
      this.lookDir(dir);
    } else if (this.speed > 0.35) {
      dir.copy(this.vel).multiplyScalar(1 / this.speed);
    } else {
      dir.copy(this.bodyFwd);
      dir.y *= 0.96;
    }
    if (this.surfaced) dir.y = Math.min(dir.y, 0.05);
    dir.y = clamp(dir.y, -0.82, 0.82);
    dir.normalize();
    const prevYaw = Math.atan2(this.bodyFwd.x, this.bodyFwd.z);
    t.m.lookAt(dir, new THREE.Vector3(), UP);
    t.q.setFromRotationMatrix(t.m);
    const turnRate = this.aimBlend > 0.5 ? 12 : 2.6 + Math.min(this.speed, 3) * 0.6;
    this.bodyQuat.slerp(t.q, 1 - Math.exp(-dt * turnRate));
    this.bodyFwd.set(0, 0, 1).applyQuaternion(this.bodyQuat);
    const newYaw = Math.atan2(this.bodyFwd.x, this.bodyFwd.z);
    let dy = newYaw - prevYaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    this.turn += (clamp(dy / Math.max(dt, 1e-3), -2, 2) - this.turn) * (1 - Math.exp(-dt * 5));

    const D = this.diver;
    D.root.position.copy(this.pos);
    if (this.surfaced) D.root.position.y += Math.sin(performance.now() * 0.0016) * 0.06;
    D.root.quaternion.copy(this.bodyQuat);
    const speedNorm = this.speed / 2.4;
    D.update(dt, { speed: speedNorm, turn: this.turn, rising: clamp(this.vel.y / 3, -1, 1), aim: this.aim });
    D.root.updateMatrixWorld(true);
    D.head.getWorldPosition(this.headWorld);
    D.regulator.getWorldPosition(this.regWorld);
    D.root.visible = this.aimBlend < 0.6;
  }

  updateCamera(dt) {
    const cam = this.camera;
    const look = this.lookDir(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camDist += (this.camDistTarget - this.camDist) * (1 - Math.exp(-dt * 6));

    // 三人称：少し右上から肩越しに
    const target = new THREE.Vector3().copy(this.pos);
    target.y += 0.35;
    const desired = new THREE.Vector3()
      .copy(target)
      .addScaledVector(look, -this.camDist)
      .addScaledVector(right, 0.45)
      .addScaledVector(UP, 0.25);
    const frac = this.world.sweep(target, desired, 0.3);
    const third = new THREE.Vector3().lerpVectors(target, desired, frac);
    // 一人称（カメラを構えたとき）
    const first = new THREE.Vector3().copy(this.headWorld).addScaledVector(look, 0.25);
    const want = new THREE.Vector3().lerpVectors(third, first, this.aimBlend);

    if (!this.camReady) {
      this.camPos.copy(want);
      this.camReady = true;
    } else {
      this.camPos.lerp(want, 1 - Math.exp(-dt * 14));
      // なめらかにした結果が壁に入っていたら戻す
      const f2 = this.world.sweep(target, this.camPos, 0.25);
      if (f2 < 1) this.camPos.lerpVectors(target, this.camPos, f2);
    }
    // 水面をまたがない（潜っている間は水中、浮いている間は水上）
    if (this.surfaced) this.camPos.y = Math.max(this.camPos.y, 0.5);
    else this.camPos.y = Math.min(this.camPos.y, -0.35);

    cam.position.copy(this.camPos);
    const lookAt = new THREE.Vector3().copy(cam.position).add(look);
    cam.lookAt(lookAt);
    const fov = this.baseFov / (1 + (this.zoom - 1) * this.aimBlend);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  toggleLight() {
    this.lightOn = !this.lightOn;
    this.diver.setLight(this.lightOn);
    return this.lightOn;
  }
}
