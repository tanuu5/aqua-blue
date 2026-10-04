// 操作の案内に出すボタンの絵。キーボード／マウスとゲームパッドを自動で切り替え、
// ゲームパッドは Xbox 系（タイプ1）と PlayStation 系（タイプ2）の表示を選べる（割り当ては同じ）。

const svg = (inner, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

const PS_SYMBOL = {
  cross: '<path d="M7.5 7.5 L16.5 16.5 M16.5 7.5 L7.5 16.5" stroke="#86b6ff" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
  circle: '<circle cx="12" cy="12" r="5.2" stroke="#ff7d86" stroke-width="2.2" fill="none"/>',
  square: '<rect x="7.2" y="7.2" width="9.6" height="9.6" rx="0.6" stroke="#f3a0d6" stroke-width="2.2" fill="none"/>',
  triangle: '<path d="M12 6.6 L17.6 16.2 H6.4 Z" stroke="#56d6a9" stroke-width="2.1" stroke-linejoin="round" fill="none"/>',
};
const XB_FACE = { A: '#7bd36a', B: '#ff6a5c', X: '#5aa2ff', Y: '#ffd24a' };

// 標準配置のボタン番号 → タイプごとの表示
const FACE = {
  0: { xb: 'A', ps: 'cross' },
  1: { xb: 'B', ps: 'circle' },
  2: { xb: 'X', ps: 'square' },
  3: { xb: 'Y', ps: 'triangle' },
};

function face(i, type) {
  const f = FACE[i];
  if (type === 'ps') return `<span class="gl gl-face ps">${svg(PS_SYMBOL[f.ps])}</span>`;
  return `<span class="gl gl-face xb" style="color:${XB_FACE[f.xb]}">${f.xb}</span>`;
}
const shoulder = (label) => `<span class="gl gl-sh">${label}</span>`;
const stick = (side) => `<span class="gl gl-stick">${svg('<circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.4" fill="currentColor" opacity="0.35"/>')}<b>${side}</b></span>`;
function dpad(dirs) {
  const on = (d) => (dirs.includes(d) ? '#ffffff' : 'rgba(255,255,255,0.28)');
  return `<span class="gl gl-dpad">${svg(
    `<rect x="9" y="2.5" width="6" height="7" rx="1.2" fill="${on('u')}"/>` +
      `<rect x="9" y="14.5" width="6" height="7" rx="1.2" fill="${on('d')}"/>` +
      `<rect x="2.5" y="9" width="7" height="6" rx="1.2" fill="${on('l')}"/>` +
      `<rect x="14.5" y="9" width="7" height="6" rx="1.2" fill="${on('r')}"/>`
  )}</span>`;
}
const menuBtn = (type) => (type === 'ps' ? '<span class="gl gl-pill">OPTIONS</span>' : `<span class="gl gl-menu">${svg('<path d="M7 8.5 H17 M7 12 H17 M7 15.5 H17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>')}</span>`);

const key = (k) => `<kbd class="gl gl-key">${k}</kbd>`;
function mouse(part) {
  const l = part === 'left' ? '#ffffff' : 'none';
  const r = part === 'right' ? '#ffffff' : 'none';
  const w = part === 'wheel' ? '#ffffff' : 'rgba(255,255,255,0.45)';
  const body =
    '<rect x="6.5" y="3" width="11" height="18" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M6.5 10 H17.5 M12 3 V10" stroke="currentColor" stroke-width="1.2"/>' +
    `<path d="M12 3.4 A5 5 0 0 0 7 8.5 V9.6 H11.6 V3.4 Z" fill="${l}"/>` +
    `<path d="M12.4 3.4 A5 5 0 0 1 17 8.5 V9.6 H12.4 Z" fill="${r}"/>` +
    `<rect x="11" y="5" width="2" height="3.4" rx="1" fill="${w}"/>`;
  const arrows = part === 'move' ? '<path d="M2 12 L4.5 10 M2 12 L4.5 14 M22 12 L19.5 10 M22 12 L19.5 14" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>' : '';
  return `<span class="gl gl-mouse">${svg(body + arrows)}</span>`;
}

// 動作 → ボタンの絵
function glyphFor(action, mode, type) {
  if (mode === 'pad') {
    const L1 = type === 'ps' ? 'L1' : 'LB';
    const L2 = type === 'ps' ? 'L2' : 'LT';
    const R2 = type === 'ps' ? 'R2' : 'RT';
    switch (action) {
      case 'interact': return face(2, type);
      case 'confirm':
      case 'next': return face(0, type);
      case 'back': return face(1, type);
      case 'up': return face(0, type);
      case 'down': return face(1, type);
      case 'dash': return shoulder(L1);
      case 'aim': return shoulder(L2);
      case 'shutter': return shoulder(R2);
      case 'zoom': return dpad(['u', 'd']);
      case 'light': return face(3, type);
      case 'pause': return menuBtn(type);
      case 'move': return stick('L');
      case 'look': return stick('R');
      case 'tabs': return dpad(['l', 'r']);
      case 'scroll': return dpad(['u', 'd']);
      case 'select': return dpad(['u', 'd']);
      case 'adjust': return dpad(['l', 'r']);
      case 'start': return face(0, type);
      default: return '';
    }
  }
  switch (action) {
    case 'interact': return key('E');
    case 'confirm': return key('Enter');
    case 'next': return key('E');
    case 'back': return key('Esc');
    case 'up': return key('Space');
    case 'down': return key('C');
    case 'dash': return key('Shift');
    case 'aim': return mouse('right');
    case 'shutter': return mouse('left');
    case 'zoom': return mouse('wheel');
    case 'light': return key('F');
    case 'pause': return key('Esc');
    case 'move': return `<span class="gl-keys">${key('W')}${key('A')}${key('S')}${key('D')}</span>`;
    case 'look': return mouse('move');
    case 'tabs': return `<span class="gl-keys">${key('◀')}${key('▶')}</span>`;
    case 'scroll': return `<span class="gl-keys">${key('▲')}${key('▼')}</span>`;
    case 'select': return `<span class="gl-keys">${key('▲')}${key('▼')}</span>`;
    case 'adjust': return `<span class="gl-keys">${key('◀')}${key('▶')}</span>`;
    case 'start': return mouse('left');
    default: return '';
  }
}

// ゲームパッドの名前からタイプを推定する
export function detectPadType(id = '') {
  const s = id.toLowerCase();
  // Xbox のパッドも名前に「Wireless Controller」を含むので、先に Microsoft 系を見分ける
  if (/xbox|xinput|045e|microsoft/.test(s)) return 'xb';
  if (/054c|dualsense|dualshock|playstation|ps4|ps5/.test(s)) return 'ps';
  // Sony のパッドは環境によって「Wireless Controller」とだけ名乗る
  if (/^wireless controller/.test(s)) return 'ps';
  return 'xb';
}

export const Glyphs = {
  mode: 'kbm',
  detected: 'xb',
  setting: 'auto',
  bound: new Set(),
  listeners: new Set(),

  get type() {
    if (this.setting === 'type1') return 'xb';
    if (this.setting === 'type2') return 'ps';
    return this.detected;
  },

  btn(action) {
    return glyphFor(action, this.mode, this.type);
  },

  // 機器を指定して描く（操作説明の表など）
  btnAs(action, mode) {
    return glyphFor(action, mode, this.type);
  },

  // テンプレートの {動作} をボタンの絵に置き換える。関数なら (mode) => 文字列
  fmt(tpl) {
    const t = typeof tpl === 'function' ? tpl(this.mode, this.type) : tpl;
    return t.replace(/\{(\w+)\}/g, (_, a) => this.btn(a));
  },

  bind(el, tpl) {
    el.innerHTML = this.fmt(tpl);
    this.bound.add({ el, tpl });
    return el;
  },

  refresh() {
    for (const b of this.bound) {
      if (!b.el.isConnected) {
        this.bound.delete(b);
        continue;
      }
      b.el.innerHTML = this.fmt(b.tpl);
    }
    for (const f of this.listeners) f(this.mode, this.type);
  },

  onChange(f) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  },

  // 毎フレーム呼ぶ。最後に触った機器と、つながっているパッドの種類を見る
  update(input, setting = 'auto') {
    const mode = input.lastDevice === 'pad' ? 'pad' : 'kbm';
    const detected = input.gp ? detectPadType(input.gp.id) : this.detected;
    if (mode !== this.mode || detected !== this.detected || setting !== this.setting) {
      this.mode = mode;
      this.detected = detected;
      this.setting = setting;
      this.refresh();
    }
  },

  // オプションの見本用
  sample(type) {
    return [0, 1, 2, 3].map((i) => face(i, type)).join('');
  },
};
