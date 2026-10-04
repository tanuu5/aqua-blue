// 記憶のかけら：海の底で青白く光る結晶。近づいて触れると、誰かの記憶が聞こえる。
import * as THREE from 'three';
import { U, UW_COMMON } from '../core/env.js';
import { FRAGMENTS, FINAL_FRAGMENT } from './story.js';
import { GARDEN, REEF, CAVE } from '../world/layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function glowTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(200,240,255,0.85)');
  g.addColorStop(0.45, 'rgba(90,190,255,0.25)');
  g.addColorStop(1, 'rgba(40,120,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // 十字のきらめき
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createLinearGradient(0, S / 2, S, S / 2);
  lg.addColorStop(0, 'rgba(160,220,255,0)');
  lg.addColorStop(0.5, 'rgba(220,245,255,0.7)');
  lg.addColorStop(1, 'rgba(160,220,255,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, S / 2 - 1.5, S, 3);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(Math.PI / 2);
  ctx.translate(-S / 2, -S / 2);
  ctx.fillRect(0, S / 2 - 1.5, S, 3);
  ctx.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fragments {
  constructor(world, creatures) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'fragments';
    const crystalGeo = new THREE.OctahedronGeometry(0.2, 0);
    crystalGeo.scale(1, 1.9, 1);
    const crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.6, 3.4) });
    const shellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.2, 2.0), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowTex = glowTexture();
    this.light = new THREE.PointLight(0x9fdcff, 0, 9, 1.6);
    this.group.add(this.light);

    const W = world;
    const findFloor = (x, z, yTop, lift) => {
      let y = yTop;
      for (let i = 0; i < 200; i++) {
        if (W.solidDistance(x, y, z) < 0.25) break;
        y -= 0.2;
      }
      return V(x, y + lift, z);
    };
    const openSpot = (p) => {
      for (let i = 0; i < 30 && W.solidDistance(p.x, p.y, p.z) < 0.6; i++) p.y += 0.2;
      return p;
    };
    const R = W.ruins.points;
    const clam = creatures.bigClam;
    const ch = CAVE.chamber;
    const pos = {
      f1: openSpot(findFloor(GARDEN.x - 15, GARDEN.z + 3, -2, 1.1)),
      f2: V(clam.x, clam.y + 0.65, clam.z),
      f3: openSpot(findFloor(REEF.x - 4, REEF.z - 2, -3, 1.0)),
      f4: V(REEF.x + 9, -20.5, REEF.z - 22),
      f5: openSpot(findFloor(ch[0] + 1, ch[2] - 1, ch[1], 1.0)),
      f6: openSpot(V(CAVE.window[0] - 0.5, CAVE.window[1] - 1.5, CAVE.window[2] + 3)),
      f7: R.altar.clone(),
      f8: R.bell.clone().add(V(1.6, 0.6, 0.8)),
      final: R.statueFront.clone(),
    };

    this.items = [...FRAGMENTS, FINAL_FRAGMENT].map((def) => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(crystalGeo, crystalMat);
      const shell = new THREE.Mesh(crystalGeo, shellMat);
      shell.scale.setScalar(1.5);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fdcff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      glow.scale.setScalar(2.2);
      g.add(core, shell, glow);
      g.position.copy(pos[def.id]);
      this.group.add(g);
      return { def, id: def.id, pos: pos[def.id].clone(), group: g, core, shell, glow, collected: false, final: def.id === 'final', phase: Math.random() * 6 };
    });
    this.t = 0;
    this.nearest = null;
  }

  sync(save) {
    const got = new Set(save.fragments);
    for (const it of this.items) {
      it.collected = got.has(it.id);
      if (it.final) it.collected = got.has('final') || !FRAGMENTS.every((f) => got.has(f.id));
      it.group.visible = !it.collected;
    }
  }

  count(save) {
    return FRAGMENTS.filter((f) => save.fragments.includes(f.id)).length;
  }

  update(dt, playerPos, cameraY = -1) {
    this.t += dt;
    this.group.visible = cameraY < 0;
    let best = null, bestD = Infinity;
    for (const it of this.items) {
      if (it.collected) continue;
      const g = it.group;
      g.position.set(it.pos.x, it.pos.y + Math.sin(this.t * 1.2 + it.phase) * 0.12, it.pos.z);
      it.core.rotation.y += dt * 0.6;
      it.shell.rotation.y -= dt * 0.4;
      const pulse = 0.75 + 0.25 * Math.sin(this.t * 2.2 + it.phase);
      it.glow.material.opacity = 0.65 * pulse;
      it.glow.scale.setScalar(1.8 + pulse * 0.6);
      const d = g.position.distanceTo(playerPos);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    this.nearest = best ? { item: best, dist: bestD } : null;
    // いちばん近いかけらだけが周りを照らす
    if (best && bestD < 30) {
      this.light.position.copy(best.group.position);
      this.light.intensity = (6 + Math.sin(this.t * 2.2) * 1.5) * Math.min(1, (30 - bestD) / 10);
    } else {
      this.light.intensity = 0;
    }
    return this.nearest;
  }

  collect(it) {
    it.collected = true;
    it.group.visible = false;
  }
}
