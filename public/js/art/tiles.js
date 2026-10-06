/**
 * 地面瓦片
 * ------------------------------------------------------------------
 * 地图用 ASCII 字符串数组描述，一个字符 = 一格 16x16。
 * 地面层在进入场景时**一次性烘焙**成一张大画布，
 * 之后每帧只要 drawImage 一次，600 格的地图也毫无压力。
 */
import { C, pick } from './palette.js';
import { surface, px, rect, speckle } from './pixel.js';
import { makeRng, hash2 } from '../core/rng.js';

export const TILE = 16;

/** 会挡住路的字符：水、墙、门、树、石头、栅栏、箱子之类 */
export const SOLID = new Set([
  '~', '#',       // 深浅水
  'h', 'd',       // 房子墙体 / 门（门用传送点实现，本体不穿）
  'T', 'P', 'A', 'K', 'B', 'S', 'R', // 树 / 松树 / 苹果树 / 樱花树 / 灌木 / 树桩 / 石头
  'F', 'x', 'j', 's', // 栅栏 / 木箱 / 木桶 / 木牌
]);

/** 需要「按 y 排序、画在角色前后」的立体物件（地面先铺草，再叠物件） */
export const OBJECT_CHARS = new Set(['T', 'P', 'A', 'K', 'S', 'B', 'F', 'R', 'x', 'j', 's']);

/** 能走的地面字符，列表本身也是文档：改地图时对着它写就不会踩坑 */
export const WALKABLE = new Set([' ', '.', ',', '*', 'g', '=', '_', 'o', 'w', 'p']);

export function isSolid(char) {
  return SOLID.has(char);
}

/* ------------------------------------------------------------------ */
/* 单个地面格子的绘制                                                   */
/* ------------------------------------------------------------------ */

function grassBase(ctx, tx, ty, seed) {
  // 底色用「双色抖动」而不是纯色，看起来才有老像素游戏的味道
  rect(ctx, 0, 0, TILE, TILE, C.grass[0]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(tx * TILE + x, ty * TILE + y, seed);
      if (n > 0.82) px(ctx, x, y, C.grass[1]);
      else if (n < 0.1) px(ctx, x, y, C.grass[2]);
    }
  }
}

function drawGrass(ctx, tx, ty, seed, rng) {
  grassBase(ctx, tx, ty, seed);
  if (rng.chance(0.25)) {
    // 零星的浅色草尖
    const bx = rng.int(2, 12);
    const by = rng.int(3, 13);
    px(ctx, bx, by, C.grass[3]);
    px(ctx, bx, by + 1, C.grass[3]);
  }
}

function drawTuft(ctx, tx, ty, seed, rng) {
  grassBase(ctx, tx, ty, seed);
  const bx = rng.int(3, 11);
  const by = rng.int(4, 12);
  const dark = C.grassDark;
  px(ctx, bx, by, dark); px(ctx, bx, by + 1, dark); px(ctx, bx, by + 2, C.grass[3]);
  px(ctx, bx - 1, by + 1, dark); px(ctx, bx - 2, by + 2, dark);
  px(ctx, bx + 1, by + 1, dark); px(ctx, bx + 2, by + 2, dark);
}

function drawFlower(ctx, tx, ty, seed, rng) {
  grassBase(ctx, tx, ty, seed);
  const n = rng.int(1, 2);
  for (let i = 0; i < n; i++) {
    const fx = rng.int(2, 13);
    const fy = rng.int(3, 12);
    const col = pick(C.flower, rng.int(0, C.flower.length - 1));
    px(ctx, fx, fy, col);
    px(ctx, fx - 1, fy, col);
    px(ctx, fx + 1, fy, col);
    px(ctx, fx, fy - 1, col);
    px(ctx, fx, fy + 1, '#e8d06a');
  }
}

/** 参考图里那种「开满小白花」的草地 */
function drawFloweryGrass(ctx, tx, ty, seed, rng) {
  grassBase(ctx, tx, ty, seed);
  const n = rng.int(3, 7);
  for (let i = 0; i < n; i++) {
    px(ctx, rng.int(0, 15), rng.int(0, 15), rng.chance(0.7) ? C.white : '#ffe9a8');
  }
}

