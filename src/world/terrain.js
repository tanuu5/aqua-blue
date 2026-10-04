// 海底の高さ場（砂地・岩場）。島や岩の塔は sdf.js 側の立体で作る。
import * as THREE from 'three';
import { Noise, lerp, smoothstep, radial, clamp } from '../core/noise.js';
import { patchUW } from '../core/uwmat.js';
import { BOAT, REEF, RUINS, ISLAND } from './layout.js';

const noise = new Noise(1337);

export function seabedHeight(x, z) {
  let h = -15;
  h = lerp(h, -9, radial(x, z, BOAT.x, BOAT.z + 2, 26, 88));
  h = lerp(h, -26, radial(x, z, REEF.x, REEF.z, 30, 85));
  h = lerp(h, -31.5, radial(x, z, RUINS.x, RUINS.z, 40, 92));
  h = lerp(h, -24, radial(x, z, ISLAND.x, ISLAND.z, 25, 85));
  const drop = smoothstep(122, 185, z);
  const wall = Math.max(smoothstep(150, 205, -z), smoothstep(160, 215, Math.abs(x)));
  h = lerp(h, -5, wall * (1 - drop));
  h += noise.fbm2(x * 0.011, z * 0.011, 4) * 3.2 + noise.fbm2(x * 0.045 + 7.3, z * 0.045 - 2.1, 3) * 0.9;
  // 遺跡の基壇のまわりは平らにならす
  const flat = radial(x, z, RUINS.x, RUINS.z - 4, 22, 34);
  h = lerp(h, RUINS.floor + noise.fbm2(x * 0.08, z * 0.08, 2) * 0.25, flat);
  h = lerp(h, -78, drop);
  return h;
}

// 描画用の格子と同じ高さを双一次補間で引く（当たり判定・魚の回避用に速い）
let HF = null;
export function seabedHeightFast(x, z) {
  if (!HF) return seabedHeight(x, z);
  const fx = ((x + HF.half) / (HF.half * 2)) * HF.seg;
  const fz = ((z + HF.half) / (HF.half * 2)) * HF.seg;
  if (fx < 0 || fz < 0 || fx >= HF.seg || fz >= HF.seg) return seabedHeight(x, z);
  const i = fx | 0, j = fz | 0;
  const tx = fx - i, tz = fz - j;
  const n = HF.seg + 1, d = HF.data;
  const a = d[j * n + i], b = d[j * n + i + 1], c = d[(j + 1) * n + i], e = d[(j + 1) * n + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (e - c) * tx) * tz;
}

export function seabedNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.4;
  const hx = seabedHeight(x + e, z) - seabedHeight(x - e, z);
  const hz = seabedHeight(x, z + e) - seabedHeight(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

// 岩っぽさ（0〜1）。斜面・岩場エリアほど高い
function rockiness(x, z, ny) {
  const slope = smoothstep(0.86, 0.66, ny);
  const patch = smoothstep(0.25, 0.6, noise.fbm2(x * 0.03 + 11, z * 0.03 - 5, 3));
  const reef = radial(x, z, REEF.x, REEF.z, 25, 60) * 0.55;
  const wall = smoothstep(140, 190, Math.max(-z, Math.abs(x)));
  return clamp(Math.max(slope, patch * 0.42, reef * (0.5 + patch), wall * 0.8), 0, 1);
}

export const TERRAIN_GLSL = /* glsl */ `
uniform sampler2D tSand;
uniform sampler2D tSandN;
uniform sampler2D tRock;
uniform sampler2D tRockN;
varying vec2 vMat;
vec3 triTex(sampler2D t, vec3 p, float s, vec3 w) {
  return texture2D(t, p.zy * s).rgb * w.x + texture2D(t, p.xz * s).rgb * w.y + texture2D(t, p.xy * s).rgb * w.z;
}
vec3 triN(sampler2D t, vec3 p, vec3 n, float s, vec3 w) {
  vec3 tx = texture2D(t, p.zy * s).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(t, p.xz * s).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(t, p.xy * s).xyz * 2.0 - 1.0;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}
`;

export function buildSeabed(tex) {
  const half = 250;
  const seg = 340;
  const n = seg + 1;
  const pos = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  const mat = new Float32Array(n * n * 2);
  const tmp = new THREE.Vector3();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + (i / seg) * half * 2;
      const z = -half + (j / seg) * half * 2;
      const y = seabedHeight(x, z);
      const k = j * n + i;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      seabedNormal(x, z, tmp);
      nrm[k * 3] = tmp.x; nrm[k * 3 + 1] = tmp.y; nrm[k * 3 + 2] = tmp.z;
      mat[k * 2] = rockiness(x, z, tmp.y);
      mat[k * 2 + 1] = clamp(noise.fbm2(x * 0.05 - 3, z * 0.05 + 9, 3) * 1.5 + 0.2, 0, 1);
    }
  }
  const hdata = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) hdata[k] = pos[k * 3 + 1];
  HF = { half, seg, data: hdata };
  const idx = new Uint32Array(seg * seg * 6);
  let p = 0;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();

  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  patchUW(m, {
    key: 'seabed',
    worldNormal: true,
    spec: 0.04,
    uniforms: {
      tSand: { value: tex.sand.albedo },
      tSandN: { value: tex.sand.normal },
      tRock: { value: tex.rock.albedo },
      tRockN: { value: tex.rock.normal },
    },
    vertexHead: 'attribute vec2 aMat; varying vec2 vMat;',
    vertexBegin: 'vMat = aMat;',
    fragmentHead: TERRAIN_GLSL,
    mapFragment: /* glsl */ `
      vec3 tN = normalize(vUwNrm);
      vec3 tw = pow(abs(tN), vec3(4.0));
      tw /= (tw.x + tw.y + tw.z + 1e-5);
      float rockW = smoothstep(0.3, 0.7, vMat.x);
      vec3 sandC = triTex(tSand, vUwPos, 0.33, tw);
      float macro = texture2D(tSand, vUwPos.xz * 0.027, 4.0).r;
      sandC *= 0.55 + macro * 0.62;
      vec3 rockC = triTex(tRock, vUwPos, 0.19, tw);
      vec3 albedo = mix(sandC, rockC, rockW);
      albedo = mix(albedo, albedo * vec3(0.7, 0.86, 0.66), vMat.y * 0.55 * (1.0 - rockW * 0.5));
      diffuseColor.rgb *= albedo;
    `,
    normalFragment: /* glsl */ `
      {
        vec3 nS = triN(tSandN, vUwPos, tN, 0.33, tw);
        vec3 nR = triN(tRockN, vUwPos, tN, 0.19, tw);
        vec3 nW = normalize(mix(nS, nR, rockW));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = 'seabed';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
