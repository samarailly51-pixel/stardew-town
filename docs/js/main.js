/**
 * 苹果小镇 · 主程序
 * ------------------------------------------------------------------
 * 只做「接线」：把世界、主角、居民、Agent、UI、输入串成一个循环。
 * 具体逻辑都在各自的模块里，这里尽量一眼能读完。
 */
import { input } from './core/input.js';
import { Camera } from './core/camera.js';
import { makeCharacterSprites } from './art/sprites.js';
import { TILE } from './art/tiles.js';
import { getProp } from './art/props.js';
import { seedFrom } from './core/rng.js';
import { World } from './world/world.js';
import { getScene } from './world/scenes.js';
import { getCharacter } from './world/characters.js';
import { Player } from './game/player.js';
import { Npc } from './game/npc.js';
import { SceneTransition } from './game/transition.js';
import { findInteraction, portalUnderfoot } from './game/interact.js';
import { AgentManager, ALL_COUNT, sceneResidents } from './ai/agents.js';
import { ai } from './ai/client.js';
import { hud } from './ui/hud.js';
import { dialog } from './ui/dialog.js';
import { openMap, openArchive } from './ui/panels.js';
import {
  state, addApples, addCoins, addAffection, markMet, saveGame, loadGame, resetGame,
  tickClock, clockStr,
} from './game/state.js';

/* ================================================================== */
/* 画布与环境                                                          */
/* ================================================================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const VW = canvas.width;    // 352
const VH = canvas.height;   // 224

const camera = new Camera(VW, VH);
const agents = new AgentManager();

/** 角色贴图按需生成 + 缓存（跟 Agent 一样，用到谁才画谁） */
const spriteCache = new Map();
function spritesFor(character) {
  if (!spriteCache.has(character.id)) {
    spriteCache.set(character.id, makeCharacterSprites(character.pal ?? {}));
  }
  return spriteCache.get(character.id);
}

let world = null;
let player = null;
let npcs = [];
let running = false;
let elapsed = 0;
/** 刚落地的那一格传送点先「锁」住，走开之前不重复触发 */
let gateLock = null;
/** 苹果树多久重新结果（秒） */
const REGROW_SECONDS = 45;

/* ================================================================== */
/* 场景装载                                                            */
/* ================================================================== */

/**
 * 换到某个场景。所有「进入一个场景要发生的事」都在这里。
 * @param {string} sceneId
 * @param {{arrivalGate?:object}} opts
 */
function loadScene(sceneId, opts = {}) {
  state.sceneId = sceneId;
  state.visited.add(sceneId);

  world = new World(sceneId, state);
  const scene = world.scene;

  // ---- 居民：只实例化这个场景的人 ----
  npcs = sceneResidents(scene).map(
    (c) => new Npc({ character: c, sprites: spritesFor(c), world }),
  );

  // ---- Agent：唤醒本场景的，其余继续睡觉 ----
  agents.wakeScene(scene);
  hud.setAgents(scene.id, [...agents.awake.values()], ALL_COUNT);

  // ---- 主角落位 ----
  if (opts.arrivalGate) {
    const g = opts.arrivalGate;
    player.placeAt(g.x * TILE + TILE / 2, g.y * TILE + TILE - 2);
    gateLock = `${g.x},${g.y}`;
  } else if (!player) {
    player = new Player(
      spritesFor(getCharacter(scene.resident)),
      scene.spawn.x * TILE + TILE / 2,
      scene.spawn.y * TILE + TILE - 2,
    );
  } else {
    player.placeAt(scene.spawn.x * TILE + TILE / 2, scene.spawn.y * TILE + TILE - 2);
    gateLock = `${scene.spawn.x},${scene.spawn.y}`;
  }
  // 主角的贴图是通用的「旅人」样子，这里换成场景居民那套颜色不合适，
  // 所以给主角单独固定一份配色
  player.sprites = spritesFor(PLAYER_LOOK);

  camera.snap(player.x, player.y, world.w, world.h);

  hud.setScene(scene);
  hud.refreshExplore(scene);
  hud.refresh();

  return { world, npcs, player };
}

/** 主角自己的配色（不走名册，单独一份） */
const PLAYER_LOOK = {
  id: '__player',
  name: '你',
  pal: {
    hair: '#3a2a1e',
    shirt: '#4a7fb5',
    pants: '#5a4632',
    skin: '#f2c99b',
    hairStyle: 'short',
  },
};

