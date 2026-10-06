/**
 * 小镇场景表（20 个）
 * ------------------------------------------------------------------
 * 拓扑是「双枢纽」结构，不会迷路：
 *
 *       老苹果园    谷仓牧场        集市 ── 木工坊
 *            \       /              |
 *   苔藓森林 —— 苹果农场 —— 小镇广场 —— 面包房/铁匠铺/图书馆/诊所/裁缝铺/学堂
 *     |    \
 *   矿洞  温泉 —— 天文台
 *     |
 *   河畔码头 —— 灯塔
 *        \
 *       湖畔画室
 *
 * 传送点只声明「在哪一侧、第几格、通向谁」，
 * 到达后的落点由目标场景里那条回程传送点自动推算 —— 不用手写坐标，也就不会对不上。
 *
 * 地图字符表（详见 art/tiles.js）：
 *   . 草   , 草丛  * 花   g 花草地  = 泥路  _ 耕地  o 石板  w 木地板
 *   ~ 浅水  # 深水
 *   T 橡树  P 松树  A 苹果树  K 樱花树  B 灌木  S 树桩  R 石头
 *   F 栅栏  x 木箱  j 木桶  s 木牌
 */
import {
  blank, stamp, rect, frame, hline, vline, scatter, grid, carveGate, set, get,
} from './mapgen.js';
import { isSolid } from '../art/tiles.js';
import { getCharacter } from './characters.js';

/* ================================================================== */
/* 四个手工精修场景                                                     */
/* ================================================================== */

/** 苹果农场：主玩法发生地，苹果树最多 */
function buildAppleFarm(g, rng) {
  // 主路：一条横穿东西，一条从北通到南
  hline(g, 1, 9, 24, '=');
  vline(g, 13, 1, 16, '=');

  // 果园：4 列 3 行的苹果树阵
  grid(g, 5, 3, 4, 3, 2, 2, 'A');
  // 果园外圈小栅栏
  vline(g, 4, 3, 6, 'F');
  hline(g, 4, 8, 9, 'F');

  // 东侧一小片樱花树，参考图里的粉树
  stamp(g, 18, 2, [
    '.K..K.',
    '......',
    '..K...',
  ]);

  // 池塘
  rect(g, 17, 12, 5, 4, '~');
  rect(g, 18, 13, 3, 2, '#');

  // 散落的装饰
  scatter(g, ',', 26, rng, ['.', 'g']);
  scatter(g, '*', 18, rng, ['.', 'g']);
  scatter(g, 'B', 6, rng, ['.', 'g']);
  scatter(g, 'S', 4, rng, ['.', 'g']);
  scatter(g, 'R', 3, rng, ['.', 'g']);

  // 营地：帐篷 + 木箱木桶
  set(g, 3, 14, 'x');
  set(g, 4, 15, 'j');
  set(g, 8, 15, 'x');
  set(g, 6, 11, 'j');
}

/** 小镇广场：交通枢纽，商店门面一圈 */
function buildTownSquare(g, rng) {
  // 石板广场
  rect(g, 8, 5, 10, 8, 'o');
  frame(g, 7, 4, 12, 10, '=');

  // 中央喷泉
  rect(g, 11, 7, 4, 3, '~');
  set(g, 11, 7, 'o'); set(g, 14, 7, 'o');
  set(g, 11, 9, 'o'); set(g, 14, 9, 'o');

  // 通往西/东大门的横路
  hline(g, 1, 9, 6, '=');
  hline(g, 18, 9, 7, '=');

  // 三条往北去店铺的小巷、三条往南去铺子的小巷
  for (const x of [5, 13, 21]) {
    vline(g, x, 1, 3, '=');
    vline(g, x, 12, 5, '=');
  }

  // 花坛点缀
  stamp(g, 9, 5, ['*.*.*', '.....', '*.*.*']);

  scatter(g, ',', 14, rng, ['.']);
  scatter(g, '*', 10, rng, ['.']);

  // 集市摊位的杂物
  set(g, 17, 6, 'x'); set(g, 17, 7, 'j');
  set(g, 5, 13, 'x'); set(g, 6, 13, 'j');
  set(g, 10, 14, 'j');

  // 苹果收购站在 (13,13)，旁边放一个桶
  set(g, 12, 13, 'j');
}

