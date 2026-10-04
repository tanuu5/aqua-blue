// 入力（キーボード・マウス・ゲームパッド）をまとめて「操作」にする。
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = 0;
    this.pressedButtons = 0;
    this.locked = false;
    this.wantLock = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.gp = null;
    this.gpPrev = [];
    this.gpPressed = new Set();
    this.lastDevice = 'kbm';
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
      this.lastDevice = 'kbm';
      // ブラウザの既定動作（スクロール・タブ移動）を止める
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = 0;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // 一部の環境で異常に大きい値が来ることがあるので抑える
      this.mouseDX += Math.max(-200, Math.min(200, e.movementX));
      this.mouseDY += Math.max(-200, Math.min(200, e.movementY));
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) this.lastDevice = 'kbm';
    });
    canvas.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.pressedButtons |= 1 << e.button;
      this.lastDevice = 'kbm';
      if (this.wantLock && !this.locked) this.requestLock();
    });
    addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true }
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    if (this.locked) return;
    // 使えない環境（埋め込み表示など）でも黙って失敗させ、次のクリックで再挑戦する
    const plain = () => {
      try {
        const p2 = this.canvas.requestPointerLock();
        if (p2 && p2.catch) p2.catch(() => {});
      } catch {
        /* noop */
      }
    };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(plain);
    } catch {
      plain();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.gp = gp;
    this.gpPressed.clear();
    this.stickNav = null;
    if (!gp) return;
    const now = gp.buttons.map((b) => b.pressed);
    now.forEach((v, i) => {
      if (v && !this.gpPrev[i]) {
        this.gpPressed.add(i);
        this.lastDevice = 'pad';
      }
    });
    this.gpPrev = now;
    const ax = gp.axes;
    if (ax.some((a) => Math.abs(a) > 0.3)) this.lastDevice = 'pad';
    // 左スティックでもメニューを動かせるように（倒した瞬間と、倒しっぱなしの連続入力）
    const sx = this.axis(0), sy = this.axis(1);
    const dir = sy < -0.6 ? 'u' : sy > 0.6 ? 'd' : sx < -0.6 ? 'l' : sx > 0.6 ? 'r' : null;
    const tNow = performance.now();
    if (dir) {
      if (dir !== this._navDir) {
        this.stickNav = dir;
        this._navT = tNow + 380;
      } else if (tNow > this._navT) {
        this.stickNav = dir;
        this._navT = tNow + 150;
      }
    }
    this._navDir = dir;
  }

  axis(i) {
    if (!this.gp) return 0;
    const v = this.gp.axes[i] || 0;
    const dz = 0.15;
    return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz);
  }

  btn(i) {
    return !!(this.gp && this.gp.buttons[i] && this.gp.buttons[i].pressed);
  }

  btnValue(i) {
    return this.gp && this.gp.buttons[i] ? this.gp.buttons[i].value : 0;
  }

  key(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.pressedKeys.has(code);
  }

  // ---- 操作（ゲーム側はこれだけを見る）----
  get move() {
    let x = 0, y = 0;
    if (this.key('KeyW') || this.key('ArrowUp')) y += 1;
    if (this.key('KeyS') || this.key('ArrowDown')) y -= 1;
    if (this.key('KeyD') || this.key('ArrowRight')) x += 1;
    if (this.key('KeyA') || this.key('ArrowLeft')) x -= 1;
    x += this.axis(0);
    y -= this.axis(1);
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  get vertical() {
    let v = 0;
    if (this.key('Space')) v += 1;
    if (this.key('KeyC') || this.key('KeyQ')) v -= 1;
    if (this.btn(0)) v += 1; // A
    if (this.btn(1)) v -= 1; // B
    return Math.max(-1, Math.min(1, v));
  }

  get dash() {
    return this.key('ShiftLeft') || this.key('ShiftRight') || this.btn(4) || this.btn(10);
  }

  // 視点の回転量（ラジアン）
  look(dt) {
    const s = 0.0022 * this.sensitivity;
    let dx = this.mouseDX * s;
    let dy = this.mouseDY * s;
    dx += this.axis(2) * 2.6 * dt * this.sensitivity;
    dy += this.axis(3) * 2.0 * dt * this.sensitivity;
    if (this.invertY) dy = -dy;
    return { dx, dy };
  }

  get aim() {
    return (this.buttons & 4) !== 0 || this.btnValue(6) > 0.4;
  }

  get shutter() {
    return (this.pressedButtons & 1) !== 0 || this.gpPressed.has(7);
  }

  get interact() {
    return this.pressed('KeyE') || this.pressed('Enter') || this.gpPressed.has(2);
  }

  get light() {
    return this.pressed('KeyF') || this.gpPressed.has(3);
  }

  get pause() {
    return this.pressed('Escape') || this.pressed('KeyP') || this.gpPressed.has(9);
  }

  get zoom() {
    let z = -this.wheel;
    if (this.btn(12)) z += 0.25;
    if (this.btn(13)) z -= 0.25;
    return z;
  }

  // メニュー操作
  get menuUp() {
    return this.pressed('ArrowUp') || this.pressed('KeyW') || this.gpPressed.has(12) || this.stickNav === 'u';
  }
  get menuDown() {
    return this.pressed('ArrowDown') || this.pressed('KeyS') || this.gpPressed.has(13) || this.stickNav === 'd';
  }
  get menuLeft() {
    return this.pressed('ArrowLeft') || this.pressed('KeyA') || this.gpPressed.has(14) || this.gpPressed.has(4) || this.stickNav === 'l';
  }
  get menuRight() {
    return this.pressed('ArrowRight') || this.pressed('KeyD') || this.gpPressed.has(15) || this.gpPressed.has(5) || this.stickNav === 'r';
  }
  get menuOk() {
    return this.pressed('Enter') || this.pressed('Space') || this.pressed('KeyE') || this.gpPressed.has(0);
  }
  get menuBack() {
    return this.pressed('Escape') || this.pressed('Backspace') || this.gpPressed.has(1);
  }
  get anyPressed() {
    return this.pressedKeys.size > 0 || this.pressedButtons !== 0 || this.gpPressed.size > 0;
  }

  // フレームの終わりに呼ぶ
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.pressedKeys.clear();
    this.pressedButtons = 0;
  }
}