/* ================================================================== */
/* 场景切换                                                            */
/* ================================================================== */

const transition = new SceneTransition({
  ui: {
    setInputLocked: (v) => hud.setInputLocked(v),
    showTransition: (o) => hud.showTransition(o),
    fadeTransition: (v) => hud.fadeTransition(v),
    hideTransition: () => hud.hideTransition(),
    toast: (m) => hud.toast(m),
  },
  actors: () => ({ player, world, npcs }),
  /**
   * 真正的换场景动作：加载新世界，把引路 NPC 挪到门口。
   * 这一瞬间屏幕是全黑的，玩家看不到「加载」。
   */
  swapScene: (toId, fromId) => {
    const toScene = getScene(toId);
    const loaded = loadScene(toId, {});

    // 落点 = 目标场景里那条「通回来」的传送点
    const gate = loaded.world.gates.find((g) => g.to === fromId)
      ?? loaded.world.gates[0]
      ?? { x: toScene.spawn.x, y: toScene.spawn.y, side: 'south' };

    const px = gate.x * TILE + TILE / 2;
    const py = gate.y * TILE + TILE - 2;
    loaded.player.placeAt(px, py);
    gateLock = `${gate.x},${gate.y}`;
    camera.snap(px, py, loaded.world.w, loaded.world.h);

    // 引路 NPC：让这个场景的居民从门口出现，再带你往里走
    const guide = loaded.npcs.find((n) => n.id === toScene.resident) ?? null;
    if (guide) {
      guide.x = px;
      guide.y = py;
    }
    return { guide, gate };
  },
});

/* ================================================================== */
/* 交互                                                                */
/* ================================================================== */

function pickApple(tree) {
  state.treePicked[tree.key] = true;
  state.treeRegrow[tree.key] = REGROW_SECONDS;
  addApples(1);
  // 换一张「果子被摘掉了」的贴图（getProp 内部有缓存，不会反复重画）
  tree.prop = getProp('A', seedFrom(tree.key), 'empty');
  hud.flash();
  hud.refresh();
  const left = world.appleTrees.filter((t) => !state.treePicked[t.key]).length;
  hud.toast(`🍎 摘到一个苹果${left ? `（这片还剩 ${left} 个）` : '（这片摘完了）'}`);
  if (state.apples === 1) {
    setTimeout(() => hud.toast('背包里有一个苹果了 —— 送给居民能涨好感度'), 900);
  }
}

function doInteraction(hit) {
  if (!hit) return;
  switch (hit.kind) {
    case 'npc': {
      const npc = hit.target;
      if (!state.met.has(npc.id)) {
        markMet(npc.id);
        hud.toast(`认识了 ${npc.character.name}！`);
        addAffection(npc.id, 2);
      }
      npc.faceTowards(player.x, player.y);
      openDialogWith(npc);
      break;
    }
    case 'apple':
      pickApple(hit.target);
      break;
    case 'sparkle': {
      state.discovered.add(hit.target.id);
      hud.refreshExplore(world.scene);
      hud.toast(`🔍 ${hit.target.text}`);
      addCoins(3);
      hud.refresh();
      break;
    }
    case 'station': {
      if (state.apples <= 0) {
        hud.toast('收购站：你还没摘到苹果呢');
      } else {
        const gain = state.apples * 4;
        addCoins(gain);
        hud.toast(`🪙 卖掉 ${state.apples} 个苹果，换到 ${gain} 金币`);
        addApples(-state.apples);
        hud.refresh();
      }
      break;
    }
    default:
      break;
  }
}

function openDialogWith(npc) {
  const c = npc.character;
  hud.setInputLocked(true);
  dialog.openDialog(npc, c.greet);
  setTimeout(() => document.getElementById('dlgInput')?.focus(), 60);
}

async function sendToNpc(npc, text) {
  if (!npc) return;
  dialog.echoPlayer(text);
  dialog.showThinking();
  state.chats++;

  const res = await agents.reply(npc.id, text, {
    clock: clockStr(),
    sceneName: world.scene.name,
  });

  dialog.typeOut(res.text, res.source);
  // 每次聊天涨一点点好感，送礼涨得多
  addAffection(npc.id, 1);
  dialog.refreshHearts();
  hud.refreshTokens();

  if (res.source === 'error') {
    setTimeout(() => hud.toast(`模型没接上：${res.error}`), 400);
  }
}

