// 起動時に一度だけ焼く深度マップ。
//  - 光の遮蔽マップ：水中の光の向きから見た深度（洞窟の暗さ・光の筋・コースティクスの影）
//  - 上空マップ：真上から見た地形の高さ（水上から見たときの水深・浜の白波）
//  - 太陽の影：島まわり（粗い）と、ボートだけ（細かい）の 2 枚
import * as THREE from 'three';
import { U, LIGHT_DIR_UW, SUN_DIR } from '../core/env.js';

export const STATIC_LAYER = 1;
export const SUN_LAYER = 2;
export const BOAT_SUN_LAYER = 3;

function depthTarget(size) {
  const dt = new THREE.DepthTexture(size, size);
  dt.type = THREE.FloatType;
  dt.minFilter = THREE.NearestFilter;
  dt.magFilter = THREE.NearestFilter;
  return new THREE.WebGLRenderTarget(size, size, {
    depthTexture: dt,
    depthBuffer: true,
    type: THREE.UnsignedByteType,
  });
}

export function bakeMaps(renderer, scene, { boat = null } = {}) {
  const override = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const prevOverride = scene.overrideMaterial;
  const prevBg = scene.background;
  scene.overrideMaterial = override;
  scene.background = null;

  // 光の遮蔽マップ
  const occSize = 2048;
  const occ = depthTarget(occSize);
  const half = 270;
  const occCam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 420);
  const center = new THREE.Vector3(0, -20, -10);
  occCam.position.copy(center).addScaledVector(LIGHT_DIR_UW, -200);
  occCam.up.set(0, 0, -1);
  occCam.lookAt(center);
  occCam.updateMatrixWorld(true);
  occCam.layers.set(STATIC_LAYER);
  renderer.setRenderTarget(occ);
  renderer.clear();
  renderer.render(scene, occCam);

  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  U.uOccTex.value = occ.depthTexture;
  U.uOccMatrix.value.copy(bias).multiply(occCam.projectionMatrix).multiply(occCam.matrixWorldInverse);
  U.uOccRange.value = occCam.far - occCam.near;
  U.uOccTexel.value = 1 / occSize;

  // 上空マップ（真上から）
  const topSize = 1024;
  const top = depthTarget(topSize);
  const th = 260;
  const topCam = new THREE.OrthographicCamera(-th, th, th, -th, 0, 160);
  topCam.position.set(0, 60, 0);
  topCam.up.set(0, 0, -1);
  topCam.lookAt(0, 0, 0);
  topCam.updateMatrixWorld(true);
  topCam.layers.set(STATIC_LAYER);
  renderer.setRenderTarget(top);
  renderer.clear();
  renderer.render(scene, topCam);
  renderer.setRenderTarget(null);
  U.uTopTex.value = top.depthTexture;
  // xz -> uv、深度 d -> 高さ 60 - d*160
  U.uTopMatrix.value.set(1 / (2 * th), 0.5, -1 / (2 * th), 0.5);

  // 水上の太陽の影（島のまわりだけ）
  const sunSize = 2048;
  const sun = depthTarget(sunSize);
  const sh = 120;
  const sunCam = new THREE.OrthographicCamera(-sh, sh, sh, -sh, 1, 600);
  const sc = new THREE.Vector3(70, 5, -30);
  sunCam.position.copy(sc).addScaledVector(SUN_DIR, 300);
  sunCam.up.set(0, 1, 0);
  sunCam.lookAt(sc);
  sunCam.updateMatrixWorld(true);
  sunCam.layers.set(SUN_LAYER);
  renderer.setRenderTarget(sun);
  renderer.clear();
  renderer.render(scene, sunCam);
  renderer.setRenderTarget(null);
  U.uSunOccTex.value = sun.depthTexture;
  U.uSunOccMatrix.value.copy(bias).multiply(sunCam.projectionMatrix).multiply(sunCam.matrixWorldInverse);
  U.uSunOccRange.value = sunCam.far - sunCam.near;
  U.uSunOccTexel.value = 1 / sunSize;

  // ボートの太陽の影（ボートだけを細かく焼く）。島のマップでは目が粗く、甲板の影がガタガタになるため
  let boatSun = null;
  let boatSunBase = null;
  if (boat) {
    const size = 2048;
    const dt = new THREE.DepthTexture(size, size);
    dt.type = THREE.FloatType;
    // 比較つきで読むと、線形補間で影のふちがなめらかになる
    dt.compareFunction = THREE.LessEqualCompare;
    dt.minFilter = THREE.LinearFilter;
    dt.magFilter = THREE.LinearFilter;
    boatSun = new THREE.WebGLRenderTarget(size, size, { depthTexture: dt, depthBuffer: true, type: THREE.UnsignedByteType });
    boat.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(boat);
    const ctr = bb.getCenter(new THREE.Vector3());
    const rad = bb.getSize(new THREE.Vector3()).length() / 2;
    const cam = new THREE.OrthographicCamera(-rad, rad, rad, -rad, 0.5, rad * 2 + 1);
    cam.position.copy(ctr).addScaledVector(SUN_DIR, rad + 0.5);
    cam.up.set(0, 1, 0);
    cam.lookAt(ctr);
    cam.updateMatrixWorld(true);
    // 太陽から見たボートの形にぴったり合わせて、マップの目をできるだけ細かくする
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();
    boat.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
        lo.min(v);
        hi.max(v);
      }
    });
    const m = 0.3;
    cam.left = lo.x - m;
    cam.right = hi.x + m;
    cam.bottom = lo.y - m;
    cam.top = hi.y + m;
    cam.near = Math.max(0.05, -hi.z - m);
    cam.far = -lo.z + m;
    cam.updateProjectionMatrix();
    cam.layers.set(BOAT_SUN_LAYER);
    renderer.setRenderTarget(boatSun);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    U.uBoatSunTex.value = dt;
    U.uBoatSunBias.value = 0.02 / (cam.far - cam.near);
    U.uBoatSunTexel.value = 1 / size;
    // 焼いたときの姿勢を覚えておく。毎フレーム「今の姿勢 → 焼いたときの姿勢」に戻してから引く（World.update）
    boatSunBase = new THREE.Matrix4().copy(bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(boat.matrixWorld);
    U.uBoatSunMatrix.value.copy(boatSunBase).multiply(new THREE.Matrix4().copy(boat.matrixWorld).invert());
  }

  scene.overrideMaterial = prevOverride;
  scene.background = prevBg;
  override.dispose();
  return { occ, top, sun, boatSun, boatSunBase, occCam, topCam, sunCam };
}
