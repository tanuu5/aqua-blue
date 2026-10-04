// 海面。水中から見上げると「スネルの窓」と全反射、水上からは反射と透けた浅瀬。
import * as THREE from 'three';
import { U, UW_COMMON } from '../core/env.js';
import { Noise } from '../core/noise.js';
import { dataTexture } from './textures.js';
import { NOISE_GLSL } from './sky.js';

function makeWaveNormal(size = 256) {
  const n = new Noise(77);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      h[y * size + x] = n.tileFbm(u, v, 4, 5, 0.5) + 0.35 * n.tileFbm(u + 0.3, v + 0.6, 8, 3, 0.5);
    }
  }
  const out = new Uint8Array(size * size * 4);
  const s = 6.0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)]) * s;
      const dy = (h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x]) * s;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = (-dx / l * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return dataTexture(out, size, size);
}

export function buildWater() {
  const tNormal = makeWaveNormal();
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, tNormal: { value: tNormal } },
    vertexShader: /* glsl */ `
      varying vec3 vWp;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWp = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${UW_COMMON}
      ${NOISE_GLSL}
      uniform sampler2D tNormal;
      varying vec3 vWp;

      vec3 waveN(vec2 p, float dist) {
        vec2 a = texture2D(tNormal, p * 0.045 + vec2(uTime * 0.011, uTime * 0.007)).xy * 2.0 - 1.0;
        vec2 b = texture2D(tNormal, p * 0.1 + vec2(-uTime * 0.012, uTime * 0.016)).xy * 2.0 - 1.0;
        vec2 c = texture2D(tNormal, p * 0.27 + vec2(uTime * 0.03, -uTime * 0.02)).xy * 2.0 - 1.0;
        vec2 g = a * 0.55 + b * 0.5 + c * 0.35;
        g *= 1.0 / (1.0 + dist * 0.012);
        return normalize(vec3(g.x * 0.55, 1.0, g.y * 0.55));
      }

      void main() {
        vec3 V = vWp - cameraPosition;
        float dist = length(V);
        vec3 dir = V / max(dist, 1e-4);
        vec3 N = waveN(vWp.xz, dist);
        if (uUnderwater > 0.5) {
          vec3 n = -N;
          vec3 refr = refract(dir, n, 1.333);
          vec3 refl = reflect(dir, n);
          vec3 inner = uwScatter(refl, 0.0) * 0.85;
          vec3 col;
          if (dot(refr, refr) < 1e-4) {
            col = inner;
          } else {
            float cosI = max(dot(-dir, n), 0.0);
            float edge = smoothstep(0.0, 0.25, cosI - 0.66);
            vec3 sky = skyColor(refr) * 1.25;
            sky += vec3(1.0, 0.95, 0.85) * pow(max(dot(refr, uSunDir), 0.0), 600.0) * 30.0;
            sky += vec3(1.0, 0.95, 0.85) * pow(max(dot(refr, uSunDir), 0.0), 40.0) * 1.2;
            col = mix(inner, sky, edge);
          }
          vec3 tr = exp(-uAbsorb * dist);
          col = col * tr + uwScatter(dir, cameraPosition.y) * (1.0 - tr);
          gl_FragColor = vec4(col, 1.0);
        } else {
          float cosV = max(dot(-dir, N), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
          vec3 R = reflect(dir, N);
          R.y = abs(R.y);
          vec3 refl = skyColor(R);
          refl += vec3(1.0, 0.92, 0.75) * pow(max(dot(R, uSunDir), 0.0), 350.0) * 25.0;
          float topH = uwTopHeight(vWp.xz);
          if (topH < -150.0) topH = -120.0;
          float depth = max(-topH, 0.0);
          float path = depth / max(-dir.y, 0.12);
          float body = 1.0 - exp(-path * 0.055);
          vec3 deepC = uWaterDeep * 1.6 + vec3(0.0, 0.03, 0.08);
          vec3 shallowC = uWaterShallow * 0.9 + vec3(0.02, 0.12, 0.1);
          vec3 waterC = mix(shallowC, deepC, smoothstep(2.0, 30.0, depth));
          // 浅瀬の白波
          float foamN = vnoise(vWp.xz * 0.35 + uTime * 0.25) * 0.6 + vnoise(vWp.xz * 1.3 - uTime * 0.4) * 0.4;
          float foam = smoothstep(0.9, 0.0, depth) * smoothstep(0.35, 0.7, foamN) * step(-1.5, topH) * step(topH, 0.6);
          vec3 col = mix(waterC, refl, fres);
          col = mix(col, vec3(0.95), foam * 0.8);
          float alpha = clamp(max(body * 0.92, fres) + foam, 0.0, 1.0);
          float f = 1.0 - exp(-dist * uAirFog);
          col = mix(col, skyColor(dir), f);
          alpha = mix(alpha, 1.0, f);
          gl_FragColor = vec4(col, alpha);
        }
      }
    `,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
  const geo = new THREE.PlaneGeometry(3000, 3000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, s, cam) => {
    mesh.position.set(Math.round(cam.position.x / 10) * 10, 0, Math.round(cam.position.z / 10) * 10);
    mesh.updateMatrixWorld();
  };
  // 水上から見るときだけ半透明にする
  mesh.userData.setUnderwater = (uw) => {
    mat.transparent = !uw;
    mat.depthWrite = uw;
  };
  return mesh;
}
