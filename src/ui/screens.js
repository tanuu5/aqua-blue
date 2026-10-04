// 画面いろいろ：タイトル、メニュー、ギャラリー（図鑑・アルバム・記憶）、オプション、物語の文章。
import { SPECIES, SPECIES_BY_ID } from '../creatures/species.js';
import { FRAGMENTS, FINAL_FRAGMENT } from '../game/story.js';
import { Album, Save } from '../core/save.js';
import { Sound } from '../audio/audio.js';
import { Glyphs } from './glyphs.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 上下で選んで決定するメニュー
class Menu {
  constructor(parent, cls, items, opts = {}) {
    this.el = el('div', 'menu interactive ' + cls, parent);
    this.items = [];
    this.index = 0;
    this.onBack = opts.onBack || null;
    this.setItems(items);
  }
  setItems(items) {
    this.el.innerHTML = '';
    this.items = items.map((it, i) => {
      const b = el('div', 'mi' + (it.disabled ? ' disabled' : ''), this.el, `<span class="cur">▶</span><span class="lab">${esc(it.label)}</span>`);
      if (it.sub) el('span', 'sub', b, esc(it.sub));
      b.addEventListener('mouseenter', () => {
        if (it.disabled) return;
        if (this.index !== i) Sound.play('select');
        this.index = i;
        this.render();
      });
      b.addEventListener('click', () => {
        if (it.disabled) return;
        this.index = i;
        this.activate();
      });
      return { ...it, b };
    });
    this.index = Math.max(0, this.items.findIndex((it) => !it.disabled));
    this.render();
  }
  render() {
    this.items.forEach((it, i) => it.b.classList.toggle('sel', i === this.index));
  }
  move(d) {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      this.index = (this.index + d + n) % n;
      if (!this.items[this.index].disabled) break;
    }
    Sound.play('select');
    this.render();
  }
  activate() {
    const it = this.items[this.index];
    if (!it || it.disabled) return;
    Sound.play('confirm');
    it.action && it.action();
  }
  handle(input) {
    if (input.menuUp) this.move(-1);
    else if (input.menuDown) this.move(1);
    else if (input.menuOk) this.activate();
    else if (input.menuBack && this.onBack) {
      Sound.play('cancel');
      this.onBack();
    }
  }
}

// 画面の下に出す操作の案内（機器に合わせてボタンの絵が変わる）
const hint = (parent, tpl, cls = '') => Glyphs.bind(el('div', 'mhint ' + cls, parent), tpl);
const MENU_HINT = '{select}<span>選ぶ</span>{confirm}<span>決定</span>{back}<span>もどる</span>';

export class Screens {
  constructor(root) {
    this.root = root;
    this.layer = el('div', 'screens', root);
    this.stack = [];
    this.handlers = {};
    // 黒（白）でのフェード
    this.fade = el('div', 'fade', root);
  }

  setFade(v, color = '#000', ms = 800) {
    this.fade.style.transition = `opacity ${ms}ms ease`;
    this.fade.style.background = color;
    this.fade.style.opacity = String(v);
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---- はじめの「クリックして開始」----
  boot(onStart) {
    const s = el('div', 'boot interactive', this.layer);
    el('div', 'boot-logo', s, 'AQUA BLUE');
    Glyphs.bind(el('div', 'boot-press', s), (mode) => (mode === 'pad' ? '{start}<span>ではじめる</span>' : 'クリックしてはじめる'));
    el('div', 'boot-note', s, '音が出ます　／　ヘッドホン推奨　／　ゲームパッドはボタンを押してはじめる');
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      this.bootGo = null;
      removeEventListener('keydown', go);
      s.removeEventListener('click', go);
      s.classList.add('out');
      setTimeout(() => s.remove(), 800);
      onStart();
    };
    s.addEventListener('click', go);
    addEventListener('keydown', go);
    this.bootGo = go;
    this.current = { handle: () => {} };
  }

  clear() {
    this.layer.querySelectorAll('.screen').forEach((e) => e.remove());
    this.current = null;
  }