function giftApple(npc) {
  if (!npc) return;
  if (state.apples <= 0) {
    hud.toast('背包里没有苹果了');
    return;
  }
  addApples(-1);
  state.gifts++;
  addAffection(npc.id, 8);
  npc.showBubble('♪', 1.6);
  hud.refresh();
  dialog.refreshHearts();
  hud.toast(`${npc.character.name} 收下了苹果，好感度 +8`);
  dialog.typeOut(npc.character.gift ?? '谢谢你。', 'local');
}

function closeDialog() {
  dialog.closeDialog();
  hud.setInputLocked(false);
}

/* ================================================================== */
/* 主循环                                                              */
/* ================================================================== */

let last = 0;
function loop(now) {
  if (!running) return;
  // 夹住 dt：切标签页回来时 now 会跳很大，时钟倒退时也不能让它变成负数
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
  last = now;
  elapsed += dt;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  tickClock(dt);
  transition.update(dt);

  const dialogOpen = dialog.open;
  const busy = dialogOpen || hud.modalOpen || transition.active || hud.locked;
  if (busy) input.endFrame();

  /* ---- 全局按键 ---- */
  if (input.consume('esc')) {
    if (hud.modalOpen) hud.closeModal();
    else if (dialogOpen) closeDialog();
  }
  if (!busy) {
    if (input.consume('map')) openMap(hud, { onTravel: quickTravel });
    if (input.consume('bag')) openArchive(hud);
  }

  /* ---- 居民 ---- */
  for (const n of npcs) {
    const d = Math.hypot(n.x - player.x, n.y - player.y);
    n.update(dt, player, d);
    n.tickBubble(dt);
    // 靠近且没说过话，头顶冒个感叹号
    if (!n.bubble && d < 40 && state.met.has(n.id) === false) n.showBubble('!', 0.6);
  }

  /* ---- 玩家移动 ---- */
  // 引路过程中由 transition 自己接管主角的动作，这里就不要插手
  const axis = busy || transition.active ? { x: 0, y: 0 } : input.axis;
  if (!transition.active) player.update(dt, axis, world, false);

  /* ---- 苹果树重新结果 ---- */
  for (const key of Object.keys(state.treeRegrow)) {
    state.treeRegrow[key] -= dt;
    if (state.treeRegrow[key] <= 0) {
      delete state.treeRegrow[key];
      delete state.treePicked[key];
      const tree = world.appleTrees.find((t) => t.key === key);
      if (tree) tree.prop = getProp('A', seedFrom(tree.key), '');
    }
  }

  /* ---- 相机 ---- */
  camera.follow(player.x, player.y, world.w, world.h, dt);

  /* ---- 交互提示 ---- */
  const hit = busy ? null : findInteraction({ player, world, npcs, state });
  if (dialogOpen) {
    hud.hideHint();
  } else if (hit) {
    hud.showHint(hit.label);
  } else {
    const near = world.portals.find(
      (p) => Math.hypot(p.x * TILE + 8 - player.x, p.y * TILE + 8 - player.y) < TILE * 1.6,
    );
    if (near) hud.showHint(`往${sideWord(near.side)}出去 → ${getScene(near.to).name}`);
    else hud.hideHint();
  }

  /* ---- 触发交互 ---- */
  if (!busy && input.consume('action')) {
    doInteraction(hit);
  }

  /* ---- 踩到传送点 ---- */
  const gate = portalUnderfoot(world, player);
  const key = gate ? `${gate.x},${gate.y}` : null;
  if (key !== gateLock) gateLock = null;      // 走开了就解锁
  if (gate && !gateLock && !busy) {
    transition.start(gate, world.scene.id);
  }

  /* ---- 自动存档 ---- */
  saveTimer -= dt;
  if (saveTimer <= 0) {
    saveTimer = 8;
    saveGame();
  }

  input.endFrame();
}

let saveTimer = 8;

function sideWord(side) {
  return { west: '西边', east: '东边', north: '北边', south: '南边' }[side] ?? '旁边';
}

function render() {
  ctx.fillStyle = '#1d2a17';
  ctx.fillRect(0, 0, VW, VH);
  const actors = [player, ...npcs];
  world.render(ctx, camera, elapsed, actors, state.discovered);
  drawGateLabels();
}

