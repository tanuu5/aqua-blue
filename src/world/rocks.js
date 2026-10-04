// SDF から作る大きな岩（島・岩の塔）のメッシュとマテリアル。
import * as THREE from 'three';
import { patchUW } from '../core/uwmat.js';
import { TERRAIN_GLSL } from './terrain.js';
import { buildGrid, surfaceNets, islandSDF, islandColumn, ISLAND_BOX, reefSDF, REEF_BOX } from './sdf.js';

export function rockMaterial(tex, key = 'rock') {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  return patchUW(m, {
    key,
    worldNormal: true,
    spec: 0.05,
    uniforms: {
      tSand: { value: tex.sand.albedo },
      tSandN: { value: tex.sand.normal },
      tRock: { value: tex.rock.albedo },
      tRockN: { value: tex.rock.normal },
      tGrass: { value: tex.grass.albedo },
    },
    fragmentHead: TERRAIN_GLSL.replace('varying vec2 vMat;', '') + '\nuniform sampler2D tGrass;\n',
    mapFragment: /* glsl */ `
      vec3 tN = normalize(vUwNrm);
      vec3 tw = pow(abs(tN), vec3(4.0));
      tw /= (tw.x + tw.y + tw.z + 1e-5);
      float wy = vUwPos.y;
      vec3 rockC = triTex(tRock, vUwPos, 0.15, tw);
      vec3 sandC = triTex(tSand, vUwPos, 0.33, tw);
      float macro = texture2D(tRock, vUwPos.xz * 0.043 + vUwPos.y * 0.02).g;
      float flatT = smoothstep(0.6, 0.88, tN.y + (macro - 0.45) * 0.3);
      float sandW = flatT * (1.0 - smoothstep(-1.5, 0.0, wy)) * 0.9;
      float beachW = smoothstep(0.7, 0.9, tN.y) * (1.0 - smoothstep(1.4, 3.2, wy + macro));
      float grassW = smoothstep(0.5, 0.78, tN.y + macro * 0.25) * smoothstep(2.4, 5.0, wy + macro * 3.0);
      vec3 grassC = texture2D(tGrass, vUwPos.xz * 0.18).rgb * (1.0 + macro * 0.7);
      float dry = smoothstep(0.4, 1.8, wy);
      if (dry > 0.0) {
        // 水上の崖は白っぽい石灰岩。縦の雨だれと横の地層
        float lum = dot(rockC, vec3(0.3, 0.55, 0.15));
        float streak = texture2D(tRock, vec2((vUwPos.x + vUwPos.z) * 0.11, vUwPos.y * 0.012)).g;
        float strata = 0.9 + 0.1 * sin(wy * 2.3 + macro * 4.0);
        vec3 lime = vec3(0.84, 0.8, 0.71) * (0.5 + lum * 1.3) * (0.78 + streak * 0.4) * strata;
        rockC = mix(rockC * vec3(0.9, 0.95, 1.0), lime, dry);
      }
      vec3 albedo = mix(rockC, sandC * mix(1.0, 1.12, dry), max(sandW, beachW));
      albedo = mix(albedo, grassC, grassW);
      float wet = (1.0 - smoothstep(0.1, 1.4, wy)) * smoothstep(-0.8, 0.1, wy);
      albedo *= 1.0 - wet * 0.4;
      diffuseColor.rgb *= albedo;
      float uwSandMix = max(sandW, beachW) * (1.0 - grassW);
    `,
    normalFragment: /* glsl */ `
      {
        vec3 nR = triN(tRockN, vUwPos, tN, 0.15, tw);
        vec3 nS = triN(tSandN, vUwPos, tN, 0.33, tw);
        vec3 nW = normalize(mix(nR, nS, uwSandMix));
        nW = normalize(mix(nW, tN, grassW * 0.6));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }
    `,
  });
}

export function buildIsland(tex) {
  const grid = buildGrid(islandSDF, ISLAND_BOX, islandColumn);
  const geo = surfaceNets(grid);
  const mesh = new THREE.Mesh(geo, rockMaterial(tex, 'rock-island'));
  mesh.name = 'island';
  return { mesh, grid };
}

export function buildReef(tex) {
  const grid = buildGrid(reefSDF, REEF_BOX);
  const geo = surfaceNets(grid);
  const mesh = new THREE.Mesh(geo, rockMaterial(tex, 'rock-reef'));
  mesh.name = 'reef';
  return { mesh, grid };
}
