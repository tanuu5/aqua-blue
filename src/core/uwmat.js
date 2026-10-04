// MeshStandardMaterial に水中ライティング（太陽・遮蔽・コースティクス・環境光）と
// 水中の霧を差し込む。ライトは潜水ライトなど少数だけを three.js 側に置き、
// 太陽と環境光はすべてここで計算する。
import * as THREE from 'three';
import { U, UW_COMMON } from './env.js';

export function patchUW(mat, opt = {}) {
  const per = {
    uSpec: { value: opt.spec ?? 0.12 },
    uShin: { value: opt.shininess ?? 24 },
    uEnvSpec: { value: opt.envSpec ?? 0.0 },
    uWrap: { value: opt.wrap ?? 0.0 },
    uCausMul: { value: opt.caustics ?? 1.0 },
    ...(opt.uniforms || {}),
  };
  const worldNormal = !!opt.worldNormal;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, per);
    let vs = shader.vertexShader;
    vs = vs.replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
varying vec3 vUwPos;
${worldNormal ? 'varying vec3 vUwNrm;' : ''}
${opt.vertexHead || ''}`
    );
    if (opt.normalBegin) {
      vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${opt.normalBegin}`);
    }
    if (opt.vertexBegin) {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${opt.vertexBegin}`);
    }
    vs = vs.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
{
  vec4 uwWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  uwWp = instanceMatrix * uwWp;
  #endif
  uwWp = modelMatrix * uwWp;
  vUwPos = uwWp.xyz;
  ${
    worldNormal
      ? `#ifdef USE_INSTANCING
  vUwNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
  #else
  vUwNrm = normalize(mat3(modelMatrix) * objectNormal);
  #endif`
      : ''
  }
}`
    );
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace(
      '#include <common>',
      `#include <common>
${UW_COMMON}
uniform float uSpec;
uniform float uShin;
uniform float uEnvSpec;
uniform float uWrap;
uniform float uCausMul;
varying vec3 vUwPos;
${worldNormal ? 'varying vec3 vUwNrm;' : ''}
float uwFogLight = 1.0;
${opt.fragmentHead || ''}`
    );
    if (opt.mapFragment) fs = fs.replace('#include <map_fragment>', opt.mapFragment);
    if (opt.normalFragment) fs = fs.replace('#include <normal_fragment_maps>', opt.normalFragment);
    if (opt.emissiveFragment) {
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${opt.emissiveFragment}`);
    }
    fs = fs.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
{
  vec3 uwN = inverseTransformDirection(normal, viewMatrix);
  float uwUnder = 1.0 - smoothstep(-0.25, 0.25, vUwPos.y);
  vec3 uwL = normalize(mix(uSunDir, -uLightDirUW, uwUnder));
  float uwNdl = dot(uwN, uwL);
  float uwDiff = uwSat((uwNdl + uWrap) / (1.0 + uWrap));
  float uwDepth = max(-vUwPos.y, 0.0);
  vec3 uwAtt = mix(vec3(1.0), exp(-uLightAbsorb * uwDepth), uwUnder);
  float uwUnderOcc = 0.0;
  float uwVis = 1.0;
  if (uwUnder > 0.0) uwVis = mix(1.0, uwOccVis(vUwPos, uwUnderOcc), uwUnder);
  if (uwUnder < 1.0) uwVis = mix(uwSunVisAir(vUwPos, uwN), uwVis, uwUnder);
  float uwAmbOcc = 1.0;
  if (uwUnder > 0.0) uwAmbOcc = mix(1.0, uwSkyAO(vUwPos, uwN), uwUnder);
  float uwCaus = 1.0;
  float uwCausAmt = 0.0;
  if (uwUnder > 0.0) {
    uwCaus = uwCaustics(vUwPos);
    uwCausAmt = uwUnder * uCaustStrength * uCausMul * smoothstep(0.0, 1.2, uwDepth) * exp(-uwDepth * 0.025)
      * uwSat(uwN.y * 0.9 + 0.35);
  }
  vec3 uwSun = uSunColor * uwAtt * (uwDiff * uwVis);
  reflectedLight.directDiffuse += material.diffuseColor * uwSun * mix(1.0, uwCaus, uwCausAmt);
  vec3 uwAmbS = mix(uAmbSkyAir, uAmbSkyWater, uwUnder);
  vec3 uwAmbG = mix(uAmbGndAir, uAmbGndWater, uwUnder);
  vec3 uwAmbAtt = mix(vec3(1.0), exp(-uLightAbsorb * uwDepth * 0.75), uwUnder);
  vec3 uwAmb = mix(uwAmbG, uwAmbS, uwN.y * 0.5 + 0.5) * uwAmbAtt * uwAmbOcc;
  reflectedLight.indirectDiffuse += material.diffuseColor * uwAmb;
  vec3 uwV = normalize(cameraPosition - vUwPos);
  vec3 uwH = normalize(uwL + uwV);
  reflectedLight.directSpecular += uwSun * (uSpec * pow(max(dot(uwN, uwH), 0.0), uShin));
  if (uEnvSpec > 0.0) {
    vec3 uwR = reflect(-uwV, uwN);
    vec3 uwEnv = mix(skyColor(uwR), uwScatter(uwR, vUwPos.y) * 1.8, uwUnder) * uwAmbOcc;
    float uwFres = pow(1.0 - max(dot(uwN, uwV), 0.0), 3.0);
    reflectedLight.indirectSpecular += uwEnv * (uEnvSpec * (0.35 + 0.65 * uwFres));
  }
  uwFogLight = mix(1.0, uwAmbOcc, uwUnder);
}`
    );
    fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = uwFog(gl_FragColor.rgb, vUwPos, uwFogLight);');
    shader.fragmentShader = fs;
    if (opt.onShader) opt.onShader(shader);
  };
  mat.customProgramCacheKey = () => 'uw:' + (opt.key || mat.type);
  mat.userData.uw = per;
  return mat;
}

// よく使う形：単色・頂点色の水中マテリアル
export function uwStandard(params = {}, opt = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, ...params });
  return patchUW(m, opt);
}