/** 苔藓森林：树多、路窄，通向矿洞与温泉 */
function buildMossyForest(g, rng) {
  // 主路：横贯东西（一直铺到东边出口），再往南通到码头
  hline(g, 1, 8, 24, '=');
  vline(g, 12, 8, 9, '=');
  // 北侧岔路去矿洞
  vline(g, 13, 1, 8, '=');

  // 大片树林（避开路径，用 from 白名单只覆盖草地）
  scatter(g, 'T', 48, rng, ['.']);
  scatter(g, 'P', 28, rng, ['.']);
  scatter(g, 'B', 18, rng, ['.']);
  scatter(g, 'S', 8, rng, ['.']);
  scatter(g, 'R', 10, rng, ['.']);
  scatter(g, ',', 20, rng, ['.']);

  // 林间空地：一圈石头围着树桩
  stamp(g, 5, 3, [
    'R.R.R',
    '..S..',
    'R.R.R',
  ]);
}

/** 河畔码头：一条横贯的河，木栈桥伸进去 */
function buildRiversideDock(g, rng) {
  // 河面
  rect(g, 0, 3, 26, 4, '~');
  rect(g, 2, 4, 22, 2, '#');
  // 栈桥：从河心一直铺到南岸的小路上
  rect(g, 12, 3, 3, 8, 'w');
  rect(g, 11, 4, 5, 1, 'w');

  // 岸边小路
  hline(g, 1, 11, 24, '=');
  vline(g, 13, 11, 5, '=');

  // 装饰：芦苇用草丛表示
  scatter(g, ',', 30, rng, ['.']);
  scatter(g, '*', 14, rng, ['.']);
  scatter(g, 'B', 8, rng, ['.']);
  scatter(g, 'R', 5, rng, ['.']);
  scatter(g, 'A', 4, rng, ['.']);

  // 渔具
  set(g, 16, 10, 'j'); set(g, 17, 10, 'x');
  set(g, 8, 10, 'j');
  set(g, 20, 9, 'S');
}

/* ================================================================== */
/* 两套模板：16 个场景按模板生成，但每个场景的底料/装饰/建筑都不同       */
/* ================================================================== */

/**
 * 室外模板
 * @param {{fill:string,border:string,size:[number,number],groves?:Array,pond?:boolean,decor?:string[],density?:number}} o
 */
function outdoorTemplate(o) {
  return (g, rng) => {
    const [w, h] = o.size;
    // 主干路：东西 + 南北各一条
    hline(g, 1, Math.floor(h / 2), w - 2, '=');
    vline(g, Math.floor(w / 2), 1, h - 2, '=');

    if (o.pond) {
      const px = Math.floor(w / 2) + 4;
      const py = Math.floor(h / 2) + 3;
      rect(g, px, py, 4, 3, '~');
      rect(g, px + 1, py + 1, 2, 1, '#');
    }
    // 果园 / 树阵
    for (const gr of o.groves ?? []) {
      grid(g, gr.x, gr.y, gr.cols, gr.rows, gr.stepX ?? 2, gr.stepY ?? 2, gr.char);
    }
    const d = o.density ?? 1;
    scatter(g, ',', Math.round(24 * d), rng, ['.']);
    scatter(g, '*', Math.round(16 * d), rng, ['.']);
    for (const dec of o.decor ?? ['B', 'S', 'R']) {
      scatter(g, dec, Math.round(7 * d), rng, ['.']);
    }
  };
}

