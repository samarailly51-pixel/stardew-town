/**
 * 立体物件 & 建筑
 * ------------------------------------------------------------------
 * 树、石头、栅栏、木屋……全部按种子程序化画出来并缓存成小画布。
 * 每张图都带一个「锚点」：锚点对齐到格子的底边中点，
 * 这样一棵 40px 高的树站在哪一格就一目了然，也方便按 y 排序遮挡角色。
 */
import { C, pick, shade } from './palette.js';
import { surface, px, rect, speckle } from './pixel.js';
import { makeRng } from '../core/rng.js';
import { TILE } from './tiles.js';

/* ------------------------------------------------------------------ */
/* 通用零件                                                            */
/* ------------------------------------------------------------------ */

/** 用随机圆斑堆一个树冠 */
function canopy(ctx, cx, cy, r, colors, rng, outlineColor = C.outline) {
  const inBlob = (x, y) => {
    const dx = (x - cx) / (r * 1.05);
    const dy = (y - cy) / (r * 0.92);
    return dx * dx + dy * dy <= 1;
  };
  // 先铺一团深色当轮廓
  for (let y = Math.floor(cy - r) - 1; y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r) - 1; x <= cx + r + 1; x++) {
      if (inBlob(x, y)) px(ctx, x, y, outlineColor);
    }
  }
  // 再内缩一圈填叶子
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!inBlob(x, y)) continue;
      const n = rng.next();
      const dist = Math.hypot(x - cx, y - cy) / r;
      let col = colors[0];
      if (n > 0.86) col = colors[3];
      else if (n > 0.6) col = colors[1];
      if (dist > 0.72) col = colors[2];
      // 左上受光
      if (x < cx - r * 0.25 && y < cy) col = shade(col, 0.12);
      px(ctx, x, y, col);
    }
  }
}

function trunk(ctx, x, yTop, yBottom, w = 4, col = C.wood, dark = C.woodDark) {
  rect(ctx, x, yTop, w, yBottom - yTop, col);
  rect(ctx, x, yTop, 1, yBottom - yTop, shade(col, 0.18));
  rect(ctx, x + w - 1, yTop, 1, yBottom - yTop, dark);
}

/* ------------------------------------------------------------------ */
/* 树                                                                  */
/* ------------------------------------------------------------------ */

function makeTree(seed, kind = 'oak') {
  const rng = makeRng(seed);
  const W = 26;
  const H = 34;
  const { canvas, ctx } = surface(W, H);
  const cx = 12;
  const baseY = H - 1;

  const leafSet =
    kind === 'pink' ? C.leafPink : kind === 'autumn' ? C.leafAutumn : C.leaf;

  trunk(ctx, cx - 2, 18, baseY, 4, C.wood, C.woodDark);
  // 树根
  px(ctx, cx - 3, baseY, C.woodDark);
  px(ctx, cx + 2, baseY, C.woodDark);

  if (kind === 'pine') {
    for (let layer = 0; layer < 3; layer++) {
      const ly = 20 - layer * 6;
      const half = 9 - layer * 2;
      for (let y = 0; y < 7; y++) {
        const w = Math.round((half * (y + 1)) / 7);
        for (let x = -w; x <= w; x++) {
          const col = pick(C.leafPine, rng.int(0, 3));
          px(ctx, cx + x, ly + y, x < -w + 1 || x > w - 1 ? C.outline : col);
        }
      }
      // 底边描边
      rect(ctx, cx - half, ly + 6, half * 2 + 1, 1, C.outline);
    }
    return { canvas, ax: cx, ay: baseY };
  }

  canopy(ctx, cx, 11, 11, leafSet, rng);
  canopy(ctx, cx - 7, 16, 6, leafSet, rng);
  canopy(ctx, cx + 7, 16, 6, leafSet, rng);

  if (kind === 'apple') {
    // 挂几颗苹果
    for (let i = 0; i < 5; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const rr = rng.range(3, 9);
      const ax = Math.round(cx + Math.cos(ang) * rr);
      const ay = Math.round(11 + Math.sin(ang) * rr * 0.9);
      px(ctx, ax, ay, C.outline);
      px(ctx, ax, ay + 1, C.red);
      px(ctx, ax + 1, ay, C.red);
      px(ctx, ax + 1, ay + 1, shade(C.red, -0.2));
      px(ctx, ax + 2, ay, C.outline);
    }
  }
  if (kind === 'cherry') {
    for (let i = 0; i < 8; i++) {
      px(ctx, Math.round(cx + rng.range(-10, 10)), Math.round(11 + rng.range(-9, 9)), C.leafPink[2]);
    }
  }
  return { canvas, ax: cx, ay: baseY };
}

