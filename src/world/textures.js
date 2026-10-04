// 起動時にコードで描くテクスチャ（すべてタイル状につながる）。
import * as THREE from 'three';
import { Noise, mulberry32, clamp } from '../core/noise.js';

const noise = new Noise(4242);

export function dataTexture(data, w, h, { srgb = false, repeat = true, mip = true, filter = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = filter ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mip;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// 高さ配列からタイル状の法線マップを作る
function heightToNormal(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size, xr = (x + 1) % size;
      const yu = (y - 1 + size) % size, yd = (y + 1) % size;
      const dx = (h[y * size + xr] - h[y * size + xl]) * strength;
      const dy = (h[yd * size + x] - h[yu * size + x]) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

const to8 = (v) => clamp(Math.round(v * 255), 0, 255);

function makeSand(size = 512) {
  const h = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  const rand = mulberry32(7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const warp = noise.tileFbm(u, v, 3, 3) * 1.3;
      const ph = (u * 9 + v * 2 + warp) * Math.PI * 2;
      const s = 0.5 + 0.5 * Math.sin(ph);
      const ripple = Math.pow(s, 1.6);
      const grain = noise.tile2(u * 128, v * 128, 128, 128) * 0.5 + noise.tile2(u * 64, v * 64, 64, 64) * 0.5;
      const mottle = noise.tileFbm(u, v, 4, 4);
      const ht = ripple * 0.75 + grain * 0.12 + mottle * 0.25;
      h[y * size + x] = ht;
      const base = 0.88 + mottle * 0.08 + ripple * 0.06 + grain * 0.05;
      let r = 0.8 * base, g = 0.74 * base, b = 0.6 * base;
      // 谷にたまった有機物で少し暗く・緑っぽく
      const trough = 1 - ripple;
      r -= trough * 0.07; g -= trough * 0.045; b -= trough * 0.05;
      // 貝殻のかけら・黒い粒
      const sp = rand();
      if (sp > 0.997) { r += 0.1; g += 0.1; b += 0.09; }
      else if (sp < 0.0015) { r *= 0.8; g *= 0.8; b *= 0.8; }
      const i = (y * size + x) * 4;
      alb[i] = to8(r); alb[i + 1] = to8(g); alb[i + 2] = to8(b); alb[i + 3] = 255;
    }
  }
  return {
    albedo: dataTexture(alb, size, size, { srgb: true }),
    normal: dataTexture(heightToNormal(h, size, 3.0), size, size),
  };
}

function makeRock(size = 512) {
  const h = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const f = noise.tileFbm(u, v, 4, 6, 0.55);
      const r1 = 1 - Math.abs(noise.tile2(u * 8, v * 8, 8, 8));
      const r2 = 1 - Math.abs(noise.tile2(u * 16 + 3.1, v * 16, 16, 16));
      const fine = noise.tile2(u * 96, v * 96, 96, 96);
      const ht = f * 0.6 + r1 * r1 * 0.35 + r2 * 0.15 + fine * 0.05;
      h[y * size + x] = ht;
      const tint = noise.tileFbm(u + 0.37, v + 0.11, 2, 3);
      const tint2 = noise.tileFbm(u + 0.71, v + 0.53, 3, 3);
      let br = 0.42 + f * 0.16 + r1 * 0.08 + fine * 0.04;
      let r = br * 1.02, g = br * 0.98, b = br * 0.92;
      // 石灰藻（ピンク〜紫）と藻（緑）のまだら
      const pink = clamp((tint - 0.15) * 3, 0, 1);
      r = r * (1 - pink * 0.5) + 0.62 * pink * 0.5;
      g = g * (1 - pink * 0.5) + 0.38 * pink * 0.5;
      b = b * (1 - pink * 0.5) + 0.5 * pink * 0.5;
      const green = clamp((tint2 - 0.2) * 3, 0, 1);
      r = r * (1 - green * 0.45) + 0.28 * green * 0.45;
      g = g * (1 - green * 0.45) + 0.4 * green * 0.45;
      b = b * (1 - green * 0.45) + 0.22 * green * 0.45;
      // くぼみは暗く
      const cav = clamp(1 - ht * 1.3, 0, 1);
      r *= 1 - cav * 0.45; g *= 1 - cav * 0.45; b *= 1 - cav * 0.4;
      const i = (y * size + x) * 4;
      alb[i] = to8(r); alb[i + 1] = to8(g); alb[i + 2] = to8(b); alb[i + 3] = 255;
    }
  }
  return {
    albedo: dataTexture(alb, size, size, { srgb: true }),
    normal: dataTexture(heightToNormal(h, size, 5.0), size, size),
  };
}

