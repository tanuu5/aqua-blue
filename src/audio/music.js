// その場で鳴らす BGM。場所ごとの「気分」があり、切り替えるとゆっくり重なって移る。
// 物語の子守唄（書きおろしのメロディ）が、タイトル・記憶・エンディングに流れる。
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

// 子守唄：[音（MIDI）, 拍]（3 拍子）
const LULLABY = [
  [69, 1], [69, 1], [71, 1], [69, 1], [66, 2], [64, 1], [66, 1], [69, 1], [62, 3],
  [66, 1], [69, 1], [71, 1], [74, 1], [71, 2], [69, 1], [66, 1], [64, 1], [64, 3],
  [71, 1], [71, 1], [74, 1], [76, 1], [74, 1], [71, 1], [69, 1], [71, 1], [69, 1], [66, 3],
  [64, 1], [66, 1], [69, 1], [71, 1], [69, 1], [66, 1], [64, 1], [62, 1], [64, 1], [62, 3],
];
// 小節ごとの和音
const D = [50, 57, 62, 66], Bm = [47, 54, 59, 62], A = [45, 52, 57, 61], G = [43, 50, 55, 59], Em = [40, 47, 55, 59];
const LULL_CHORDS = [D, Bm, A, D, Bm, G, D, A, G, Em, D, Bm, A, G, A, D];

const SCALE = {
  lydianC: [60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 79],
  aDorian: [57, 60, 62, 64, 67, 69, 72, 74, 76],
  dDorian: [50, 53, 55, 57, 60, 62, 65, 67, 69],
  ePent: [64, 67, 69, 71, 74, 76, 79],
  dMajPent: [62, 64, 66, 69, 71, 74, 76, 78, 81],
};

const MOODS = {
  title: {
    bpm: 64, beats: 3, chords: LULL_CHORDS, chordBars: 1, melody: LULLABY, melodyInst: 'box', pad: 0.05, bass: 0.07, arp: 0.0,
    bells: 0.12, scale: SCALE.dMajPent, padCut: 1400,
  },
  surface: {
    bpm: 64, beats: 3, chords: LULL_CHORDS, chordBars: 1, melody: null, pad: 0.045, bass: 0.06, arp: 0.35, arpInst: 'pluck',
    bells: 0.05, scale: SCALE.dMajPent, padCut: 1600,
  },
  garden: {
    bpm: 72, beats: 4, chordBars: 2,
    chords: [[48, 55, 59, 64], [50, 54, 57, 62], [52, 55, 59, 62], [50, 55, 57, 62]],
    pad: 0.045, bass: 0.06, arp: 0.42, arpInst: 'pluck', bells: 0.06, scale: SCALE.lydianC, padCut: 1300,
  },
  reef: {
    bpm: 60, beats: 4, chordBars: 2,
    chords: [[45, 52, 59, 60, 64], [41, 48, 55, 57, 64], [43, 50, 55, 59, 64], [40, 47, 55, 59, 62]],
    pad: 0.05, bass: 0.07, arp: 0.18, arpInst: 'bell', bells: 0.1, scale: SCALE.aDorian, padCut: 1000,
  },
  ruins: {
    bpm: 48, beats: 4, chordBars: 2,
    chords: [[38, 45, 50, 53, 57], [36, 43, 48, 52, 55], [34, 41, 46, 50, 53], [33, 40, 45, 49, 52]],
    pad: 0.04, bass: 0.0, drone: [38, 45], choir: 0.035, arp: 0.12, arpInst: 'pluckLow', bells: 0.04, temple: 0.18,
    scale: SCALE.dDorian, padCut: 800,
  },
  cave: {
    bpm: 44, beats: 4, chordBars: 4,
    chords: [[40, 47, 54, 59, 66], [36, 43, 52, 55, 62]],
    pad: 0.03, bass: 0.0, drone: [28, 40], drips: 0.35, arp: 0.08, arpInst: 'box', bells: 0.0, scale: SCALE.ePent, padCut: 700,
  },
  memory: {
    bpm: 58, beats: 3, chords: LULL_CHORDS, chordBars: 1, melody: LULLABY, melodyInst: 'box', pad: 0.05, bass: 0.05, arp: 0, bells: 0,
    scale: SCALE.dMajPent, padCut: 1100,
  },
  ending: {
    bpm: 62, beats: 3, chords: LULL_CHORDS, chordBars: 1, melody: LULLABY, melodyInst: 'bell', strings: 0.04, pad: 0.06, bass: 0.08,
    arp: 0.25, arpInst: 'box', bells: 0.08, scale: SCALE.dMajPent, padCut: 1800,
  },
};

