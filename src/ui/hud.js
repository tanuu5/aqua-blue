// 画面の表示：深さとエア、方位つきのレーダー、操作の案内、お知らせ、エリア名。
import { SPECIES_BY_ID } from '../creatures/species.js';
import { Glyphs } from './glyphs.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

export class HUD {
  constructor(root) {
    this.root = el('div', 'hud', root);
    this.root.style.display = 'none';
    // レーダー
    this.radarWrap = el('div', 'radar', this.root);
    this.radar = el('canvas', '', this.radarWrap);
    this.radar.width = this.radar.height = 220;
    this.rctx = this.radar.getContext('2d');
    // 深さ・エア
    const g = (this.gauge = el('div', 'gauge', this.root));
    const r1 = el('div', 'row', g);
    el('span', 'lbl', r1, 'DEPTH');
    this.depthEl = el('span', 'val', r1, '0.0');
    el('span', 'unit', r1, 'm');
    const r2 = el('div', 'row', g);
    el('span', 'lbl', r2, 'AIR');
    this.airEl = el('span', 'val', r2, '200');
    el('span', 'unit', r2, '');
    const bar = el('div', 'bar', g);
    this.airFill = el('div', 'fill', bar);
    // 案内など
    this.prompt = el('div', 'prompt', this.root);
    this.toasts = el('div', 'toasts', this.root);
    this.card = el('div', 'areacard', this.root);
    this.cardJp = el('div', 'jp', this.card);
    this.cardEn = el('div', 'en', this.card);
    this.help = el('div', 'help', this.root);
    this.warn = el('div', 'warn-vignette', this.root);
    this.status = el('div', 'status', this.root);
    this.lockHint = el('div', 'lockhint', this.root, 'クリックして操作をはじめる');
    this.cardTimer = 0;
    this.t = 0;
    this.lastDepth = -1;
    this.lastAir = -1;
  }

  show(v) {
    this.root.style.display = v ? '' : 'none';
  }

  setPrompt(text) {
    if (this._prompt === text) return;
    this._prompt = text;
    this.prompt.innerHTML = text || '';
    this.prompt.classList.toggle('on', !!text);
  }

  toast(html, kind = '') {
    const t = el('div', 'toast ' + kind, this.toasts, html);
    setTimeout(() => t.classList.add('on'), 20);
    setTimeout(() => t.classList.remove('on'), 3600);
    setTimeout(() => t.remove(), 4400);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
  }

  areaCard(jp, en, depth) {
    this.cardJp.textContent = jp;
    this.cardEn.textContent = `${en}${depth ? `  —  ${depth}` : ''}`;
    this.card.classList.remove('on');
    void this.card.offsetWidth;
    this.card.classList.add('on');
    clearTimeout(this._cardT);
    this._cardT = setTimeout(() => this.card.classList.remove('on'), 4200);
  }

  // 操作の案内（{move} のような印がボタンの絵になり、機器を替えると描き直される）
  setHelp(tpl) {
    if (tpl) Glyphs.bind(this.help, tpl);
    else this.help.innerHTML = '';
    this.help.classList.toggle('on', !!tpl);
  }

  setLockHint(on) {
    if (this._lock === on) return;
    this._lock = on;
    this.lockHint.classList.toggle('on', on);
  }

  setStatus(html) {
    this.status.innerHTML = html || '';
  }

  update(dt, s) {
    this.t += dt;
    const depth = Math.max(0, -s.depthY);
    const d10 = Math.round(depth * 10);
    if (d10 !== this.lastDepth) {
      this.lastDepth = d10;
      this.depthEl.textContent = (d10 / 10).toFixed(1);
    }
    const air = Math.max(0, Math.ceil(s.air));
    if (air !== this.lastAir) {
      this.lastAir = air;
      this.airEl.textContent = String(air);
      this.airFill.style.width = `${(s.air / s.airMax) * 100}%`;
    }
    const low = s.air / s.airMax;
    this.gauge.classList.toggle('low', low < 0.25);
    this.gauge.classList.toggle('crit', low < 0.12);
    this.warn.style.opacity = low < 0.12 ? (0.35 + 0.25 * Math.sin(this.t * 6)).toFixed(3) : '0';
    this.drawRadar(s);
  }

