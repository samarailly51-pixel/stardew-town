/**
 * 把游戏画面真正画出来，导出 PNG
 * ------------------------------------------------------------------
 * 用 harness 的光栅画布跑真的 main.js，逐个场景截图。
 * 这是唯一能「亲眼确认程序化像素美术没画歪」的手段。
 *
 *   node tools/render.mjs
 *   → screenshots/*.png
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { installDom, encodePng, RasterCanvas } from './harness.mjs';

const OUT = new URL('../screenshots/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const H = installDom({ raster: true, report: (m) => console.error('  [主循环] ' + m) });
const main = await import('../public/js/main.js');
await H.idle();
await H.idle();

if (!H.click('btnStart')) {
  console.error('点不到开始按钮，boot() 可能没跑完');
  process.exit(1);
}
await H.frame(8);

const SHOTS = [
  ['01-apple-farm', 'apple_farm', '苹果农场：主玩法发生地，4x3 的苹果树阵'],
  ['02-town-square', 'town_square', '小镇广场：交通枢纽，石板广场 + 喷泉 + 收购站'],
  ['03-mossy-forest', 'mossy_forest', '苔藓森林：树最密，一条路通往矿洞与码头'],
  ['04-riverside-dock', 'riverside_dock', '河畔码头：横贯的河 + 木栈桥'],
  ['05-old-orchard', 'old_orchard', '老苹果园：苹果树最多，19 棵'],
  ['06-bakery', 'bakery', '麦香面包房：室内模板（木地板 + 柜台 + 货架）'],
  ['07-greenhouse', 'greenhouse', '玻璃温室：程序化画的玻璃房'],
  ['08-hot-spring', 'hot_spring', '山间温泉：方形汤池 + 石板围边'],
];

const COLS = 2;
const rows = Math.ceil(SHOTS.length / COLS);
const sheet = new RasterCanvas(COLS * 352, rows * 224);
const sctx = sheet.getContext('2d');

const report = [];
for (let i = 0; i < SHOTS.length; i++) {
  const [file, sceneId, note] = SHOTS[i];
  main.__debug.loadScene(sceneId);
  await H.frame(3);

  // 让居民走到位、玩家站好，再截
  const png = encodePng(352, 224, H.gameCanvas.data, 3);
  writeFileSync(new URL(`${file}.png`, OUT), png);
  sctx.drawImage(H.gameCanvas, (i % COLS) * 352, Math.floor(i / COLS) * 224);
  report.push({ file, sceneId, note });
}

writeFileSync(new URL('00-overview.png', OUT), encodePng(COLS * 352, rows * 224, sheet.data, 2));

console.log('\n已导出：');
for (const r of report) console.log(`  screenshots/${r.file}.png   ${r.note}`);
console.log(`  screenshots/00-overview.png  ${SHOTS.length} 个场景拼图`);
if (H.drawErrors.length) {
  console.log(`\n绘制参数问题（${H.drawErrors.length}）：`);
  H.drawErrors.slice(0, 10).forEach((e) => console.log('  ⚠ ' + e));
}
process.exit(0);