  // ---- タイトル ----
  title({ canContinue, onNew, onContinue, onGallery, onOption, endingSeen }) {
    this.clear();
    const s = el('div', 'screen title', this.layer);
    const logo = el('div', 'logo', s);
    el('div', 'logo-en', logo, '<span class="cap">A</span>QUA <span class="cap">B</span>LUE');
    el('div', 'logo-wave', logo, '<svg viewBox="0 0 400 30" preserveAspectRatio="none"><path d="M0 18 C 60 4, 120 30, 200 16 S 330 4, 400 14" /></svg>');
    el('div', 'logo-jp', logo, 'アクアブルー');
    el('div', 'logo-sub', logo, '〜失われた海の記憶〜');
    const menu = new Menu(s, 'title-menu', [
      { label: 'New Game', action: onNew },
      { label: 'Continue', action: onContinue, disabled: !canContinue },
      { label: 'Gallery', action: onGallery },
      { label: 'Option', action: onOption },
    ]);
    if (canContinue) menu.index = 1;
    menu.render();
    el('div', 'title-foot', s, endingSeen ? '✦ 記憶はすべて、海に還った' : '');
    hint(s, (mode) => (mode === 'pad' ? '{select}<span>選ぶ</span>{confirm}<span>決定</span>' : ''), 'title-hint');
    this.current = menu;
    setTimeout(() => s.classList.add('on'), 20);
    return s;
  }

  // ---- 一時停止 ----
  pause({ onResume, onGallery, onHelp, onOption, onBoat, onTitle }) {
    this.clear();
    const s = el('div', 'screen pause', this.layer);
    const p = el('div', 'panel', s);
    el('div', 'panel-title', p, 'PAUSE');
    const menu = new Menu(p, 'pause-menu', [
      { label: '潜水を続ける', action: onResume },
      { label: '図鑑・アルバム・記憶', action: onGallery },
      { label: '操作のしかた', action: onHelp },
      { label: 'オプション', action: onOption },
      { label: 'ボートへ戻る', action: onBoat },
      { label: 'タイトルへ（記録は自動で残ります）', action: onTitle },
    ], { onBack: onResume });
    hint(p, MENU_HINT);
    this.current = menu;
    setTimeout(() => s.classList.add('on'), 20);
  }

  // ---- ボートの上 ----
  boat({ lines, onDive, onRest, title = 'ダイビングボート' }) {
    this.clear();
    const s = el('div', 'screen boatmenu', this.layer);
    const p = el('div', 'panel', s);
    el('div', 'panel-title', p, esc(title));
    const t = el('div', 'boat-talk', p);
    t.innerHTML = lines.map((l) => `<p>${esc(l)}</p>`).join('');
    const menu = new Menu(p, 'boat-menu', [
      { label: 'もう一度潜る', sub: 'エアを補給して海へ', action: onDive },
      { label: '記録して休む', sub: 'タイトルへ戻る', action: onRest },
    ], { onBack: onDive });
    hint(p, '{select}<span>選ぶ</span>{confirm}<span>決定</span>');
    this.current = menu;
    setTimeout(() => s.classList.add('on'), 20);
  }

  // ---- 操作のしかた ----
  help({ onClose }) {
    this.clear();
    const s = el('div', 'screen helpscreen interactive', this.layer);
    const p = el('div', 'panel wide', s);
    el('div', 'panel-title', p, '操作のしかた');
    const ROWS = [
      ['泳ぐ（見ている方向へ）', ['move']],
      ['見回す', ['look']],
      ['浮上 ／ 潜行', ['up', 'down']],
      ['速く泳ぐ（エアの減りが早い）', ['dash']],
      ['カメラを構える（押したまま）', ['aim']],
      ['撮影（構えているとき）', ['shutter']],
      ['ズーム ／ カメラの距離', ['zoom']],
      ['調べる・ボートに上がる', ['interact']],
      ['潜水ライト', ['light']],
      ['メニュー', ['pause']],
    ];
    const table = el('div', 'help-table', p);
    Glyphs.bind(table, (mode, type) => {
      const padName = type === 'ps' ? 'ゲームパッド（タイプ2）' : 'ゲームパッド（タイプ1）';
      let h = `<div class="ht-row ht-head"><span></span><span class="${mode === 'kbm' ? 'on' : ''}">キーボード・マウス</span><span class="${mode === 'pad' ? 'on' : ''}">${padName}</span></div>`;
      for (const [label, acts] of ROWS) {
        const k = acts.map((a) => Glyphs.btnAs(a, 'kbm')).join('<i>／</i>');
        const g = acts.map((a) => Glyphs.btnAs(a, 'pad')).join('<i>／</i>');
        h += `<div class="ht-row"><span class="ht-label">${label}</span><span class="ht-k ${mode === 'kbm' ? 'on' : ''}">${k}</span><span class="ht-k ${mode === 'pad' ? 'on' : ''}">${g}</span></div>`;
      }
      return h;
    });
    el('div', 'help-note', p, '生き物を撮影すると図鑑に登録されます。海のどこかで光る「記憶のかけら」に触れると、物語が少しずつわかります。ボタンの表示はオプションで切り替えられます。');
    const menu = new Menu(p, 'help-menu', [{ label: 'とじる', action: onClose }], { onBack: onClose });
    hint(p, '{confirm}<span>とじる</span>');
    this.current = menu;
    setTimeout(() => s.classList.add('on'), 20);
  }

