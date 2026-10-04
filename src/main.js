import * as THREE from 'three';
import { U } from './core/env.js';
import { PostFX } from './core/postfx.js';
import { Input } from './core/input.js';
import { Save } from './core/save.js';
import { World } from './world/world.js';
import { Player } from './player/player.js';
import { Creatures } from './creatures/creatures.js';
import { Game } from './game/game.js';
import { Glyphs } from './ui/glyphs.js';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.rotation.order = 'YXZ';
const post = new PostFX(renderer);
const world = new World(renderer);
const input = new Input(renderer.domElement);

const fill = document.querySelector('.ld-fill');
const ldText = document.querySelector('.ld-text');
await world.build((p, msg) => {
  fill.style.width = `${Math.round(p * 92)}%`;
  if (msg) ldText.textContent = msg;
});
ldText.textContent = '生き物を放しています…';
await new Promise((r) => setTimeout(r, 0));
const creatures = new Creatures(world);
world.scene.add(creatures.group);
const player = new Player(world, camera);
const game = new Game({ renderer, camera, post, world, creatures, player, input, uiRoot: document.getElementById('ui') });

// シェーダーを先にまとめて準備しておく（最初の数フレームのカクつきを減らす）
ldText.textContent = '光を合わせています…';
fill.style.width = '96%';
await new Promise((r) => setTimeout(r, 0));
camera.position.set(0, -6, 60);
camera.updateMatrixWorld();
try {
  renderer.compile(world.scene, camera);
} catch {
  /* 失敗しても描画時に作られる */
}
fill.style.width = '100%';
const loadingEl = document.getElementById('loading');
loadingEl.classList.add('done');
setTimeout(() => loadingEl.remove(), 1500);

// 開発用：?at=x,y,z,yaw,pitch でいきなり潜る、?cam=... で自由カメラ（公開ビルドでは無効）
const params = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams();
let free = params.has('cam');
const fc = (params.get('cam') || '0,-6,60,0,0').split(',').map(Number);
let fyaw = fc[3] || 0, fpitch = fc[4] || 0;
if (free) camera.position.set(fc[0], fc[1], fc[2]);
if (params.has('at')) {
  const sp = params.get('at').split(',').map(Number);
  Save.loadSettings();
  game.applySettings();
  Save.ensure();
  game.fragments.sync(Save.data);
  player.spawn(sp[0], sp[1], sp[2], sp[3] || 0, sp[4] || 0);
  game.state = 'play';
  game.hud.show(true);
  input.wantLock = true;
} else if (!free) {
  game.start();
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

let shotReq = null;
// 確認用の道具（開発サーバーのときだけ。公開版には入れない）
if (import.meta.env.DEV) {
  window.__dbg = {
    THREE, U, camera, world, renderer, post, player, input, creatures, game, Save, Glyphs,
    setCam(x, y, z, yw = 0, pt = 0) { free = true; camera.position.set(x, y, z); fyaw = yw; fpitch = pt; },
    play() { free = false; },
    shot(name) { return new Promise((res) => (shotReq = { name, res })); },
  };
}

const clock = new THREE.Timer();
let time = 0;
const sizeNow = new THREE.Vector2();
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function frame(ts, manual = false) {
  renderer.getSize(sizeNow);
  if (sizeNow.x !== window.innerWidth || sizeNow.y !== window.innerHeight) resize();
  clock.update(manual ? undefined : ts);
  const dt = manual ? 1 / 60 : Math.min(clock.getDelta(), 0.05);
  time += dt;
  input.pollGamepad();
  Glyphs.update(input, Save.settings.padGlyphs);

  if (free) {
    camera.rotation.set(fpitch, fyaw, 0);
    const spd = (input.key('ShiftLeft') ? 30 : 8) * dt;
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    if (input.key('KeyW')) camera.position.addScaledVector(fwd, spd);
    if (input.key('KeyS')) camera.position.addScaledVector(fwd, -spd);
    if (input.key('KeyD')) camera.position.addScaledVector(right, spd);
    if (input.key('KeyA')) camera.position.addScaledVector(right, -spd);
    if (input.key('KeyE')) camera.position.y += spd;
    if (input.key('KeyQ')) camera.position.y -= spd;
    const lk = input.look(dt);
    fyaw -= lk.dx;
    fpitch -= lk.dy;
    camera.updateMatrixWorld();
  } else {
    game.update(dt);
  }
  creatures.update(dt, { playerPos: player.pos, playerSpeed: player.speed });
  world.update(dt, time, camera);
  post.render(world.scene, camera);
  game.afterRender();
  if (shotReq) {
    const { name, res } = shotReq;
    shotReq = null;
    const url = renderer.domElement.toDataURL('image/jpeg', 0.9);
    fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url }).then(() => res(name));
  }
  input.endFrame();
  if (!manual) {
    autoQuality(dt);
    requestAnimationFrame(frame);
  }
}

// 重いときは内部の解像度を少しずつ下げる（最大 3 回）
let slowT = 0, avgDt = 1 / 60, drops = 0;
function autoQuality(dt) {
  avgDt += (dt - avgDt) * 0.05;
  if (game.state !== 'play' || document.hidden) return;
  slowT = avgDt > 1 / 42 ? slowT + dt : 0;
  if (slowT > 3 && drops < 3) {
    slowT = 0;
    drops++;
    post.setQuality({ maxPx: Math.max(0.9e6, post.quality.maxPx * 0.7) });
  }
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) {
  // ペインが隠れていて rAF が止まっているときの確認用：数コマ描く
  window.__dbg.renderOnce = (n = 1) => {
    for (let i = 0; i < n; i++) frame(undefined, true);
  };
  // n コマ進めてから shots/ に保存する
  window.__dbg.snap = async (name, n = 1) => {
    if (n > 1) window.__dbg.renderOnce(n - 1);
    const p = window.__dbg.shot(name);
    frame(undefined, true);
    await p;
    return name;
  };
}
