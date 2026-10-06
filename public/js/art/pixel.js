/**
 * 像素绘制小工具
 * ------------------------------------------------------------------
 * 只做三件事：建离屏画布、逐像素画、撒噪点。
 * 所有图形都是「一次性生成 + 缓存」，运行时只做 drawImage，帧率才稳。
 */
import { makeRng } from '../core/rng.js';

/** 建一张离屏画布，并关掉平滑（保证像素锐利） */
export function surface(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** 画一个像素 */
export function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

/** 画一个矩形（像素对齐） */
export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

/** 描边：给一块区域套一圈 outline，像素风的灵魂 */
export function outlineRect(ctx, x, y, w, h, color) {
  rect(ctx, x, y, w, 1, color);
  rect(ctx, x, y + h - 1, w, 1, color);
  rect(ctx, x, y, 1, h, color);
  rect(ctx, x + w - 1, y, 1, h, color);
}

/**
 * 撒噪点：在矩形区域里随机点若干像素，用来做草地/泥土/石头的纹理。
 * rng 传固定种子就每次结果一样。
 */
export function speckle(ctx, x, y, w, h, colors, count, rng = makeRng(1)) {
  for (let i = 0; i < count; i++) {
    const c = colors[Math.floor(rng.next() * colors.length)];
    px(ctx, x + Math.floor(rng.next() * w), y + Math.floor(rng.next() * h), c);
  }
}

/** 画一块「圆角」的色块：像素风里就是削掉四个角 */
export function blob(ctx, x, y, w, h, color, corner = 1) {
  rect(ctx, x + corner, y, w - corner * 2, h, color);
  rect(ctx, x, y + corner, w, h - corner * 2, color);
}

/** 水平渐变条（用几条实色带模拟，保持像素味） */
export function band(ctx, x, y, w, h, colors) {
  const step = h / colors.length;
  colors.forEach((c, i) => rect(ctx, x, y + Math.round(i * step), w, Math.ceil(step), c));
}

/** 复制一张画布，用于做「结果帧」 */
export function clone(canvas) {
  const { canvas: c, ctx } = surface(canvas.width, canvas.height);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

/** 左右镜像一张画布，做角色侧向的另一边 */
export function mirror(canvas) {
  const { canvas: c, ctx } = surface(canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return c;
}
