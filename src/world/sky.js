// 空（水上）と、水中で見える「青の奥行き」を描く大きな球。
import * as THREE from 'three';
import { U, UW_COMMON } from '../core/env.js';

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbmN(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
`;

export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: /* glsl */ `
      ${UW_COMMON}
      ${NOISE_GLSL}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c;
        if (uUnderwater > 0.5) {
          c = uwScatter(d, cameraPosition.y);
        } else {
          c = skyColor(d);
          float sd = dot(d, uSunDir);
          c += vec3(1.0, 0.94, 0.82) * smoothstep(0.99955, 0.99975, sd) * 40.0;
          if (d.y > -0.02) {
            vec2 cp = d.xz / (d.y + 0.12) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);
            float n = fbmN(cp * 1.6);
            float band = smoothstep(0.55, 0.05, d.y);
            float cov = mix(0.62, 0.42, band);
            float cl = smoothstep(cov, cov + 0.22, n) * smoothstep(-0.02, 0.06, d.y);
            float lit = smoothstep(0.2, 0.9, fbmN(cp * 1.6 + vec2(0.35, 0.6)));
            vec3 cloudC = mix(vec3(0.62, 0.68, 0.78), vec3(1.08, 1.06, 1.02), lit);
            cloudC += vec3(1.0, 0.9, 0.7) * pow(max(sd, 0.0), 12.0) * 0.4;
            c = mix(c, cloudC, cl * 0.9);
          }
        }
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.onBeforeRender = (r, s, cam) => {
    mesh.position.copy(cam.position);
    mesh.updateMatrixWorld();
  };
  return mesh;
}