function drawPath(ctx, tx, ty, seed, rng) {
  rect(ctx, 0, 0, TILE, TILE, C.dirt[0]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(tx * TILE + x, ty * TILE + y, seed + 77);
      if (n > 0.78) px(ctx, x, y, C.dirt[2]);
      else if (n < 0.16) px(ctx, x, y, C.dirt[1]);
    }
  }
  // 几颗小石子
  for (let i = 0; i < 3; i++) {
    const sx = rng.int(2, 13);
    const sy = rng.int(2, 13);
    px(ctx, sx, sy, C.stone[1]);
    px(ctx, sx + 1, sy, C.stone[2]);
  }
  // 边缘做一点「啃掉」的不规则，跟草地衔接更自然
  for (let i = 0; i < 6; i++) {
    const edge = rng.int(0, 3);
    const t = rng.int(0, 15);
    const c = C.grass[0];
    if (edge === 0) px(ctx, t, 0, c);
    else if (edge === 1) px(ctx, t, 15, c);
    else if (edge === 2) px(ctx, 0, t, c);
    else px(ctx, 15, t, c);
  }
}

function drawSoil(ctx, tx, ty, seed, rng) {
  rect(ctx, 0, 0, TILE, TILE, C.soil);
  for (let y = 0; y < TILE; y += 3) rect(ctx, 1, y + 1, TILE - 2, 1, '#7a5836');
  speckle(ctx, 0, 0, TILE, TILE, [C.dirtDark, '#6f4f30'], 10, rng);
}

const isWaterChar = (ch) => ch === '~' || ch === '#';

/**
 * 在某一侧画一条起伏的岸线。
 * 水的四边如果都是笔直的直角，看起来就像个蓝色矩形；
 * 跟着格子哈希抖两像素，才有池塘的感觉。
 */
function shoreEdge(ctx, side, tx, ty, col) {
  for (let i = 0; i < TILE; i++) {
    const n = hash2(tx * TILE + (side === 'left' || side === 'right' ? 0 : i),
      ty * TILE + (side === 'up' || side === 'down' ? 0 : i), 991);
    const depth = n > 0.62 ? 2 : n > 0.25 ? 1 : 0;
    for (let d = 0; d < depth; d++) {
      if (side === 'up') px(ctx, i, d, col);
      else if (side === 'down') px(ctx, i, TILE - 1 - d, col);
      else if (side === 'left') px(ctx, d, i, col);
      else px(ctx, TILE - 1 - d, i, col);
    }
  }
}

function drawWater(ctx, tx, ty, seed, rng, deep, nb) {
  rect(ctx, 0, 0, TILE, TILE, deep ? C.waterDeep : C.water);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(tx * TILE + x, ty * TILE + y, seed + 31);
      if (n > 0.9) px(ctx, x, y, deep ? C.water : C.waterLight);
    }
  }
  // 两道横向波纹
  if (rng.chance(deep ? 0.25 : 0.6)) {
    const wy = rng.int(2, 12);
    const wx = rng.int(0, 6);
    rect(ctx, wx, wy, rng.int(4, 9), 1, deep ? C.water : C.waterFoam);
    if (!deep && rng.chance(0.5)) rect(ctx, wx + 2, wy + 3, rng.int(3, 6), 1, C.waterLight);
  }
  // 靠岸的那几条边打碎成起伏的岸线
  if (nb) {
    const shore = C.dirt[1];
    if (nb.up && !isWaterChar(nb.up)) shoreEdge(ctx, 'up', tx, ty, shore);
    if (nb.down && !isWaterChar(nb.down)) shoreEdge(ctx, 'down', tx, ty, shore);
    if (nb.left && !isWaterChar(nb.left)) shoreEdge(ctx, 'left', tx, ty, shore);
    if (nb.right && !isWaterChar(nb.right)) shoreEdge(ctx, 'right', tx, ty, shore);
  }
}

function drawWoodFloor(ctx, tx, ty, seed, rng) {
  rect(ctx, 0, 0, TILE, TILE, C.plank);
  for (let y = 0; y < TILE; y += 4) rect(ctx, 0, y, TILE, 1, C.woodDark);
  rect(ctx, 0, 0, 1, TILE, '#8a5f30');
  speckle(ctx, 0, 0, TILE, TILE, [C.woodLight, '#96683a'], 6, rng);
}

/**
 * 室内墙体。
 * 竖着拼木板 + 上一道顶部高光、下一道底部阴影，
 * 这样即使四面墙长得一样，也能看出「这是一圈墙」而不是一块空地。
 */
