/**
 * 交互判定
 * ------------------------------------------------------------------
 * 每帧问一次：「玩家现在按空格，最该发生什么？」
 * 优先级：居民 > 苹果树 > 调查点 > 收购站。
 * 越「想要」的东西排越前，避免站在树下跟人说话时反而把苹果摘了。
 */
import { TILE } from '../art/tiles.js';

const R = {
  npcNear: 34,     // 玩家与居民的距离阈值
  npcFront: 26,    // 朝向点与居民的距离阈值
  apple: 20,
  sparkle: 18,
  station: 26,
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * @returns {null | {kind:'npc'|'apple'|'sparkle'|'station', target:any, label:string, dist:number}}
 */
export function findInteraction({ player, world, npcs, state }) {
  const front = player.facingPoint(0.5);
  const feet = { x: player.x, y: player.y - 2 };

  /* ---- 1. 居民 ---- */
  let bestNpc = null;
  let bestNpcD = Infinity;
  for (const n of npcs) {
    const dFront = dist(front, n);
    const dNear = dist(feet, n);
    const d = Math.min(dFront, dNear);
    if (dFront > R.npcFront && dNear > R.npcNear) continue;
    if (d < bestNpcD) {
      bestNpcD = d;
      bestNpc = n;
    }
  }
  if (bestNpc) {
    const known = state.met.has(bestNpc.id);
    return {
      kind: 'npc',
      target: bestNpc,
      label: known ? `和${bestNpc.character.name}聊聊` : `认识一下${bestNpc.character.name}`,
      dist: bestNpcD,
    };
  }

  /* ---- 2. 结果的苹果树 ---- */
  const tree = world.nearestAppleTree(front.x, front.y, R.apple) ??
    world.nearestAppleTree(feet.x, feet.y, R.apple);
  if (tree) {
    const key = tree.key;
    if (!state.treePicked[key]) {
      return { kind: 'apple', target: tree, label: '摘苹果', dist: 0 };
    }
  }

  /* ---- 3. 发光调查点 ---- */
  let bestSp = null;
  let bestSpD = R.sparkle;
  for (const s of world.sparkles) {
    if (state.discovered.has(s.id)) continue;
    const d = dist(feet, s);
    if (d < bestSpD) {
      bestSpD = d;
      bestSp = s;
    }
  }
  if (bestSp) return { kind: 'sparkle', target: bestSp, label: '调查', dist: bestSpD };

  /* ---- 4. 收购站 ---- */
  for (const st of world.stations) {
    const d = dist(feet, st);
    if (d < R.station) {
      return { kind: 'station', target: st, label: st.label ?? '看看', dist: d };
    }
  }

  return null;
}

/** 玩家踩到传送格了吗 */
export function portalUnderfoot(world, player) {
  const t = player.tile();
  return world.portalAt(t.x, t.y);
}

export { TILE };
