// 巨大な石像の頭（巫女の顔）。距離関数で彫り、Surface Nets でメッシュにする。
// ローカル座標：+Z が顔の正面、+Y が上。1 単位 = 1 m（高さ約 7.5 m）。
import { Noise, clamp, lerp } from '../core/noise.js';
import { buildGrid, surfaceNets } from './sdf.js';

const nz = new Noise(31337);
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
};
const smax = (a, b, k) => -smin(-a, -b, k);

function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx, qy = py / ry, qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
}
function cap(x, y, z, ax, ay, az, bx, by, bz, r) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

export function headSDF(x, y, z) {
  const S = 2.6; // 全体の大きさ
  const X = x / S, Y = y / S, Z = z / S;
  const ax = Math.abs(X);
  // 頭蓋と顔
  let d = ell(X, Y, Z, 0, 0.35, -0.05, 0.56, 0.66, 0.66);
  d = smin(d, ell(X, Y, Z, 0, -0.12, 0.12, 0.44, 0.56, 0.52), 0.18);
  // 頬
  d = smin(d, ell(ax, Y, Z, 0.24, -0.05, 0.32, 0.18, 0.2, 0.18), 0.12);
  // あご
  d = smin(d, ell(X, Y, Z, 0, -0.56, 0.32, 0.17, 0.14, 0.14), 0.14);
  // 眉の張り
  d = smin(d, cap(ax, Y, Z, 0.0, 0.22, 0.5, 0.26, 0.2, 0.42, 0.06), 0.08);
  // 鼻
  d = smin(d, cap(X, Y, Z, 0, 0.18, 0.54, 0, -0.12, 0.66, 0.055), 0.07);
  d = smin(d, ell(X, Y, Z, 0, -0.15, 0.62, 0.085, 0.06, 0.07), 0.05);
  // 目のくぼみと、閉じたまぶた
  d = smax(d, -ell(ax, Y, Z, 0.17, 0.09, 0.55, 0.12, 0.065, 0.1), 0.06);
  d = smin(d, ell(ax, Y, Z, 0.17, 0.075, 0.5, 0.105, 0.05, 0.075), 0.03);
  // 唇
  d = smin(d, cap(X, Y, Z, -0.11, -0.3, 0.55, 0.11, -0.3, 0.55, 0.038), 0.05);
  d = smin(d, cap(X, Y, Z, -0.09, -0.37, 0.53, 0.09, -0.37, 0.53, 0.035), 0.05);
  d = smax(d, -cap(X, Y, Z, -0.1, -0.335, 0.6, 0.1, -0.335, 0.6, 0.012), 0.02);
  // 耳
  d = smin(d, ell(ax, Y, Z, 0.53, 0.02, 0.0, 0.05, 0.14, 0.09), 0.06);
  // 首（途中で折れている）
  d = smin(d, cap(X, Y, Z, 0, -0.5, -0.05, 0, -1.2, -0.12, 0.3), 0.2);
  d = smax(d, -(Y + 0.95 + nz.n2(X * 4, Z * 4) * 0.08), 0.05);
  // 髪：頭頂から後ろへ流れる波打つ髪と、後ろのまげ
  const hairBase = ell(X, Y, Z, 0, 0.42, -0.1, 0.62, 0.66, 0.7);
  const front = Z * 0.9 + Y * 0.35 - 0.38; // 額より前には出さない
  const ang = Math.atan2(X, Z);
  const wave = Math.sin(ang * 13 + Y * 6) * 0.03 + Math.sin(ang * 29 - Y * 9) * 0.012;
  let hair = smax(hairBase + wave, front, 0.06);
  hair = smax(hair, -(Y + 0.15 - Math.max(0, -Z) * 0.25), 0.1);
  d = smin(d, hair, 0.05);
  d = smin(d, ell(X, Y, Z, 0, 0.32, -0.72, 0.32, 0.3, 0.26), 0.12);
  // 額の髪の房
  for (let i = -3; i <= 3; i++) {
    const cx = i * 0.11;
    d = smin(d, ell(X, Y, Z, cx, 0.5 - Math.abs(i) * 0.03, 0.42 - Math.abs(i) * 0.05, 0.075, 0.06, 0.06), 0.04);
  }
  // 額飾り（細い輪）
  const rr = Math.hypot(X / 0.6, (Z + 0.05) / 0.66) - 1;
  const band = Math.sqrt(rr * rr * 0.36 + (Y - 0.4 - Z * 0.12) * (Y - 0.4 - Z * 0.12)) - 0.018;
  d = smin(d, band + Math.max(0, nz.n2(X * 6, Z * 6)) * 0.03, 0.015);
  // 風化（欠けとざらつき）
  d += nz.fbm3(X * 3.0, Y * 3.0, Z * 3.0, 3) * 0.025 + Math.abs(nz.n3(X * 9, Y * 9, Z * 9)) * 0.01;
  // 右の頬から耳にかけて大きく欠けている
  d = smax(d, -ell(X, Y, Z, -0.55, -0.2, 0.25, 0.22, 0.3, 0.2), 0.06);
  return d * S;
}

export const HEAD_BOX = { min: [-2.0, -3.2, -2.9], max: [2.0, 3.0, 2.2], cell: 0.11 };

export function buildHead() {
  const grid = buildGrid(headSDF, HEAD_BOX);
  const geo = surfaceNets(grid);
  return { geo, grid };
}
