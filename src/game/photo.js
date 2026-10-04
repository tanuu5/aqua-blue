// 水中カメラ：ファインダーの中の生き物を見分けて、撮った写真を図鑑とアルバムに残す。
import * as THREE from 'three';
import { SPECIES_BY_ID } from '../creatures/species.js';
import { Album, Save } from '../core/save.js';
import { Glyphs } from '../ui/glyphs.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

export class PhotoSystem {
  constructor(renderer, camera, creatures, world, uiRoot) {
    this.renderer = renderer;
    this.camera = camera;
    this.creatures = creatures;
    this.world = world;
    this.requested = null;
    this.subject = null;
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.timer = 0;
    // ファインダー
    const vf = (this.vf = el('div', 'viewfinder', uiRoot));
    for (const c of ['tl', 'tr', 'bl', 'br']) el('div', 'vf-corner ' + c, vf);
    el('div', 'vf-center', vf);
    this.vfLabel = el('div', 'vf-label', vf);
    this.vfZoom = el('div', 'vf-zoom', vf);
    this.vfInfo = el('div', 'vf-info', vf, '<span class="rec"></span>');
    Glyphs.bind(el('span', 'vf-keys', this.vfInfo), '{shutter}<span>撮影</span>{zoom}<span>ズーム</span>');
    this.flash = el('div', 'flash', uiRoot);
    // 撮った写真のカード
    this.card = el('div', 'photo-card', uiRoot);
    this.cardImg = el('img', '', this.card);
    this.cardText = el('div', 'pc-text', this.card);
  }

  setAiming(on, zoom = 1) {
    this.vf.classList.toggle('on', on);
    if (on) this.vfZoom.textContent = `×${zoom.toFixed(1)}`;
  }

  // ファインダー内でいちばんよく写っている生き物
  findSubject() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const camPos = this._p.setFromMatrixPosition(cam.matrixWorld);
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    const best = new Map();
    const v = this._v;
    for (const pr of this.creatures.providers) {
      const sp = pr.species;
      pr.forEach((x, y, z, size) => {
        const dx = x - camPos.x, dy = y - camPos.y, dz = z - camPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 40 || dist < 0.25) return;
        v.set(x, y, z).applyMatrix4(vp);
        if (v.z > 1 || Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.92) return;
        const frac = size / (2 * dist * tanHalf);
        const center = 1 - 0.55 * Math.min(1, Math.hypot(v.x, v.y));
        const clarity = Math.exp(-dist * 0.035);
        const score = Math.min(frac, 0.6) * center * clarity;
        const cur = best.get(sp);
        if (!cur || score > cur.score) best.set(sp, { species: sp, score, dist, frac, x, y, z, ndc: [v.x, v.y] });
      });
    }
    const list = [...best.values()].sort((a, b) => b.score - a.score);
    // 見えているか（岩の向こうではないか）を上位だけ調べる
    const out = [];
    for (const c of list.slice(0, 4)) {
      const t = this.world.sweep(camPos, new THREE.Vector3(c.x, c.y, c.z), 0.05);
      if (t > 0.97) out.push(c);
    }
    return out.filter((c) => c.frac > 0.012);
  }

  update(dt, aiming, zoom) {
    this.timer -= dt;
    if (!aiming) {
      this.subject = null;
      return;
    }
    if (this.timer <= 0) {
      this.timer = 0.12;
      const list = this.findSubject();
      this.subject = list[0] || null;
      this.candidates = list;
    }
    this.vfZoom.textContent = `×${zoom.toFixed(1)}`;
    if (this.subject) {
      const s = SPECIES_BY_ID[this.subject.species];
      const known = !!Save.data?.species[this.subject.species];
      this.vfLabel.innerHTML = `${known ? '' : '<span class="new">未登録</span>'}${s.name}`;
      this.vfLabel.classList.add('on');
    } else {
      this.vfLabel.classList.remove('on');
    }
  }

  // シャッター。実際の取り込みは描画の直後（afterRender）で行う
  shoot(meta) {
    if (this.requested) return;
    const list = this.candidates || this.findSubject();
    this.requested = { meta, list };
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  afterRender() {
    if (!this.requested) return null;
    const { meta, list } = this.requested;
    this.requested = null;
    const src = this.renderer.domElement;
    const W = 960, H = 540;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    // 16:9 に切り抜く
    const sa = src.width / src.height, ta = W / H;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sa > ta) { sw = src.height * ta; sx = (src.width - sw) / 2; }
    else { sh = src.width / ta; sy = (src.height - sh) / 2; }
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
    const best = list[0] || null;
    const starsOf = (c) => (c.score > 0.16 ? 3 : c.score > 0.07 ? 2 : 1);
    const stars = best ? starsOf(best) : 0;
    // 主役のほかは、はっきり写っているものだけ数える
    const subjects = list.filter((c, i) => i === 0 || c.frac > 0.035);
    const result = {
      id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
      time: Date.now(),
      species: subjects.map((c) => c.species),
      starsBy: Object.fromEntries(subjects.map((c) => [c.species, starsOf(c)])),
      best: best ? best.species : null,
      stars,
      depth: meta.depth,
      area: meta.area,
    };
    const tc = document.createElement('canvas');
    tc.width = 320;
    tc.height = 180;
    tc.getContext('2d').drawImage(cv, 0, 0, 320, 180);
    result.thumb = tc.toDataURL('image/jpeg', 0.75);
    cv.toBlob((blob) => {
      result.blob = blob;
      Album.add(result);
    }, 'image/jpeg', 0.88);
    return result;
  }

  showCard(result, isNew) {
    this.cardImg.src = result.thumb;
    const s = result.best ? SPECIES_BY_ID[result.best] : null;
    const st = '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars);
    this.cardText.innerHTML = s
      ? `${isNew ? '<span class="new">NEW</span>' : ''}<b>${s.name}</b><span class="stars">${st}</span>`
      : '<b>海の風景</b>';
    this.card.classList.remove('on');
    void this.card.offsetWidth;
    this.card.classList.add('on');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.card.classList.remove('on'), 3200);
  }
}