/** 传送口上标一个小牌子，写清通向哪儿（比箭头有用多了） */
function drawGateLabels() {
  ctx.font = '8px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  for (const p of world.portals) {
    const sx = Math.round(p.x * TILE + 8 - camera.x);
    const sy = Math.round(p.y * TILE - 6 - camera.y);
    if (sx < -40 || sx > VW + 40 || sy < -12 || sy > VH + 12) continue;
    const label = getScene(p.to).name;
    const w = ctx.measureText(label).width + 6;
    ctx.fillStyle = 'rgba(20,14,8,.72)';
    ctx.fillRect(sx - w / 2, sy - 8, w, 11);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(label, sx, sy);
  }
  ctx.textAlign = 'left';
}

/* ================================================================== */
/* 快速旅行（从地图上直接过去）                                        */
/* ================================================================== */

async function quickTravel(sceneId) {
  if (transition.active) return;
  const ui = {
    setInputLocked: (v) => hud.setInputLocked(v),
    showTransition: (o) => hud.showTransition({ ...o, guide: '快速前往' }),
    fadeTransition: (v) => hud.fadeTransition(v),
    hideTransition: () => hud.hideTransition(),
    toast: (m) => hud.toast(m),
  };
  ui.setInputLocked(true);
  ui.showTransition({ text: `前往 ${getScene(sceneId).name}`, hint: getScene(sceneId).en, lead: false });
  await new Promise((r) => setTimeout(r, 40));
  ui.fadeTransition(1);
  await new Promise((r) => setTimeout(r, 420));
  loadScene(sceneId, {});
  ui.fadeTransition(0);
  await new Promise((r) => setTimeout(r, 420));
  ui.hideTransition();
  ui.setInputLocked(false);
  ui.toast(`到达 ${getScene(sceneId).name}`);
}

/* ================================================================== */
/* 启动                                                                */
/* ================================================================== */

async function boot() {
  hud.init();
  input.bind();

  dialog.init({
    onSend: (npc, text) => sendToNpc(npc, text),
    onGift: (npc) => giftApple(npc),
    onClose: () => closeDialog(),
  });

  // Agent 思考时，右侧面板上那个人的状态跟着变
  agents.onChange = (ev) => {
    if (ev.type === 'thinking') hud.setAgentState(ev.id, ev.value);
  };

  // 模型状态
  await ai.probe();
  refreshModeUI();

  /* ---- 纯静态托管：让访客填自己的 Key ---- */
  document.getElementById('btnSaveKey').addEventListener('click', async () => {
    const v = document.getElementById('keyInput').value.trim();
    if (!v) {
      hud.toast('先把 Key 粘贴进来');
      return;
    }
    ai.setKey(v);
    await ai.probe();
    refreshModeUI();
    hud.toast(ai.ready ? '已接通，居民现在说的是真话' : 'Key 存下了，但格式看着不对（应该以 sk- 开头）');
  });
  document.getElementById('btnClearKey').addEventListener('click', async () => {
    ai.setKey('');
    document.getElementById('keyInput').value = '';
    await ai.probe();
    refreshModeUI();
    hud.toast('已清除 Key，退回预置台词');
  });

  document.getElementById('btnVerify').addEventListener('click', async () => {
    const out = document.getElementById('ssVerifyOut');
    out.classList.remove('hidden');
    out.textContent = '正在真的发一次请求问 DeepSeek…';
    const r = await ai.verify();
    out.textContent = [
      r.ok ? '✅ ' : '❌ ',
      r.message,
      r.hint ? `\n提示：${r.hint}` : '',
      r.detail ? `\n详情：${r.detail}` : '',
      r.latencyMs ? `\n耗时：${r.latencyMs} ms` : '',
      r.keyPrefix ? `\nKey：${r.keyPrefix}` : '',
    ].join('');
    if (r.ok) {
      hud.toast('模型已接通');
      await ai.probe();
      refreshModeUI();
    }
  });

  document.getElementById('btnStart').addEventListener('click', startGame);

  // 手柄上的两个按钮
  document.getElementById('btnAct').addEventListener('click', () => input.press('action'));
  document.getElementById('btnMap').addEventListener('click', () => input.press('map'));
  document.getElementById('btnBag').addEventListener('click', () => input.press('bag'));

  // 先画一帧待机画面，免得开始界面背后是纯黑的
  loadScene(state.sceneId, {});
  render();
}

