/**
 * 生成 GitHub Pages 用的静态站点
 * ------------------------------------------------------------------
 * GitHub Pages 只能从仓库根目录或者 /docs 目录发布，不能指定 /public。
 * 所以把 public/ 整个复制一份到 docs/，然后 Pages 选 main 分支的 /docs。
 *
 *   node tools/build-pages.mjs
 */
import { cp, rm, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = path.join(root, 'public');
const out = path.join(root, 'docs');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(src, out, { recursive: true });

// 让 GitHub Pages 原样发布，不要拿 Jekyll 处理
await writeFile(path.join(out, '.nojekyll'), '');

// 静态版不会有后端，所以把「怎么填 Key」写进页面注释里，方便排查
const files = [];
async function walk(dir, prefix = '') {
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) await walk(p, `${prefix}${name}/`);
    else files.push(`${prefix}${name} (${(s.size / 1024).toFixed(1)} KB)`);
  }
}
await walk(out);

console.log(`\n已生成静态站点：docs/`);
console.log('─'.repeat(52));
for (const f of files) console.log('  ' + f);
console.log('─'.repeat(52));
console.log(`  共 ${files.length} 个文件`);
console.log('\n下一步：把这个目录提交上去，然后在仓库 Settings → Pages 里');
console.log('   Source 选「Deploy from a branch」，分支 main，目录选 /docs\n');
