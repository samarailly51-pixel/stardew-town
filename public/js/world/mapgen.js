/**
 * 地图构建助手
 * ------------------------------------------------------------------
 * 手写 26x18 的 ASCII 地图太容易数错格子（少一个字符整行就错位）。
 * 于是把地图写成「底料 + 一小块一小块盖章」的形式：
 *
 *   const g = blank(26, 18, 'g', 'T');   // 26x18，铺花草地，四周一圈树
 *   stamp(g, 10, 3, ['AAAAA', '.....', 'AAAAA']);   // 在 (10,3) 盖一块苹果林
 *
 * 既好读，又不会错位；改布局只要挪一个坐标。
 */

/** 建一张字符网格 */
export function blank(w, h, fill = '.', border = null) {
  const g = [];
  for (let y = 0; y < h; y++) {
    const row = new Array(w).fill(fill);
    g.push(row);
  }
  if (border) borderRect(g, border);
  return g;
}

/** 画一圈边框 */
export function borderRect(g, char) {
  const h = g.length;
  const w = g[0].length;
  for (let x = 0; x < w; x++) {
    g[0][x] = char;
    g[h - 1][x] = char;
  }
  for (let y = 0; y < h; y++) {
    g[y][0] = char;
    g[y][w - 1] = char;
  }
}

export function set(g, x, y, char) {
  if (y < 0 || y >= g.length) return;
  if (x < 0 || x >= g[0].length) return;
  g[y][x] = char;
}

export function get(g, x, y) {
  if (y < 0 || y >= g.length) return ' ';
  if (x < 0 || x >= g[0].length) return ' ';
  return g[y][x];
}

/** 盖一块小地图：lines 是若干字符串，逐字符覆盖 */
export function stamp(g, x0, y0, lines) {
  lines.forEach((line, dy) => {
    for (let dx = 0; dx < line.length; dx++) set(g, x0 + dx, y0 + dy, line[dx]);
  });
}

export function rect(g, x, y, w, h, char) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) set(g, x + dx, y + dy, char);
  }
}

/** 只画边框的中空矩形（池塘外围那种） */
export function frame(g, x, y, w, h, char) {
  for (let dx = 0; dx < w; dx++) {
    set(g, x + dx, y, char);
    set(g, x + dx, y + h - 1, char);
  }
  for (let dy = 0; dy < h; dy++) {
    set(g, x, y + dy, char);
    set(g, x + w - 1, y + dy, char);
  }
}

export function hline(g, x, y, len, char) {
  for (let i = 0; i < len; i++) set(g, x + i, y, char);
}

export function vline(g, x, y, len, char) {
  for (let i = 0; i < len; i++) set(g, x, y + i, char);
}

/** 随机撒点：只覆盖 from 里的字符，不破坏已经画好的路和房子 */
export function scatter(g, char, count, rng, from = null, inset = 1) {
  const h = g.length;
  const w = g[0].length;
  let placed = 0;
  let guard = count * 40;
  while (placed < count && guard-- > 0) {
    const x = inset + Math.floor(rng.next() * (w - inset * 2));
    const y = inset + Math.floor(rng.next() * (h - inset * 2));
    const cur = g[y][x];
    if (from && !from.includes(cur)) continue;
    g[y][x] = char;
    placed++;
  }
  return placed;
}

/** 规则排列的点阵（果园、栅栏院子那种） */
export function grid(g, x, y, cols, rows, stepX, stepY, char) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) set(g, x + c * stepX, y + r * stepY, char);
  }
}

/** 网格 → 字符串数组（渲染层只认这个格式） */
export function render(g) {
  return g.map((row) => row.join(''));
}

/**
 * 在某一侧边界开一个缺口，并往内铺一小段路。
 * 传送点就放在缺口里，玩家「走到边上」就自然换场景。
 * @returns {{x:number,y:number}} 缺口内侧那一格（落脚点）
 */
export function carveGate(g, side, at, char = '=') {
  const h = g.length;
  const w = g[0].length;
  switch (side) {
    case 'west':
      set(g, 0, at, char); set(g, 0, at - 1, char); set(g, 0, at + 1, char);
      set(g, 1, at, char); set(g, 1, at - 1, char); set(g, 1, at + 1, char);
      return { x: 1, y: at };
    case 'east':
      set(g, w - 1, at, char); set(g, w - 1, at - 1, char); set(g, w - 1, at + 1, char);
      set(g, w - 2, at, char); set(g, w - 2, at - 1, char); set(g, w - 2, at + 1, char);
      return { x: w - 2, y: at };
    case 'north':
      set(g, at, 0, char); set(g, at - 1, 0, char); set(g, at + 1, 0, char);
      set(g, at, 1, char); set(g, at - 1, 1, char); set(g, at + 1, 1, char);
      return { x: at, y: 1 };
    default:
      set(g, at, h - 1, char); set(g, at - 1, h - 1, char); set(g, at + 1, h - 1, char);
      set(g, at, h - 2, char); set(g, at - 1, h - 2, char); set(g, at + 1, h - 2, char);
      return { x: at, y: h - 2 };
  }
}
