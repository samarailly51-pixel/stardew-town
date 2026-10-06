/**
 * 资源爬虫
 * ------------------------------------------------------------------
 * ES module 是「一个 404 就整页死」的加载方式，
 * 所以部署前必须确认浏览器会请求的每一个文件都真的有。
 *
 *   node tools/crawl.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://localhost:3100';

const seen = new Map();
const bad = [];

async function get(pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl;
  if (seen.has(url)) return seen.get(url);
  let entry;
  try {
    const res = await fetch(url);
    const body = res.ok ? await res.text() : '';
    entry = { status: res.status, type: res.headers.get('content-type') ?? '', body, url };
  } catch (e) {
    entry = { status: 0, type: '', body: '', url, error: String(e.message ?? e) };
  }
  seen.set(url, entry);
  if (entry.status !== 200) bad.push(entry);
  return entry;
}

/** 从 JS 里抽出所有相对 import（静态 + 动态） */
function importsOf(code) {
  const out = [];
  for (const m of code.matchAll(/(?:import|export)[^'"()]*?from\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

const index = await get('/');
if (index.status !== 200) {
  console.error(`首页都拿不到：HTTP ${index.status} ${index.error ?? ''}`);
  console.error('服务没起来？双击「启动.bat」，或者在这个目录跑：node server.js');
  process.exit(1);
}

/* 1. HTML 里直接引用的 */
const refs = [...index.body.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((x) => !x.startsWith('data:') && !x.startsWith('http'));

const queue = [];
for (const r of refs) {
  const p = r.startsWith('/') ? r : '/' + r.replace(/^\.\//, '');
  await get(p);
  if (p.endsWith('.js')) queue.push(p);
}

/* 2. 递归跟 import */
while (queue.length) {
  const rel = queue.shift();
  const entry = await get(rel);
  if (!entry.body) continue;
  const dir = rel.replace(/[^/]+$/, '');
  for (const spec of importsOf(entry.body)) {
    if (!spec.startsWith('.')) continue;                 // 跳过裸模块名
    const abs = new URL(spec, 'http://x' + dir).pathname;
    if (!seen.has(BASE + abs)) queue.push(abs);
  }
}

/* 3. 输出 */
const rows = [...seen.values()];
console.log(`\n爬了 ${rows.length} 个资源（${BASE}）`);
console.log('─'.repeat(70));
for (const r of rows) {
  const mark = r.status === 200 ? '  ' : '✗ ';
  console.log(`${mark}${String(r.status).padStart(3)}  ${r.url.replace(BASE, '') || '/'}   ${r.type.split(';')[0]}`);
}
if (bad.length) {
  console.log(`\n❌ ${bad.length} 个资源拿不到：`);
  for (const b of bad) console.log(`   ${b.status}  ${b.url.replace(BASE, '')}  ${b.error ?? ''}`);
  process.exit(1);
}
console.log('\n✅ 浏览器要的东西全都在\n');
