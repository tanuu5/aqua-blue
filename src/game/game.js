// ゲームの進行：タイトル → プロローグ → 潜水（撮影・記憶のかけら・エア）→ ボート → エンディング。
import * as THREE from 'three';
import { Save } from '../core/save.js';
import { Sound } from '../audio/audio.js';
import { HUD } from '../ui/hud.js';
import { Screens } from '../ui/screens.js';
import { PhotoSystem } from './photo.js';
import { Fragments } from './fragments.js';
import { PROLOGUE, CAPTAIN, FRAGMENTS, ENDING, CREDITS, HINTS } from './story.js';
import { SPECIES, SPECIES_BY_ID } from '../creatures/species.js';
import { AREAS, BOAT, CAVE } from '../world/layout.js';
import { Glyphs } from '../ui/glyphs.js';

const AIR_MAX = 200;
const HELP_TPL =
  '<div class="hrow">{move}<span>泳ぐ</span>{look}<span>見回す</span></div>' +
  '<div class="hrow">{up}<span>浮上</span>{down}<span>潜行</span>{dash}<span>速く泳ぐ</span></div>' +
  '<div class="hrow">{aim}<span>カメラを構える</span>{shutter}<span>撮影</span></div>' +
  '<div class="hrow">{light}<span>ライト</span>{interact}<span>調べる</span>{pause}<span>メニュー</span></div>';