/**
 * 室内模板：木地板 + 一圈墙，南边一个门。
 * 家具用「柜台 + 货架 + 桶」拼，每个场景换一套字符就是完全不同的房间。
 */
function interiorTemplate(o) {
  return (g, rng) => {
    const [w, h] = o.size;
    // 地板铺装：中间铺一小块地毯/石板，不要铺满，否则整个房间只剩木头边框
    if (o.rug) rect(g, 6, 4, w - 12, h - 8, o.rug);
    // 靠墙的柜台
    hline(g, 2, 2, w - 4, 'x');
    // 两侧货架
    vline(g, 1, 4, h - 6, o.shelf ?? 'j');
    vline(g, w - 2, 4, h - 6, o.shelf ?? 'j');
    // 中间几件家具
    for (const it of o.center ?? []) {
      set(g, it[0], it[1], it[2]);
    }
    // 地毯 / 石板点缀
    if (o.accent) rect(g, Math.floor(w / 2) - 1, h - 5, 3, 2, o.accent);
    scatter(g, ',', 3, rng, ['w']);
  };
}

/* ================================================================== */
/* 场景定义                                                            */
/* ================================================================== */

/** 统一尺寸，室内小、室外大 */
const OUT = [26, 18];
const OUT_S = [22, 16];
const IN = [18, 12];

