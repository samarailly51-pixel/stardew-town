/**
 * 角色精灵
 * ------------------------------------------------------------------
 * 每位居民都由几个颜色参数（发色/上衣/裤子/肤色/发型）程序化画出来：
 *   4 个朝向 × 3 帧（站立 + 左脚 + 右脚）= 12 张小图。
 *
 * 关键设计：**角色贴图在角色进入场景时才生成**（懒加载）。
 * 20 个居民如果一开局全画一遍也没多少开销，但「按需生成」正好和
 * 「按场景唤醒 Agent」是同一个思路，日志里能直接看到省下来的量。
 */
import { C, shade } from './palette.js';
import { surface, px, rect } from './pixel.js';

const W = 16;
const H = 24;
const FEET = H - 1;      // 脚底所在的 y
const AX = 8;            // 锚点（底边中点）

/** 一帧的姿势参数：哪只脚在前、身体有没有上下浮动 */
const FRAMES = [
  { legL: 0, legR: 0, bob: 0, armL: 0, armR: 0 }, // 站立
  { legL: -1, legR: 1, bob: -1, armL: 1, armR: -1 }, // 左脚前
  { legL: 1, legR: -1, bob: 0, armL: -1, armR: 1 }, // 右脚前
];

function drawBody(ctx, dir, frame, pal) {
  const f = FRAMES[frame] ?? FRAMES[0];
  const { hair, shirt, pants, skin } = pal;
  const hairDark = shade(hair, -0.25);
  const shirtDark = shade(shirt, -0.22);
  const pantsDark = shade(pants, -0.25);

  const top = 3 + f.bob;
  const headY = top;
  const bodyY = headY + 9;
  const legY = bodyY + 6;

  // ---- 影子（在脚下画一小块深色，让角色不「飘」） ----
  rect(ctx, AX - 4, FEET - 1, 8, 2, '#00000030');

  // ---- 腿 ----
  const lx = AX - 3;
  const rx = AX + 0;
  rect(ctx, lx + f.legL, legY, 3, FEET - legY, pants);
  rect(ctx, rx + f.legR, legY, 3, FEET - legY, pants);
  rect(ctx, lx + f.legL, legY, 1, FEET - legY, shade(pants, 0.15));
  rect(ctx, rx + f.legR, legY, 1, FEET - legY, shade(pants, 0.15));
  // 鞋
  rect(ctx, lx + f.legL, FEET - 1, 3, 1, pantsDark);
  rect(ctx, rx + f.legR, FEET - 1, 3, 1, pantsDark);

  // ---- 躯干 ----
  rect(ctx, AX - 4, bodyY, 8, 7, shirt);
  rect(ctx, AX - 4, bodyY, 1, 7, shade(shirt, 0.18));
  rect(ctx, AX + 3, bodyY, 1, 7, shirtDark);
  rect(ctx, AX - 4, bodyY + 6, 8, 1, shirtDark);

  // ---- 胳膊 ----
  rect(ctx, AX - 6, bodyY + f.armL, 2, 5, shirt);
  rect(ctx, AX + 4, bodyY + f.armR, 2, 5, shirt);
  rect(ctx, AX - 6, bodyY + f.armL + 4, 2, 2, skin);
  rect(ctx, AX + 4, bodyY + f.armR + 4, 2, 2, skin);

  // ---- 头 ----
  rect(ctx, AX - 5, headY, 10, 9, skin);
  rect(ctx, AX - 5, headY, 10, 1, shade(skin, -0.25));   // 下巴阴影
  rect(ctx, AX - 5, headY + 8, 10, 1, shade(skin, -0.2));
  rect(ctx, AX - 5, headY, 1, 9, shade(skin, -0.12));
  rect(ctx, AX + 4, headY, 1, 9, shade(skin, -0.12));

  // ---- 头发 ----
  rect(ctx, AX - 5, headY - 2, 10, 4, hair);
  rect(ctx, AX - 5, headY - 2, 10, 1, shade(hair, 0.2));
  rect(ctx, AX - 5, headY - 2, 1, 7, hair);
  rect(ctx, AX + 4, headY - 2, 1, 7, hair);
  rect(ctx, AX - 5, headY + 3, 10, 1, hairDark);

  switch (pal.hairStyle) {
    case 'long':
      rect(ctx, AX - 5, headY, 1, 8, hair);
      rect(ctx, AX + 4, headY, 1, 8, hair);
      break;
    case 'ponytail':
      if (dir === 'down' || dir === 'up') rect(ctx, AX + 4, headY + 1, 2, 6, hair);
      else rect(ctx, AX - 6, headY + 1, 2, 6, hair);
      break;
    case 'hat':
      rect(ctx, AX - 6, headY - 4, 12, 3, hair);
      rect(ctx, AX - 4, headY - 1, 8, 1, shade(hair, -0.3));
      rect(ctx, AX - 6, headY - 4, 12, 1, shade(hair, 0.25));
      break;
    default:
      break; // 短发
  }

  // ---- 五官 ----
  const eyeY = headY + 5;
  if (dir === 'down') {
    px(ctx, AX - 3, eyeY, C.outline);
    px(ctx, AX + 2, eyeY, C.outline);
    px(ctx, AX - 1, eyeY + 2, shade(skin, -0.3));
    if (pal.blush) {
      px(ctx, AX - 4, eyeY + 2, pal.blush);
      px(ctx, AX + 3, eyeY + 2, pal.blush);
    }
  } else if (dir === 'left') {
    px(ctx, AX - 3, eyeY, C.outline);
    px(ctx, AX - 6, eyeY + 1, shade(skin, -0.15));   // 侧面鼻尖
  } else if (dir === 'right') {
    px(ctx, AX + 2, eyeY, C.outline);
    px(ctx, AX + 5, eyeY + 1, shade(skin, -0.15));
  }
  // up：后脑勺，不画五官
}

