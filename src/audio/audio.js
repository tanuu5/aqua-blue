// 音はすべて WebAudio でその場で作る（ファイルは使わない）。
// 呼吸（レギュレーターの吸気と泡）、環境音、効果音、BGM の土台。
import { Music } from './music.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.bgmVol = 0.7;
    this.seVol = 0.8;
    this.underwater = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    // 残響
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(3.2, 2.6);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.8;
    this.reverb.connect(this.reverbOut).connect(this.master);

    // 水中のこもり（効果音と環境音にかける）
    this.uwFilter = ctx.createBiquadFilter();
    this.uwFilter.type = 'lowpass';
    this.uwFilter.frequency.value = 18000;
    this.uwFilter.Q.value = 0.4;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.seVol;
    this.sfx.connect(this.uwFilter).connect(this.master);
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0.25;
    this.sfx.connect(this.sfxSend).connect(this.reverb);
    // UI の音はこもらせない
    this.ui = ctx.createGain();
    this.ui.gain.value = this.seVol;
    this.ui.connect(this.master);

    this.music = new Music(ctx, this.master, this.reverb);
    this.music.setVolume(this.bgmVol);

    this.noise = this.makeNoise(3);
    this.buildAmbience();
    this.ready = true;
  }

  makeNoise(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeIR(sec, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return b;
  }

  // ---- 環境音 ----
  buildAmbience() {
    const ctx = this.ctx;
    // 水中のゴーという低い音
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise;
    rumble.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(lp).connect(this.rumbleGain).connect(this.master);
    rumble.start();
    // 波の音（水上）
    const waves = ctx.createBufferSource();
    waves.buffer = this.noise;
    waves.loop = true;
    const wl = ctx.createBiquadFilter();
    wl.type = 'lowpass';
    wl.frequency.value = 900;
    this.waveGain = ctx.createGain();
    this.waveGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.05;
    lfo.connect(lfoAmt).connect(this.waveGain.gain);
    lfo.start();
    waves.connect(wl).connect(this.waveGain).connect(this.master);
    waves.start();
  }

  setVolumes(bgm, se) {
    this.bgmVol = bgm;
    this.seVol = se;
    if (!this.ctx) return;
    this.music.setVolume(bgm);
    this.sfx.gain.setTargetAtTime(se, this.ctx.currentTime, 0.05);
    this.ui.gain.setTargetAtTime(se, this.ctx.currentTime, 0.05);
  }

  // mode: 'under' | 'surface' | 'menu'
  setEnvironment(mode, { depth = 0, reef = 0, cave = 0 } = {}) {
    if (!this.ctx) return;
    const under = mode === 'under';
    this.underwater = under;
    // 深さは 2 m 刻みにまとめ、値が変わったときだけ音の設定を動かす
    const key = `${mode}|${Math.round(Math.min(depth, 30) / 2)}|${cave}`;
    if (key === this._envKey) return;
    this._envKey = key;
    void reef;
    const t = this.ctx.currentTime;
    const d = Math.round(Math.min(depth, 30) / 2) * 2;
    this.uwFilter.frequency.setTargetAtTime(under ? 1400 - d * 15 : 18000, t, 0.25);
    this.rumbleGain.gain.setTargetAtTime(under ? 0.12 + cave * 0.06 : 0, t, 0.5);
    this.waveGain.gain.setTargetAtTime(mode === 'surface' ? 0.11 : mode === 'menu' ? 0.06 : 0, t, 0.6);
    this.reverbOut.gain.setTargetAtTime(0.8 + cave * 0.9, t, 0.5);
  }

  // ---- 効果音 ----
  env(g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }

  noiseBurst(dest, t, dur, type, freq, q, peak, attack = 0.01) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 2);
    src.stop(t + attack + dur + 0.05);
    return f;
  }

  tone(dest, t, freq, dur, { type = 'sine', peak = 0.2, attack = 0.005, glide = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'inhale': {
        // レギュレーターの「シュー」
        const v = opts.vol ?? 1;
        this.noiseBurst(this.sfx, t, 0.75, 'bandpass', 2400, 1.2, 0.07 * v, 0.18);
        this.noiseBurst(this.sfx, t + 0.05, 0.6, 'highpass', 5000, 0.7, 0.025 * v, 0.2);
        break;
      }
      case 'exhale': {
        // ゴボゴボという泡
        const v = opts.vol ?? 1;
        this.noiseBurst(this.sfx, t, 1.0, 'lowpass', 400, 0.8, 0.12 * v, 0.06);
        const n = 22;
        for (let i = 0; i < n; i++) {
          const tt = t + Math.random() * 1.1;
          this.tone(this.sfx, tt, 260 + Math.random() * 700, 0.05 + Math.random() * 0.05, { peak: 0.05 * v, glide: 1.8 + Math.random() });
        }
        break;
      }
      case 'bubble': {
        this.tone(this.sfx, t, 400 + Math.random() * 600, 0.06, { peak: 0.06, glide: 2.2 });
        break;
      }
      case 'shutter': {
        this.noiseBurst(this.ui, t, 0.03, 'highpass', 3000, 0.7, 0.35, 0.001);
        this.tone(this.ui, t, 1800, 0.02, { type: 'square', peak: 0.05 });
        this.noiseBurst(this.ui, t + 0.07, 0.05, 'bandpass', 1800, 2, 0.25, 0.002);
        this.tone(this.ui, t + 0.06, 900, 0.03, { type: 'triangle', peak: 0.06 });
        break;
      }
      case 'select':
        this.tone(this.ui, t, 880, 0.08, { type: 'sine', peak: 0.07 });
        break;
      case 'confirm':
        this.tone(this.ui, t, 660, 0.12, { type: 'sine', peak: 0.08 });
        this.tone(this.ui, t + 0.07, 990, 0.18, { type: 'sine', peak: 0.07 });
        break;
      case 'cancel':
        this.tone(this.ui, t, 520, 0.12, { type: 'sine', peak: 0.07, glide: 0.8 });
        break;
      case 'newspecies': {
        const notes = [784, 988, 1175, 1568];
        notes.forEach((f, i) => this.bell(this.ui, t + i * 0.09, f, 1.2, 0.06));
        break;
      }
      case 'chime':
      case 'pickup': {
        const notes = [587, 740, 880, 1175, 1480];
        notes.forEach((f, i) => this.bell(this.ui, t + i * 0.12, f, 2.4, 0.07));
        break;
      }
      case 'resonance': {
        const v = opts.vol ?? 0.5;
        this.bell(this.sfx, t, 1175, 2.0, 0.045 * v);
        this.bell(this.sfx, t + 0.18, 1480, 2.0, 0.03 * v);
        break;
      }
      case 'warn':
        this.tone(this.ui, t, 880, 0.12, { type: 'square', peak: 0.045 });
        this.tone(this.ui, t + 0.16, 660, 0.14, { type: 'square', peak: 0.045 });
        break;
      case 'splash': {
        this.noiseBurst(this.ui, t, 0.7, 'lowpass', 1800, 0.5, 0.35, 0.01);
        this.noiseBurst(this.ui, t + 0.05, 1.0, 'bandpass', 600, 0.7, 0.2, 0.03);
        for (let i = 0; i < 14; i++) this.tone(this.ui, t + 0.1 + Math.random() * 0.6, 300 + Math.random() * 500, 0.05, { peak: 0.05, glide: 2 });
        break;
      }
      case 'light':
        this.noiseBurst(this.ui, t, 0.03, 'bandpass', 2500, 3, 0.12, 0.001);
        break;
      case 'open':
        this.tone(this.ui, t, 392, 0.4, { type: 'sine', peak: 0.06 });
        this.tone(this.ui, t + 0.05, 587, 0.5, { type: 'sine', peak: 0.05 });
        break;
      default:
        break;
    }
  }

  bell(dest, t, f, dur, peak) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 1.4, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    this.env(g, t, 0.004, peak, dur);
    car.connect(g);
    g.connect(dest);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    g.connect(send).connect(this.reverb);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.1);
    mod.stop(t + dur + 0.1);
  }
}

export const Sound = new AudioEngine();