export const SCENES = {
  /* ---------- 双枢纽 ---------- */
  apple_farm: {
    id: 'apple_farm',
    name: '苹果农场',
    en: 'Apple Farm',
    resident: 'li',
    size: OUT,
    fill: 'g',
    border: 'T',
    spawn: { x: 13, y: 11 },
    portals: [
      { to: 'town_square', side: 'east', at: 9, label: '小镇广场' },
      { to: 'mossy_forest', side: 'south', at: 13, label: '苔藓森林' },
      { to: 'old_orchard', side: 'north', at: 13, label: '老苹果园' },
      { to: 'barn_yard', side: 'west', at: 9, label: '谷仓牧场' },
    ],
    buildings: [
      { style: 'cabin', x: 2, y: 2, w: 4, h: 3 },
      { style: 'tent', x: 4, y: 12, w: 3, h: 3 },
    ],
    build: buildAppleFarm,
    sparkles: [
      { x: 5, y: 16, text: '营地边翻出一把旧木勺，柄上刻着「阿栗」两个字。' },
      { x: 21, y: 5, text: '樱花树下埋着一个小小的铁盒，里面是一枚生锈的铜扣。' },
    ],
  },

  town_square: {
    id: 'town_square',
    name: '小镇广场',
    en: 'Town Square',
    resident: 'orin',
    size: OUT,
    fill: '.',
    border: 'T',
    spawn: { x: 12, y: 13 },
    portals: [
      { to: 'apple_farm', side: 'west', at: 9, label: '苹果农场' },
      { to: 'market_stalls', side: 'east', at: 9, label: '集市摊位' },
      { to: 'bakery', side: 'north', at: 5, label: '麦香面包房' },
      { to: 'blacksmith', side: 'north', at: 13, label: '铁心铁匠铺' },
      { to: 'library', side: 'north', at: 21, label: '小镇图书馆' },
      { to: 'clinic', side: 'south', at: 5, label: '白芷诊所' },
      { to: 'tailor_shop', side: 'south', at: 13, label: '针线裁缝铺' },
      { to: 'schoolhouse', side: 'south', at: 21, label: '小镇学堂' },
    ],
    buildings: [
      { style: 'shop', x: 1, y: 2, w: 5, h: 3 },
      { style: 'cabin', x: 8, y: 2, w: 4, h: 3 },
      { style: 'house', x: 16, y: 2, w: 5, h: 3 },
    ],
    build: buildTownSquare,
    /** 广场上可以卖苹果换金币 */
    stations: [{ kind: 'sell', x: 13, y: 13, label: '苹果收购站' }],
    sparkles: [
      { x: 3, y: 15, text: '石板缝里卡着一枚旧铜币，年份已经磨平了。' },
    ],
  },

  /* ---------- 苹果农场周边 ---------- */
  mossy_forest: {
    id: 'mossy_forest',
    name: '苔藓森林',
    en: 'Mossy Forest',
    resident: 'moss',
    size: OUT,
    fill: '.',
    border: 'P',
    spawn: { x: 12, y: 9 },
    portals: [
      { to: 'apple_farm', side: 'east', at: 8, label: '苹果农场' },
      { to: 'riverside_dock', side: 'south', at: 12, label: '河畔码头' },
      { to: 'old_mine', side: 'north', at: 13, label: '后山矿洞' },
      { to: 'hot_spring', side: 'west', at: 8, label: '山间温泉' },
    ],
    buildings: [],
    build: buildMossyForest,
    sparkles: [
      { x: 8, y: 5, text: '一棵倒下的老树桩上，苔藓长得像一张地图。' },
      { x: 21, y: 14, text: '灌木后面藏着一只褪色的布鞋，鞋带系得很仔细。' },
    ],
  },

  riverside_dock: {
    id: 'riverside_dock',
    name: '河畔码头',
    en: 'Riverside Dock',
    resident: 'lang',
    size: OUT,
    fill: '.',
    border: 'T',
    spawn: { x: 13, y: 12 },
    portals: [
      { to: 'mossy_forest', side: 'north', at: 13, label: '苔藓森林' },
      { to: 'lighthouse', side: 'east', at: 11, label: '海角灯塔' },
      { to: 'lake_hut', side: 'west', at: 11, label: '湖畔画室' },
    ],
    buildings: [{ style: 'cabin', x: 19, y: 11, w: 4, h: 3 }],
    build: buildRiversideDock,
    sparkles: [
      { x: 3, y: 14, text: '芦苇丛里漂着一只木塞，上面刻着「阿满二号」。' },
      { x: 22, y: 13, text: '岸边有一串很深的脚印，比人的脚大得多。' },
    ],
  },

  /* ---------- 广场北侧一排铺子（室内） ---------- */
  bakery: {
    id: 'bakery',
    name: '麦香面包房',
    en: 'Bakery',
    resident: 'malt',
    size: IN,
    fill: 'w',
    border: 'h',
    spawn: { x: 9, y: 9 },
    portals: [{ to: 'town_square', side: 'south', at: 9, label: '小镇广场' }],
    buildings: [],
    build: interiorTemplate({ size: IN, rug: 'o', shelf: 'j', center: [[5, 5, 'x'], [6, 6, 'j'], [12, 6, 'x'], [11, 5, 'j']] }),
    sparkles: [{ x: 3, y: 8, text: '柜台下面压着一张没写完的配方，最后一行只有两个字：「最后」。' }],
  },
  blacksmith: {
    id: 'blacksmith',
    name: '铁心铁匠铺',
    en: 'Blacksmith',
    resident: 'flint',
    size: IN,
    fill: 'o',
    border: 'h',
    spawn: { x: 9, y: 9 },
    portals: [{ to: 'town_square', side: 'south', at: 9, label: '小镇广场' }],
    buildings: [],
    build: interiorTemplate({ size: IN, shelf: 'x', center: [[6, 5, 'j'], [7, 5, 'j'], [12, 7, 'x'], [5, 7, 'x']], accent: 'w' }),
    sparkles: [{ x: 14, y: 8, text: '墙角堆着半成品的小锄头，只差最后一道淬火。' }],
  },
  library: {
    id: 'library',
    name: '小镇图书馆',
    en: 'Library',
    resident: 'kite',
    size: IN,
    fill: 'w',
    border: 'h',
    spawn: { x: 9, y: 9 },
    portals: [{ to: 'town_square', side: 'south', at: 9, label: '小镇广场' }],
    buildings: [],
    build: interiorTemplate({ size: IN, shelf: 'x', center: [[4, 6, 'x'], [5, 6, 'x'], [13, 6, 'x'], [12, 5, 'x']], accent: 'o' }),
    sparkles: [{ x: 15, y: 4, text: '最里面的架子上有一本手抄册子，扉页写着「苹果小镇农事笔记 第三卷」。' }],
  },
  clinic: {
    id: 'clinic',
    name: '白芷诊所',
    en: 'Clinic',
    resident: 'angelica',
    size: IN,
    fill: 'w',
    border: 'h',
    spawn: { x: 9, y: 9 },
    portals: [{ to: 'town_square', side: 'south', at: 9, label: '小镇广场' }],
    buildings: [],
    build: interiorTemplate({ size: IN, shelf: 'j', center: [[6, 5, 'x'], [12, 5, 'x'], [12, 7, 'j']], accent: 'o' }),
    sparkles: [{ x: 3, y: 5, text: '一本厚病历摊在桌上，最后一页是空白的。' }],
  },
  tailor_shop: {
    id: 'tailor_shop',
    name: '针线裁缝铺',
    en: 'Tailor',
    resident: 'stitch',
    size: IN,
    fill: 'w',
    border: 'h',
    spawn: { x: 9, y: 9 },
    portals: [{ to: 'town_square', side: 'south', at: 9, label: '小镇广场' }],
    buildings: [],
    build: interiorTemplate({ size: IN, rug: 'o', shelf: 'j', center: [[5, 6, 'x'], [13, 6, 'x'], [9, 5, 'x']] }),
    sparkles: [{ x: 14, y: 4, text: '衣架最里侧挂着一件没有钉扣子的外套，尺码很小。' }],
  },
  schoolhouse: {
    id: 'schoolhouse',
    name: '小镇学堂',
    en: 'Schoolhouse',
    resident: 'chalk',
    size: [20, 12],
    fill: 'w',
    border: 'h',
    spawn: { x: 10, y: 9 },
    portals: [{ to: 'town_square', side: 'south', at: 10, label: '小镇广场' }],
    buildings: [],
    build: interiorTemplate({ size: [20, 12], shelf: 'x', center: [[5, 6, 'x'], [6, 6, 'x'], [13, 6, 'x'], [14, 6, 'x']], accent: 'o' }),
    sparkles: [{ x: 2, y: 4, text: '黑板上留着半行字：「为什么秋天的苹果最甜——」。' }],
  },

  /* ---------- 广场东侧 ---------- */
  market_stalls: {
    id: 'market_stalls',
    name: '集市摊位',
    en: 'Market',
    resident: 'full',
    size: OUT_S,
    fill: 'o',
    border: 'T',
    spawn: { x: 11, y: 10 },
    portals: [
      { to: 'town_square', side: 'west', at: 8, label: '小镇广场' },
      { to: 'carpentry', side: 'north', at: 11, label: '木工坊' },
    ],
    buildings: [{ style: 'shop', x: 2, y: 2, w: 5, h: 3 }],
    build: outdoorTemplate({
      size: OUT_S,
      fill: 'o',
      pond: false,
      density: 0.7,
      decor: ['x', 'j', 'j', 'B'],
      groves: [{ x: 4, y: 10, cols: 3, rows: 2, char: 'x', stepX: 3, stepY: 2 }],
    }),
    sparkles: [{ x: 17, y: 13, text: '摊子底下滚出来一枚铜板，边缘被磨得发亮。' }],
  },
  carpentry: {
    id: 'carpentry',
    name: '木工坊',
    en: 'Carpentry',
    resident: 'woody',
    size: IN,
    fill: 'w',
    border: 'h',
    spawn: { x: 9, y: 9 },
    portals: [{ to: 'market_stalls', side: 'south', at: 9, label: '集市摊位' }],
    buildings: [],
    build: interiorTemplate({ size: IN, shelf: 'x', center: [[5, 5, 'j'], [12, 5, 'j'], [6, 7, 'x'], [12, 7, 'x']] }),
    sparkles: [{ x: 4, y: 8, text: '工作台上一把刨子，木柄被手磨得发亮，包浆很厚。' }],
  },

  /* ---------- 苹果农场周边（续） ---------- */
  old_orchard: {
    id: 'old_orchard',
    name: '老苹果园',
    en: 'Old Orchard',
    resident: 'elder',
    size: OUT,
    fill: '.',
    border: 'T',
    spawn: { x: 13, y: 15 },
    portals: [
      { to: 'apple_farm', side: 'south', at: 13, label: '苹果农场' },
      { to: 'greenhouse', side: 'east', at: 9, label: '玻璃温室' },
    ],
    buildings: [{ style: 'cabin', x: 2, y: 2, w: 4, h: 3 }],
    build: outdoorTemplate({
      size: OUT,
      fill: '.',
      pond: true,
      decor: ['S', 'B', 'R', 'S'],
      groves: [
        { x: 4, y: 6, cols: 5, rows: 4, char: 'A', stepX: 2, stepY: 2 },
        { x: 17, y: 3, cols: 3, rows: 3, char: 'K', stepX: 2, stepY: 2 },
      ],
    }),
    sparkles: [{ x: 6, y: 3, text: '最老的那棵树，树皮上刻着两行歪歪扭扭的小字，看不全了。' }],
  },
  greenhouse: {
    id: 'greenhouse',
    name: '玻璃温室',
    en: 'Greenhouse',
    resident: 'bell',
    size: OUT_S,
    fill: '.',
    border: 'T',
    spawn: { x: 11, y: 12 },
    portals: [
      { to: 'old_orchard', side: 'west', at: 8, label: '老苹果园' },
      { to: 'barn_yard', side: 'south', at: 11, label: '谷仓牧场' },
    ],
    buildings: [{ style: 'greenhouse', x: 6, y: 2, w: 6, h: 4 }],
    build: outdoorTemplate({
      size: OUT_S,
      fill: '.',
      density: 1.4,
      pond: true,
      decor: ['B', '*', 'B'],
      groves: [{ x: 3, y: 4, cols: 3, rows: 3, char: 'B', stepX: 2, stepY: 3 }],
    }),
    sparkles: [{ x: 17, y: 5, text: '花盆里插着一张小木牌，上面的名字被雨洗掉了一半。' }],
  },
  barn_yard: {
    id: 'barn_yard',
    name: '谷仓牧场',
    en: 'Barn Yard',
    resident: 'hay',
    size: OUT,
    fill: '.',
    border: 'F',
    spawn: { x: 12, y: 10 },
    portals: [
      { to: 'apple_farm', side: 'east', at: 9, label: '苹果农场' },
      { to: 'greenhouse', side: 'north', at: 12, label: '玻璃温室' },
    ],
    buildings: [{ style: 'barn', x: 3, y: 3, w: 6, h: 4 }],
    build: outdoorTemplate({
      size: OUT,
      fill: '.',
      pond: true,
      decor: ['S', 'B', 'R'],
      groves: [{ x: 16, y: 4, cols: 1, rows: 5, char: 'F', stepX: 1, stepY: 2 }],
    }),
    sparkles: [
      { x: 11, y: 14, text: '草堆里滚出三个鸡蛋，还热着。' },
      { x: 20, y: 12, text: '一段旧篱笆上挂着个小铁牌，刻着「阿满二号」。' },
    ],
  },
  lighthouse: {
    id: 'lighthouse',
    name: '海角灯塔',
    en: 'Lighthouse',
    resident: 'beacon',
    size: OUT_S,
    fill: '.',
    border: 'T',
    spawn: { x: 9, y: 12 },
    portals: [{ to: 'riverside_dock', side: 'west', at: 11, label: '河畔码头' }],
    buildings: [{ style: 'silo', x: 8, y: 2, w: 3, h: 5 }],
    build: outdoorTemplate({
      size: OUT_S,
      fill: '.',
      density: 0.7,
      decor: ['R', 'R', 'B'],
      groves: [{ x: 3, y: 4, cols: 2, rows: 4, char: 'P', stepX: 2, stepY: 2 }],
    }),
    sparkles: [{ x: 18, y: 6, text: '悬崖边有一本被海风吹散页的航海日志，最后一页只写了「灯亮着」。' }],
  },

  /* ---------- 森林周边 ---------- */
  old_mine: {
    id: 'old_mine',
    name: '后山矿洞',
    en: 'Old Mine',
    resident: 'stone',
    size: OUT_S,
    fill: 'o',
    border: 'R',
    spawn: { x: 11, y: 13 },
    portals: [{ to: 'mossy_forest', side: 'south', at: 11, label: '苔藓森林' }],
    buildings: [{ style: 'cabin', x: 2, y: 2, w: 4, h: 3 }],
    build: outdoorTemplate({
      size: OUT_S,
      fill: 'o',
      density: 0.8,
      decor: ['R', 'R', 'S'],
      groves: [{ x: 5, y: 5, cols: 4, rows: 3, char: 'R', stepX: 3, stepY: 3 }],
    }),
    sparkles: [{ x: 17, y: 4, text: '岩壁上有一行用炭画的记号，数到第七道就断了。' }],
  },
  hot_spring: {
    id: 'hot_spring',
    name: '山间温泉',
    en: 'Hot Spring',
    resident: 'bath',
    size: OUT_S,
    fill: '.',
    border: 'P',
    spawn: { x: 11, y: 12 },
    portals: [
      { to: 'mossy_forest', side: 'east', at: 8, label: '苔藓森林' },
      { to: 'observatory', side: 'north', at: 11, label: '山顶天文台' },
    ],
    buildings: [{ style: 'cabin', x: 3, y: 3, w: 5, h: 3 }],
    build: (g, rng) => {
      hline(g, 1, 8, 20, '=');
      vline(g, 11, 1, 15, '=');
      // 汤池
      rect(g, 13, 9, 6, 4, '~');
      rect(g, 14, 10, 4, 2, '#');
      frame(g, 12, 8, 8, 6, 'o');
      scatter(g, 'R', 12, rng, ['.']);
      scatter(g, 'B', 8, rng, ['.']);
      scatter(g, 'P', 10, rng, ['.']);
      scatter(g, ',', 14, rng, ['.']);
    },
    sparkles: [{ x: 5, y: 12, text: '池边木桶上放着一块搓澡巾，叠得整整齐齐。' }],
  },
  observatory: {
    id: 'observatory',
    name: '山顶天文台',
    en: 'Observatory',
    resident: 'nova',
    size: OUT_S,
    fill: 'o',
    border: 'P',
    spawn: { x: 11, y: 13 },
    portals: [{ to: 'hot_spring', side: 'south', at: 11, label: '山间温泉' }],
    buildings: [{ style: 'silo', x: 8, y: 2, w: 4, h: 4 }],
    build: outdoorTemplate({
      size: OUT_S,
      fill: 'o',
      density: 0.5,
      decor: ['R', 'S'],
      groves: [{ x: 4, y: 5, cols: 2, rows: 4, char: 'P', stepX: 3, stepY: 2 }],
    }),
    sparkles: [{ x: 17, y: 10, text: '石台上摊着一张星图，有一颗星被反复圈了十几次。' }],
  },
  lake_hut: {
    id: 'lake_hut',
    name: '湖畔画室',
    en: 'Lake Hut',
    resident: 'pigment',
    size: IN,
    fill: 'w',
    border: 'h',
    spawn: { x: 9, y: 9 },
    portals: [{ to: 'riverside_dock', side: 'north', at: 9, label: '河畔码头' }],
    buildings: [],
    build: interiorTemplate({ size: IN, shelf: 'x', center: [[5, 6, 'x'], [6, 5, 'x'], [12, 6, 'x'], [13, 5, 'x']], accent: 'o' }),
    sparkles: [{ x: 2, y: 5, text: '三百多张画靠在墙上，全部朝向里面——没有一张是正面朝外的。' }],
  },
};

