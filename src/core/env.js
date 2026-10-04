// 水中・水上の見え方を決める共有ユニフォームと GLSL 関数。
// すべてのマテリアル・空・水面・ポストエフェクトがこれを共有する。
import * as THREE from 'three';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (r, g, b) => new THREE.Color(r, g, b);

// 太陽の方向（太陽へ向かう向き）。南西の空、仰角およそ 55°
export const SUN_DIR = v3(-0.4, 0.82, 0.41).normalize();
// 水中での光の進む向き：屈折で鉛直から約 25° に傾く
export const LIGHT_DIR_UW = (() => {
  const h = v3(-SUN_DIR.x, 0, -SUN_DIR.z).normalize();
  const elev = Math.asin(SUN_DIR.y);
  const inAir = Math.PI / 2 - elev; // angle from vertical
  const inWater = Math.asin(Math.sin(inAir) / 1.333);
  return v3(h.x * Math.sin(inWater), -Math.cos(inWater), h.z * Math.sin(inWater)).normalize();
})();

export const U = {
  uTime: { value: 0 },
  uUnderwater: { value: 1 },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: col(1.0, 0.95, 0.86).multiplyScalar(1.15) },
  uLightDirUW: { value: LIGHT_DIR_UW.clone() },
  uWaterDeep: { value: col(0.0, 0.014, 0.048) },
  uWaterShallow: { value: col(0.012, 0.19, 0.42) },
  uAbsorb: { value: v3(0.14, 0.05, 0.034) },
  uLightAbsorb: { value: v3(0.068, 0.028, 0.018) },
  uSkyZenith: { value: col(0.06, 0.22, 0.62) },
  uSkyHorizon: { value: col(0.5, 0.68, 0.88) },
  uAirFog: { value: 0.0011 },
  uAmbSkyAir: { value: col(0.32, 0.42, 0.55) },
  uAmbGndAir: { value: col(0.12, 0.12, 0.1) },
  uAmbSkyWater: { value: col(0.16, 0.42, 0.62) },
  uAmbGndWater: { value: col(0.04, 0.12, 0.18) },
  uCaustTex: { value: null },
  uCaustScale: { value: 1 / 7 },
  uCaustStrength: { value: 1.0 },
  uOccTex: { value: null },
  uOccMatrix: { value: new THREE.Matrix4() },
  uOccRange: { value: 400 },
  uOccTexel: { value: 1 / 2048 },
  uTopTex: { value: null },
  uTopMatrix: { value: new THREE.Vector4(0, 0, 1, 1) }, // xz -> uv: (x*a+b, z*c+d)
  uDiveLight: { value: 0 },
  uSunOccTex: { value: null },
  uSunOccMatrix: { value: new THREE.Matrix4() },
  uSunOccRange: { value: 300 },
  uSunOccTexel: { value: 1 / 2048 },
  // ボートだけの細かい太陽の影（比較つきの深度テクスチャ）。行列はボートの揺れに合わせて毎フレーム更新する
  uBoatSunTex: { value: null },
  uBoatSunMatrix: { value: new THREE.Matrix4().makeScale(0, 0, 0) },
  uBoatSunBias: { value: 0 },
  uBoatSunTexel: { value: 1 / 1024 },
};

