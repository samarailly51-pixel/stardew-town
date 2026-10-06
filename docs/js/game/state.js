/**
 * 全场状态 + 存档
 * ------------------------------------------------------------------
 * 只放「跨场景、要持久化」的东西：苹果、金币、好感度、探索记录、token 用量。
 * 场景内的临时数据（谁在走、对话框开着没）一律不进来。
 */

const SAVE_KEY = 'apple-town-save-v1';

export const state = {
  /** 当前所在场景 */
  sceneId: 'apple_farm',

  /** 背包：目前只有苹果，留成对象以后好扩展 */
  apples: 0,
  coins: 0,

  /** 好感度：{ 居民id: 点数 }，每 25 点一颗心 */
  affection: {},

  /** 送过苹果的次数（每人每天只算一次，这里简化成只记总数） */
  gifts: 0,

  /** 已调查的发光点 id */
  discovered: new Set(),

  /** 摘过的苹果树：{ "场景:格子": true }，被摘过的树会变成「没果子的样子」 */
  treePicked: {},

  /** 摘过的树什么时候重新结果（秒，游戏内计时） */
  treeRegrow: {},

  /** 说过话的居民 */
  met: new Set(),

  /** 走过的场景 */
  visited: new Set(['apple_farm']),

  /** 累计对话轮数 */
  chats: 0,

  /** LLM 用量统计 —— 面板上要显示「省了多少」 */
  usage: { calls: 0, promptTokens: 0, completionTokens: 0, cached: 0, mock: 0 },

  /** 游戏内经过的秒数 */
  clock: 6 * 60 * 60,   // 从早上 6:00 开始
};

/* ------------------------------------------------------------------ */

export function addApples(n) {
  state.apples = Math.max(0, state.apples + n);
  return state.apples;
}

export function addCoins(n) {
  state.coins = Math.max(0, state.coins + n);
  return state.coins;
}

export function addAffection(id, n) {
  state.affection[id] = Math.max(0, Math.min(100, (state.affection[id] ?? 0) + n));
  return state.affection[id];
}

export function affectionOf(id) {
  return state.affection[id] ?? 0;
}

export function markMet(id) {
  state.met.add(id);
}

/** 认识了几位居民 */
export function metCount() {
  return state.met.size;
}

/** 场景探索度：调查点全找齐 = 100% */
export function exploreRatio(scene) {
  const total = (scene.sparkles ?? []).length;
  if (!total) return 1;
  const found = (scene.sparkles ?? []).filter((_, i) =>
    state.discovered.has(`${scene.id}:sp${i}`),
  ).length;
  return found / total;
}

/** 全局探索度：所有场景加起来 */
export function globalExplore(allScenes) {
  let total = 0;
  let found = 0;
  for (const s of allScenes) {
    total += (s.sparkles ?? []).length;
    found += (s.sparkles ?? []).filter((_, i) => state.discovered.has(`${s.id}:sp${i}`)).length;
  }
  return total ? found / total : 1;
}

/** 游戏内时钟：1 真实秒 = 1 游戏分钟 */
export function tickClock(dt) {
  state.clock = (state.clock + dt * 60) % (24 * 60 * 60);
}

export function clockStr() {
  const total = Math.floor(state.clock);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* 存档                                                                */
/* ------------------------------------------------------------------ */

export function saveGame() {
  try {
    const payload = {
      sceneId: state.sceneId,
      apples: state.apples,
      coins: state.coins,
      affection: state.affection,
      gifts: state.gifts,
      discovered: [...state.discovered],
      treePicked: state.treePicked,
      met: [...state.met],
      visited: [...state.visited],
      chats: state.chats,
      usage: state.usage,
      clock: state.clock,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw);
    state.sceneId = p.sceneId ?? state.sceneId;
    state.apples = p.apples ?? 0;
    state.coins = p.coins ?? 0;
    state.affection = p.affection ?? {};
    state.gifts = p.gifts ?? 0;
    state.discovered = new Set(p.discovered ?? []);
    state.treePicked = p.treePicked ?? {};
    state.met = new Set(p.met ?? []);
    state.visited = new Set(p.visited ?? ['apple_farm']);
    state.chats = p.chats ?? 0;
    state.usage = { ...state.usage, ...(p.usage ?? {}) };
    state.clock = p.clock ?? state.clock;
    return true;
  } catch {
    return false;
  }
}

export function resetGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 无痕模式下 localStorage 可能不可用，忽略 */
  }
}
