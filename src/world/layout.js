// マップの配置（単位はメートル。y=0 が海面、-Z が北）。
export const BOAT = { x: 0, z: 72, yaw: -0.5 };
export const ISLAND = { x: 100, z: -42 };
export const REEF = { x: -95, z: -25 };
export const RUINS = { x: 2, z: -120, floor: -31 };
export const GARDEN = { x: 0, z: 70 };

// 青の洞窟：島の南西の崖から入り、中の広間を抜けて北側の「青の窓」へ
export const CAVE = {
  entrance: [55, -18, -28],
  bend: [68, -17, -38],
  chamber: [84, -16, -50],
  window: [82, -15, -86],
};

// 遊べる範囲（ここを越えると潮に押し戻される）
export const BOUNDS = { minX: -185, maxX: 185, minZ: -185, maxZ: 168 };

export const AREAS = [
  { id: 'garden', name: 'サンゴの庭', en: 'Coral Garden', x: 0, z: 70, r: 70 },
  { id: 'reef', name: 'マンタの根', en: 'Manta Pinnacles', x: -95, z: -25, r: 62 },
  { id: 'ruins', name: '沈んだ神殿', en: 'Sunken Temple', x: 2, z: -120, r: 62 },
  { id: 'cave', name: '青の洞窟', en: 'Blue Grotto', x: 76, z: -54, r: 34 },
  { id: 'drop', name: '外洋の崖', en: 'The Drop-off', x: 0, z: 165, r: 45 },
];