export class Music {
  constructor(ctx, out, reverb) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    this.out.connect(out);
    this.rev = ctx.createGain();
    this.rev.gain.value = 0.55;
    this.rev.connect(reverb);
    // ディレイ（音を水の中に溶かす）
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.47;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2200;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.5;
    dl.connect(dOut).connect(this.out);
    dOut.connect(this.rev);
    this.layer = null;
    this.name = null;
    this.timer = setInterval(() => this.tick(), 40);
  }

  setVolume(v) {
    this.out.gain.setTargetAtTime(v * 0.9, this.ctx.currentTime, 0.1);
  }

  setMood(name) {
    if (name === this.name) return;
    this.name = name;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.layer) {
      const old = this.layer;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + 2.5);
      old.dead = true;
      if (old.drones) for (const o of old.drones) o.stop(t + 3);
      setTimeout(() => old.gain.disconnect(), 6000);
    }
    if (!name || !MOODS[name]) {
      this.layer = null;
      return;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 3);
    g.connect(this.out);
    const send = ctx.createGain();
    send.gain.value = 1;
    g.connect(send).connect(this.rev);
    const dsend = ctx.createGain();
    dsend.gain.value = 0.35;
    g.connect(dsend).connect(this.delay);
    this.layer = { mood: MOODS[name], gain: g, beat: 0, next: t + 0.15, melIdx: 0, melNext: 0, droneOn: false, name };
  }

  tick() {
    const L = this.layer;
    if (!L || L.dead) return;
    const ctx = this.ctx;
    const m = L.mood;
    const spb = 60 / m.bpm;
    while (L.next < ctx.currentTime + 0.25) {
      this.onBeat(L, L.beat, L.next, spb);
      L.beat++;
      L.next += spb;
    }
  }

  onBeat(L, beat, t, spb) {
    const m = L.mood;
    const bar = Math.floor(beat / m.beats);
    const inBar = beat % m.beats;
    const chordIdx = Math.floor(bar / m.chordBars) % m.chords.length;
    const chord = m.chords[chordIdx];
    const out = L.gain;
    // 和音（小節の頭、和音が変わるとき）
    if (inBar === 0 && bar % m.chordBars === 0) {
      const dur = spb * m.beats * m.chordBars;
      if (m.pad) this.pad(out, t, chord, dur + spb, m.pad, m.padCut);
      if (m.strings) this.strings(out, t, chord.map((n) => n + 12), dur, m.strings);
      if (m.choir) this.choir(out, t, chord.slice(1, 4).map((n) => n + 12), dur, m.choir);
      if (m.bass) this.bassNote(out, t, chord[0] - (chord[0] > 45 ? 12 : 0), dur * 0.9, m.bass);
    }
    // 持続音（遺跡・洞窟）
    if (m.drone && !L.droneOn) {
      L.droneOn = true;
      L.drones = this.drone(out, t, m.drone);
    }
    // メロディ
    if (m.melody) {
      if (beat >= L.melNext) {
        const [note, len] = m.melody[L.melIdx % m.melody.length];
        this.voice(m.melodyInst, out, t, note, spb * len, 0.11);
        L.melNext = beat + len;
        L.melIdx++;
        // 一周したら 2 小節休む
        if (L.melIdx % m.melody.length === 0) L.melNext += m.beats * 2;
      }
    }
    // アルペジオ・ぽつぽつ鳴る音
    if (m.arp && Math.random() < m.arp) {
      const pool = Math.random() < 0.6 ? chord.map((n) => n + 12).filter((n) => n > 55) : m.scale;
      const note = pool[Math.floor(Math.random() * pool.length)] + (Math.random() < 0.3 ? 12 : 0);
      const off = Math.random() < 0.5 ? 0 : spb * 0.5;
      this.voice(m.arpInst, out, t + off, note, spb * 2, 0.07);
    }
    if (m.bells && Math.random() < m.bells * 0.5) {
      const note = m.scale[Math.floor(Math.random() * m.scale.length)] + 12;
      this.voice('bell', out, t + Math.random() * spb, note, spb * 3, 0.035);
    }
    if (m.temple && inBar === 0 && bar % 4 === 0 && Math.random() < 0.8) this.templeBell(out, t, m.temple);
    if (m.drips && Math.random() < m.drips) this.drip(out, t + Math.random() * spb);
  }

  // ---- 楽器 ----
  voice(kind, out, t, note, dur, vel) {
    switch (kind) {
      case 'box': return this.musicBox(out, t, note, vel);
      case 'bell': return this.fmBell(out, t, note, vel * 0.8, 3.2);
      case 'pluckLow': return this.pluck(out, t, note - 12, vel * 1.2);
      default: return this.pluck(out, t, note, vel);
    }
  }

  pad(out, t, notes, dur, vel, cut) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cut * 0.6, t);
    f.frequency.linearRampToValueAtTime(cut, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(cut * 0.7, t + dur);
    f.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(1.6, dur * 0.3));
    g.gain.setValueAtTime(vel, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.8);
    f.connect(g).connect(out);
    for (const n of notes) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 2);
      }
    }
  }

  strings(out, t, notes, dur, vel) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 1.2);
    g.gain.setValueAtTime(vel, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
    f.connect(g).connect(out);
    for (const n of notes.slice(1)) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5 + Math.random();
      const la = ctx.createGain();
      la.gain.value = 4;
      lfo.connect(la).connect(o.detune);
      o.connect(f);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 1.4);
      lfo.stop(t + dur + 1.4);
    }
  }

  choir(out, t, notes, dur, vel) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 2.0);
    g.gain.setValueAtTime(vel, t + dur - 0.5);
    g.gain.linearRampToValueAtTime(0, t + dur + 2.0);
    g.connect(out);
    for (const fr of [700, 1150]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr;
      bp.Q.value = 6;
      bp.connect(g);
      for (const n of notes) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 4.5 + Math.random();
        const la = ctx.createGain();
        la.gain.value = 6;
        lfo.connect(la).connect(o.detune);
        o.connect(bp);
        o.start(t);
        lfo.start(t);
        o.stop(t + dur + 2.2);
        lfo.stop(t + dur + 2.2);
      }
    }
  }

  bassNote(out, t, note, dur, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(note);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = hz(note);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.3);
    g.gain.setValueAtTime(vel, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(out);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.6);
    o2.stop(t + dur + 0.6);
  }

  drone(out, t, notes) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 6);
    f.connect(g).connect(out);
    const list = [];
    for (const n of notes) {
      for (const det of [-5, 4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        list.push(o);
      }
    }
    return list;
  }

  pluck(out, t, note, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(note);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = hz(note) * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(f).connect(out);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.5);
    o2.stop(t + 1.5);
  }

  musicBox(out, t, note, vel) {
    const ctx = this.ctx;
    const f0 = hz(note + 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    g.connect(out);
    for (const [mul, amp] of [[1, 1], [3.01, 0.18], [5.03, 0.06]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f0 * mul;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + 2.3);
    }
  }

  fmBell(out, t, note, vel, dur) {
    const ctx = this.ctx;
    const f = hz(note);
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    car.frequency.value = f;
    mod.frequency.value = f * 2.76;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.02, t + dur);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g).connect(out);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.1);
    mod.stop(t + dur + 0.1);
  }

  templeBell(out, t, vel) {
    const ctx = this.ctx;
    const base = 73;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
    g.connect(out);
    for (const [mul, amp] of [[1, 1], [2.02, 0.5], [2.76, 0.35], [4.07, 0.2], [5.4, 0.1]]) {
      const o = ctx.createOscillator();
      o.frequency.value = base * mul;
      const a = ctx.createGain();
      a.gain.value = amp * 0.4;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + 9.2);
    }
  }

  drip(out, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 900 + Math.random() * 900;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  }
}
