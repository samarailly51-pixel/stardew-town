/**
 * 静态校验脚本
 * ------------------------------------------------------------------
 * 浏览器里跑得起来不代表地图数据是对的：可能某个传送点通向了不存在的场景、
 * 某个居民被摆在了水面上、某块地图的出生点被树堵死了。
 * 这个脚本在 Node 里给 canvas 打个桩，把 20 个场景全实例化一遍来验证。
 *
 *   node tools/check.mjs
 */

/* ---------------- canvas 打桩 ---------------- */
const noop = () => {};
function fakeCtx() {
  return {
    imageSmoothingEnabled: false,
    fillStyle: '#000',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    fillRect: noop,
    clearRect: noop,
    drawImage: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    ellipse: noop,
    fillText: noop,
    measureText: (t) => ({ width: String(t).length * 4 }),
  };
}
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') return {};
    const c = { width: 1, height: 1, _ctx: null };
    c.getContext = () => (c._ctx ??= fakeCtx());
    return c;
  },
};

/* ---------------- 开始校验 ---------------- */
const { SCENES } = await import('../public/js/world/scenes.js');
const { CHARACTERS, getCharacter } = await import('../public/js/world/characters.js');
const { World } = await import('../public/js/world/world.js');
const { OBJECT_CHARS, isSolid } = await import('../public/js/art/tiles.js');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const sceneIds = Object.keys(SCENES);
const charIds = new Set(CHARACTERS.map((c) => c.id));
const sceneOf = new Map(CHARACTERS.map((c) => [c.id, c.scene]));

/* ---- 1. 场景数量与居民一一对应 ---- */
if (sceneIds.length !== 20) err(`场景数量是 ${sceneIds.length}，要求 20`);
if (CHARACTERS.length !== 20) err(`居民数量是 ${CHARACTERS.length}，要求 20`);

const residentCount = {};
for (const c of CHARACTERS) {
  residentCount[c.scene] = (residentCount[c.scene] ?? 0) + 1;
  if (!SCENES[c.scene]) err(`居民 ${c.id}(${c.name}) 住在一个不存在的场景：${c.scene}`);
  for (const field of ['persona', 'about', 'greet', 'gift', 'guide', 'lore', 'likes', 'title']) {
    if (!c[field]) err(`居民 ${c.id} 缺少字段 ${field}`);
  }
  if (!Array.isArray(c.lines) || c.lines.length < 3) err(`居民 ${c.id} 的预置台词少于 3 条`);
  if (!c.pal?.shirt || !c.pal?.hair) err(`居民 ${c.id} 缺少配色`);
}
for (const s of sceneIds) {
  if ((residentCount[s] ?? 0) === 0) err(`场景 ${s} 没有常驻居民`);
  if ((residentCount[s] ?? 0) > 1) err(`场景 ${s} 有 ${residentCount[s]} 位居民，目前设计为一人一场景`);
}

/* ---- 2. 逐场景实例化并检查 ---- */
const rows = [];
const stats = { totalTiles: 0, totalProps: 0, totalWalkable: 0 };
/** 当前场景从出生点洪水填充能走到的格子（flood() 会重填） */
let reachSet = new Set();