  // ---- オプション ----
  options({ settings, onChange, onClose }) {
    this.clear();
    const s = el('div', 'screen options interactive', this.layer);
    const p = el('div', 'panel wide', s);
    el('div', 'panel-title', p, 'オプション');
    const rows = [
      { key: 'bgm', label: 'BGM の音量', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'se', label: '効果音の音量', type: 'range', min: 0, max: 1, step: 0.05 },
      { key: 'sens', label: 'マウス感度', type: 'range', min: 0.3, max: 2.5, step: 0.05 },
      { key: 'fov', label: '視野角', type: 'range', min: 50, max: 80, step: 1 },
      { key: 'invertY', label: '上下を反転', type: 'toggle' },
      { key: 'quality', label: '画質', type: 'choice', choices: [['low', '軽い'], ['mid', 'ふつう'], ['high', 'きれい']] },
      { key: 'help', label: '操作の案内を表示', type: 'toggle' },
      {
        key: 'padGlyphs',
        label: 'パッドのボタン表示',
        type: 'choice',
        choices: [
          ['auto', '自動'],
          ['type1', `タイプ1<span class="gsample">${Glyphs.sample('xb')}</span>`],
          ['type2', `タイプ2<span class="gsample">${Glyphs.sample('ps')}</span>`],
        ],
      },
    ];
    const list = el('div', 'opt-list', p);
    const items = [];
    const fmt = (r, v) => (r.type === 'range' ? (r.key === 'fov' ? `${v}°` : `${Math.round(v * 100)}%`) : '');
    rows.forEach((r) => {
      const row = el('div', 'opt-row', list);
      el('span', 'opt-label', row, r.label);
      const ctl = el('div', 'opt-ctl', row);
      let refresh;
      if (r.type === 'range') {
        const inp = el('input', '', ctl);
        inp.type = 'range';
        inp.min = r.min;
        inp.max = r.max;
        inp.step = r.step;
        inp.value = settings[r.key];
        const val = el('span', 'opt-val', ctl, fmt(r, settings[r.key]));
        inp.addEventListener('input', () => {
          settings[r.key] = parseFloat(inp.value);
          val.textContent = fmt(r, settings[r.key]);
          onChange(settings);
        });
        refresh = () => {
          inp.value = settings[r.key];
          val.textContent = fmt(r, settings[r.key]);
        };
        items.push({ row, adjust: (d) => { settings[r.key] = Math.min(r.max, Math.max(r.min, +(settings[r.key] + d * r.step * (r.key === 'fov' ? 1 : 2)).toFixed(3))); refresh(); onChange(settings); } });
      } else if (r.type === 'toggle') {
        const b = el('button', 'opt-toggle', ctl);
        refresh = () => (b.textContent = settings[r.key] ? 'オン' : 'オフ');
        refresh();
        const flip = () => { settings[r.key] = !settings[r.key]; refresh(); onChange(settings); Sound.play('select'); };
        b.addEventListener('click', flip);
        items.push({ row, adjust: flip, ok: flip });
      } else {
        const bs = r.choices.map(([v, lab]) => {
          const b = el('button', 'opt-choice', ctl, lab);
          b.addEventListener('click', () => { settings[r.key] = v; refresh(); onChange(settings); Sound.play('select'); });
          return [v, b];
        });
        refresh = () => bs.forEach(([v, b]) => b.classList.toggle('on', settings[r.key] === v));
        refresh();
        items.push({ row, adjust: (d) => { const i = r.choices.findIndex((c) => c[0] === settings[r.key]); const n = r.choices[(i + d + r.choices.length) % r.choices.length][0]; settings[r.key] = n; refresh(); onChange(settings); } });
      }
    });
    const close = el('div', 'opt-close mi', p, '<span class="cur">▶</span><span class="lab">とじる</span>');
    hint(p, '{select}<span>選ぶ</span>{adjust}<span>変える</span>{back}<span>もどる</span>');
    close.addEventListener('click', () => { Sound.play('confirm'); onClose(); });
    items.push({ row: close, ok: () => { Sound.play('confirm'); onClose(); } });
    let idx = 0;
    const render = () => items.forEach((it, i) => it.row.classList.toggle('sel', i === idx));
    render();
    items.forEach((it, i) => it.row.addEventListener('mouseenter', () => { idx = i; render(); }));
    this.current = {
      handle: (input) => {
        if (input.menuUp) { idx = (idx - 1 + items.length) % items.length; Sound.play('select'); render(); }
        else if (input.menuDown) { idx = (idx + 1) % items.length; Sound.play('select'); render(); }
        else if (input.menuLeft && items[idx].adjust) items[idx].adjust(-1);
        else if (input.menuRight && items[idx].adjust) items[idx].adjust(1);
        else if (input.menuOk && items[idx].ok) items[idx].ok();
        else if (input.menuBack) { Sound.play('cancel'); onClose(); }
      },
    };
    setTimeout(() => s.classList.add('on'), 20);
  }

