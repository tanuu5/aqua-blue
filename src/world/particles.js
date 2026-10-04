// 水中を漂う粒（マリンスノー）と、ダイバーの吐く泡。
import * as THREE from 'three';
import { U, UW_COMMON } from '../core/env.js';
import { mulberry32 } from '../core/noise.js';

export class MarineSnow {
  constructor(count = 2600, box = 34) {
    const rand = mulberry32(5);
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand() * box;
      pos[i * 3 + 1] = rand() * box;
      pos[i * 3 + 2] = rand() * box;
      sz[i] = 0.5 + rand() * rand() * 2.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uBox: { value: box }, uScale: { value: 400 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uBox;
        uniform float uScale;
        uniform vec3 uCam;
        attribute float aSize;
        varying vec3 vWp;
        varying float vFade;
        void main() {
          vec3 drift = vec3(sin(uTime * 0.05 + position.y) * 0.6, -uTime * 0.05, cos(uTime * 0.04 + position.x) * 0.6);
          vec3 p = mod(position + drift - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
          vWp = p;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = length(p - uCam);
          vFade = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d)) * smoothstep(0.3, 1.5, d) * step(p.y, -0.2);
          gl_PointSize = aSize * uScale * 0.012 / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        ${UW_COMMON}
        varying vec3 vWp;
        varying float vFade;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r = dot(q, q);
          if (r > 1.0 || vFade < 0.01) discard;
          float a = (1.0 - r) * vFade * 0.55;
          vec3 c = vec3(0.55, 0.75, 0.8) * exp(uLightAbsorb * min(vWp.y, 0.0) * 0.7);
          c = uwFog(c, vWp, 1.0);
          gl_FragColor = vec4(c * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'marine-snow';
  }

  update(camera, height) {
    this.mat.uniforms.uCam.value.copy(camera.position);
    this.mat.uniforms.uScale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.points.visible = camera.position.y < 0;
  }
}

export class Bubbles {
  constructor(max = 420) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.phase = new Float32Array(max);
    this.alive = 0;
    this.cursor = 0;
    this.rand = mulberry32(77);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aSize;
        varying vec3 vWp;
        varying float vOn;
        void main() {
          vWp = position;
          vOn = step(0.0005, aSize);
          vec4 mv = viewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        ${UW_COMMON}
        varying vec3 vWp;
        varying float vOn;
        void main() {
          if (vOn < 0.5) discard;
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r = length(q);
          if (r > 1.0) discard;
          float rim = smoothstep(0.55, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
          float hl = smoothstep(0.42, 0.0, length(q - vec2(-0.32, -0.34)));
          float a = rim * 0.75 + hl * 0.9 + 0.06;
          vec3 c = mix(vec3(0.6, 0.85, 0.95), vec3(1.4, 1.5, 1.5), hl);
          c *= exp(uLightAbsorb * min(vWp.y, 0.0) * 0.5);
          c = uwFog(c, vWp, 1.0);
          gl_FragColor = vec4(c * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'bubbles';
  }

  emit(p, count = 8, spread = 0.08, sizeMin = 0.012, sizeMax = 0.05, upSpeed = 0.4) {
    const R = this.rand;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = p.x + (R() - 0.5) * spread;
      this.pos[i * 3 + 1] = p.y + (R() - 0.5) * spread;
      this.pos[i * 3 + 2] = p.z + (R() - 0.5) * spread;
      this.vel[i * 3] = (R() - 0.5) * 0.3;
      this.vel[i * 3 + 1] = upSpeed * (0.5 + R() * 0.8);
      this.vel[i * 3 + 2] = (R() - 0.5) * 0.3;
      this.size[i] = sizeMin + Math.pow(R(), 2.2) * (sizeMax - sizeMin);
      this.life[i] = 12 + R() * 6;
      this.phase[i] = R() * 10;
    }
  }

  update(dt, camera, height) {
    this.mat.uniforms.uScale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const P = this.pos, Vv = this.vel, S = this.size, L = this.life, Ph = this.phase;
    for (let i = 0; i < this.max; i++) {
      if (S[i] <= 0) continue;
      L[i] -= dt;
      const y = P[i * 3 + 1];
      if (L[i] <= 0 || y > -0.04) {
        S[i] = 0;
        continue;
      }
      // 大きい泡ほど速く浮く、ゆらゆら揺れる
      const target = 0.25 + S[i] * 14;
      Vv[i * 3 + 1] += (target - Vv[i * 3 + 1]) * Math.min(1, dt * 2);
      Vv[i * 3] *= 1 - Math.min(1, dt * 1.5);
      Vv[i * 3 + 2] *= 1 - Math.min(1, dt * 1.5);
      const w = Math.sin(Ph[i] + L[i] * 9) * S[i] * 6;
      P[i * 3] += (Vv[i * 3] + w) * dt;
      P[i * 3 + 1] += Vv[i * 3 + 1] * dt;
      P[i * 3 + 2] += (Vv[i * 3 + 2] + Math.cos(Ph[i] + L[i] * 7) * S[i] * 4) * dt;
      // 浮き上がると水圧が下がって少しふくらむ
      S[i] *= 1 + dt * 0.012;
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.points.visible = camera.position.y < 0.5;
  }
}
