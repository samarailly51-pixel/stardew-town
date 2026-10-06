/**
 * 确定性随机数
 * ------------------------------------------------------------------
 * 程序化生成像素美术时到处都要「随机」，但每次刷新得长一样，
 * 所以统一用带种子的 PRNG，而不是 Math.random()。
 */

/** mulberry32：短小、够用、分布均匀 */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** [min, max) 浮点 */
    range: (min, max) => min + next() * (max - min),
    /** [min, max] 整数 */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** 概率 p 为真 */
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** 原地洗牌 */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/** 把任意字符串压成一个 32 位种子，好让「场景 id」直接当种子用 */
export function seedFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 二维坐标哈希：同一格永远得到同一个 0~1 的值 */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
