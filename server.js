/**
 * 苹果小镇 —— 后端服务
 * ------------------------------------------------------------------
 * 零第三方依赖，只用 Node 内置模块（Node >= 18 自带全局 fetch）。
 *
 * 职责：
 *   1. 托管 public/ 下的静态页面（游戏本体全部是前端 canvas，无需数据库）
 *   2. 提供 POST /api/chat，把某个 NPC 的对话转发给 DeepSeek，API Key 只留在服务端
 *   3. 没配置 API Key 时进入「演示模式」，前端会自动切到每个 NPC 人设里的预置台词
 *
 * 启动：node server.js    然后浏览器打开 http://localhost:3100
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* 1. .env 读取（带 mtime 缓存：改完保存即生效，不用重启）                */
/* ------------------------------------------------------------------ */
const ENV_PATH = path.join(__dirname, '.env');

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

let envCache = { mtimeMs: -1, values: {} };

function readEnvFile() {
  let stat;
  try {
    stat = fs.statSync(ENV_PATH);
  } catch {
    return {};
  }
  if (stat.mtimeMs === envCache.mtimeMs) return envCache.values;
  let values = {};
  try {
    values = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
  } catch {
    values = {};
  }
  envCache = { mtimeMs: stat.mtimeMs, values };
  return values;
}

function getConfig() {
  const file = readEnvFile();
  const pick = (key, dflt = '') => {
    const fromFile = file[key];
    if (typeof fromFile === 'string' && fromFile.trim()) return fromFile.trim();
    const fromEnv = process.env[key];
    if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
    return dflt;
  };
  const apiKey = pick('DEEPSEEK_API_KEY');
  return {
    apiKey,
    model: pick('DEEPSEEK_MODEL', 'deepseek-chat'),
    baseUrl: pick('DEEPSEEK_BASE_URL', 'https://api.deepseek.com').replace(/\/+$/, ''),
    mock: !apiKey || /你的key|your[_-]?key|^sk-x+$/i.test(apiKey),
  };
}

const bootEnv = (() => {
  try {
    return parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
  } catch {
    return {};
  }
})();

const PORT = Number(bootEnv.PORT || process.env.PORT || 3100);
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ------------------------------------------------------------------ */
/* 2. 静态文件服务                                                      */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // 防目录穿越：解析后必须仍在 PUBLIC_DIR 内
  const target = path.resolve(PUBLIC_DIR, '.' + rel);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  // 代码文件不缓存（否则改完代码刷新页面会拿到旧版本），图片才允许缓存
  const cacheable = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff2', '.mp3'];
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cacheable.includes(ext)
      ? 'public, max-age=3600'
      : 'no-store, must-revalidate',
  });
  fs.createReadStream(target).pipe(res);
}

/* ------------------------------------------------------------------ */
/* 3. 对话接口                                                          */
/* ------------------------------------------------------------------ */
async function readJsonBody(req, limitBytes = 128 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** 只保留最近若干轮，过滤非法内容，防止把整段历史无限塞给模型（也直接省钱） */
function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 1000).trim() }))
    .filter((m) => m.content)
    .slice(-8);
}

async function handleChat(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: '请求格式错误' });
  }

  const messages = sanitizeMessages(body.messages);
  if (!messages.length) return sendJson(res, 400, { error: 'messages 不能为空' });

  // persona 由前端按 NPC 人设拼好，这里只做长度兜底
  const persona = String(body.persona || '').slice(0, 3000);
  const scene = String(body.scene || '').slice(0, 40);

  const cfg = getConfig();

  // ---- 演示模式：不调模型，前端会用 NPC 自己的预置台词接管 ----
  if (cfg.mock) {
    return sendJson(res, 200, { reply: '', mock: true, model: '演示模式（未配置 DEEPSEEK_API_KEY）' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: persona },
          ...(scene ? [{ role: 'system', content: `（当前场景：${scene}）` }] : []),
          ...messages,
        ],
        temperature: 1.1,
        max_tokens: 160,
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const detail = data?.error?.message || `DeepSeek 返回 ${upstream.status}`;
      console.error('[DeepSeek 错误]', upstream.status, detail);
      const hint =
        upstream.status === 401
          ? 'API Key 无效或已过期，检查 .env 里的 DEEPSEEK_API_KEY'
          : upstream.status === 402
            ? 'DeepSeek 账户余额不足，请先充值'
            : upstream.status === 429
              ? '小镇居民今天说得太多了，喘口气再来'
              : 'DeepSeek 服务暂时不可用，稍后再试';
      return sendJson(res, 502, { error: hint, detail });
    }

    const reply = (data?.choices?.[0]?.message?.content || '').trim();
    if (!reply) return sendJson(res, 502, { error: '这位居民一时语塞，再问一次吧' });

    return sendJson(res, 200, { reply, model: data.model || cfg.model, usage: data.usage });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error('[请求失败]', err);
    return sendJson(res, 504, {
      error: aborted ? '居民想太久走神了，再问一次吧' : '连接不上 DeepSeek，检查一下网络',
    });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* 4. Key 体检接口                                                      */