export const UW_COMMON = /* glsl */ `
uniform float uTime;
uniform float uUnderwater;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uLightDirUW;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec3 uAbsorb;
uniform vec3 uLightAbsorb;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uAirFog;
uniform vec3 uAmbSkyAir;
uniform vec3 uAmbGndAir;
uniform vec3 uAmbSkyWater;
uniform vec3 uAmbGndWater;
uniform sampler2D uCaustTex;
uniform float uCaustScale;
uniform float uCaustStrength;
uniform sampler2D uOccTex;
uniform mat4 uOccMatrix;
uniform float uOccRange;
uniform float uOccTexel;
uniform sampler2D uTopTex;
uniform vec4 uTopMatrix;
uniform sampler2D uSunOccTex;
uniform mat4 uSunOccMatrix;
uniform float uSunOccRange;
uniform float uSunOccTexel;
uniform sampler2DShadow uBoatSunTex;
uniform mat4 uBoatSunMatrix;
uniform float uBoatSunBias;
uniform float uBoatSunTexel;

float uwSat(float x) { return clamp(x, 0.0, 1.0); }

// 水上の空の色（太陽のにじみ込み）
vec3 skyColor(vec3 dir) {
  float h = max(dir.y, 0.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(h + 1e-4, 0.5));
  float sd = max(dot(dir, uSunDir), 0.0);
  c += vec3(1.0, 0.86, 0.62) * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.5);
  // 水平線より下（遠景の海）は少し落とす
  c = mix(c, uSkyHorizon * 0.8, uwSat(-dir.y * 4.0));
  return c;
}

// 水中で dir の方向を見たときの散乱光の色（深さ y で暗くなる）
vec3 uwScatter(vec3 dir, float y) {
  float up = uwSat(dir.y * 0.5 + 0.5);
  float k = up * up * (3.0 - 2.0 * up);
  vec3 c = mix(uWaterDeep, uWaterShallow, k);
  float s = max(dot(dir, -uLightDirUW), 0.0);
  c += uWaterShallow * (pow(s, 4.0) * 0.55 + pow(s, 24.0) * 0.6);
  c *= exp(uLightAbsorb * min(y, 0.0) * 0.6);
  return c;
}

// 光の遮蔽（上空からの「影」）。返り値は 0〜1、under は遮蔽物の下に何 m 潜っているか
float uwOccVis(vec3 wp, out float under) {
  vec3 c = (uOccMatrix * vec4(wp, 1.0)).xyz;
  under = 0.0;
  if (c.x <= 0.001 || c.x >= 0.999 || c.y <= 0.001 || c.y >= 0.999) return 1.0;
  float d0 = texture2D(uOccTex, c.xy).r;
  under = max((c.z - d0) * uOccRange, 0.0);
  // 遮蔽物から離れるほど影はぼやける（水中の散乱）
  float o = uOccTexel * (1.5 + min(under, 14.0) * 0.9);
  float k = uOccRange / (1.2 + under * 0.25);
  float v = uwSat((d0 - c.z) * k + 1.0);
  v += uwSat((texture2D(uOccTex, c.xy + vec2(o, 0.0)).r - c.z) * k + 1.0);
  v += uwSat((texture2D(uOccTex, c.xy - vec2(o, 0.0)).r - c.z) * k + 1.0);
  v += uwSat((texture2D(uOccTex, c.xy + vec2(0.0, o)).r - c.z) * k + 1.0);
  v += uwSat((texture2D(uOccTex, c.xy - vec2(0.0, o)).r - c.z) * k + 1.0);
  return v * 0.2;
}

// 水上の太陽の影（島の崖や木の影）
float uwSunVisAir(vec3 wp, vec3 n) {
  float vis = 1.0;
  // 島まわりの大きなマップ（目が粗いので、法線方向に大きめにずらして引く）
  vec3 c = (uSunOccMatrix * vec4(wp + n * 0.15, 1.0)).xyz;
  if (c.x > 0.001 && c.x < 0.999 && c.y > 0.001 && c.y < 0.999 && c.z < 1.0) {
    float k = uSunOccRange / 0.6;
    float b = 0.25 / uSunOccRange;
    float o = uSunOccTexel * 1.2;
    float v = uwSat((texture2D(uSunOccTex, c.xy + vec2(o, o)).r - c.z + b) * k + 1.0);
    v += uwSat((texture2D(uSunOccTex, c.xy + vec2(-o, o)).r - c.z + b) * k + 1.0);
    v += uwSat((texture2D(uSunOccTex, c.xy + vec2(o, -o)).r - c.z + b) * k + 1.0);
    v += uwSat((texture2D(uSunOccTex, c.xy + vec2(-o, -o)).r - c.z + b) * k + 1.0);
    vis = v * 0.25;
  }
  // ボートの影（細かいマップ）。比較つきの線形補間を 3x3 で重ね、ふちのギザギザをぼかす
  vec3 q = (uBoatSunMatrix * vec4(wp + n * 0.025, 1.0)).xyz;
  if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0 && q.z > 0.0 && q.z < 1.0) {
    float r = q.z - uBoatSunBias;
    float o = uBoatSunTexel * 1.5;
    float s = 0.0;
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        s += textureLod(uBoatSunTex, vec3(q.xy + vec2(float(i), float(j)) * o, r), 0.0);
      }
    }
    vis *= s / 9.0;
  }
  return vis;
}

// 真上から見た地形の高さ（上空マップ）
float uwTopHeight(vec2 xz) {
  vec2 uv = vec2(xz.x * uTopMatrix.x + uTopMatrix.y, xz.y * uTopMatrix.z + uTopMatrix.w);
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return -200.0;
  return 60.0 - texture2D(uTopTex, uv).r * 160.0;
}

// 頭上を岩にふさがれているほど環境光が減る（洞窟・アーチの下・張り出し）
float uwSkyAO(vec3 wp, vec3 n) {
  vec3 p = wp + n * 2.2;
  float t = 0.4;
  float c = max(uwTopHeight(p.xz + vec2(t, 0.0)) - p.y, 0.0)
          + max(uwTopHeight(p.xz - vec2(t, 0.0)) - p.y, 0.0)
          + max(uwTopHeight(p.xz + vec2(0.0, t)) - p.y, 0.0)
          + max(uwTopHeight(p.xz - vec2(0.0, t)) - p.y, 0.0);
  return mix(0.08, 1.0, exp(-max(c * 0.25 - 2.0, 0.0) * 0.09));
}

// コースティクス（水面の波で集まった光の模様）。光の向きに沿って水面へ投影して引く
float uwCaustics(vec3 wp) {
  vec2 s = wp.xz - uLightDirUW.xz * (wp.y / uLightDirUW.y);
  vec2 uv = s * uCaustScale;
  float depth = max(-wp.y, 0.0);
  float bias = clamp(depth * 0.05 - 0.4, 0.0, 2.5);
  float d = 0.0025 + depth * 0.00012;
  float r = texture2D(uCaustTex, uv + vec2(d, 0.0), bias).r;
  float g = texture2D(uCaustTex, uv, bias).r;
  float b = texture2D(uCaustTex, uv - vec2(d, 0.0), bias).r;
  return (r + g + b) * 0.3333;
}

// 霧（水中は波長ごとの吸収と散乱、水上は大気のかすみ）
vec3 uwFog(vec3 col, vec3 wp, float lightAmt) {
  vec3 V = wp - cameraPosition;
  float dist = length(V);
  vec3 dir = V / max(dist, 1e-4);
  if (uUnderwater > 0.5) {
    float d = dist;
    if (wp.y > 0.0 && dir.y > 1e-4) d = min(dist, -cameraPosition.y / dir.y);
    vec3 tr = exp(-uAbsorb * d);
    // 洞窟の中の水は暗いが、遠くを見るほど途中の開けた水の明るさが勝つ
    float la = max(lightAmt, 1.0 - exp(-dist * 0.045));
    vec3 sc = uwScatter(dir, cameraPosition.y) * la;
    return col * tr + sc * (1.0 - tr);
  }
  if (wp.y < 0.0 && dir.y < -1e-4) {
    float tS = cameraPosition.y / -dir.y;
    float uw = max(dist - tS, 0.0);
    vec3 tr = exp(-uAbsorb * uw * 1.1);
    col = col * tr + uWaterShallow * 0.42 * (1.0 - tr);
  }
  float f = 1.0 - exp(-dist * uAirFog);
  return mix(col, skyColor(dir), f);
}
`;