/* ================================================================== */

export const SCENE_LIST = Object.values(SCENES);
export const SCENE_IDS = Object.keys(SCENES);

export function getScene(id) {
  const s = SCENES[id];
  if (!s) throw new Error(`没有这个场景：${id}`);
  return s;
}

/** 找一条「从 fromId 回到 toId」的传送点，用来算到达后的落点 */
export function findPortal(sceneId, targetId) {
  const s = getScene(sceneId);
  return (s.portals ?? []).find((p) => p.to === targetId) ?? null;
}

/**
 * 把场景数据实例化成一张可玩的地图。
 * 每次进入场景都重跑一遍（纯计算，几毫秒；烘焙好的地面会缓存）。
 */
export function instantiateScene(id, rngSeed = 0) {
  const scene = getScene(id);
  const [w, h] = scene.size;
  const cells = blank(w, h, scene.fill ?? '.', scene.border ?? null);

  // 用固定种子跑内容，同一个场景每次进来布局都一样
  scene.build?.(cells, makeSceneRng(id, rngSeed));

  // 传送缺口最后挖，免得被后面的随机装饰堵上
  const gates = [];
  for (const p of scene.portals ?? []) {
    const inner = carveGate(cells, p.side, p.at, '=');
    gates.push({ ...p, x: inner.x, y: inner.y });
  }

  // 保留区：出生点、居民站位、调查点周边必须能站人、能走到
  const floor = scene.fill === 'w' || scene.fill === 'o' ? scene.fill : '.';
  keepClear(cells, scene.spawn.x, scene.spawn.y, floor);
  for (const p of scene.portals ?? []) {
    const inner = gates.find((gg) => gg.to === p.to && gg.side === p.side);
    if (inner) keepClear(cells, inner.x, inner.y, '=');
  }
  const resident = scene.resident ? getCharacter(scene.resident) : null;
  if (resident) keepClear(cells, resident.pos.x, resident.pos.y, floor);
  for (const sp of scene.sparkles ?? []) keepClear(cells, sp.x, sp.y, floor);
  for (const st of scene.stations ?? []) keepClear(cells, st.x, st.y, floor);

  return { scene, cells, gates, resident };
}

