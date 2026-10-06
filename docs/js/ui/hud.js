/**
 * HUD / 提示 / 过渡幕 / 弹窗
 * ------------------------------------------------------------------
 * 世界里的一切画在 canvas 上，所有文字都走 DOM —— 中文更清晰，
 * 也方便用 CSS 做缩放和响应式。
 */
import { state, clockStr, metCount, exploreRatio } from '../game/state.js';
import { heartsStr, CHARACTERS } from '../world/characters.js';

const $ = (id) => document.getElementById(id);

export const hud = {
  el: {},
  _toastTimer: null,

  init() {
    this.el = {
      sceneName: $('sceneName'),
      sceneSub: $('sceneSub'),
      exploreBar: $('exploreBar'),
      exploreText: $('exploreText'),
      appleCount: $('appleCount'),
      coinCount: $('coinCount'),
      friendCount: $('friendCount'),
      apScene: $('apScene'),
      apCount: $('apCount'),
      apList: $('apList'),
      apTokens: $('apTokens'),
      agentPanel: $('agentPanel'),
      hint: $('hint'),
      hintText: $('hintText'),
      toasts: $('toasts'),
      transition: $('transition'),
      trGuide: $('trGuide'),
      trText: $('trText'),
      trHint: $('trHint'),
      modal: $('modal'),
      modalTitle: $('modalTitle'),
      modalBody: $('modalBody'),
      modalClose: $('modalClose'),
      flash: $('flash'),
    };
    this.el.modalClose.addEventListener('click', () => this.closeModal());
    this.el.modal.addEventListener('click', (e) => {
      if (e.target === this.el.modal) this.closeModal();
    });
  },

  /* ---------------- 顶部信息 ---------------- */

  setScene(scene) {
    this.el.sceneName.textContent = scene.name;
    this.el.sceneSub.textContent = scene.en;
    this.refresh();
  },

  refreshExplore(scene) {
    const r = scene ? exploreRatio(scene) : 0;
    this.el.exploreBar.style.width = `${Math.round(r * 100)}%`;
    this.el.exploreText.textContent = `探索度 ${Math.round(r * 100)}%`;
  },

  refresh() {
    this.el.appleCount.textContent = state.apples;
    this.el.coinCount.textContent = state.coins;
    this.el.friendCount.textContent = `${metCount()}/${CHARACTERS.length}`;
  },

  /* ---------------- Agent 面板 ---------------- */

  setAgents(sceneId, awake, all) {
    this.el.apScene.textContent = '本场景 Agent';
    this.el.apCount.textContent = `${awake.length} / ${all}`;
    this.el.apList.innerHTML = '';
    for (const a of awake) {
      const li = document.createElement('li');
      li.dataset.id = a.id;
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = a.character.pal?.shirt ?? '#888';
      const nm = document.createElement('span');
      nm.textContent = a.name;
      const st = document.createElement('span');
      st.className = 'st';
      st.textContent = '待机';
      li.append(sw, nm, st);
      this.el.apList.appendChild(li);
    }
    void sceneId;
    this.refreshTokens();
  },

  setAgentState(id, thinking) {
    const li = this.el.apList.querySelector(`li[data-id="${id}"] .st`);
    if (li) li.textContent = thinking ? '思考中…' : '待机';
  },

  refreshTokens() {
    const t = state.usage.promptTokens + state.usage.completionTokens;
    const extra = state.usage.cached + state.usage.mock;
    this.el.apTokens.textContent = extra ? `${t} (省 ${extra})` : String(t);
  },

  /* ---------------- 交互提示 ---------------- */

  showHint(text) {
    if (this.el.hintText.textContent !== text) this.el.hintText.textContent = text;
    this.el.hint.classList.remove('hidden');
  },

  hideHint() {
    this.el.hint.classList.add('hidden');
  },

  /* ---------------- 飘字 ---------------- */

  toast(msg) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), 2000);
    // 最多同时留 4 条
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  },

  /** 摘苹果时闪一下白，给一点「手感」 */
  flash() {
    this.el.flash.classList.add('on');
    setTimeout(() => this.el.flash.classList.remove('on'), 60);
  },

  /* ---------------- 过渡幕 ---------------- */

  showTransition({ guide, text, hint, lead }) {
    this.el.trGuide.textContent = guide ?? '';
    this.el.trText.textContent = text ?? '';
    this.el.trHint.textContent = hint ?? '';
    this.el.transition.classList.toggle('lead', !!lead);
    this.el.transition.classList.remove('hidden');
  },

  fadeTransition(opacity) {
    this.el.transition.style.opacity = String(opacity);
  },

  hideTransition() {
    this.el.transition.classList.add('hidden');
    this.el.transition.classList.remove('lead');
    this.el.transition.style.opacity = '';
  },

  /* ---------------- 弹窗 ---------------- */

  openModal(title, html) {
    this.el.modalTitle.textContent = title;
    this.el.modalBody.innerHTML = html;
    this.el.modal.classList.remove('hidden');
  },

  closeModal() {
    this.el.modal.classList.add('hidden');
  },

  get modalOpen() {
    return !this.el.modal.classList.contains('hidden');
  },

  /* ---------------- 输入锁 ---------------- */

  setInputLocked(v) {
    this.locked = v;
  },

  /* ---------------- 小工具 ---------------- */

  /** 生成一屏「档案卡」HTML（居民列表 / 好感度） */
  residentCards(list, filterFn) {
    return list
      .map((c) => {
        const hearts = heartsStr(state.affection[c.id] ?? 0);
        const known = state.met.has(c.id);
        const locked = filterFn ? filterFn(c) : !known;
        return `
          <div class="res-card ${locked ? 'locked' : ''}">
            <canvas width="40" height="40" data-portrait="${c.id}"></canvas>
            <div>
              <div class="rn">${locked ? '？？？' : c.name}</div>
              <div class="rt">${locked ? '还没见过' : c.title}</div>
            </div>
            <div class="rh">${locked ? '' : hearts}</div>
          </div>`;
      })
      .join('');
  },
};

export { clockStr };
