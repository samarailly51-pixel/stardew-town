/**
 * DeepSeek 客户端（两种部署方式，一套代码）
 * ------------------------------------------------------------------
 * 页面启动时会探一下 `/api/health`，然后自动切到其中一种模式：
 *
 *   有后端（本地 npm start / 自己的服务器）
 *     live    服务端配了 Key  → 走 /api/chat 代理，Key 只留在服务端
 *     mock    服务端没配 Key  → 不调模型，用居民自带的预置台词
 *
 *   纯静态托管（GitHub Pages，跑不了 Node）
 *     static  访客自己填了 Key → 浏览器直连 api.deepseek.com
 *                                Key 存在访客自己的 localStorage 里，站长永远看不到
 *     offline 访客没填 Key     → 预置台词
 *
 * mock / offline 下**一次模型请求都不发**，Token 为 0 —— 这是刻意的：
 * 断网、没 Key、课堂投屏翻车，玩法照样完整跑通，而且不会假装那是模型说的话。
 *
 * 之所以 static 模式可行，是因为 DeepSeek 的 API 开放了 CORS：
 *   access-control-allow-origin: <请求方的 Origin>
 *   access-control-allow-headers: authorization,content-type
 */

const TIMEOUT_MS = 30_000;
const KEY_STORE = 'apple-town-deepseek-key';

/** 直连模式下的默认参数（跟服务端保持一致） */
export const DIRECT_DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 1.1,
  maxTokens: 160,
};

export const ai = {
  /** 'unknown' | 'live' | 'mock' | 'static' | 'offline' */
  mode: 'unknown',
  model: null,
  lastError: null,

  /** 现在能问模型吗 */
  get ready() {
    return this.mode === 'live' || this.mode === 'static';
  },

  /** 现在走的是不是「访客自带 Key」的直连模式 */
  get isDirect() {
    return this.mode === 'static';
  },

  /* ---------------- 访客的 Key（只在浏览器本地） ---------------- */

  getKey() {
    try {
      return localStorage.getItem(KEY_STORE) ?? '';
    } catch {
      return '';
    }
  },

  setKey(key) {
    try {
      const v = String(key ?? '').trim();
      if (v) localStorage.setItem(KEY_STORE, v);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      /* 无痕模式下 localStorage 可能不可用，忽略 */
    }
    return this.getKey();
  },

  hasKey() {
    return /^sk-\S{10,}$/.test(this.getKey());
  },

  /* ---------------- 探测 ---------------- */

  /** 启动时探一次：有没有后端？后端有没有 Key？ */
  async probe() {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.mode = data.mock ? 'mock' : 'live';
      this.model = data.model ?? null;
      this.lastError = null;
    } catch (err) {
      // 没有后端（比如 GitHub Pages）→ 看访客有没有自带 Key
      this.mode = this.hasKey() ? 'static' : 'offline';
      this.model = this.mode === 'static' ? DIRECT_DEFAULTS.model : null;
      this.lastError = String(err?.message ?? err);
    }
    return this.mode;
  },

  /** 自检：真的发一次最小请求，用人话告诉你结论 */
  async verify() {
    if (this.mode === 'static' || this.mode === 'offline') {
      return this._verifyDirect();
    }
    try {
      const res = await fetch('/api/verify', { signal: AbortSignal.timeout(35_000) });
      return await res.json();
    } catch (err) {
      return {
        ok: false,
        mock: false,
        message: '连不上本地服务',
        hint: '双击项目里的「启动.bat」，或者命令行跑 npm start，然后用 http://localhost:3100 打开',
        detail: String(err?.message ?? err),
      };
    }
  },

  async _verifyDirect() {
    const key = this.getKey();
    if (!key) {
      return {
        ok: false,
        mock: false,
        static: true,
        message: '这是纯静态托管（没有后端），需要你自己填一个 DeepSeek Key',
        hint: 'Key 只会存在你这台电脑的浏览器里，不会上传到任何服务器。申请地址：https://platform.deepseek.com/api_keys',
      };
    }
    const started = Date.now();
    try {
      const data = await this._postDirect(key, {
        messages: [{ role: 'user', content: '只回复两个字：收到' }],
        max_tokens: 16,
      });
      return {
        ok: true,
        mock: false,
        static: true,
        model: data.model ?? DIRECT_DEFAULTS.model,
        keyPrefix: key.slice(0, 6) + '****',
        reply: (data?.choices?.[0]?.message?.content ?? '').trim(),
        latencyMs: Date.now() - started,
        usage: data.usage,
        message: 'Key 有效，浏览器已直连 DeepSeek',
      };
    } catch (err) {
      return {
        ok: false,
        mock: false,
        static: true,
        status: err.status,
        message: err.message,
        hint: err.status === 401
          ? 'Key 不对。注意不要有多余空格或引号，也不要漏掉开头的 sk-'
          : err.status === 402
            ? 'Key 是对的，但账户余额不足，去 platform.deepseek.com 充值'
            : '浏览器直连被挡了（CORS 或网络）。此时会退回预置台词，玩法不受影响。',
      };
    }
  },

  /* ---------------- 请居民说话 ---------------- */

  /**
   * @param {{persona:string, messages:Array<{role:string,content:string}>, scene?:string}} o
   * @returns {Promise<{reply:string, mock:boolean, usage?:object}>}
   */
  async chat({ persona, messages, scene }) {
    /* ---- 演示 / 没配 Key：一次请求都不发 ---- */
    if (!this.ready) return { reply: '', mock: true, usage: null };

    /* ---- 纯静态托管：浏览器直连 ---- */
    if (this.mode === 'static') {
      const system = [
        { role: 'system', content: persona },
        ...(scene ? [{ role: 'system', content: `（当前场景：${scene}）` }] : []),
      ];
      const data = await this._postDirect(this.getKey(), {
        messages: [...system, ...messages],
      });
      return {
        reply: (data?.choices?.[0]?.message?.content ?? '').trim(),
        mock: false,
        usage: data.usage,
        model: data.model,
      };
    }

    /* ---- 有后端：走后端代理（Key 不落浏览器） ---- */
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona, messages, scene }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || `请求失败（${res.status}）`);
      err.detail = data?.detail;
      throw err;
    }
    return { reply: (data.reply ?? '').trim(), mock: !!data.mock, usage: data.usage };
  },

  /** 直连 DeepSeek。失败时抛出的 Error 上带 status，方便区分 401 / 402 / 429 */
  async _postDirect(key, { messages, max_tokens = DIRECT_DEFAULTS.maxTokens }) {
    let res;
    try {
      res = await fetch(`${DIRECT_DEFAULTS.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: DIRECT_DEFAULTS.model,
          messages,
          temperature: DIRECT_DEFAULTS.temperature,
          max_tokens,
          stream: false,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const e = new Error(err?.name === 'TimeoutError' ? '请求超时' : '连不上 DeepSeek');
      e.status = 0;
      throw e;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data?.error?.message || `DeepSeek 返回 ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return data;
  },
};

/** 估算 token：中文大概 1.6 字一个 token，只在服务端没返回 usage 时兜底 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 1.6);
}