/** 把一格改成能走的，并在被围死时拆掉一个邻居 */
export function keepClear(cells, x, y, floor = '.') {
  const h = cells.length;
  const w = cells[0].length;
  const put = (px, py, ch) => {
    if (py < 0 || py >= h || px < 0 || px >= w) return;
    cells[py][px] = ch;
  };
  if (isSolid(get(cells, x, y))) put(x, y, floor);

  // 四邻里如果全是障碍，就挑一个「最开阔」的拆开，防止居民被关在树丛里
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const open = dirs.filter(([dx, dy]) => !isSolid(get(cells, x + dx, y + dy)));
  if (open.length) return;
  let best = null;
  let bestScore = -1;
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    let score = 0;
    for (const [ax, ay] of dirs) {
      if (!isSolid(get(cells, nx + ax, ny + ay))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = [nx, ny];
    }
  }
  if (best) put(best[0], best[1], floor);
}

/** 场景内容用「场景 id」当种子，刷新页面布局不变，但也各不相同 */
function makeSceneRng(id, extraSeed = 0) {
  let h = 2166136261 >>> 0;
  const s = id + '|' + extraSeed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 直接内联一个 mulberry32，避免为了一个种子多绕一圈依赖
  let a = h >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    range: (min, max) => min + next() * (max - min),
  };
}