for (const id of sceneIds) {
  const scene = SCENES[id];
  if (scene.id !== id) err(`场景 ${id} 的 id 字段写成了 ${scene.id}`);
  if (!scene.resident || !charIds.has(scene.resident)) {
    err(`场景 ${id} 的 resident 无效：${scene.resident}`);
  } else if (sceneOf.get(scene.resident) !== id) {
    err(`场景 ${id} 的 resident(${scene.resident}) 其实住在 ${sceneOf.get(scene.resident)}`);
  }

  // 传送点必须双向
  for (const p of scene.portals ?? []) {
    const target = SCENES[p.to];
    if (!target) {
      err(`场景 ${id} 有一条传送点通向不存在的场景：${p.to}`);
      continue;
    }
    if (!(target.portals ?? []).some((q) => q.to === id)) {
      err(`传送点不对称：${id} → ${p.to}，但 ${p.to} 没有回 ${id} 的路`);
    }
    const [w, h] = scene.size;
    const limit = p.side === 'north' || p.side === 'south' ? w : h;
    if (p.at < 2 || p.at > limit - 3) {
      err(`场景 ${id} 的传送点 ${p.side}@${p.at} 太靠边了（可用范围 2~${limit - 3}）`);
    }
  }

  let world;
  try {
    world = new World(id, { treePicked: {} });
  } catch (e) {
    err(`场景 ${id} 实例化失败：${e.message}`);
    continue;
  }

  // 出生点能站人
  const [sx, sy] = [scene.spawn.x, scene.spawn.y];
  if (world.solidTile(sx, sy)) err(`场景 ${id} 的出生点 (${sx},${sy}) 是障碍物`);

  // 居民站位能站人
  const res = scene.resident ? getCharacter(scene.resident) : null;
  if (res && world.solidTile(res.pos.x, res.pos.y)) {
    err(`场景 ${id} 的居民 ${res.name} 站在障碍物上 (${res.pos.x},${res.pos.y})`);
  }
  if (res && (res.pos.x < 2 || res.pos.y < 2 || res.pos.x > scene.size[0] - 3 || res.pos.y > scene.size[1] - 3)) {
    warn(`场景 ${id} 的居民 ${res.name} 贴在地图边上，玩家可能不好走近`);
  }

  // 调查点 / 收购站不要悬空在障碍里（允许在障碍上，但要能走到旁边）
  for (const sp of scene.sparkles ?? []) {
    if (sp.x < 1 || sp.y < 1 || sp.x >= scene.size[0] - 1 || sp.y >= scene.size[1] - 1) {
      err(`场景 ${id} 的调查点 (${sp.x},${sp.y}) 在地图外`);
    }
    if (!sp.text || sp.text.length < 6) warn(`场景 ${id} 的调查点 (${sp.x},${sp.y}) 文本太短`);
  }
  for (const st of scene.stations ?? []) {
    if (world.solidTile(st.x, st.y)) err(`场景 ${id} 的收购站 (${st.x},${st.y}) 在障碍物上`);
  }

  // 传送落点必须能站人
  for (const g of world.gates) {
    if (world.solidTile(g.x, g.y)) err(`场景 ${id} 传送点 ${g.to} 的落点 (${g.x},${g.y}) 是障碍物`);
  }

  // 苹果树数量
  const apples = world.appleTrees.length;

  // 统计可行走比例：从出生点洪水填充，看看能走到多少格
  const reach = flood(world, sx, sy);
  const passable = countPassable(world);
  if (reach < passable * 0.5) {
    warn(`场景 ${id} 只有 ${reach}/${passable} 个可行走格能从出生点走到，地图可能被切成了好几块`);
  }
  // 居民和传送点必须在可达区域里
  if (res && !reachSet.has(res.pos.x + ',' + res.pos.y)) {
    err(`场景 ${id} 的居民 ${res.name} 从出生点走不到（被围住了）`);
  }
  for (const g of world.gates) {
    const gp = world.portals.find((p) => p.to === g.to);
    const tx = gp ? gp.x : g.x;
    const ty = gp ? gp.y : g.y;
    if (!reachSet.has(tx + ',' + ty)) {
      err(`场景 ${id} 的传送点 ${g.to} 从出生点走不到`);
    }
  }

  stats.totalTiles += world.cols * world.rows;
  stats.totalProps += world.props.length;
  stats.totalWalkable += passable;

  rows.push({
    id,
    name: scene.name,
    size: `${scene.size[0]}x${scene.size[1]}`,
    portals: (scene.portals ?? []).length,
    apples,
    props: world.props.length,
    resident: res ? res.name : '—',
    reach: Math.round((reach / passable) * 100) + '%',
  });
  void OBJECT_CHARS;
  void isSolid;
}

/* ---- 洪水填充：从出生点出发能走到的格子 ---- */
function flood(world, sx, sy) {
  reachSet = new Set();
  const q = [[sx, sy]];
  reachSet.add(sx + ',' + sy);
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = nx + ',' + ny;
      if (reachSet.has(k)) continue;
      if (nx < 0 || ny < 0 || nx >= world.cols || ny >= world.rows) continue;
      if (world.solidTile(nx, ny)) continue;
      reachSet.add(k);
      q.push([nx, ny]);
    }
  }
  return reachSet.size;
}

function countPassable(world) {
  let n = 0;
  for (let y = 0; y < world.rows; y++) {
    for (let x = 0; x < world.cols; x++) if (!world.solidTile(x, y)) n++;
  }
  return n;
}

/* ---- 输出 ---- */
const pad = (s, n) => String(s).padEnd(n, ' ');
console.log('\n场景总览');
console.log('─'.repeat(78));
console.log(pad('id', 16) + pad('名称', 12) + pad('尺寸', 8) + pad('出口', 6) + pad('苹果树', 8) + pad('物件', 6) + pad('居民', 10) + '可达');
console.log('─'.repeat(78));
for (const r of rows) {
  console.log(
    pad(r.id, 16) + pad(r.name, 12) + pad(r.size, 8) + pad(r.portals, 6) +
    pad(r.apples, 8) + pad(r.props, 6) + pad(r.resident, 10) + r.reach,
  );
}
console.log('─'.repeat(78));
console.log(`合计：${rows.length} 个场景 · ${stats.totalTiles} 格 · ${stats.totalProps} 个立体物件`);

if (warnings.length) {
  console.log('\n提醒（不影响运行）：');
  warnings.forEach((w) => console.log('  · ' + w));
}
if (errors.length) {
  console.log('\n错误：');
  errors.forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('\n✅ 全部检查通过\n');