/* ------------------------------------------------------------------ */
async function handleVerify(req, res) {
  const cfg = getConfig();

  if (cfg.mock) {
    return sendJson(res, 200, {
      ok: false,
      mock: true,
      message: '还没有配置 DEEPSEEK_API_KEY，当前是演示模式（NPC 用预置台词）',
      hint: '双击「填写Key.bat」把 Key 粘到 DEEPSEEK_API_KEY= 后面，保存后直接刷新网页',
    });
  }

  const started = Date.now();
  try {
    const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: '只回复两个字：收到' }],
        max_tokens: 16,
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await upstream.json().catch(() => ({}));
    const ms = Date.now() - started;

    if (!upstream.ok) {
      return sendJson(res, 200, {
        ok: false,
        mock: false,
        model: cfg.model,
        status: upstream.status,
        message: data?.error?.message || `DeepSeek 返回 ${upstream.status}`,
        hint:
          upstream.status === 401
            ? 'Key 不对。注意不要有多余空格或引号，也不要漏掉开头的 sk-'
            : upstream.status === 402
              ? 'Key 是好的，但账户余额不足，去 platform.deepseek.com 充值'
              : '检查 baseUrl 和网络',
      });
    }

    return sendJson(res, 200, {
      ok: true,
      mock: false,
      model: data.model || cfg.model,
      keyPrefix: cfg.apiKey.slice(0, 6) + '****',
      reply: (data?.choices?.[0]?.message?.content || '').trim(),
      latencyMs: ms,
      usage: data.usage,
      message: 'Key 有效，DeepSeek 已接通',
    });
  } catch (err) {
    return sendJson(res, 200, {
      ok: false,
      mock: false,
      message: err?.name === 'TimeoutError' ? '请求超时' : '连不上 DeepSeek',
      detail: String(err?.message || err),
      hint: '检查网络、代理，或 DEEPSEEK_BASE_URL 是否写对',
    });
  }
}

/* ------------------------------------------------------------------ */
/* 5. HTTP 服务器                                                      */
/* ------------------------------------------------------------------ */

/** 端口被别的程序占着就往后找一个，总比直接崩掉强 */
async function pickPort(start) {
  for (let p = start; p < start + 12; p++) {
    const free = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(p, '0.0.0.0');
    });
    if (free) return p;
  }
  return start;
}

/** Windows / macOS / Linux 都能用的「用默认浏览器打开这个地址」 */
function openBrowser(url) {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

const wantOpen = process.argv.includes('--open') || process.env.OPEN_BROWSER === '1';

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (pathname === '/api/health') {
    const cfg = getConfig();
    return sendJson(res, 200, { ok: true, mock: cfg.mock, model: cfg.mock ? null : cfg.model });
  }
  if (pathname === '/api/verify') return handleVerify(req, res);
  if (pathname === '/api/chat') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: '请使用 POST' });
    return handleChat(req, res);
  }
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: '接口不存在' });

  return serveStatic(req, res, pathname);
});

server.on('error', (err) => {
  console.error('\n  ✗ 服务启动失败：' + err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('    端口被占用了。关掉占用的程序，或改 .env 里的 PORT。');
  }
  console.error('');
  process.exit(1);
});

/* ------------------------------------------------------------------ */
/* 6. 启动                                                              */
/* ------------------------------------------------------------------ */
const port = await pickPort(PORT);

server.listen(port, () => {
  const cfg = getConfig();
  const line = '─'.repeat(58);
  console.log('');
  console.log(line);
  console.log('  🍎  苹果小镇已启动');
  console.log(line);
  console.log(`  👉  请用浏览器打开：http://localhost:${port}`);
  console.log('      直接双击项目里的「启动.bat」也行，它会自动帮你打开');
  console.log(line);
  console.log(`  模型：${cfg.mock ? '演示模式（未配置 Key，居民用预置台词）' : cfg.model}`);
  if (cfg.mock) {
    console.log('  提示：双击「填写Key.bat」填入 DEEPSEEK_API_KEY 即可接入真模型（保存即生效）');
  } else {
    console.log(`  Key ：${cfg.apiKey.slice(0, 6)}****（走 ${cfg.baseUrl}）`);
  }
  console.log(line);
  console.log(`  自检：http://localhost:${port}/api/verify`);
  console.log('  停止服务：在这个窗口按 Ctrl+C');
  console.log(line);
  console.log('');

  if (wantOpen) setTimeout(() => openBrowser(`http://localhost:${port}`), 400);
});