/**
 * 把「当前模型状态」画到开始界面上，
 * 顺便决定要不要显示「填自己的 Key」那一行（纯静态托管下才需要）。
 */
function refreshModeUI() {
  const tag = document.getElementById('ssMode');
  const keyRow = document.getElementById('ssKeyRow');
  const keyTip = document.getElementById('ssKeyTip');
  const keyInput = document.getElementById('keyInput');

  const needsKey = ai.mode === 'static' || ai.mode === 'offline';
  keyRow.classList.toggle('hidden', !needsKey);
  keyTip.classList.toggle('hidden', !needsKey);

  switch (ai.mode) {
    case 'live':
      tag.textContent = `DeepSeek 已接通（服务端代理）· ${ai.model}`;
      tag.className = 'mode-tag live';
      break;
    case 'mock':
      tag.textContent = '演示模式（服务端没配 Key，居民用预置台词）';
      tag.className = 'mode-tag mock';
      break;
    case 'static':
      tag.textContent = `浏览器直连 DeepSeek · ${ai.model}`;
      tag.className = 'mode-tag direct';
      break;
    default:
      tag.textContent = '演示模式（纯静态托管，填个 Key 就能用真模型）';
      tag.className = 'mode-tag err';
  }

  if (needsKey) {
    const saved = ai.getKey();
    keyInput.value = saved;
    keyInput.placeholder = saved ? '已保存，重新粘贴可覆盖' : 'sk-… 粘贴你自己的 DeepSeek Key';
  }
}

function startGame() {
  const fresh = !loadGame();
  document.getElementById('startScreen').classList.add('hidden');

  loadScene(state.sceneId, {});
  hud.refresh();

  running = true;
  last = performance.now();
  requestAnimationFrame(loop);

  hud.toast(`早上好 · ${getScene(state.sceneId).name}`);
  setTimeout(() => {
    const res = getCharacter(getScene(state.sceneId).resident);
    const met = state.met.has(res.id);
    hud.toast(`${res.name}：${met ? res.name + '又见到你了' : res.name + '在那儿等着你'}`);
  }, 1200);
  if (fresh) {
    setTimeout(() => hud.toast('走近苹果树按 空格 摘苹果'), 2400);
    setTimeout(() => hud.toast('按 M 看小镇地图，Tab 看档案'), 3600);
  } else {
    setTimeout(() => hud.toast(`欢迎回来 · 背包 ${state.apples} 个苹果`), 2400);
  }

  window.addEventListener('beforeunload', () => saveGame());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame();
  });
}

/* 立刻启动引导（不确定玩家什么时候点开始，所以先把 UI 挂上） */
boot();

/* ------------------------------------------------------------------ */
/* 调试/测试接口（tools/sim.mjs 靠它驱动游戏）                          */
/* ------------------------------------------------------------------ */
export const __debug = {
  loadScene,
  isRunning: () => running,
  /** 当前醒着的 Agent id（用来验证「只唤醒本场景」） */
  awakeIds: () => [...agents.awake.keys()],
  /** Agent 管理器本体（测试用） */
  getAgents: () => agents,
  /** 当前场景应有的居民 id */
  sceneResidentIds: () => sceneResidents(world.scene).map((c) => c.id),
  hudLocked: () => hud.locked,
  busy: () => dialog.open || hud.modalOpen || transition.active || hud.locked,
  getWorld: () => world,
  getNpcs: () => npcs,
  getPlayerPos: () => ({ x: player.x, y: player.y }),
  openDialogWith,
  sendToNpc,
  giftApple,
  closeDialog,
  doInteraction,
  /** 手动触发某条传送点（等价于玩家踩上去） */
  triggerPortal: (gate) => transition.start(gate, world.scene.id),
  /**
   * 站到第一棵结果的苹果树下面，走**真实的交互判定**去摘它。
   * 测试要用真路径，不然测了等于没测。
   */
  harvestNearestApple() {
    const tree = world.appleTrees.find((t) => !state.treePicked[t.key]);
    if (!tree) return false;
    player.placeAt(tree.tx * TILE + TILE / 2, tree.ty * TILE + TILE * 2 - 2);
    player.face('up');
    const hit = findInteraction({ player, world, npcs, state });
    if (!hit || hit.kind !== 'apple') return false;
    doInteraction(hit);
    return true;
  },
};

export { resetGame };
