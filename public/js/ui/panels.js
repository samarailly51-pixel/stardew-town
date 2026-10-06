/**
 * 弹窗面板：小镇地图 / 农场档案
 * ------------------------------------------------------------------
 * 地图不只是好看：已经去过的场景可以直接「快速前往」，
 * 省得为了找一个人再横穿五个场景。没去过的地方显示成「？？？」，
 * 保留一点探索的意思。
 */
import { SCENE_LIST, getScene } from '../world/scenes.js';
import { CHARACTERS, getCharacter, heartsStr, heartsOf } from '../world/characters.js';
import { state, globalExplore } from '../game/state.js';
import { portraitFor } from './dialog.js';
import { ai } from '../ai/client.js';

/** 把卡片里的 <canvas data-portrait="id"> 真正画上头像 */
function paintPortraits(root) {
  root.querySelectorAll('canvas[data-portrait]').forEach((cv) => {
    const c = CHARACTERS.find((x) => x.id === cv.dataset.portrait);
    if (!c) return;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(portraitFor(c), 0, 0, cv.width, cv.height);
  });
}

export function openMap(hud, { onTravel }) {
  const cells = SCENE_LIST.map((s) => {
    const here = state.sceneId === s.id;
    const visited = state.visited.has(s.id);
    const res = s.resident ? getCharacter(s.resident) : null;
    const met = res ? state.met.has(res.id) : false;
    const name = visited ? s.name : '？？？';
    const sub = visited ? s.en : '尚未到过';
    const who = !res ? '' : met ? `${res.name} · ${res.title}` : visited ? '有人住在这儿' : '';
    return `
      <div class="map-cell ${here ? 'here' : ''}" data-scene="${s.id}" data-visited="${visited}">
        ${here ? '<span class="badge">📍在这</span>' : visited ? '<span class="badge">已去过</span>' : ''}
        <span class="mn">${name}</span>
        <span class="md">${sub}</span>
        ${who ? `<div class="md">${who}</div>` : ''}
        ${visited && !here ? '<div class="md" style="margin-top:4px;color:#4a8b3b;font-weight:700">点击快速前往 ›</div>' : ''}
      </div>`;
  }).join('');

  const visitedCount = state.visited.size;
  const totalSp = SCENE_LIST.reduce((n, s) => n + (s.sparkles ?? []).length, 0);
  const foundSp = state.discovered.size;

  hud.openModal(
    '小镇地图',
    `
    <div class="section-title">走到过 ${visitedCount} / ${SCENE_LIST.length} 个地方 · 调查点 ${foundSp} / ${totalSp} · 总探索度 ${Math.round(globalExplore(SCENE_LIST) * 100)}%</div>
    <div class="map-grid">${cells}</div>
    <div class="dlg-tips" style="margin-top:10px">
      提示：点「快速前往」会直接过去，路上不会遇到人；想看引路动画就走过去。
    </div>
    `,
  );

  hud.el.modalBody.querySelectorAll('.map-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      const id = cell.dataset.scene;
      if (cell.dataset.visited !== 'true') {
        hud.toast('那个地方你还没去过');
        return;
      }
      if (id === state.sceneId) {
        hud.toast('你已经在这儿了');
        return;
      }
      hud.closeModal();
      onTravel?.(id);
    });
  });
}

export function openArchive(hud) {
  const totalTokens = state.usage.promptTokens + state.usage.completionTokens;
  const saved = state.usage.cached + state.usage.mock;

  const stats = `
    <div class="res-grid">
      <div class="res-card"><div><div class="rn">🍎 苹果</div><div class="rt">背包里的收成</div></div><div class="rh">${state.apples}</div></div>
      <div class="res-card"><div><div class="rn">🪙 金币</div><div class="rt">收购站换来的</div></div><div class="rh">${state.coins}</div></div>
      <div class="res-card"><div><div class="rn">💛 认识的居民</div><div class="rt">共 ${CHARACTERS.length} 位</div></div><div class="rh">${state.met.size}</div></div>
      <div class="res-card"><div><div class="rn">🗺️ 走过的场景</div><div class="rt">共 ${SCENE_LIST.length} 个</div></div><div class="rh">${state.visited.size}</div></div>
      <div class="res-card"><div><div class="rn">🔍 调查点</div><div class="rt">发光的小东西</div></div><div class="rh">${state.discovered.size}</div></div>
      <div class="res-card"><div><div class="rn">💬 对话轮数</div><div class="rt">跟居民说过的话</div></div><div class="rh">${state.chats}</div></div>
    </div>`;

  const usage = `
    <div class="res-grid">
      <div class="res-card"><div><div class="rn">模型调用</div><div class="rt">真正发出去的请求</div></div><div class="rh">${state.usage.calls}</div></div>
      <div class="res-card"><div><div class="rn">Token 合计</div><div class="rt">输入+输出</div></div><div class="rh">${totalTokens}</div></div>
      <div class="res-card"><div><div class="rn">省下的次数</div><div class="rt">缓存命中 + 演示模式</div></div><div class="rh">${saved}</div></div>
      <div class="res-card"><div><div class="rn">当前模型</div><div class="rt">${{
        live: '已接通（服务端代理）',
        static: '已接通（浏览器直连）',
        mock: '演示模式（预置台词）',
        offline: '演示模式（预置台词）',
      }[ai.mode] ?? '检测中'}</div></div><div class="rh" style="font-size:.85em">${ai.model ?? '—'}</div></div>
    </div>
    <div class="dlg-tips" style="margin-top:8px">
      省 Token 的三条规则：① 只有你所在场景的居民会被唤醒；
      ② 打招呼和重复问题都走本地/缓存；③ 每人只保留最近 3 轮对话。
    </div>`;

  const friends = CHARACTERS.map((c) => {
    const known = state.met.has(c.id);
    const hearts = heartsOf(state.affection[c.id] ?? 0);
    const scene = getScene(c.scene);
    return `
      <div class="res-card ${known ? '' : 'locked'}">
        <canvas width="40" height="40" data-portrait="${c.id}"></canvas>
        <div>
          <div class="rn">${known ? c.name : '？？？'}</div>
          <div class="rt">${known ? c.title : '还没见过'}</div>
          <div class="rt">${known ? scene.name : '住在一个你没去过的地方'}</div>
        </div>
        <div class="rh">${known ? heartsStr(hearts * 25) : ''}</div>
      </div>`;
  }).join('');

  hud.openModal(
    '农场档案',
    `
    <div class="section-title">收成与足迹</div>
    ${stats}
    <div class="section-title">模型用量（省 Token 的证据）</div>
    ${usage}
    <div class="section-title">居民名册</div>
    <div class="res-grid">${friends}</div>
    `,
  );
  paintPortraits(hud.el.modalBody);
}

export { paintPortraits };