  // ---- ギャラリー（図鑑・アルバム・記憶）----
  gallery({ onClose, tab = 'zukan' }) {
    this.clear();
    const s = el('div', 'screen gallery interactive', this.layer);
    const p = el('div', 'gpanel', s);
    const head = el('div', 'g-head', p);
    el('div', 'g-title', head, 'GALLERY');
    const tabs = el('div', 'g-tabs', head);
    const closeB = el('div', 'g-close', head, '×');
    closeB.addEventListener('click', () => { Sound.play('cancel'); onClose(); });
    const body = el('div', 'g-body', p);
    hint(p, '{tabs}<span>タブ</span>{scroll}<span>スクロール</span>{back}<span>とじる</span>', 'g-hint');
    const data = Save.ensure();
    const T = [
      ['zukan', '図鑑'],
      ['album', 'アルバム'],
      ['memory', '記憶'],
    ];
    const tabEls = {};
    const show = (name) => {
      tab = name;
      Object.entries(tabEls).forEach(([k, e]) => e.classList.toggle('on', k === name));
      body.innerHTML = '';
      body.scrollTop = 0;
      if (name === 'zukan') this.renderZukan(body, data);
      else if (name === 'album') this.renderAlbum(body);
      else this.renderMemories(body, data);
    };
    T.forEach(([k, lab]) => {
      const b = el('div', 'g-tab', tabs, lab);
      b.addEventListener('click', () => { Sound.play('select'); show(k); });
      tabEls[k] = b;
    });
    show(tab);
    this.current = {
      handle: (input) => {
        if (this.detail) {
          if (input.menuBack || input.menuOk) { this.closeDetail(); Sound.play('cancel'); }
          return;
        }
        const idx = T.findIndex((t) => t[0] === tab);
        if (input.menuLeft) { Sound.play('select'); show(T[(idx + 2) % 3][0]); }
        else if (input.menuRight) { Sound.play('select'); show(T[(idx + 1) % 3][0]); }
        else if (input.menuUp) body.scrollTop -= 140;
        else if (input.menuDown) body.scrollTop += 140;
        else if (input.menuBack) { Sound.play('cancel'); onClose(); }
      },
    };
    setTimeout(() => s.classList.add('on'), 20);
  }

  renderZukan(body, data) {
    const found = Object.keys(data.species).length;
    el('div', 'g-sum', body, `撮影した生き物　<b>${found}</b> ／ ${SPECIES.length}`);
    const grid = el('div', 'zukan-grid', body);
    SPECIES.forEach((sp, i) => {
      const rec = data.species[sp.id];
      const c = el('div', 'zcard' + (rec ? ' got' : ''), grid);
      const img = el('div', 'zimg', c);
      if (rec && rec.thumb) img.style.backgroundImage = `url(${rec.thumb})`;
      else img.innerHTML = '<span>？</span>';
      el('div', 'zno', c, `No.${String(i + 1).padStart(2, '0')}`);
      el('div', 'zname', c, rec ? esc(sp.name) : '？？？');
      el('div', 'zstar', c, rec ? '★'.repeat(rec.stars || 1) + '☆'.repeat(3 - (rec.stars || 1)) : esc(sp.area));
      c.addEventListener('click', () => {
        Sound.play('select');
        if (rec) this.openDetail(this.zukanDetail(sp, rec, i));
      });
    });
  }