/** 苹果树：带果/不带果两种形态，摘完苹果会切换 */
function makeAppleTreeEmpty(seed) {
  const t = makeTree(seed, 'oak');
  return t;
}

/* ------------------------------------------------------------------ */
/* 小物件                                                              */
/* ------------------------------------------------------------------ */

function makeBush(seed) {
  const rng = makeRng(seed);
  const W = 18;
  const H = 16;
  const { canvas, ctx } = surface(W, H);
  canopy(ctx, 8, 8, 7, C.leaf, rng);
  for (let i = 0; i < 5; i++) {
    px(ctx, rng.int(3, 14), rng.int(3, 12), rng.chance(0.5) ? C.red : C.leafPink[2]);
  }
  return { canvas, ax: 8, ay: H - 1 };
}

function makeRock(seed) {
  const rng = makeRng(seed);
  const W = 16;
  const H = 14;
  const { canvas, ctx } = surface(W, H);
  const pts = [
    [3, 13], [2, 9], [4, 5], [8, 3], [12, 5], [14, 9], [13, 13],
  ];
  ctx.fillStyle = C.stone[0];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();
  rect(ctx, 3, 13, 11, 1, C.stoneDark);
  speckle(ctx, 3, 4, 11, 9, [C.stone[1], C.stone[2], C.stoneDark], 26, rng);
  rect(ctx, 5, 5, 4, 1, C.stone[2]);
  return { canvas, ax: 8, ay: H - 1 };
}

