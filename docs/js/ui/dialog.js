/**
 * 对话框
 * ------------------------------------------------------------------
 * 结构：头像 + 名字 + 好感度 + 正文 + 输入框 + 送苹果 + 关闭。
 *
 * 两个细节值得说：
 *   · 正文用打字机逐字出现，说话「有节奏」；
 *   · 每句话都标来源（模型 / 缓存 / 预置台词），
 *     演示模式或接口出错时不会假装那是模型说的。
 */
import { makePortrait } from '../art/sprites.js';
import { heartsStr } from '../world/characters.js';
import { state } from '../game/state.js';

const $ = (id) => document.getElementById(id);

const portraitCache = new Map();

export function portraitFor(character) {
  if (!portraitCache.has(character.id)) {
    portraitCache.set(character.id, makePortrait(character.pal ?? {}));
  }
  return portraitCache.get(character.id);
}

const SOURCE_TAG = {
  model: '',
  cache: '缓存',
  local: '预置台词',
  error: '接口不通·预置台词',
  greet: '开场',
};

export const dialog = {
  el: {},
  npc: null,
  typing: null,
  pending: false,

  init({ onSend, onGift, onClose }) {
    this.el = {
      root: $('dialog'),
      portrait: $('portrait'),
      name: $('dlgName'),
      title: $('dlgTitle'),
      hearts: $('dlgHearts'),
      text: $('dlgText'),
      input: $('dlgInput'),
      send: $('dlgSend'),
      gift: $('dlgGift'),
      close: $('dlgClose'),
      tips: $('dlgTips'),
    };

    this.el.send.addEventListener('click', () => this._submit(onSend));
    this.el.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._submit(onSend);
      }
    });
    this.el.gift.addEventListener('click', () => onGift?.(this.npc));
    this.el.close.addEventListener('click', () => onClose?.(this.npc));
  },

  get open() {
    return !this.el.root.classList.contains('hidden');
  },

  _submit(onSend) {
    if (this.pending) return;
    const text = this.el.input.value.trim();
    if (!text) return;
    this.el.input.value = '';
    onSend?.(this.npc, text);
  },

  /**
   * 打开对话框。
   * @param {object} npc   game/npc.js 的 Npc
   * @param {string} greet 开场白（本地台词，不花 token）
   */
  openDialog(npc, greet) {
    this.npc = npc;
    const c = npc.character;
    const cv = this.el.portrait;
    const img = portraitFor(c);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);

    this.el.name.textContent = c.name;
    this.el.title.textContent = c.title;
    this.refreshHearts();
    this.el.root.classList.remove('hidden');
    this.el.input.disabled = false;
    this.el.send.disabled = false;
    this.el.gift.disabled = state.apples <= 0;
    this.el.gift.textContent = state.apples > 0 ? `🍎 送苹果（${state.apples}）` : '🍎 没有苹果';
    this.el.tips.textContent = '回车发送 · Esc 结束对话 · 送苹果能涨好感度';
    this.pending = false;
    this.typeOut(greet, 'greet');
  },

  refreshHearts() {
    if (!this.npc) return;
    this.el.hearts.textContent = heartsStr(state.affection[this.npc.id] ?? 0);
    this.el.gift.disabled = state.apples <= 0;
    this.el.gift.textContent = state.apples > 0 ? `🍎 送苹果（${state.apples}）` : '🍎 没有苹果';
  },

  /** 打字机效果 */
  typeOut(text, source = 'model') {
    this.cancelTyping();
    const tag = SOURCE_TAG[source] ?? '';
    this.el.text.innerHTML = '';
    if (tag) {
      const s = document.createElement('span');
      s.className = 'tag';
      s.textContent = tag;
      this.el.text.appendChild(s);
    }
    const span = document.createElement('span');
    this.el.text.appendChild(span);

    let i = 0;
    const speed = source === 'greet' ? 26 : 34;   // 毫秒/字
    this.typing = setInterval(() => {
      i++;
      span.textContent = text.slice(0, i);
      this.el.text.scrollTop = this.el.text.scrollHeight;
      if (i >= text.length) this.cancelTyping();
    }, speed);
    this.pending = false;
    this.el.input.disabled = false;
    this.el.send.disabled = false;
  },

  showThinking() {
    this.cancelTyping();
    this.el.text.innerHTML = '<span class="thinking">……想了想</span>';
    this.pending = true;
    this.el.input.disabled = true;
    this.el.send.disabled = true;
  },

  showError(message) {
    this.cancelTyping();
    this.el.text.innerHTML = '';
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = '出错了';
    const t = document.createElement('span');
    t.textContent = message;
    this.el.text.append(s, t);
    this.pending = false;
    this.el.input.disabled = false;
    this.el.send.disabled = false;
  },

  cancelTyping() {
    if (this.typing) {
      clearInterval(this.typing);
      this.typing = null;
    }
  },

  closeDialog() {
    this.cancelTyping();
    this.npc = null;
    this.pending = false;
    this.el.root.classList.add('hidden');
  },

  /** 玩家说完一句，立刻把这句话显示出来，像真的在对话 */
  echoPlayer(text) {
    this.cancelTyping();
    this.el.text.innerHTML = '';
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = '你说';
    const t = document.createElement('span');
    t.textContent = text;
    this.el.text.append(s, t);
  },
};
