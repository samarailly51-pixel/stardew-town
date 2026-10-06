/**
 * 世界层
 * ------------------------------------------------------------------
 * 把「场景数据」变成「能跑能撞能画的世界」：
 *   · 地面烘焙成一张大图（同一个场景第二次进直接复用）
 *   · 立体物件收集成一张列表，按 y 排序后和角色一起画，实现前后遮挡
 *   · 提供像素级的碰撞查询（角色用脚底的一个小方框去撞）
 *   · 传送点、苹果树、调查点都带上像素坐标，交互层直接用
 */
import { bakeGround, TILE, OBJECT_CHARS, isSolid, charAt } from '../art/tiles.js';
import { getProp, makeBuilding, drawSparkle } from '../art/props.js';
import { instantiateScene, getScene } from './scenes.js';
import { seedFrom } from '../core/rng.js';

/** 地面烘焙缓存：切回去过的场景不用重画 */
const groundCache = new Map();
const GROUND_CACHE_MAX = 6;

export class World {
  constructor(sceneId, gameState) {
    const { scene, cells, gates, resident } = instantiateScene(sceneId);
    this.id = sceneId;
    this.scene = scene;
    this.cells = cells.map((r) => r.join(''));
    this.cols = cells[0].length;
    this.rows = cells.length;
    this.w = this.cols * TILE;
    this.h = this.rows * TILE;
    this.gates = gates;
    this.resident = resident;

    /* ---- 地面 ---- */
    if (!groundCache.has(sceneId)) {
      const baked = bakeGround(this.cells, seedFrom(sceneId));
      groundCache.set(sceneId, baked.canvas);
      // 缓存别无限涨，超过就丢掉最早的
      if (groundCache.size > GROUND_CACHE_MAX) {
        const oldest = groundCache.keys().next().value;
        if (oldest !== sceneId) groundCache.delete(oldest);
      }
    }
    this.ground = groundCache.get(sceneId);

    /* ---- 立体物件 ---- */
    this.props = [];
    this.appleTrees = [];
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const ch = charAt(this.cells, tx, ty);
        if (!OBJECT_CHARS.has(ch)) continue;
        const key = `${sceneId}:${tx},${ty}`;
        const picked = gameState?.treePicked?.[key];
        const variant = ch === 'A' && picked ? 'empty' : '';
        const prop = getProp(ch, seedFrom(key), variant);
        const item = {
          ch,
          tx,
          ty,
          prop,
          px: tx * TILE + 8 - prop.ax,
          py: ty * TILE + TILE - prop.ay,
          baseY: ty * TILE + TILE,
          key,
        };
        this.props.push(item);
        if (ch === 'A') this.appleTrees.push(item);
      }
    }

    /* ---- 建筑 ---- */
    this.buildings = (scene.buildings ?? []).map((b, i) => {
      const built = makeBuilding(b.style, b.w, b.h, seedFrom(`${sceneId}:b${i}`));
      return {
        ...b,
        canvas: built.canvas,
        px: b.x * TILE - built.ox,
        py: b.y * TILE + b.h * TILE - built.canvas.height + built.oy,
        baseY: (b.y + b.h) * TILE,
      };
    });

    /* ---- 传送点 / 苹果树 / 调查点 / 收购站：统一转成像素坐标 ---- */
    this.portals = gates.map((g) => ({
      ...g,
      px: g.x * TILE + TILE / 2,
      py: g.y * TILE + TILE / 2,
    }));

    this.sparkles = (scene.sparkles ?? []).map((s, i) => ({
      ...s,
      id: `${sceneId}:sp${i}`,
      px: s.x * TILE + TILE / 2,
      py: s.y * TILE + TILE / 2,
    }));

    this.stations = (scene.stations ?? []).map((s, i) => ({
      ...s,
      id: `${sceneId}:st${i}`,
      px: s.x * TILE + TILE / 2,
      py: s.y * TILE + TILE / 2,
      prop: s.kind === 'sell'
        ? { canvas: makeBuilding('cabin', 1, 1, 7).canvas }
        : null,
    }));
  }

  /* ---------------- 碰撞 ---------------- */

  /** 格子是否挡路（含建筑占格） */
  solidTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return true;
    if (isSolid(charAt(this.cells, tx, ty))) return true;
    for (const b of this.buildings) {
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return true;
    }
    return false;
  }

  /** 角色脚底的一个矩形能不能站：逐格检查它盖住的瓦片 */
  free(x, y, w, h) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.solidTile(tx, ty)) return false;
      }
    }
    return true;
  }

  /* ---------------- 查询 ---------------- */

  portalAt(tx, ty) {
    return this.portals.find((p) => p.x === tx && p.y === ty) ?? null;
  }

  /** 找离某点最近的苹果树（用于「空格摘苹果」） */
  nearestAppleTree(x, y, maxDist = 22) {
    let best = null;
    let bestD = maxDist;
    for (const t of this.appleTrees) {
      const cx = t.tx * TILE + TILE / 2;
      const cy = t.ty * TILE + TILE / 2;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /* ---------------- 渲染 ---------------- */

  /**
   * 画地面 + 所有立体物件。
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number,y:number}} cam
   * @param {number} t  全局时间（秒），给发光点做呼吸动画
   * @param {Array} actors  角色数组，会跟物件一起按 y 排序后绘制
   * @param {Set<string>} found  已调查过的点 id
   */
  render(ctx, cam, t, actors, found) {
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

    ctx.drawImage(this.ground, 0, 0);

    // 收集所有需要按 y 排序的东西
    const drawables = [];
    const viewL = cam.x - 32;
    const viewR = cam.x + 352 + 32;
    const viewT = cam.y - 64;
    const viewB = cam.y + 224 + 32;

    for (const p of this.props) {
      if (p.px + 32 < viewL || p.px > viewR || p.py + 40 < viewT || p.py > viewB) continue;
      drawables.push(p);
    }
    for (const b of this.buildings) {
      drawables.push(b);
    }
    for (const s of this.sparkles) {
      if (found?.has(s.id)) continue;
      drawables.push({ baseY: s.py, sparkle: s });
    }
    for (const a of actors) {
      drawables.push({ baseY: a.baseY ?? a.y, actor: a });
    }

    drawables.sort((a, b) => a.baseY - b.baseY);

    for (const d of drawables) {
      if (d.sparkle) {
        drawSparkle(ctx, d.sparkle.px, d.sparkle.py - 6, t);
      } else if (d.actor) {
        d.actor.draw(ctx, t);
      } else if (d.canvas) {
        ctx.drawImage(d.canvas, Math.round(d.px), Math.round(d.py));
      } else if (d.prop) {
        ctx.drawImage(d.prop.canvas, Math.round(d.px), Math.round(d.py));
      }
    }

    // 传送口的地面标记：一小片浅色箭头，提示「这儿能出去」
    for (const p of this.portals) {
      const x = p.x * TILE;
      const y = p.y * TILE;
      if (x + 32 < viewL || x > viewR || y + 32 < viewT || y > viewB) continue;
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 2.4);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(x + 4, y + 6, 8, 2);
      ctx.fillRect(x + 4, y + 6, 2, 6);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}

/** 换场景时把地面缓存清掉（内存友好，重进也就多花几毫秒） */
export function clearGroundCache() {
  groundCache.clear();
}

export { TILE };
