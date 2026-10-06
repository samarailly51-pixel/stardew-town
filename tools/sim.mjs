/**
 * 端到端仿真（不需要浏览器）
 * ------------------------------------------------------------------
 * 用 harness 的 DOM/Canvas 桩把真的 main.js 跑起来：
 *   · 遍历全部 20 个场景，每个都实例化 + 渲染
 *   · 模拟走路、摘苹果、跟居民说话、逐个走传送点换场景
 *   · 断言「只有当前场景的 Agent 醒着」「演示模式零模型请求」
 *   · Canvas 桩会校验每个绘制调用的参数，所以「画的时候炸了」也能抓到
 *
 *   node tools/sim.mjs
 */
import { installDom } from './harness.mjs';

const problems = [];
const notes = [];
const ok = (m) => notes.push(m);
const bad = (m) => problems.push(m);

process.on('unhandledRejection', (e) => {
  problems.push('未处理的异步错误：' + String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '));
});

const H = installDom({ raster: false, report: (m) => bad(m) });

const { input } = await import('../public/js/core/input.js');
const { state, saveGame } = await import('../public/js/game/state.js');
const { SCENE_LIST } = await import('../public/js/world/scenes.js');
const main = await import('../public/js/main.js');

await H.idle();
await H.idle();      // 等 boot() 里的 probe 落地

async function walk(dir, seconds) {
  input.held.clear();
  input.held.add(dir);
  await H.frame(Math.round(seconds * 60));
  input.held.clear();
  await H.frame(2);
}

/* ---- 3.1 启动 ---- */
H.clock = performance.now();
if (!H.click('btnStart')) bad('按钮 #btnStart 没注册点击事件');
await H.frame(6);
if (main.__debug.isRunning()) ok('主循环启动成功');
else bad('点了开始按钮，主循环却没跑起来');

/* ---- 3.2 走路 ---- */
{
  H.section = '走路';
  const start = main.__debug.getPlayerPos();
  await walk('right', 0.4);
  await walk('down', 0.4);
  const end = main.__debug.getPlayerPos();
  const moved = Math.hypot(end.x - start.x, end.y - start.y);
  if (moved > 4) ok(`走路正常：(${start.x.toFixed(0)},${start.y.toFixed(0)}) → (${end.x.toFixed(0)},${end.y.toFixed(0)})`);
  else bad(`按方向键走不动（只移动了 ${moved.toFixed(1)}px）`);
}

/* ---- 3.3 摘苹果 ---- */
{
  H.section = '摘苹果';
  const before = state.apples;
  const picked = main.__debug.harvestNearestApple();
  if (picked && state.apples === before + 1) ok(`摘苹果走的是真实交互链路：${before} → ${state.apples}`);
  else bad('摘苹果失败（苹果农场应该有 12 棵结果的苹果树）');
}

/* ---- 3.4 遍历全部 20 个场景 ---- */
{
  H.section = '遍历场景';
  let failed = 0;
  for (const s of SCENE_LIST) {
    try { main.__debug.loadScene(s.id); await H.frame(4); }
    catch (e) { failed++; bad(`场景 ${s.id} 渲染时抛错：${e.message}`); }
  }
  if (!failed) ok('20 个场景全部实例化 + 渲染通过');
}

/* ---- 3.5 逐个走传送点：换场景 + 引路 + Agent 按需唤醒 ---- */
{
  H.section = '走传送点';
  let hops = 0;
  let agentChecks = 0;
  let leadChecks = 0;
  for (const s of SCENE_LIST) {
    main.__debug.loadScene(s.id);
    await H.frame(3);
    const world = main.__debug.getWorld();
    if (!world.gates.length) continue;

    const gate = world.gates[0];
    const gatePx = { x: gate.x * 16 + 8, y: gate.y * 16 + 16 - 2 };
    main.__debug.triggerPortal(gate);
    await H.frame(60 * 9);        // 引路最长约 7 秒

    if (state.sceneId !== gate.to) {
      bad(`从 ${s.id} 走向 ${gate.to} 后，人还停在 ${state.sceneId}`);
      continue;
    }
    hops++;

    // 只有目标场景的居民该醒着 —— 这就是「按需启动 Agent」
    const awake = main.__debug.awakeIds();
    const expect = main.__debug.sceneResidentIds();
    if (awake.length === expect.length && awake.every((id) => expect.includes(id))) agentChecks++;
    else bad(`换到 ${state.sceneId} 后醒着的 Agent 不对：[${awake}]，应为 [${expect}]`);

    // 引路 NPC 应该把玩家从门口往里带几格
    const pp = main.__debug.getPlayerPos();
    const moved = Math.hypot(pp.x - gatePx.x, pp.y - gatePx.y);
    if (moved > 8) leadChecks++;
    else bad(`到达 ${state.sceneId} 后引路 NPC 没把玩家带离门口（只移动了 ${moved.toFixed(1)}px）`);
  }
  ok(`走了 ${hops} 次传送点，全部真实落到目标场景`);
  ok(`${agentChecks}/${hops} 次换场景后，只有本场景的 Agent 被唤醒（其余 19 位在睡觉）`);
  ok(`${leadChecks}/${hops} 次换场景都有 NPC 引路把玩家带进场景`);
  if (state.usage.calls !== 0) bad(`演示模式下竟然发了 ${state.usage.calls} 次模型请求`);
  else ok('整个流程 0 次模型请求（演示模式下 Token 消耗为 0）');
}

/* ---- 3.6 对话（演示模式 → 预置台词） ---- */
{
  H.section = '对话';
  const npc = main.__debug.getNpcs()[0];
  if (!npc) bad('当前场景没有居民实体');
  else {
    main.__debug.openDialogWith(npc);
    if (!main.__debug.busy()) bad('打开对话后，输入没有被锁住（玩家会一边说话一边乱跑）');
    const before = state.chats;
    await main.__debug.sendToNpc(npc, '你好呀，这里是什么地方？');
    await H.frame(4);
    if (state.chats === before + 1) ok(`对话流程走通：${npc.character.name} 用预置台词回答（0 token）`);
    else bad('对话没有计入统计');

    state.apples = 3;
    const affBefore = state.affection[npc.id] ?? 0;
    main.__debug.giftApple(npc);
    await H.frame(2);
    if ((state.affection[npc.id] ?? 0) > affBefore && state.apples === 2) {
      ok(`送苹果正常：好感度 ${affBefore} → ${state.affection[npc.id]}，苹果 3 → ${state.apples}`);
    } else bad('送苹果没有正确生效');

    main.__debug.closeDialog();
    if (main.__debug.busy()) bad('关掉对话后，输入还锁着');
  }
}

/* ---- 3.7 调查点 / 收购站 / 存档 ---- */
{
  H.section = '调查点与收购站';
  main.__debug.loadScene('town_square');
  await H.frame(3);
  const world = main.__debug.getWorld();

  const sp = world.sparkles[0];
  if (sp) {
    const before = state.discovered.size;
    main.__debug.doInteraction({ kind: 'sparkle', target: sp });
    await H.frame(2);
    if (state.discovered.size === before + 1) ok(`调查点生效：已发现 ${state.discovered.size} 个`);
    else bad('调查点没有生效');
  } else bad('小镇广场没有调查点');

  const st = world.stations[0];
  if (st) {
    state.apples = 5;
    const coinBefore = state.coins;
    main.__debug.doInteraction({ kind: 'station', target: st });
    await H.frame(2);
    if (state.apples === 0 && state.coins > coinBefore) {
      ok(`收购站生效：5 个苹果换到 ${state.coins - coinBefore} 金币`);
    } else bad('收购站没有正确结算');
  } else bad('小镇广场没有收购站');

  saveGame();
  ok('存档写入成功');
}

/* ---- 3.8 长时间空跑 ---- */
{
  H.section = '空跑压测';
  main.__debug.loadScene('apple_farm');
  const t0 = Date.now();
  await H.frame(60 * 20);
  ok(`连续跑 1200 帧（约 20 秒游戏时间）无异常，耗时 ${Date.now() - t0} ms`);
}

/* ---- 3.9 纯静态托管（GitHub Pages）：浏览器直连 DeepSeek 的退路 ---- */
{
  H.section = '静态模式';
  const { ai } = await import('../public/js/ai/client.js');

  // 1) 没有后端、也没填 Key → 降级成 offline，一次请求都不发
  ai.setKey('');
  globalThis.fetch = async () => { throw new Error('Failed to fetch'); };
  await ai.probe();
  if (ai.mode === 'offline' && !ai.ready) ok('没有后端也没 Key → 演示模式（离线不报错）');
  else bad(`无后端无 Key 时模式不对：${ai.mode}`);

  // 2) 访客填了自己的 Key → 转成 static，请求直接打给 api.deepseek.com
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, auth: opts.headers?.Authorization, body: opts.body });
    if (u.includes('api.deepseek.com')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          model: 'deepseek-chat',
          choices: [{ message: { content: '哦，是你啊。苹果随便摘，别把枝拽断。' } }],
          usage: { prompt_tokens: 120, completion_tokens: 18 },
        }),
      };
    }
    throw new Error('Failed to fetch');
  };

  ai.setKey('sk-' + 'a'.repeat(28));
  await ai.probe();
  if (ai.mode === 'static' && ai.ready) ok('填了 Key → 自动切到「浏览器直连」模式');
  else bad(`填了 Key 后模式不对：${ai.mode}`);

  // 3) 真的走一遍 Agent → 直连 DeepSeek
  main.__debug.loadScene('apple_farm');
  await H.frame(2);
  const before = { ...state.usage };
  const r = await main.__debug.getAgents().reply('li', '这儿能摘苹果吗？');
  const hit = calls.find((c) => c.url.includes('api.deepseek.com'));
  if (!hit) bad('静态模式下没有发出直连请求');
  else {
    if (hit.auth !== `Bearer ${ai.getKey()}`) bad('直连请求没带上访客的 Key');
    const sent = JSON.parse(hit.body);
    if (!sent.messages?.[0]?.content?.includes('阿栗')) bad('直连请求的 system prompt 里没有带上居民人设');
    else ok('直连请求带上了人设 prompt 和访客自己的 Key');
  }
  if (r.source === 'model' && r.text.includes('苹果')) {
    ok(`静态模式对话走通（来源=${r.source}，模型回复已进入对话历史）`);
  } else bad(`静态模式对话没走通：source=${r.source} text=${r.text}`);

  if (state.usage.calls > before.calls && state.usage.promptTokens > before.promptTokens) {
    ok(`Token 记账正常：调用 ${before.calls} → ${state.usage.calls}，输入 ${state.usage.promptTokens} tokens`);
  } else bad('直连模式的 token 没有被统计');

  // 4) 再问同一句 → 应该命中缓存，不再发请求
  const callsBefore = calls.length;
  const r2 = await main.__debug.getAgents().reply('li', '这儿能摘苹果吗？');
  if (r2.source === 'cache' && calls.length === callsBefore) {
    ok('同一句问第二遍走缓存，零 Token（省 token 的第二条规则生效）');
  } else bad(`缓存没命中：source=${r2.source}，新增请求 ${calls.length - callsBefore} 次`);
}

/* ================================================================== */
/* 结果                                                                */
/* ================================================================== */
console.log('\n仿真结果');
console.log('─'.repeat(66));
for (const n of notes) console.log('  ✅ ' + n);
if (H.drawErrors.length) {
  console.log(`\n绘制参数问题（${H.drawErrors.length}）：`);
  H.drawErrors.slice(0, 20).forEach((e) => console.log('  ⚠ ' + e));
}
if (problems.length) {
  console.log(`\n问题（${problems.length}）：`);
  problems.forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}
if (H.drawErrors.length) process.exit(1);
console.log(`\n✅ 端到端仿真通过：${notes.length} 项检查\n`);
process.exit(0);