  zukanDetail(sp, rec, i) {
    const d = el('div', 'detail zdetail');
    const img = el('div', 'dimg', d);
    if (rec.thumb) img.style.backgroundImage = `url(${rec.thumb})`;
    const info = el('div', 'dinfo', d);
    el('div', 'dno', info, `No.${String(i + 1).padStart(2, '0')}　${'★'.repeat(sp.rarity)}`);
    el('div', 'dname', info, esc(sp.name));
    el('div', 'dsci', info, esc(sp.sci));
    el('div', 'dmeta', info, `大きさ　${esc(sp.size)}<br>深さ　${esc(sp.depth)}<br>見られる場所　${esc(sp.area)}`);
    el('div', 'dtext', info, esc(sp.text));
    el('div', 'dbest', info, `いちばんよく撮れた写真　${'★'.repeat(rec.stars || 1)}${'☆'.repeat(3 - (rec.stars || 1))}`);
    return d;
  }

  async renderAlbum(body) {
    const wrap = el('div', 'album', body);
    const photos = await Album.all();
    if (!photos.length) {
      el('div', 'g-empty', wrap, 'まだ写真がありません。<br>右クリックでカメラを構えて、左クリックで撮影しましょう。');
      return;
    }
    el('div', 'g-sum', wrap, `写真　<b>${photos.length}</b> 枚`);
    const grid = el('div', 'album-grid', wrap);
    for (const ph of photos) {
      const c = el('div', 'acard', grid);
      const img = el('div', 'aimg', c);
      img.style.backgroundImage = `url(${ph.thumb})`;
      const sp = ph.best ? SPECIES_BY_ID[ph.best] : null;
      const date = new Date(ph.time);
      el('div', 'acap', c, `${sp ? esc(sp.name) : '海の風景'}<span>${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}・${ph.depth ?? '-'}m</span>`);
      c.addEventListener('click', () => {
        Sound.play('select');
        const d = el('div', 'detail adetail');
        const big = el('img', 'abig', d);
        let url = ph.thumb;
        if (ph.blob) {
          url = URL.createObjectURL(ph.blob);
          d._url = url;
        }
        big.src = url;
        const bar = el('div', 'abar', d);
        el('span', '', bar, `${sp ? esc(sp.name) : '海の風景'}　${'★'.repeat(ph.stars || 0)}　${esc(ph.area || '')}`);
        const dl = el('a', 'abtn', bar, '保存');
        dl.href = url;
        dl.download = `aquablue-${ph.time}.jpg`;
        const del = el('span', 'abtn danger', bar, '削除');
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!del.dataset.sure) {
            del.dataset.sure = '1';
            del.textContent = 'もう一度押すと削除';
            return;
          }
          await Album.remove(ph.id);
          this.closeDetail();
          body.innerHTML = '';
          this.renderAlbum(body);
        });
        this.openDetail(d);
      });
    }
  }

  renderMemories(body, data) {
    const got = new Set(data.fragments);
    const n = FRAGMENTS.filter((f) => got.has(f.id)).length;
    el('div', 'g-sum', body, `記憶のかけら　<b>${n}</b> ／ ${FRAGMENTS.length}`);
    const list = el('div', 'mem-list', body);
    [...FRAGMENTS, FINAL_FRAGMENT].forEach((f, i) => {
      const has = got.has(f.id);
      if (f.id === 'final' && !has) return;
      const c = el('div', 'mem' + (has ? ' got' : ''), list);
      el('div', 'mem-h', c, has ? `${f.id === 'final' ? '✦' : i + 1}　${esc(f.voice)}<span>${esc(f.area)}</span>` : `${i + 1}　？？？<span>${esc(f.area.split('（')[0])}のどこか</span>`);
      if (has) el('div', 'mem-b', c, f.lines.map((l) => `<p>${esc(l)}</p>`).join(''));
    });
  }

  openDetail(d) {
    this.closeDetail();
    const ov = el('div', 'detail-ov interactive', this.layer);
    ov.appendChild(d);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) {
        Sound.play('cancel');
        this.closeDetail();
      }
    });
    this.detail = ov;
    setTimeout(() => ov.classList.add('on'), 20);
  }

  closeDetail() {
    if (!this.detail) return;
    const d = this.detail.querySelector('.detail');
    if (d && d._url) URL.revokeObjectURL(d._url);
    this.detail.remove();
    this.detail = null;
  }

  // ---- 物語の文章（下の帯）----
  dialog({ speaker, lines, onDone, memory = false }) {
    this.clear();
    const s = el('div', 'screen dialog interactive' + (memory ? ' memory' : ''), this.layer);
    const box = el('div', 'dbox', s);
    if (speaker) el('div', 'dspeaker', box, esc(speaker));
    const text = el('div', 'dtext2', box);
    const more = Glyphs.bind(el('div', 'dmore', box), '{next}<span class="tri">▼</span>');
    let i = 0, shown = 0, full = false;
    const all = lines.slice();
    const render = () => {
      text.innerHTML = all
        .slice(0, i + 1)
        .map((l, k) => `<p>${esc(k < i ? l : l.slice(0, shown))}</p>`)
        .join('');
    };
    const timer = setInterval(() => {
      if (full) return;
      shown += 1;
      if (shown >= all[i].length) {
        if (i < all.length - 1) { i++; shown = 0; }
        else full = true;
      }
      render();
    }, 38);
    const next = () => {
      if (!full) {
        i = all.length - 1;
        shown = all[i].length;
        full = true;
        render();
        return;
      }
      clearInterval(timer);
      s.classList.remove('on');
      setTimeout(() => s.remove(), 400);
      onDone && onDone();
    };
    s.addEventListener('click', next);
    this.current = { handle: (input) => { if (input.menuOk || input.interact) next(); } };
    setTimeout(() => s.classList.add('on'), 20);
  }

  // ---- 全画面の文章（プロローグ・エンディング）----
  story({ lines, onDone, white = false, title = '' }) {
    this.clear();
    const s = el('div', 'screen story interactive' + (white ? ' white' : ''), this.layer);
    if (title) el('div', 'story-title', s, esc(title));
    const box = el('div', 'story-box', s);
    const ps = lines.map((l) => el('p', l ? '' : 'gap', box, esc(l) || '&nbsp;'));
    let k = 0;
    const step = () => {
      if (k < ps.length) {
        ps[k].classList.add('on');
        k++;
      }
    };
    const timer = setInterval(() => {
      step();
      if (k >= ps.length) {
        clearInterval(timer);
        hint.classList.add('on');
      }
    }, 900);
    step();
    const hint = Glyphs.bind(el('div', 'story-hint', s), (mode) => (mode === 'pad' ? '{next}<span>で進む</span>' : '<span>クリック ／</span>{confirm}<span>で進む</span>'));
    let done = false;
    const next = () => {
      if (k < ps.length) {
        while (k < ps.length) step();
        clearInterval(timer);
        hint.classList.add('on');
        return;
      }
      if (done) return;
      done = true;
      s.classList.remove('on');
      setTimeout(() => s.remove(), 900);
      onDone && onDone();
    };
    s.addEventListener('click', next);
    this.current = { handle: (input) => { if (input.menuOk || input.interact || input.menuBack) next(); } };
    setTimeout(() => s.classList.add('on'), 20);
  }

  credits({ items, onDone }) {
    this.clear();
    const s = el('div', 'screen credits interactive', this.layer);
    const roll = el('div', 'roll', s);
    items.forEach(([a, b], i) => {
      const r = el('div', 'credit' + (i === 0 ? ' big' : ''), roll);
      if (a) el('div', 'ca', r, esc(a));
      if (b) el('div', 'cb', r, esc(b));
    });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      s.classList.remove('on');
      setTimeout(() => s.remove(), 1200);
      onDone && onDone();
    };
    setTimeout(finish, 16000);
    s.addEventListener('click', finish);
    this.current = { handle: (input) => { if (input.menuOk || input.menuBack) finish(); } };
    setTimeout(() => s.classList.add('on'), 20);
  }

  handle(input) {
    if (this.current && this.current.handle) this.current.handle(input);
  }
}