/**
 * 生成一位居民的全部朝向帧。
 * @param {{hair:string, shirt:string, pants:string, skin:string, hairStyle?:string, blush?:string}} pal
 * @returns {{down:HTMLCanvasElement[], up:HTMLCanvasElement[], left:HTMLCanvasElement[], right:HTMLCanvasElement[]}}
 */
export function makeCharacterSprites(pal) {
  const full = {
    hair: pal.hair ?? C.hair[0],
    shirt: pal.shirt ?? C.red,
    pants: pal.pants ?? '#3f4f6b',
    skin: pal.skin ?? C.skin[0],
    hairStyle: pal.hairStyle ?? 'short',
    blush: pal.blush ?? null,
  };
  const out = {};
  for (const dir of ['down', 'up', 'left', 'right']) {
    out[dir] = FRAMES.map((_, i) => {
      const { canvas, ctx } = surface(W, H);
      drawBody(ctx, dir, i, full);
      return canvas;
    });
  }
  return out;
}

/** 生成对话用的头像一个（大号脸） */
export function makePortrait(pal) {
  const S = 40;
  const { canvas, ctx } = surface(S, S);
  const hair = pal.hair ?? C.hair[0];
  const skin = pal.skin ?? C.skin[0];
  const hairDark = shade(hair, -0.28);
  const blush = pal.blush ?? '#e79a90';

  // 背景
  rect(ctx, 0, 0, S, S, pal.bg ?? '#d9c8a4');
  rect(ctx, 0, S - 6, S, 6, shade(pal.bg ?? '#d9c8a4', -0.18));

  // 脖子 + 肩
  rect(ctx, 16, 30, 8, 6, shade(skin, -0.18));
  rect(ctx, 8, 34, 24, 6, pal.shirt ?? C.red);
  rect(ctx, 8, 34, 24, 1, shade(pal.shirt ?? C.red, 0.2));

  // 脸
  rect(ctx, 10, 10, 20, 22, skin);
  rect(ctx, 10, 10, 20, 1, shade(skin, -0.12));
  rect(ctx, 10, 31, 20, 1, shade(skin, -0.28));
  rect(ctx, 10, 10, 1, 22, shade(skin, -0.14));
  rect(ctx, 29, 10, 1, 22, shade(skin, -0.14));

  // 头发
  rect(ctx, 9, 5, 22, 8, hair);
  rect(ctx, 9, 5, 22, 2, shade(hair, 0.22));
  rect(ctx, 9, 5, 3, 18, hair);
  rect(ctx, 28, 5, 3, 18, hair);
  if (pal.hairStyle === 'long') {
    rect(ctx, 9, 18, 3, 16, hairDark);
    rect(ctx, 28, 18, 3, 16, hairDark);
  }
  if (pal.hairStyle === 'ponytail') rect(ctx, 31, 8, 5, 16, hair);
  if (pal.hairStyle === 'hat') {
    rect(ctx, 5, 2, 30, 5, hair);
    rect(ctx, 5, 2, 30, 1, shade(hair, 0.3));
    rect(ctx, 7, 7, 26, 2, hairDark);
  }
  rect(ctx, 9, 12, 22, 1, hairDark);

  // 眼睛
  rect(ctx, 14, 18, 3, 4, '#ffffff');
  rect(ctx, 23, 18, 3, 4, '#ffffff');
  rect(ctx, 15, 19, 2, 3, C.outline);
  rect(ctx, 24, 19, 2, 3, C.outline);
  px(ctx, 15, 19, '#ffffff');
  px(ctx, 24, 19, '#ffffff');
  // 眉
  rect(ctx, 14, 16, 3, 1, hairDark);
  rect(ctx, 23, 16, 3, 1, hairDark);
  // 腮红
  rect(ctx, 12, 24, 3, 2, blush);
  rect(ctx, 25, 24, 3, 2, blush);
  // 嘴
  rect(ctx, 18, 27, 4, 1, shade(skin, -0.35));
  px(ctx, 18, 26, shade(skin, -0.35));
  px(ctx, 21, 26, shade(skin, -0.35));

  return canvas;
}
