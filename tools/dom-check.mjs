/**
 * DOM 约定检查
 * ------------------------------------------------------------------
 * 「页面打开了但什么都没发生」最常见的两个原因：
 *   1. JS 里 getElementById 的 id 在 HTML 里拼错了 → 拿到 null → 后面全崩
 *   2. querySelector 的选择器匹配不到任何元素
 * 这类问题不会报错到控制台显眼处，但会让整个页面变成死的，所以单独查一遍。
 *
 *   node tools/dom-check.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../public/', import.meta.url);
const publicDir = fileURLToPath(root);
const html = readFileSync(new URL('index.html', root), 'utf8');

/* ---- HTML 里定义了哪些 id / class / data-* ---- */
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const htmlClasses = new Set(
  [...html.matchAll(/\sclass="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
);

const problems = [];
const notes = [];

/* ---- 收集所有 JS ---- */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = walk(publicDir);

/* ---- 逐个文件检查 ---- */
const usedIds = new Set();
const usedSelectors = new Set();

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);

  // getElementById('x') 和 $('x')
  for (const m of code.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) usedIds.add(m[1]);
  for (const m of code.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)) usedIds.add(m[1]);

  // querySelector / querySelectorAll
  for (const m of code.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    usedSelectors.add(m[1]);
  }
  void rel;
}

/* ---- 这些选择器匹配的是 JS 运行时动态生成的节点，HTML 里当然找不到 ---- */
const DYNAMIC_SELECTORS = new Set([
  'canvas[data-portrait]',   // panels.js 把居民头像卡片插进 modalBody 时才有
  '.map-cell',               // 同上，地图格子也是动态生成的
]);

for (const id of usedIds) {
  if (!htmlIds.has(id)) problems.push(`JS 里取了 #${id}，但 index.html 里没有这个 id`);
}

for (const sel of usedSelectors) {
  if (DYNAMIC_SELECTORS.has(sel)) continue;
  // 只检查简单选择器：#id / .class / tag[attr]
  if (sel.startsWith('#')) {
    const id = sel.slice(1).split(/[\s.:[]/)[0];
    if (!htmlIds.has(id)) problems.push(`querySelector('${sel}')：index.html 里没有 #${id}`);
    continue;
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1).split(/[\s.:[]/)[0];
    if (!htmlClasses.has(cls)) problems.push(`querySelector('${sel}')：index.html 里没有任何元素带 .${cls}`);
    continue;
  }
  if (sel.includes(' ')) {
    // 复合选择器：#dpad .dp 这种，拆开各查一次
    const parts = sel.split(/\s+/);
    for (const p of parts) {
      const cls = p.startsWith('.') ? p.slice(1) : null;
      if (cls && !htmlClasses.has(cls)) {
        problems.push(`querySelector('${sel}')：HTML 里没有任何元素带 .${cls}`);
      }
    }
    continue;
  }
  if (/^[a-z]/.test(sel) && sel.includes('[')) {
    const attr = sel.match(/\[([a-z-]+)/)?.[1];
    if (attr && !html.includes(attr)) problems.push(`querySelector('${sel}')：HTML 里没有 ${attr} 属性`);
  }
}

/* ---- 反向检查：HTML 里定义了但 JS 从没用过的 id（只是提醒） ---- */
const unused = [...htmlIds].filter((id) => !usedIds.has(id) && !['app', 'stage', 'controls', 'dpad', 'actions', 'hud', 'startScreen', 'toasts', 'flash', 'hint'].includes(id));
if (unused.length) notes.push(`HTML 里这些 id 没被 JS 用到（可能是纯展示节点）：${unused.join(', ')}`);

/* ---- 输出 ---- */
console.log(`\n检查了 ${files.length} 个 JS 文件，${usedIds.size} 个 id、${usedSelectors.size} 个选择器`);
console.log(`index.html 定义了 ${htmlIds.size} 个 id、${htmlClasses.size} 个 class`);
console.log('─'.repeat(66));
if (notes.length) notes.forEach((n) => console.log('  · ' + n));

// 顺便看看 index.html 里 script/canvas 这些关键节点在不在
const mustHave = ['game', 'portrait', 'dialog', 'dlgInput', 'dlgSend', 'dlgText', 'trText', 'transition', 'modal', 'btnStart', 'sceneName', 'apList', 'appleCount'];
for (const id of mustHave) {
  if (!htmlIds.has(id)) problems.push(`关键节点 #${id} 在 index.html 里不见了`);
}
if (!/type="module"/.test(html)) problems.push('index.html 里的 <script> 没有 type="module"');
if (!/id="game"/.test(html)) problems.push('找不到 <canvas id="game">');

if (problems.length) {
  console.log(`\n❌ ${problems.length} 个问题：`);
  problems.forEach((p) => console.log('   ✗ ' + p));
  process.exit(1);
}
console.log('\n✅ DOM 约定全部对得上\n');
