// 乱数とノイズ（シード付き）。地形・テクスチャ・配置の生成に使う。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const GX8 = new Float32Array(8);
const GY8 = new Float32Array(8);
for (let i = 0; i < 8; i++) {
  GX8[i] = Math.cos((i * Math.PI) / 4);
  GY8[i] = Math.sin((i * Math.PI) / 4);
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

export class Noise {
  constructor(seed = 1) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  // 2D simplex noise, range about [-1, 1]
  n2(xin, yin) {
    const perm = this.perm;
    const pm = this.permMod12;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi = pm[ii + perm[jj]] * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi = pm[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi = pm[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2);
    }
    return 70 * n;
  }

  // 3D simplex noise, range about [-1, 1]
  n3(xin, yin, zin) {
    const perm = this.perm;
    const pm = this.permMod12;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const gi = pm[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0 + GRAD3[gi + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const gi = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1 + GRAD3[gi + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const gi = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2 + GRAD3[gi + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const gi = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n += t3 * t3 * (GRAD3[gi] * x3 + GRAD3[gi + 1] * y3 + GRAD3[gi + 2] * z3);
    }
    return 32 * n;
  }

  fbm2(x, y, oct = 4, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += a * this.n2(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return s / norm;
  }

  fbm3(x, y, z, oct = 4, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += a * this.n3(x * f, y * f, z * f);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return s / norm;
  }

  // ridged: sharp crests (rock strata, coral grooves)
  ridge2(x, y, oct = 4) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += a * (1 - Math.abs(this.n2(x * f, y * f)));
      norm += a;
      a *= 0.5;
      f *= 2;
    }
    return s / norm;
  }

  // periodic gradient noise for tileable textures (period in lattice cells, <= 256)
  tile2(x, y, px, py) {
    const perm = this.perm;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    let x0 = xi % px; if (x0 < 0) x0 += px;
    let y0 = yi % py; if (y0 < 0) y0 += py;
    const x1 = x0 + 1 === px ? 0 : x0 + 1;
    const y1 = y0 + 1 === py ? 0 : y0 + 1;
    const h00 = perm[(perm[x0 & 255] + y0) & 255] & 7;
    const h10 = perm[(perm[x1 & 255] + y0) & 255] & 7;
    const h01 = perm[(perm[x0 & 255] + y1) & 255] & 7;
    const h11 = perm[(perm[x1 & 255] + y1) & 255] & 7;
    const n00 = GX8[h00] * xf + GY8[h00] * yf;
    const n10 = GX8[h10] * (xf - 1) + GY8[h10] * yf;
    const n01 = GX8[h01] * xf + GY8[h01] * (yf - 1);
    const n11 = GX8[h11] * (xf - 1) + GY8[h11] * (yf - 1);
    const nx0 = n00 + (n10 - n00) * u;
    const nx1 = n01 + (n11 - n01) * u;
    return (nx0 + (nx1 - nx0) * v) * 1.4;
  }

  // tileable fbm over [0,1)^2 with base period p
  tileFbm(u, v, p, oct = 5, gain = 0.5) {
    let a = 1, s = 0, norm = 0, per = p;
    for (let o = 0; o < oct; o++) {
      s += a * this.tile2(u * per, v * per, per, per);
      norm += a;
      a *= gain;
      per *= 2;
    }
    return s / norm;
  }
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// 中心 (cx,cz) から r0 までは 1、r1 で 0 になる滑らかな円形マスク
export const radial = (x, z, cx, cz, r0, r1) => {
  const d = Math.hypot(x - cx, z - cz);
  return 1 - smoothstep(r0, r1, d);
};
