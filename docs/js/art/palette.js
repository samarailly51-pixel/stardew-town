/**
 * 像素调色板
 * ------------------------------------------------------------------
 * 颜色全部集中在这里，想换季（春天樱花 / 秋天红叶 / 冬天下雪）
 * 只要换这一份色表，所有程序化生成的贴图都会跟着变。
 */

export const C = {
  // 草
  grass:      ['#4a8b3b', '#54984a', '#3f7a33', '#5fa851'],
  grassDark:  '#33682a',
  grassLight: '#79c464',

  // 泥路 / 土地
  dirt:       ['#c9a06a', '#bd935d', '#d4ac78'],
  dirtDark:   '#9d7746',
  soil:       '#8a6540',

  // 水
  water:      '#3f86b8',
  waterLight: '#63a9d4',
  waterDeep:  '#2c6791',
  waterFoam:  '#cfe9f5',

  // 木头
  wood:      '#8b5a2b',
  woodDark:  '#5f3c1c',
  woodLight: '#b07d4a',
  plank:     '#a8763f',

  // 屋顶
  roof:      '#b0522c',
  roofDark:  '#7d3719',
  roofLight: '#cf6b3d',
  roofBlue:  '#3f6f9e',
  roofBlueD: '#2b4f73',
  roofGreen: '#4c7a3a',

  // 树叶
  leaf:      ['#2f6b34', '#3d8340', '#25542a', '#4b9a48'],
  leafAutumn:['#c9762b', '#dd9138', '#a55c1f', '#e8ab4c'],
  leafPink:  ['#e59ac4', '#d77aae', '#f2b6d6', '#c96a9d'],
  leafPine:  ['#245038', '#2e6746', '#1b3c2a', '#377a52'],

  // 石头
  stone:     ['#9aa3ad', '#868f99', '#b3bbc4'],
  stoneDark: '#6c747d',

  // 通用
  outline:   '#2b1d16',
  white:     '#f6f2e4',
  cream:     '#fdf6e6',
  gold:      '#f0b429',
  goldDark:  '#c98a12',
  red:       '#c0392b',
  glass:     '#a8d8e8',
  glassDark: '#78b4cb',

  // 皮肤 / 头发（角色用）
  skin:      ['#f2c99b', '#e0b184', '#c98f63', '#a9713f'],
  hair:      ['#3a2a1e', '#6b4423', '#c98a12', '#8b3a2b', '#2b2b3a', '#a8907a', '#c0392b', '#4a6b8b'],

  // 花
  flower:    ['#ffffff', '#ffd76e', '#ff9ec4', '#b48ce0', '#ff7b6b'],
};

/** 一组颜色里按固定索引取一个，越界就绕回来 */
export function pick(list, i) {
  return list[((i % list.length) + list.length) % list.length];
}

/** 把 #rrggbb 调亮/调暗，amount 为 -1~1 */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amount >= 0) {
    r = cl(r + (255 - r) * amount);
    g = cl(g + (255 - g) * amount);
    b = cl(b + (255 - b) * amount);
  } else {
    r = cl(r * (1 + amount));
    g = cl(g * (1 + amount));
    b = cl(b * (1 + amount));
  }
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