const QUALITY = {
  low: { pr: 1, msaa: 0, god: 14, maxPx: 1.0e6 },
  mid: { pr: 1.5, msaa: 2, god: 20, maxPx: 2.0e6 },
  high: { pr: 2, msaa: 4, god: 28, maxPx: 3.6e6 },
};

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.hud = new HUD(o.uiRoot);
    this.photo = new PhotoSystem(o.renderer, o.camera, o.creatures, o.world, o.uiRoot);
    this.screens = new Screens(o.uiRoot);
    this.fragments = new Fragments(o.world, o.creatures);
    o.world.scene.add(this.fragments.group);
    this.state = 'boot';
    this.air = AIR_MAX;
    this.breath = 0;
    this.exhaling = 0;
    this.area = null;
    this.areaSeen = {};
    this.t = 0;
    this.resT = 0;
    this.saveT = 0;
    this.warned = 0;
    this.helpT = 0;
    this.returnTo = null;
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'play') this.openPause();
    };
    this._v = new THREE.Vector3();
  }

  // ---- 設定 ----
  applySettings() {
    const s = Save.settings;
    this.input.sensitivity = s.sens;
    this.input.invertY = s.invertY;
    this.player.baseFov = s.fov;
    Sound.setVolumes(s.bgm, s.se);
    const q = QUALITY[s.quality] || QUALITY.high;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pr));
    if (this.post.quality.msaa !== q.msaa || this.post.quality.godSteps !== q.god || this.post.quality.maxPx !== q.maxPx) {
      this.post.setQuality({ msaa: q.msaa, godSteps: q.god, maxPx: q.maxPx });
    }
    this.autoScale = 1;
  }

  start() {
    Save.loadSettings();
    this.applySettings();
    this.titleCamera(0);
    this.screens.boot(() => {
      Sound.init();
      Sound.setVolumes(Save.settings.bgm, Save.settings.se);
      this.toTitle();
    });
  }

  // ---- タイトル ----
  toTitle() {
    this.state = 'title';
    this.inDive = false;
    this.fragments.group.visible = false;
    this.input.wantLock = false;
    this.input.exitLock();
    this.hud.show(false);
    this.photo.setAiming(false);
    this.player.diver.root.visible = false;
    if (Sound.music) Sound.music.setMood('title');
    Sound.setEnvironment('menu');
    const data = Save.load();
    this.screens.title({
      canContinue: !!data,
      endingSeen: data && data.ending,
      onNew: () => {
        if (Save.exists()) this.confirmNew();
        else this.newGame();
      },
      onContinue: () => this.continueGame(),
      onGallery: () => this.openGallery(() => this.toTitle()),
      onOption: () => this.openOptions(() => this.toTitle()),
    });
  }

  confirmNew() {
    this.screens.boat({
      title: 'NEW GAME',
      lines: ['最初からはじめますか？', '（記憶のかけらと図鑑の記録は消えます。写真のアルバムは残ります）'],
      onDive: () => this.toTitle(),
      onRest: () => this.newGame(),
    });
    // ボートのメニューを流用するので、項目の文字だけ差し替える
    const menu = this.screens.current;
    menu.setItems([
      { label: 'やめる', action: () => this.toTitle() },
      { label: '最初からはじめる', action: () => this.newGame() },
    ]);
  }

  newGame() {
    Save.newGame();
    this.fragments.sync(Save.data);
    this.state = 'story';
    this.screens.story({
      lines: PROLOGUE,
      title: 'PROLOGUE',
      onDone: () => {
        Save.data.prologue = true;
        Save.write();
        this.state = 'dialog';
        this.screens.dialog({ speaker: '船長', lines: CAPTAIN.first.map((l) => l.replace(/^船長「|^　+/, '').replace(/」$/, '')), onDone: () => this.beginDive(true) });
      },
    });
  }

  continueGame() {
    Save.load();
    this.fragments.sync(Save.data);
    this.beginDive(false);
  }

  // ---- 潜水の開始 ----
  async beginDive(first) {
    this.state = 'transition';
    this.screens.clear();
    await this.screens.setFade(1, '#000', 500);
    const L = this.world.boat.ladderWorld;
    const away = Math.atan2(L.x - BOAT.x, L.z - BOAT.z);
    this.player.spawn(L.x + Math.sin(away) * 2.5, -2.2, L.z + Math.cos(away) * 2.5, away + Math.PI, -0.25);
    this.player.diver.root.visible = true;
    this.inDive = true;
    this.air = AIR_MAX;
    this.warned = 0;
    this.area = null;
    this.areaSeen = {};
    const d = Save.ensure();
    d.dives++;
    Save.write();
    this.state = 'play';
    this.input.wantLock = true;
    this.input.requestLock();
    this.hud.show(true);
    this.helpT = Save.settings.help ? (first ? 30 : 12) : 0;
    this.hud.setHelp(this.helpT > 0 ? HELP_TPL : '');
    Sound.play('splash');
    this.world.bubbles.emit(this.player.pos, 40, 0.8, 0.02, 0.08, 0.8);
    this.breath = 0;
    this.updateStatus();
    this.screens.setFade(0, '#000', 900);
    if (first) setTimeout(() => this.hud.toast('海のどこかに、青白く光る<b>「記憶のかけら」</b>が眠っている。', 'gold'), 2500);
  }

  updateStatus() {
    const d = Save.data;
    if (!d) return;
    const n = FRAGMENTS.filter((f) => d.fragments.includes(f.id)).length;
    this.hud.setStatus(`記憶のかけら <b>${n}</b>/8<br>図鑑 <b>${Object.keys(d.species).length}</b>/${SPECIES.length}`);
  }

  // ---- メニュー類 ----
  openPause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.input.pressedKeys.clear();
    this.input.exitLock();
    this.photo.setAiming(false);
    this.screens.pause({
      onResume: () => this.resume(),
      onGallery: () => this.openGallery(() => this.openPauseAgain()),
      onHelp: () => {
        this.screens.help({ onClose: () => this.openPauseAgain() });
      },
      onOption: () => this.openOptions(() => this.openPauseAgain()),
      onBoat: () => this.rescue(false),
      onTitle: () => {
        Save.write();
        this.toTitle();
      },
    });
  }

  openPauseAgain() {
    this.state = 'play';
    this.openPause();
  }

  resume() {
    this.screens.clear();
    this.state = 'play';
    this.input.requestLock();
  }

  openGallery(back) {
    this.screens.gallery({ onClose: back });
  }

  openOptions(back) {
    this.screens.options({
      settings: Save.settings,
      onChange: () => {
        Save.writeSettings();
        this.applySettings();
      },
      onClose: () => {
        Save.writeSettings();
        back();
      },
    });
  }

  // ---- ボート ----
  boardBoat(lines) {
    this.state = 'boat';
    this.inDive = false;
    this.input.exitLock();
    this.photo.setAiming(false);
    this.hud.show(false);
    Save.write();
    if (Sound.music) Sound.music.setMood('surface');
    Sound.setEnvironment('surface');
    this.screens.boat({
      lines: lines || [CAPTAIN.back[Math.floor(Math.random() * CAPTAIN.back.length)]],
      onDive: () => this.beginDive(false),
      onRest: () => {
        Save.write();
        this.toTitle();
      },
    });
  }

  async rescue(outOfAir) {
    this.state = 'transition';
    this.input.exitLock();
    this.screens.clear();
    this.hud.show(false);
    await this.screens.setFade(1, '#000', outOfAir ? 1400 : 600);
    // ボートの上からの景色にしておく
    this.inDive = false;
    this.player.diver.root.visible = false;
    this.camera.position.set(BOAT.x - 8, 3, BOAT.z + 14);
    this.camera.lookAt(BOAT.x, 1.5, BOAT.z);
    this.camera.updateMatrixWorld();
    this.screens.setFade(0, '#000', 900);
    this.boardBoat(outOfAir ? CAPTAIN.rescue : null);
  }

  // ---- 記憶のかけら ----
  touchFragment(it) {
    this.state = 'dialog';
    this.photo.setAiming(false);
    this.hud.setPrompt('');
    Sound.play('pickup');
    if (Sound.music) Sound.music.setMood('memory');
    this.flashWhite();
    const d = Save.ensure();
    const isFinal = it.final;
    const idx = FRAGMENTS.findIndex((f) => f.id === it.id);
    const head = isFinal ? '✦ 最後の記憶' : `記憶のかけら ${idx + 1}`;
    this.screens.dialog({
      speaker: `${head} ― ${it.def.voice}`,
      lines: it.def.lines,
      memory: true,
      onDone: () => {
        this.fragments.collect(it);
        if (!d.fragments.includes(it.id)) d.fragments.push(it.id);
        Save.write();
        if (isFinal) {
          this.ending();
          return;
        }
        const n = FRAGMENTS.filter((f) => d.fragments.includes(f.id)).length;
        this.hud.toast(`記憶のかけら <b>${n}</b> ／ 8`, 'gold');
        if (n === FRAGMENTS.length) {
          this.fragments.sync(d);
          setTimeout(() => this.hud.toast(HINTS.allFound, 'gold'), 1600);
        }
        this.updateStatus();
        this.state = 'play';
        this.area = null;
      },
    });
  }

  flashWhite() {
    this.screens.setFade(0.75, '#e8f6ff', 120).then(() => this.screens.setFade(0, '#e8f6ff', 1100));
  }

  async ending() {
    this.state = 'ending';
    this.input.exitLock();
    this.hud.show(false);
    if (Sound.music) Sound.music.setMood('ending');
    await this.screens.setFade(1, '#f4fbff', 2200);
    this.screens.story({
      lines: ENDING,
      white: true,
      title: 'EPILOGUE',
      onDone: async () => {
        await this.screens.setFade(1, '#000', 1);
        this.screens.credits({
          items: CREDITS,
          onDone: () => {
            const d = Save.ensure();
            d.ending = true;
            Save.write();
            this.screens.setFade(0, '#000', 1200);
            this.toTitle();
          },
        });
        this.screens.setFade(0, '#000', 800);
      },
    });
    this.screens.setFade(0, '#f4fbff', 1200);
  }

  // ---- 写真 ----
  afterRender() {
    const res = this.photo.afterRender();
    if (!res) return;
    const d = Save.ensure();
    d.photos++;
    let isNew = false;
    const best = res.best;
    for (const sp of res.species) {
      if (!SPECIES_BY_ID[sp]) continue;
      const rec = d.species[sp];
      const st = res.starsBy[sp] || 1;
      if (!rec) {
        d.species[sp] = { first: res.time, stars: st, thumb: res.thumb };
        if (sp === best) isNew = true;
        const s = SPECIES_BY_ID[sp];
        setTimeout(() => {
          Sound.play('newspecies');
          this.hud.toast(`図鑑に登録　<b>No.${String(s.no).padStart(2, '0')} ${s.name}</b>`, 'gold');
        }, 700);
      } else if (st > (rec.stars || 0) || !rec.thumb) {
        rec.stars = Math.max(st, rec.stars || 0);
        rec.thumb = res.thumb;
      }
    }
    Save.write();
    this.photo.showCard(res, isNew);
    this.updateStatus();
  }

  // ---- 毎フレーム ----
  update(dt) {
    this.t += dt;
    const input = this.input;
    switch (this.state) {
      case 'boot':
      case 'title':
      case 'story':
        this.titleCamera(dt);
        // ゲームパッドのボタンでもはじめられる
        if (this.state === 'boot' && input.gpPressed.size > 0 && this.screens.bootGo) this.screens.bootGo();
        else this.screens.handle(input);
        break;
      case 'pause':
      case 'boat':
        this.screens.handle(input);
        break;
      case 'dialog':
      case 'ending':
        this.screens.handle({ ...this.menuish(input), interact: input.interact });
        if (this.inDive) {
          this.player.update(dt, input, { canMove: false, canLook: false });
          this.player.updateCamera(dt);
        } else {
          this.titleCamera(dt);
        }
        break;
      case 'transition':
        break;
      case 'play':
        this.updatePlay(dt);
        break;
    }
  }

  menuish(input) {
    return {
      menuUp: input.menuUp,
      menuDown: input.menuDown,
      menuLeft: input.menuLeft,
      menuRight: input.menuRight,
      menuOk: input.menuOk || (input.pressedButtons & 1) !== 0,
      menuBack: input.menuBack,
    };
  }

  titleCamera(dt) {
    const t = this.t;
    const cam = this.camera;
    // ボートを左に、島とアーチを右に置く（南東の海上から北を見る）
    cam.position.set(15 + Math.sin(t * 0.05) * 2.5, 2.6 + Math.sin(t * 0.4) * 0.1, 118 + Math.cos(t * 0.04) * 2);
    cam.lookAt(24 + Math.sin(t * 0.03) * 3, 8.5, -40);
    if (cam.fov !== 50) {
      cam.fov = 50;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  updatePlay(dt) {
    const input = this.input;
    const P = this.player;
    if (input.pause) {
      this.openPause();
      return;
    }
    this.hud.setLockHint(!input.locked && input.lastDevice !== 'pad');
    P.update(dt, input, { canMove: true });
    if (input.light) {
      const on = P.toggleLight();
      Sound.play('light');
      this.hud.toast(on ? 'ライトを点けた' : 'ライトを消した');
    }
    // カメラ
    this.photo.setAiming(P.aim, P.zoom);
    this.photo.update(dt, P.aim, P.zoom);
    if (P.aim && input.shutter) {
      Sound.play('shutter');
      this.photo.shoot({ depth: Math.max(0, -P.pos.y).toFixed(1), area: this.area ? this.area.name : '入り江' });
    }
    P.updateCamera(dt);

    // 水面に出た／潜った
    if (P.justSurfaced) {
      Sound.play('splash');
      this.world.bubbles.emit(P.pos, 20, 0.6, 0.02, 0.06, 0.6);
    }
    if (P.justDived) {
      Sound.play('splash');
      this.world.bubbles.emit(P.pos, 30, 0.6, 0.02, 0.07, 0.7);
    }

    // エアと呼吸
    const depth = Math.max(0, -P.pos.y);
    if (!P.surfaced) {
      const rate = 0.2 * (1 + depth / 10) * (P.dashing ? 1.8 : 1) * (P.aim ? 0.85 : 1);
      this.air = Math.max(0, this.air - rate * dt);
      const period = P.dashing ? 3.0 : 4.4;
      const prev = this.breath;
      this.breath = (this.breath + dt / period) % 1;
      if (prev > this.breath) Sound.play('inhale', { vol: 0.9 });
      if (prev < 0.42 && this.breath >= 0.42) {
        Sound.play('exhale', { vol: 0.9 });
        this.exhaling = 1.1;
      }
      if (this.exhaling > 0) {
        this.exhaling -= dt;
        if (Math.random() < dt * 34) this.world.bubbles.emit(P.regWorld, 2, 0.05, 0.012, 0.05, 0.5);
      }
    }
    const frac = this.air / AIR_MAX;
    if (frac < 0.25 && this.warned < 1) {
      this.warned = 1;
      Sound.play('warn');
      this.hud.toast('エアが残りわずか。そろそろ浮上しよう。', 'warn');
    }
    if (frac < 0.12 && this.warned < 2) {
      this.warned = 2;
      this.hud.toast('エアがあぶない！ 水面へ！', 'warn');
    }
    if (frac < 0.12 && Math.floor(this.t * 1.2) !== Math.floor((this.t - dt) * 1.2)) Sound.play('warn');
    if (this.air <= 0) {
      this.rescue(true);
      return;
    }

    // 記憶のかけら
    const near = this.fragments.update(dt, P.pos, this.camera.position.y);
    let prompt = '';
    let hint = null;
    if (near) {
      if (near.dist < 2.6) {
        prompt = `${Glyphs.btn('interact')}記憶にふれる`;
        if (input.interact) {
          this.touchFragment(near.item);
          return;
        }
      }
      if (near.dist < 38) {
        hint = near.item.group.position;
        this.resT -= dt;
        if (this.resT <= 0) {
          this.resT = 3.6;
          Sound.play('resonance', { vol: Math.min(1, (38 - near.dist) / 25) });
          if (!this.hintShown && near.dist > 6) {
            this.hintShown = true;
            this.hud.toast(HINTS.resonance, 'gold');
          }
        }
      }
    }
    // ボート
    const L = this.world.boat.ladderWorld;
    const dBoat = Math.hypot(P.pos.x - L.x, P.pos.z - L.z);
    if (P.surfaced && dBoat < 7) {
      prompt = `${Glyphs.btn('interact')}ボートに上がる`;
      if (input.interact) {
        Sound.play('splash');
        this.boardBoat();
        return;
      }
    } else if (P.surfaced && !prompt) {
      prompt = dBoat < 60 ? '水面に出た。ボートまで泳げば上がれる' : '';
    }
    if (P.outOfBounds) prompt = 'ここから先は潮の流れが速い。入り江へ戻ろう';
    this.hud.setPrompt(prompt);

    // エリア
    let area = null;
    for (const a of AREAS) {
      if (Math.hypot(P.pos.x - a.x, P.pos.z - a.z) < a.r) {
        if (a.id === 'cave' && P.pos.y > -6) continue;
        area = a;
        break;
      }
    }
    if (area !== this.area) {
      this.area = area;
      if (area && (!this.areaSeen[area.id] || this.t - this.areaSeen[area.id] > 90)) {
        this.hud.areaCard(area.name, area.en, `${depth.toFixed(0)}m`);
      }
      if (area) this.areaSeen[area.id] = this.t;
    }
    const mood = P.surfaced ? 'surface' : area ? ({ garden: 'garden', reef: 'reef', ruins: 'ruins', cave: 'cave', drop: 'reef' })[area.id] : 'garden';
    if (Sound.music) Sound.music.setMood(mood);
    const inCave = area && area.id === 'cave' ? 1 : 0;
    const reefy = area && (area.id === 'garden' || area.id === 'reef') ? 1 : 0.3;
    Sound.setEnvironment(P.surfaced ? 'surface' : 'under', { depth, reef: reefy, cave: inCave });

    // 案内
    if (this.helpT > 0) {
      this.helpT -= dt;
      if (this.helpT <= 0) this.hud.setHelp('');
    }

    // 表示
    this.hud.update(dt, {
      depthY: P.pos.y,
      air: this.air,
      airMax: AIR_MAX,
      yaw: P.yaw,
      px: P.pos.x,
      pz: P.pos.z,
      dots: this.radarDots(P.pos),
      hint,
      boat: { x: BOAT.x, z: BOAT.z },
      range: 40,
    });
    this.saveT += dt;
    if (this.saveT > 20) {
      this.saveT = 0;
      const d = Save.ensure();
      d.playTime += 20;
      Save.write();
    }
  }

  radarDots(p) {
    if (!this._dotsT || this.t - this._dotsT > 0.2) {
      this._dotsT = this.t;
      const BIG = new Set(['manta', 'eagleray', 'turtle', 'whitetip', 'whaleshark', 'napoleon', 'dolphin']);
      this._dots = this.creatures.nearby(p, 42, 70).map((d) => ({ x: d.x, z: d.z, big: BIG.has(d.species) }));
    }
    return this._dots;
  }
}