function drawWall(ctx, tx, ty, seed, rng) {
  rect(ctx, 0, 0, TILE, TILE, '#7a4f28');
  for (let x = 1; x < TILE; x += 5) rect(ctx, x, 0, 1, TILE, '#5f3c1c');
  speckle(ctx, 1, 2, TILE - 2, TILE - 4, ['#8a5f30', '#6b4423', '#96683a'], 12, rng);
  rect(ctx, 0, 0, TILE, 2, '#96683a');   // 顶面（受光）
  rect(ctx, 0, 1, TILE, 1, '#a8763f');
  rect(ctx, 0, TILE - 2, TILE, 1, '#4a2d13');
  rect(ctx, 0, TILE - 1, TILE, 1, '#3b230f');
}

function drawStoneFloor(ctx, tx, ty, seed, rng) {
  rect(ctx, 0, 0, TILE, TILE, C.stone[1]);
  rect(ctx, 1, 1, 6, 6, C.stone[0]);
  rect(ctx, 9, 1, 6, 6, C.stone[2]);
  rect(ctx, 1, 9, 6, 6, C.stone[2]);
  rect(ctx, 9, 9, 6, 6, C.stone[0]);
  speckle(ctx, 0, 0, TILE, TILE, [C.stoneDark], 5, rng);
}

function drawVoid(ctx) {
  rect(ctx, 0, 0, TILE, TILE, '#101a10');
}

const GROUND_PAINTERS = {
  ' ': drawGrass,
  '.': drawGrass,
  ',': drawTuft,
  '*': drawFlower,
  g: drawFloweryGrass,
  '=': drawPath,
  _: drawSoil,
  '~': (c, tx, ty, s, r, nb) => drawWater(c, tx, ty, s, r, false, nb),
  '#': (c, tx, ty, s, r, nb) => drawWater(c, tx, ty, s, r, true, nb),
  w: drawWoodFloor,
  o: drawStoneFloor,
  h: drawWall,
};

/** 物件脚下铺什么地面：树长在草上，木牌长在泥路上 */
const UNDER_OBJECT = {
  T: '.', P: '.', A: '.', K: '.', B: '.', S: '.', R: '=',
  F: '.', x: '=', j: '=', s: '=',
};

/* ------------------------------------------------------------------ */
/* 烘焙整张地面                                                         */
/* ------------------------------------------------------------------ */

/**
 * 把 ASCII 地图的地面层画进一张 (cols*16) x (rows*16) 的画布。
 * @returns {{canvas: HTMLCanvasElement, cols: number, rows: number, w: number, h: number}}
 */
export function bakeGround(map, seed) {
  const rows = map.length;
  const cols = Math.max(...map.map((r) => r.length));
  const { canvas, ctx } = surface(cols * TILE, rows * TILE);

  for (let ty = 0; ty < rows; ty++) {
    const line = map[ty];
    for (let tx = 0; tx < cols; tx++) {
      const raw = line[tx] ?? ' ';
      // 物件格：先铺它脚下的地面，物件本体之后单独画
      const char = OBJECT_CHARS.has(raw) ? (UNDER_OBJECT[raw] ?? '.') : raw;
      const painter = GROUND_PAINTERS[char] ?? drawVoid;
      const rng = makeRng((ty * 73856093) ^ (tx * 19349663) ^ seed);
      // 四邻的字符：画水面岸线、路边缘之类要靠它判断「这边是不是靠岸」
      const nb = {
        up: charAt(map, tx, ty - 1),
        down: charAt(map, tx, ty + 1),
        left: charAt(map, tx - 1, ty),
        right: charAt(map, tx + 1, ty),
      };
      ctx.save();
      ctx.translate(tx * TILE, ty * TILE);
      painter(ctx, tx, ty, seed, rng, nb);
      ctx.restore();
    }
  }
  return { canvas, cols, rows, w: cols * TILE, h: rows * TILE };
}

/** 场景加载时把地图规整成等宽矩阵，方便按 (tx,ty) 取字符 */
export function normalizeMap(map) {
  const cols = Math.max(...map.map((r) => r.length));
  return map.map((r) => r.padEnd(cols, ' '));
}

export function charAt(map, tx, ty) {
  if (ty < 0 || ty >= map.length) return ' ';
  const line = map[ty];
  if (tx < 0 || tx >= line.length) return ' ';
  return line[tx] ?? ' ';
}