// 遺跡の石積み（目地・欠け・藻）
function makeBrick(size = 512) {
  const h = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  const rows = 6;
  const rand = mulberry32(99);
  // 各段のブロック境界をあらかじめ決める（タイル状につながるよう 0〜1 で一周）
  const rowCuts = [];
  for (let r = 0; r < rows; r++) {
    const n = 3 + Math.floor(rand() * 2);
    const cuts = [];
    const off = rand();
    for (let k = 0; k < n; k++) cuts.push((off + (k + rand() * 0.35) / n) % 1);
    cuts.sort((a, b) => a - b);
    rowCuts.push(cuts);
  }
  const blockShade = [];
  for (let i = 0; i < 64; i++) blockShade.push(rand());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const rv = v * rows;
      const row = Math.floor(rv);
      const fy = rv - row;
      const cuts = rowCuts[row];
      // u に一番近い切れ目までの距離と、ブロック番号
      let blk = 0, dmin = 1;
      for (let k = 0; k < cuts.length; k++) {
        let d = Math.abs(u - cuts[k]);
        d = Math.min(d, 1 - d);
        if (d < dmin) dmin = d;
        if (u >= cuts[k]) blk = k + 1;
      }
      blk = (row * 7 + (blk % cuts.length)) % 64;
      const dyEdge = Math.min(fy, 1 - fy) / rows; // in uv
      const edge = Math.min(dmin, dyEdge);
      const mortar = 1 - clamp((edge - 0.004) / 0.012, 0, 1);
      const er = noise.tileFbm(u, v, 8, 4, 0.5);
      const chip = clamp((noise.tileFbm(u + 0.3, v + 0.7, 16, 3) - 0.25) * 4, 0, 1);
      const bevel = clamp(edge / 0.02, 0, 1);
      const ht = (1 - mortar) * (0.6 + Math.sqrt(bevel) * 0.3) + er * 0.12 - chip * 0.15;
      h[y * size + x] = ht;
      const sh = 0.8 + blockShade[blk] * 0.3;
      let r = 0.58 * sh, g = 0.56 * sh, b = 0.5 * sh;
      const n2 = noise.tileFbm(u + 0.13, v + 0.29, 6, 4);
      r += n2 * 0.06; g += n2 * 0.06; b += n2 * 0.05;
      // 藻・苔
      const moss = clamp((noise.tileFbm(u + 0.9, v + 0.2, 3, 4) + (1 - fy) * 0.25 - 0.25) * 2.2, 0, 1);
      r = r * (1 - moss * 0.6) + 0.24 * moss * 0.6;
      g = g * (1 - moss * 0.6) + 0.36 * moss * 0.6;
      b = b * (1 - moss * 0.6) + 0.22 * moss * 0.6;
      const dark = mortar * 0.38 + chip * 0.15;
      r *= 1 - dark; g *= 1 - dark; b *= 1 - dark * 0.9;
      const i = (y * size + x) * 4;
      alb[i] = to8(r); alb[i + 1] = to8(g); alb[i + 2] = to8(b); alb[i + 3] = 255;
    }
  }
  return {
    albedo: dataTexture(alb, size, size, { srgb: true }),
    normal: dataTexture(heightToNormal(h, size, 4.0), size, size),
  };
}

function makeGrass(size = 256) {
  const alb = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const f = noise.tileFbm(u, v, 6, 5, 0.6);
      const f2 = noise.tileFbm(u + 0.5, v + 0.2, 2, 3);
      let r = 0.16 + f * 0.08 + f2 * 0.05;
      let g = 0.3 + f * 0.14 + f2 * 0.04;
      let b = 0.1 + f * 0.04;
      const i = (y * size + x) * 4;
      alb[i] = to8(r); alb[i + 1] = to8(g); alb[i + 2] = to8(b); alb[i + 3] = 255;
    }
  }
  return { albedo: dataTexture(alb, size, size, { srgb: true }) };
}

let cache = null;
export function getTextures() {
  if (!cache) {
    cache = {
      sand: makeSand(),
      rock: makeRock(),
      brick: makeBrick(),
      grass: makeGrass(),
    };
  }
  return cache;
}
