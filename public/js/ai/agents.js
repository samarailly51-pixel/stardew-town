/**
 * Agent 管理器 —— 省 Token 的核心
 * ------------------------------------------------------------------
 * 20 位居民如果一开局全部「在线」，不但费 Token，还费上下文。
 * 这里的规则是：
 *
 *   1. 只有玩家**当前所在场景**的居民会被实例化（wake），
 *      离开场景立刻销毁（sleep）。面板上能实时看到 1/20、3/20 在跳。
 *   2. 打招呼用本地预置台词，不花 Token。
 *   3. 每人的对话历史最多留 3 轮（6 条），再老的直接丢。
 *   4. 同一句话问第二遍走缓存，零 Token。
 *   5. 演示模式 / 断网 → 一次模型请求都不发，全用预置台词。
 */
import { ai, estimateTokens } from './client.js';
import { CHARACTERS, heartsOf } from '../world/characters.js';
import { state } from '../game/state.js';
import { getScene } from '../world/scenes.js';

const HISTORY_MAX = 6;     // 3 轮
const CACHE_MAX = 80;      // 回复缓存条数

/** 把玩家说的话归一化，用于缓存命中判断 */
function normalize(text) {
  return String(text).trim().toLowerCase().replace(/\s+/g, '').slice(0, 60);
}

export class Agent {
  constructor(character) {
    this.character = character;
    this.id = character.id;
    this.history = [];
    this.status = 'idle';       // idle | thinking
    this.error = null;
    /** 这个 agent 从被唤醒到现在花掉的 token */
    this.tokens = 0;
    this.calls = 0;
    this.cacheHits = 0;
    this.lineIndex = 0;
  }

  get name() {
    return this.character.name;
  }

  /** 组装 system prompt —— 人设 + 小镇状态，让回答「记得住事」 */
  buildPersona(ctx = {}) {
    const c = this.character;
    const scene = getScene(c.scene);
    const hearts = heartsOf(state.affection[c.id] ?? 0);
    const neighbors = (scene.portals ?? [])
      .map((p) => `往${sideName(p.side)}是${getScene(p.to).name}`)
      .join('；');
    const lines = [
      `你是《苹果小镇》里的居民「${c.name}」，身份是${c.title}。现在你人在【${scene.name}】。`,
      '',
      `【你的性格与说话方式】${c.persona}`,
      `【你的背景】${c.about}`,
      `【你最喜欢】${c.likes}`,
      `【你熟悉的路】${neighbors || '（你不太出门）'}`,
      '',
      `【此刻的小镇】玩家是一位刚来小镇的旅人。他背包里有 ${state.apples} 个苹果，`,
      `和你的好感度是 ${hearts} 颗心（满 5 心）。现在时间 ${ctx.clock ?? '白天'}。`,
      hearts >= 3 ? `【心里话】你已经挺信任他了，可以适当说出你藏着的那件事。` : '',
      '',
      '【必须遵守】',
      '1. 只说 1~2 句话，总共不超过 50 个汉字。',
      '2. 用口语，像邻居闲聊，别用书面腔，别用「首先其次」。',
      '3. 不要 emoji，不要括号里的动作描写，不要提自己是 AI 或模型。',
      '4. 不要复述玩家的问题，直接回答。',
      '5. 玩家问到小镇以外的事、或你不知道的事，就照实说不知道，别编。',
      '6. 你可以自然地提到苹果、天气、邻居、你手上正在做的活。',
    ].filter(Boolean);
    return lines.join('\n');
  }

  /** 本地预置台词（打招呼、演示模式、请求失败时都用它） */
  nextLocalLine() {
    const lines = this.character.lines ?? [];
    if (!lines.length) return '……嗯。';
    const line = lines[this.lineIndex % lines.length];
    this.lineIndex++;
    return line;
  }

  /** 记录一轮对话，超长就丢掉最老的 */
  push(role, content) {
    this.history.push({ role, content });
    if (this.history.length > HISTORY_MAX) {
      this.history.splice(0, this.history.length - HISTORY_MAX);
    }
  }

  clear() {
    this.history.length = 0;
    this.lineIndex = 0;
    this.error = null;
  }
}

function sideName(side) {
  return { west: '西边', east: '东边', north: '北边', south: '南边' }[side] ?? '前面';
}

/* ================================================================== */

