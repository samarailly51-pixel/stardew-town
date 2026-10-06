/**
 * 测试/渲染底座
 * ------------------------------------------------------------------
 * 给 Node 里的游戏提供一套「DOM + Canvas + fetch」的替身：
 *
 *   installDom({ raster:false })  Canvas 什么都不画，只校验参数（跑逻辑测试用，快）
 *   installDom({ raster:true  })  Canvas 真的逐像素画出来（可以导出 PNG 看画面）
 *
 * 之所以自己写个光栅化器，是因为项目里只用了 fillRect / drawImage /
 * ellipse / 多边形填充这几种绘制方式，实现它们比装一个 canvas 原生依赖划算得多，
 * 而且能顺手把「非法坐标」「拿到空图」这类问题在测试里直接抓出来。
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

/* ================================================================== */
/* 颜色解析                                                            */
/* ================================================================== */
const colorCache = new Map();
export function parseColor(str) {
  if (colorCache.has(str)) return colorCache.get(str);
  let out = [0, 0, 0, 255];
  const s = String(str).trim();
  if (s[0] === '#') {
    const hex = s.slice(1);
    if (hex.length === 3) {
      out = [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), 255];
    } else if (hex.length === 6) {
      out = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
    } else if (hex.length === 8) {
      out = [
        parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(6, 8), 16),
      ];
    }
  } else if (s.startsWith('rgb')) {
    const nums = s.match(/[\d.]+/g)?.map(Number) ?? [];
    out = [nums[0] | 0, nums[1] | 0, nums[2] | 0, nums[3] === undefined ? 255 : Math.round(nums[3] * 255)];
  }
  colorCache.set(str, out);
  return out;
}

/* ================================================================== */
/* 光栅画布                                                            */
/* ================================================================== */
class RasterCanvas {
  constructor(w = 1, h = 1) {
    this.__isCanvas = true;
    this._w = Math.max(1, Math.round(w));
    this._h = Math.max(1, Math.round(h));
    this.data = new Uint8ClampedArray(this._w * this._h * 4);
    this._ctx = null;
    this.style = {};
    this.dataset = {};
  }
  get width() { return this._w; }
  set width(v) { this._resize(v, this._h); }
  get height() { return this._h; }
  set height(v) { this._resize(this._w, v); }
  _resize(w, h) {
    this._w = Math.max(1, Math.round(w));
    this._h = Math.max(1, Math.round(h));
    this.data = new Uint8ClampedArray(this._w * this._h * 4);
  }
  getContext() { return (this._ctx ??= new RasterCtx(this)); }
  addEventListener() {}
  removeEventListener() {}
  appendChild() {}
  remove() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this._w, height: this._h }; }
}

class RasterCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this._fill = [0, 0, 0, 255];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.font = '';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = false;
    this._m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this._stack = [];
    this._path = [];
  }

  set fillStyle(v) { this._fill = parseColor(v); }
  get fillStyle() { return this._fill; }

  save() { this._stack.push({ ...this._m, alpha: this.globalAlpha, fill: [...this._fill] }); }
  restore() {
    const s = this._stack.pop();
    if (!s) return;
    this._m = { a: s.a, b: s.b, c: s.c, d: s.d, e: s.e, f: s.f };
    this.globalAlpha = s.alpha;
    this._fill = s.fill;
  }
  translate(x, y) {
    this._m.e += this._m.a * x + this._m.c * y;
    this._m.f += this._m.b * x + this._m.d * y;
  }
  scale(x, y) {
    this._m.a *= x; this._m.b *= x;
    this._m.c *= y; this._m.d *= y;
  }

  _blend(x, y, rgba, alphaScale = 1) {
    const c = this.canvas;
    if (x < 0 || y < 0 || x >= c._w || y >= c._h) return;
    const a = (rgba[3] / 255) * alphaScale * this.globalAlpha;
    if (a <= 0) return;
    const i = (y * c._w + x) * 4;
    const d = c.data;
    if (a >= 1) {
      d[i] = rgba[0]; d[i + 1] = rgba[1]; d[i + 2] = rgba[2]; d[i + 3] = 255;
      return;
    }
    d[i] = d[i] * (1 - a) + rgba[0] * a;
    d[i + 1] = d[i + 1] * (1 - a) + rgba[1] * a;
    d[i + 2] = d[i + 2] * (1 - a) + rgba[2] * a;
    d[i + 3] = Math.min(255, d[i + 3] * (1 - a) + 255 * a);
  }

  clearRect(x, y, w, h) {
    const c = this.canvas;
    const x0 = Math.max(0, Math.floor(this._m.e + x * this._m.a));
    const y0 = Math.max(0, Math.floor(this._m.f + y * this._m.d));
    const x1 = Math.min(c._w, Math.ceil(this._m.e + (x + w) * this._m.a));
    const y1 = Math.min(c._h, Math.ceil(this._m.f + (y + h) * this._m.d));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * c._w + px) * 4;
        c.data[i] = c.data[i + 1] = c.data[i + 2] = c.data[i + 3] = 0;
      }
    }
  }

  fillRect(x, y, w, h) {
    const m = this._m;
    const x0 = Math.round(m.e + x * m.a);
    const y0 = Math.round(m.f + y * m.d);
    const x1 = Math.round(m.e + (x + w) * m.a);
    const y1 = Math.round(m.f + (y + h) * m.d);
    const [xa, xb] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ya, yb] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let py = ya; py < yb; py++) {
      for (let px = xa; px < xb; px++) this._blend(px, py, this._fill);
    }
  }

  /* --- 路径：只支持多边形和椭圆（项目里只用到这两种） --- */
  beginPath() { this._path = []; }
  moveTo(x, y) { this._path.push([this._tx(x), this._ty(y)]); }
  lineTo(x, y) { this._path.push([this._tx(x), this._ty(y)]); }
  closePath() {}
  ellipse(cx, cy, rx, ry, rot = 0, a0 = 0, a1 = Math.PI * 2) {
    const steps = Math.max(12, Math.round((Math.abs(rx) + Math.abs(ry)) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = a0 + ((a1 - a0) * i) / steps;
      const x = cx + Math.cos(t) * rx * Math.cos(rot) - Math.sin(t) * ry * Math.sin(rot);
      const y = cy + Math.cos(t) * rx * Math.sin(rot) + Math.sin(t) * ry * Math.cos(rot);
      this._path.push([this._tx(x), this._ty(y)]);
    }
  }
  _tx(x) { return this._m.e + x * this._m.a + 0 * this._m.c; }
  _ty(y) { return this._m.f + y * this._m.d; }

  fill() {
    const pts = this._path;
    if (pts.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this._blend(x, y, this._fill);
      }
    }
  }

  measureText(t) { return { width: String(t).length * 4 }; }
  fillText() { /* 文字不进画面：世界里的文字由 DOM 层负责 */ }

  /* --- drawImage：支持三种调用形式，最近邻采样 --- */
  drawImage(img, ...a) {
    if (!img || !img.__isCanvas) return;
    let sx = 0;
    let sy = 0;
    let sw = img._w;
    let sh = img._h;
    let dx;
    let dy;
    let dw;
    let dh;
    if (a.length === 2) [dx, dy] = a, dw = sw, dh = sh;
    else if (a.length === 4) [dx, dy, dw, dh] = a;
    else if (a.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    else return;

    const m = this._m;
    const flipX = m.a < 0;
    for (let py = 0; py < Math.abs(Math.round(dh * m.d)); py++) {
      for (let px = 0; px < Math.abs(Math.round(dw * m.a)); px++) {
        const u = flipX ? Math.abs(Math.round(dw * m.a)) - 1 - px : px;
        const tx = Math.round(m.e + (dx + (px / Math.abs(m.a)) * Math.sign(m.a)) * m.a);
        const ty = Math.round(m.f + (dy + (py / Math.abs(m.d)) * Math.sign(m.d)) * m.d);
        const ssx = Math.floor(sx + (u / Math.abs(dw * m.a)) * sw);
        const ssy = Math.floor(sy + (py / Math.abs(dh * m.d)) * sh);
        if (ssx < 0 || ssy < 0 || ssx >= img._w || ssy >= img._h) continue;
        const i = (ssy * img._w + ssx) * 4;
        this._blend(tx, ty, [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]);
      }
    }
  }
}