  drawRadar(s) {
    const c = this.rctx;
    const W = this.radar.width, R = W / 2 - 8;
    const cx = W / 2, cy = W / 2;
    c.clearRect(0, 0, W, W);
    // 背景
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(10,40,70,0.42)');
    g.addColorStop(1, 'rgba(4,20,40,0.6)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(200,240,255,0.55)';
    c.lineWidth = 2;
    c.stroke();
    c.strokeStyle = 'rgba(200,240,255,0.14)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
    c.stroke();
    const yaw = s.yaw;
    const range = s.range || 40;
    const k = R / range;
    // ワールド座標 → レーダー（視線方向が上）
    const toR = (x, z) => {
      const dx = x - s.px, dz = z - s.pz;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const f = dx * fx + dz * fz;
      const r = dx * rx + dz * rz;
      return [cx + r * k, cy - f * k, Math.hypot(dx, dz)];
    };
    // 方位の文字
    c.font = '600 17px Rajdhani, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [lab, ax, az] of [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]]) {
      const [x, y] = toR(s.px + ax * 1000, s.pz + az * 1000);
      const dx = x - cx, dy = y - cy;
      const l = Math.hypot(dx, dy) || 1;
      const px = cx + (dx / l) * (R - 1), py = cy + (dy / l) * (R - 1);
      c.fillStyle = 'rgba(4,20,40,0.85)';
      c.beginPath();
      c.arc(px, py, 10, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = lab === 'N' ? '#ffffff' : 'rgba(220,240,255,0.85)';
      c.fillText(lab, px, py + 1);
    }
    c.save();
    c.beginPath();
    c.arc(cx, cy, R - 12, 0, Math.PI * 2);
    c.clip();
    // 生き物
    for (const d of s.dots) {
      const [x, y, dist] = toR(d.x, d.z);
      if (dist > range) continue;
      const big = d.big;
      c.fillStyle = big ? 'rgba(120,230,255,0.95)' : 'rgba(70,170,255,0.85)';
      c.beginPath();
      c.arc(x, y, big ? 4 : 2.6, 0, Math.PI * 2);
      c.fill();
    }
    // 記憶の気配
    if (s.hint) {
      const [x, y, dist] = toR(s.hint.x, s.hint.z);
      const a = 0.5 + 0.5 * Math.sin(this.t * 3);
      if (dist < range) {
        const gg = c.createRadialGradient(x, y, 0, x, y, 16);
        gg.addColorStop(0, `rgba(255,236,150,${0.9 * a})`);
        gg.addColorStop(1, 'rgba(255,236,150,0)');
        c.fillStyle = gg;
        c.beginPath();
        c.arc(x, y, 16, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    // ボート（範囲外なら縁に）
    if (s.boat) {
      let [x, y, dist] = toR(s.boat.x, s.boat.z);
      if (dist > range) {
        const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy);
        x = cx + (dx / l) * (R - 22);
        y = cy + (dy / l) * (R - 22);
      }
      c.fillStyle = '#ffffff';
      c.strokeStyle = 'rgba(4,20,40,0.8)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - 7, y - 2);
      c.lineTo(x + 7, y - 2);
      c.lineTo(x + 4, y + 4);
      c.lineTo(x - 4, y + 4);
      c.closePath();
      c.stroke();
      c.fill();
      c.fillRect(x - 1, y - 9, 2, 7);
    }
    // 自分（黄色い矢印）
    c.fillStyle = '#ffd34d';
    c.strokeStyle = 'rgba(40,30,0,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx, cy - 10);
    c.lineTo(cx + 7, cy + 7);
    c.lineTo(cx, cy + 3);
    c.lineTo(cx - 7, cy + 7);
    c.closePath();
    c.fill();
    c.stroke();
  }
}

export function speciesLabel(id) {
  const s = SPECIES_BY_ID[id];
  return s ? `No.${String(s.no).padStart(2, '0')} ${s.name}` : id;
}