export class AgentManager {
  constructor() {
    /** 当前在线的 agent：id -> Agent */
    this.awake = new Map();
    /** 当前唤醒的是哪个场景 */
    this.sceneId = null;
    /** 回复缓存：归一化问题 -> 回复 */
    this.cache = new Map();
    /** 唤醒/休眠时的回调，给 UI 刷新面板 */
    this.onChange = null;
    /** 累计「因为换场景而没被唤醒」的居民数，用于展示省了多少 */
    this.skipped = 0;
  }

  get count() {
    return this.awake.size;
  }

  get totalTokens() {
    return state.usage.promptTokens + state.usage.completionTokens;
  }

  /**
   * 进入场景：唤醒该场景的居民。
   * 之前场景的 agent 全部销毁 —— 这就是「按需启动」。
   */
  wakeScene(scene) {
    if (this.sceneId === scene.id && this.awake.size) return this.awake;
    const before = this.awake.size;
    this.sleepAll();

    const here = (scene.resident ? [scene.resident] : []);
    // 场景里可能还有「来访」的居民，这里先只按 resident 唤醒
    const all = sceneResidents(scene);
    for (const c of all) {
      this.awake.set(c.id, new Agent(c));
    }
    this.sceneId = scene.id;
    // 记录一下「这次只唤醒了 N 个，另外 20-N 个在睡觉」
    this.skipped += Math.max(0, ALL_COUNT - all.length);
    void before;

    this.onChange?.({
      type: 'wake',
      sceneId: scene.id,
      awake: [...this.awake.values()],
      all: ALL_COUNT,
    });
    return this.awake;
  }

  /** 离开场景：销毁全部 agent（历史一并丢掉，不占内存也不占上下文） */
  sleepAll() {
    if (!this.awake.size) return;
    const ids = [...this.awake.keys()];
    this.awake.clear();
    this.onChange?.({ type: 'sleep', ids });
  }

  get(id) {
    return this.awake.get(id) ?? null;
  }

  /**
   * 让某位居民回应一句话。
   * @returns {Promise<{text:string, source:'model'|'cache'|'local'|'error', error?:string}>}
   */
  async reply(npcId, userText, ctx = {}) {
    const agent = this.awake.get(npcId);
    if (!agent) return { text: '（他好像不在这个场景）', source: 'local' };

    /* ---- 演示模式 / 断网：完全不发请求 ---- */
    if (!ai.ready) {
      state.usage.mock++;
      const text = agent.nextLocalLine();
      agent.push('user', userText);
      agent.push('assistant', text);
      return { text, source: 'local' };
    }

    /* ---- 缓存命中：同一个问题问第二遍，零成本 ---- */
    const key = `${npcId}|${normalize(userText)}`;
    if (this.cache.has(key)) {
      const text = this.cache.get(key);
      agent.cacheHits++;
      state.usage.cached++;
      agent.push('user', userText);
      agent.push('assistant', text);
      return { text, source: 'cache' };
    }

    /* ---- 真的去问模型 ---- */
    agent.status = 'thinking';
    agent.error = null;
    this.onChange?.({ type: 'thinking', id: npcId, value: true });

    const persona = agent.buildPersona(ctx);
    const messages = [...agent.history, { role: 'user', content: userText }];

    try {
      const res = await ai.chat({ persona, messages, scene: ctx.sceneName });
      const text = res.reply || agent.nextLocalLine();

      state.usage.calls++;
      agent.calls++;
      const pt = res.usage?.prompt_tokens ?? estimateTokens(persona + JSON.stringify(messages));
      const ct = res.usage?.completion_tokens ?? estimateTokens(text);
      state.usage.promptTokens += pt;
      state.usage.completionTokens += ct;
      agent.tokens += pt + ct;

      agent.push('user', userText);
      agent.push('assistant', text);

      this.cache.set(key, text);
      if (this.cache.size > CACHE_MAX) {
        this.cache.delete(this.cache.keys().next().value);
      }

      agent.status = 'idle';
      this.onChange?.({ type: 'thinking', id: npcId, value: false });
      return { text, source: 'model' };
    } catch (err) {
      agent.status = 'idle';
      agent.error = String(err?.message ?? err);
      this.onChange?.({ type: 'thinking', id: npcId, value: false });
      // 出错了也别让对话卡住：退回预置台词，并如实标注
      return { text: agent.nextLocalLine(), source: 'error', error: agent.error };
    }
  }
}

/* ------------------------------------------------------------------ */

const ALL_COUNT = CHARACTERS.length;

/** 某个场景里的居民（目前一人一场景，这里留好扩展位） */
function sceneResidents(scene) {
  return CHARACTERS.filter((c) => c.scene === scene.id);
}

export { ALL_COUNT, sceneResidents };