/* ================================================================== */
/* 只校验参数、不真画的空画布                                            */
/* ================================================================== */
function noopCanvasFactory(reportDrawError) {
  const checkNum = (name, ...vals) => {
    for (const v of vals) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        reportDrawError(`${name} 收到了非法坐标/尺寸：${vals.join(', ')}`);
        return;
      }
    }
  };
  const mk = (w = 1, h = 1, tag = 'canvas') => {
    const c = {
      __isCanvas: true,
      width: w,
      height: h,
      style: {},
      dataset: {},
      _ctx: null,
      getContext() { return (c._ctx ??= ctx(tag)); },
      addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    };
    return c;
  };
  const ctx = (tag) => ({
    imageSmoothingEnabled: false,
    fillStyle: '#000', font: '', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    fillRect: (...a) => checkNum(`${tag}.fillRect`, a[0], a[1], a[2], a[3]),
    clearRect: (...a) => checkNum(`${tag}.clearRect`, a[0], a[1], a[2], a[3]),
    drawImage: (img, ...rest) => {
      if (!img || !img.__isCanvas) {
        reportDrawError(`${tag}.drawImage 收到了一张不是画布的图：${img === null ? 'null' : typeof img}`);
      }
      checkNum(`${tag}.drawImage`, ...rest);
    },
    save() {}, restore() {},
    translate: (...a) => checkNum(`${tag}.translate`, ...a),
    scale: (...a) => checkNum(`${tag}.scale`, ...a),
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
    ellipse: (...a) => checkNum(`${tag}.ellipse`, ...a),
    fillText() {},
    measureText: (t) => ({ width: String(t).length * 4 }),
  });
  return mk;
}