function makeStump(seed) {
  const rng = makeRng(seed);
  const W = 18;
  const H = 14;
  const { canvas, ctx } = surface(W, H);
  // 树桩顶部年轮
  ctx.fillStyle = C.wood;
  ctx.beginPath();
  ctx.ellipse(9, 5, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.woodLight;
  ctx.beginPath();
  ctx.ellipse(9, 5, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.woodDark;
  ctx.beginPath();
  ctx.ellipse(9, 5, 2, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  // 桩身
  rect(ctx, 2, 5, 15, 8, C.wood);
  rect(ctx, 2, 5, 15, 1, C.woodDark);
  rect(ctx, 2, 12, 15, 1, C.woodDark);
  // 树根
  rect(ctx, 1, 11, 3, 2, C.woodDark);
  rect(ctx, 14, 11, 3, 2, C.woodDark);
  speckle(ctx, 3, 6, 13, 6, [C.woodDark, C.woodLight], 14, rng);
  return { canvas, ax: 9, ay: H - 1 };
}

function makeFence() {
  const W = 16;
  const H = 20;
  const { canvas, ctx } = surface(W, H);
  // 两根横杆 + 一根立柱，像素风的栅栏就这么简单
  rect(ctx, 0, 8, W, 3, C.woodLight);
  rect(ctx, 0, 14, W, 3, C.woodLight);
  rect(ctx, 0, 8, W, 1, C.wood);
  rect(ctx, 0, 14, W, 1, C.wood);
  rect(ctx, 0, 10, W, 1, C.woodDark);
  rect(ctx, 0, 16, W, 1, C.woodDark);
  rect(ctx, 5, 2, 4, 18, C.wood);
  rect(ctx, 5, 2, 1, 18, C.woodLight);
  rect(ctx, 8, 2, 1, 18, C.woodDark);
  rect(ctx, 5, 1, 4, 1, C.woodDark);
  return { canvas, ax: 8, ay: H - 1 };
}

function makeCrate(seed) {
  const rng = makeRng(seed);
  const W = 16;
  const H = 18;
  const { canvas, ctx } = surface(W, H);
  rect(ctx, 2, 4, 12, 13, C.woodLight);
  rect(ctx, 2, 4, 12, 1, C.wood);
  rect(ctx, 2, 16, 12, 1, C.woodDark);
  rect(ctx, 2, 4, 1, 13, C.wood);
  rect(ctx, 13, 4, 1, 13, C.woodDark);
  // 交叉加固条
  rect(ctx, 3, 9, 10, 2, C.wood);
  rect(ctx, 3, 12, 10, 1, C.woodDark);
  speckle(ctx, 3, 5, 10, 11, [C.wood, C.woodDark], 10, rng);
  return { canvas, ax: 8, ay: H - 1 };
}

function makeBarrel(seed) {
  const rng = makeRng(seed);
  const W = 14;
  const H = 18;
  const { canvas, ctx } = surface(W, H);
  rect(ctx, 3, 3, 8, 14, C.wood);
  rect(ctx, 2, 6, 10, 8, C.wood);
  rect(ctx, 3, 3, 1, 14, C.woodLight);
  rect(ctx, 10, 3, 1, 14, C.woodDark);
  rect(ctx, 2, 6, 10, 1, C.stoneDark);
  rect(ctx, 2, 13, 10, 1, C.stoneDark);
  rect(ctx, 3, 2, 8, 1, C.woodDark);
  speckle(ctx, 4, 4, 7, 12, [C.woodLight, C.woodDark], 10, rng);
  return { canvas, ax: 7, ay: H - 1 };
}

function makeSign(seed) {
  const W = 14;
  const H = 18;
  const { canvas, ctx } = surface(W, H);
  rect(ctx, 6, 8, 2, 10, C.wood);
  rect(ctx, 6, 8, 1, 10, C.woodLight);
  rect(ctx, 1, 3, 12, 7, C.plank);
  rect(ctx, 1, 3, 12, 1, C.woodDark);
  rect(ctx, 1, 9, 12, 1, C.woodDark);
  rect(ctx, 1, 3, 1, 7, C.woodDark);
  rect(ctx, 12, 3, 1, 7, C.woodDark);
  // 上面刻一个苹果图标
  px(ctx, 6, 5, C.red);
  px(ctx, 7, 5, C.red);
  px(ctx, 6, 6, C.red);
  px(ctx, 7, 6, shade(C.red, -0.2));
  px(ctx, 8, 4, C.green);
  void seed;
  return { canvas, ax: 7, ay: H - 1 };
}

/* ------------------------------------------------------------------ */
/* 建筑                                                                */
/* ------------------------------------------------------------------ */

const BUILDING_STYLES = {
  cabin:     { wall: C.plank,    wallDark: C.woodDark, roof: C.roof,      roofDark: C.roofDark, roofLight: C.roofLight },
  barn:      { wall: '#b5553a',  wallDark: '#7d3623',  roof: '#8f4126',    roofDark: '#5f2a17',  roofLight: '#c46f4d' },
  house:     { wall: C.woodLight, wallDark: C.wood,    roof: C.roofBlue,   roofDark: C.roofBlueD, roofLight: '#5f92c4' },
  shop:      { wall: '#d8c49a',  wallDark: '#a8906a',  roof: C.roofGreen,  roofDark: '#325a24',  roofLight: '#6ba053' },
  silo:      { wall: '#b8552e',  wallDark: '#7d3418',  roof: '#8a4123',    roofDark: '#5c2a13',  roofLight: '#d16d40' },
  greenhouse:{ wall: C.glass,    wallDark: C.glassDark, roof: '#d9eef7',   roofDark: '#8fc0d4',  roofLight: '#ffffff' },
  tent:      { wall: '#e0a83c',  wallDark: '#a87a22',  roof: '#f0c04a',    roofDark: '#b8892a',  roofLight: '#ffd873' },
};

/** 火车的车顶？不，是烟囱。 */
function chimney(ctx, x, y, w) {
  rect(ctx, x, y, w, 8, C.stone[1]);
  rect(ctx, x, y, w, 1, C.stone[0]);
  rect(ctx, x, y + 7, w, 1, C.stoneDark);
  rect(ctx, x - 1, y, w + 2, 2, C.stoneDark);
}

/**
 * 生成一栋房子。
 * @param {string} style  BUILDING_STYLES 的键
 * @param {number} wTiles 宽（格）
 * @param {number} hTiles 高（格）
 */
export function makeBuilding(style, wTiles, hTiles, seed = 1) {
  const rng = makeRng(seed);
  const S = BUILDING_STYLES[style] ?? BUILDING_STYLES.cabin;
  const W = wTiles * TILE;
  const H = hTiles * TILE;
  const pad = 6;                 // 屋顶要比墙宽一点，像素建筑才敦实
  const { canvas, ctx } = surface(W + pad * 2, H + 14);

  const ox = pad;
  const roofH = Math.max(10, Math.round(H * 0.42));
  const bodyY = 14 + roofH;

  if (style === 'tent') {
    // 帐篷：三角形
    const apex = 12;
    for (let y = 0; y < roofH + 22; y++) {
      const half = Math.round(((W + pad * 2) / 2) * (y / (roofH + 22)));
      for (let x = -half; x <= half; x++) {
        const col = x < 0 ? S.roof : S.roofDark;
        px(ctx, ox + W / 2 + x, 14 + y, col);
      }
    }
    rect(ctx, ox + W / 2 - 5, 14 + roofH + 4, 10, 20, S.wallDark);
    rect(ctx, ox + W / 2 - 4, 14 + roofH + 5, 8, 19, S.roof);
    rect(ctx, ox + W / 2 - 3, 14 + roofH + 14, 6, 10, '#6b4a1c');
    void apex;
    return { canvas, ox, oy: canvas.height - H };
  }

  if (style === 'greenhouse') {
    const top = 14;
    for (let y = 0; y <= 12; y++) {
      const half = Math.round((W / 2 + pad) * (y / 12));
      rect(ctx, ox + W / 2 - half, top - 12 + y, half * 2 + 1, 1, y < 3 ? S.roof : S.roofLight);
    }
    rect(ctx, ox, top, W, H, S.wall);
    // 玻璃格子
    for (let x = 0; x <= W; x += 8) rect(ctx, ox + x, top, 1, H, S.wallDark);
    for (let y = 0; y <= H; y += 8) rect(ctx, ox, top + y, W, 1, S.wallDark);
    rect(ctx, ox, top, W, 1, C.white);
    // 门
    rect(ctx, ox + W / 2 - 7, top + H - 22, 14, 22, S.wallDark);
    rect(ctx, ox + W / 2 - 6, top + H - 21, 12, 21, '#cfebf5');
    rect(ctx, ox + W / 2 - 1, top + H - 21, 1, 21, S.wallDark);
    return { canvas, ox, oy: canvas.height - H - 14 };
  }

  /* --- 一般木屋 --- */
  // 墙体
  rect(ctx, ox, bodyY, W, H - roofH, S.wall);
  for (let y = bodyY; y < bodyY + H - roofH; y += 4) rect(ctx, ox, y, W, 1, S.wallDark);
  rect(ctx, ox, bodyY, W, 1, shade(S.wall, 0.25));
  rect(ctx, ox, bodyY + H - roofH - 1, W, 1, S.wallDark);

  // 屋顶：一层层收窄，做出斜面
  for (let y = 0; y < roofH; y++) {
    const half = Math.round((W / 2 + pad) * (y / roofH));
    const yy = 14 + y;
    rect(ctx, ox + W / 2 - half, yy, half * 2 + 1, 1, y < roofH * 0.35 ? S.roofLight : S.roof);
  }
  rect(ctx, ox - pad, 14 + roofH - 2, W + pad * 2, 3, S.roofDark);
  // 屋脊高光
  rect(ctx, ox + W / 2 - 1, 13, 2, 2, S.roofLight);

  // 窗户
  const winW = 8;
  const winY = bodyY + 6;
  const winXs = [ox + 8, ox + W - 8 - winW];
  for (const wx of winXs) {
    if (wx < ox + 2 || wx + winW > ox + W - 2) continue;
    rect(ctx, wx - 1, winY - 1, winW + 2, winW + 2, S.wallDark);
    rect(ctx, wx, winY, winW, winW, '#8fc7de');
    rect(ctx, wx, winY, winW, 1, '#c4e6f2');
    rect(ctx, wx + 3, winY, 1, winW, S.wallDark);
    rect(ctx, wx, winY + 3, winW, 1, S.wallDark);
  }

  // 门
  const doorW = 10;
  const doorH = 16;
  const dx = ox + Math.round(W / 2 - doorW / 2);
  const dy = 14 + H - doorH;
  rect(ctx, dx - 1, dy - 1, doorW + 2, doorH + 1, S.wallDark);
  rect(ctx, dx, dy, doorW, doorH, shade(S.wallDark, -0.15));
  rect(ctx, dx + 1, dy + 1, doorW - 2, doorH - 2, '#5a3a1c');
  rect(ctx, dx + doorW - 4, dy + 8, 2, 2, C.gold);

  // 门前小台阶
  rect(ctx, dx - 3, 14 + H - 2, doorW + 6, 3, C.stone[1]);
  rect(ctx, dx - 3, 14 + H - 2, doorW + 6, 1, C.stone[2]);

  if (rng.chance(0.7)) chimney(ctx, ox + W - 12, 12, 6);

  return { canvas, ox, oy: canvas.height - H - 14 };
}

/* ------------------------------------------------------------------ */
/* 物件工厂（带缓存）                                                   */
/* ------------------------------------------------------------------ */

const propCache = new Map();

/**
 * 取一个物件的贴图。char 是地图字符，variant 用来区分「结果/不结果」等形态。
 * @returns {{canvas: HTMLCanvasElement, ax: number, ay: number}}
 */
export function getProp(char, seed, variant = '') {
  const key = `${char}|${seed}|${variant}`;
  const hit = propCache.get(key);
  if (hit) return hit;

  let prop;
  switch (char) {
    case 'T': prop = makeTree(seed, 'oak'); break;
    case 'P': prop = makeTree(seed, 'pine'); break;
    case 'A': prop = variant === 'empty' ? makeAppleTreeEmpty(seed) : makeTree(seed, 'apple'); break;
    case 'K': prop = makeTree(seed, 'cherry'); break;
    case 'B': prop = makeBush(seed); break;
    case 'R': prop = makeRock(seed); break;
    case 'S': prop = makeStump(seed); break;
    case 'F': prop = makeFence(); break;
    case 'x': prop = makeCrate(seed); break;
    case 'j': prop = makeBarrel(seed); break;
    case 's': prop = makeSign(seed); break;
    default: prop = makeBush(seed);
  }
  propCache.set(key, prop);
  return prop;
}

/** 发光的小调查点（探索玩法用），每帧现画，带呼吸动画 */
export function drawSparkle(ctx, x, y, t) {
  const k = (Math.sin(t * 3) + 1) / 2;         // 0~1
  const s = 1 + Math.round(k * 2);
  const col = k > 0.5 ? '#fff6c4' : C.gold;
  rect(ctx, x - s, y, s * 2 + 1, 1, col);
  rect(ctx, x, y - s, 1, s * 2 + 1, col);
  if (k > 0.65) {
    px(ctx, x - 1, y - 1, C.white);
    px(ctx, x + 1, y + 1, C.white);
    px(ctx, x - 1, y + 1, C.white);
    px(ctx, x + 1, y - 1, C.white);
  }
}

export { BUILDING_STYLES };