/* ================================================================== */
/* 安装整套桩                                                          */
/* ================================================================== */
export function installDom({ raster = false, report = null } = {}) {
  const drawErrors = [];
  const seen = new Set();
  const reportDrawError = (msg) => {
    if (seen.has(msg)) return;
    seen.add(msg);
    drawErrors.push(msg);
  };
  const makeRawCanvas = noopCanvasFactory(reportDrawError);
  const makeCanvas = raster
    ? (w = 1, h = 1, tag = 'canvas') => { const c = new RasterCanvas(w, h); c.dataset = {}; c.classList = mkClassList(); return c; }
    : makeRawCanvas;

  /* ---- classList ---- */
  function mkClassList() {
    const set = new Set();
    return {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      toggle: (c, f) => (f === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : (f ? set.add(c) : set.delete(c))),
      contains: (c) => set.has(c),
    };
  }

  /* ---- 元素 ---- */
  const listeners = new Map();
  let seq = 0;
  function mkEl(id, tag = 'div') {
    const el = {
      id, tagName: tag.toUpperCase(), style: {}, dataset: {},
      classList: mkClassList(), children: [],
      textContent: '', value: '', disabled: false, scrollTop: 0, scrollHeight: 0,
      addEventListener(type, fn) {
        const key = `${id}:${type}`;
        if (!listeners.has(key)) listeners.set(key, []);
        listeners.get(key).push(fn);
      },
      removeEventListener() {},
      appendChild(c) { el.children.push(c); c._parent = el; return c; },
      append(...cs) { cs.forEach((c) => { el.children.push(c); c._parent = el; }); },
      remove() {
        const p = el._parent;
        if (!p) return;
        const i = p.children.indexOf(el);
        if (i >= 0) p.children.splice(i, 1);
        el._parent = null;
      },
      focus() {}, blur() {},
      get firstChild() { return el.children[0] ?? null; },
      querySelector: () => null,
      querySelectorAll: () => [],
      getContext: () => makeCanvas(1, 1, `#${id}`).getContext('2d'),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 352, height: 224 }),
      set innerHTML(v) { el._html = v; el.children = []; },
      get innerHTML() { return el._html ?? ''; },
    };
    return el;
  }

  /* ---- index.html 里的初始 class ---- */
  const initialClasses = (() => {
    try {
      const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
      const map = new Map();
      for (const tag of html.match(/<[a-zA-Z][^>]*>/g) ?? []) {
        const idM = tag.match(/id="([^"]+)"/);
        if (!idM) continue;
        const clsM = tag.match(/class="([^"]*)"/);
        map.set(idM[1], clsM ? clsM[1].split(/\s+/).filter(Boolean) : []);
      }
      return map;
    } catch { return new Map(); }
  })();

  const elements = new Map();
  const gameCanvas = makeCanvas(352, 224, '#game');
  gameCanvas.id = 'game';
  elements.set('game', gameCanvas);
  const portraitCanvas = makeCanvas(40, 40, '#portrait');
  portraitCanvas.id = 'portrait';
  elements.set('portrait', portraitCanvas);

  globalThis.document = {
    get activeElement() { return null; },
    hidden: false,
    body: mkEl('body'),
    getElementById(id) {
      if (!elements.has(id)) {
        const el = mkEl(id);
        for (const c of initialClasses.get(id) ?? []) el.classList.add(c);
        elements.set(id, el);
      }
      return elements.get(id);
    },
    createElement(tag) {
      if (tag === 'canvas') return makeCanvas(1, 1, `dyn#${++seq}`);
      return mkEl(`dyn-${tag}-${++seq}`, tag);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  };

  globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  globalThis.localStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  };

  let rafQueue = [];
  globalThis.requestAnimationFrame = (fn) => rafQueue.push(fn);
  globalThis.cancelAnimationFrame = () => {};

  /** fetch 桩：默认扮演「没配 Key 的本地服务端」 */
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/api/health')) return { ok: true, status: 200, json: async () => ({ ok: true, mock: true, model: null }) };
    if (u.includes('/api/chat')) return { ok: true, status: 200, json: async () => ({ reply: '', mock: true }) };
    if (u.includes('/api/verify')) return { ok: true, status: 200, json: async () => ({ ok: false, mock: true, message: '演示模式' }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };

  /* ---- 帧驱动 ---- */
  const tick = () => new Promise((r) => setImmediate(r));
  let clock = 0;
  let dead = false;
  let section = '启动';

  return {
    gameCanvas,
    drawErrors,
    get clock() { return clock; },
    set clock(v) { clock = v; },
    set section(v) { section = v; },
    rafPending: () => rafQueue.length,
    click(id) {
      const fns = listeners.get(`${id}:click`) ?? [];
      if (!fns.length) return false;
      fns.forEach((f) => f());
      return true;
    },
    idle: tick,
    /**
     * 跑 n 帧。每帧之后让出事件循环 —— 浏览器里每个 rAF 是独立任务，
     * 帧与帧之间微任务会被清空，不模拟这一点的话 await 驱动的状态机接不上。
     */
    async frame(n = 1) {
      for (let i = 0; i < n; i++) {
        clock += 16.7;
        const q = rafQueue;
        rafQueue = [];
        if (!q.length) {
          if (!dead) { dead = true; report?.(`主循环在「${section}」阶段停止了（不再申请下一帧）`); }
          return;
        }
        for (const fn of q) {
          try { fn(clock); }
          catch (e) {
            if (!dead) {
              dead = true;
              report?.(`主循环在「${section}」阶段抛错：${e.message}\n      ${String(e.stack).split('\n')[1]?.trim()}`);
            }
            return;
          }
        }
        await tick();
      }
    },
  };
}

/* ================================================================== */
/* PNG 输出                                                            */
/* ================================================================== */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * 把一块 RGBA 写成 PNG。scale 做最近邻放大，方便肉眼看清像素。
 */
export function encodePng(width, height, rgba, scale = 1) {
  const w = width * scale;
  const h = height * scale;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;   // 每行开头的 filter 字节
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / scale);
      const i = (sy * width + sx) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      raw[o++] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export { RasterCanvas };
