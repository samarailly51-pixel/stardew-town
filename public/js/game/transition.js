/**
 * 场景切换 · NPC 引路
 * ------------------------------------------------------------------
 * 目标：换场景「不硬切」。
 *
 *   踩到出口
 *     ↓  锁输入
 *   黑幕淡入，幕上写着「引路 · 阿栗」和目标场景名
 *     ↓  在全黑的那一瞬间换场景（玩家看不到资源加载）
 *   黑幕淡出，人已经站在新场景的门口了
 *     ↓
 *   新场景的居民从门口走进去 4 格，玩家自动跟在后面
 *     ↓  交还控制权，飘一条「到达 小镇广场」
 *
 * 用 async/await 写状态机，靠主循环的 update(dt) 驱动 wait()，
 * 比一堆 phase 变量好读得多，也不会阻塞渲染。
 */
import { getScene } from '../world/scenes.js';
import { TILE } from '../art/tiles.js';

function inwardVector(side) {
  switch (side) {
    case 'west': return { x: 1, y: 0 };
    case 'east': return { x: -1, y: 0 };
    case 'north': return { x: 0, y: 1 };
    default: return { x: 0, y: -1 };
  }
}

function dirName(v) {
  if (v.x > 0) return 'right';
  if (v.x < 0) return 'left';
  if (v.y > 0) return 'down';
  return 'up';
}

export class SceneTransition {
  /**
   * @param {object} deps
   * @param {(toId:string, fromId:string) => {world:any, player:any, guide:any, gate:any}} deps.swapScene
   * @param {object} deps.ui
   */
  constructor(deps) {
    this.deps = deps;
    this.waiters = [];
    this.frameWaiters = [];
    this.phase = 'idle';
    /** 刚落地时先别急着再触发传送，否则会在门口来回弹 */
    this.graceTimer = 0;
  }

  get active() {
    return this.phase !== 'idle';
  }

  get justArrived() {
    return this.graceTimer > 0;
  }

  wait(seconds) {
    return new Promise((res) => this.waiters.push({ t: seconds, res }));
  }

  nextFrame() {
    return new Promise((res) => this.frameWaiters.push(res));
  }

  /** 主循环每帧调用 */
  update(dt) {
    if (this.graceTimer > 0) this.graceTimer = Math.max(0, this.graceTimer - dt);

    if (this.waiters.length) {
      const ready = [];
      for (const w of this.waiters) {
        w.t -= dt;
        if (w.t <= 0) ready.push(w);
      }
      if (ready.length) {
        this.waiters = this.waiters.filter((w) => !ready.includes(w));
        ready.forEach((w) => w.res());
      }
    }

    if (this.frameWaiters.length) {
      const f = this.frameWaiters;
      this.frameWaiters = [];
      f.forEach((res) => res());
    }
  }

  /**
   * 开始一次切换。
   * @param {object} portal  玩家踩到的传送点（world.gates 里那一条）
   * @param {string} fromId  当前场景 id
   */
  async start(portal, fromId) {
    if (this.active) return;
    const { ui, swapScene } = this.deps;
    const target = getScene(portal.to);
    this.phase = 'fading-out';

    ui.setInputLocked(true);
    ui.showTransition({
      guide: '引路',
      text: `前往 ${target.name}`,
      hint: target.en,
      lead: false,
    });
    await this.wait(0.05);
    ui.fadeTransition(1);
    await this.wait(0.42);

    this.phase = 'swapping';
    const { guide, gate } = swapScene(portal.to, fromId);

    // 落地后先站定，别在门口反复触发
    ui.fadeTransition(0);
    await this.wait(0.4);

    this.phase = 'leading';
    if (guide) {
      const name = guide.character.name;
      const line = guide.character.guide ?? '跟紧我。';
      ui.showTransition({
        guide: `${name} · ${guide.character.title}`,
        text: line,
        hint: '',
        lead: true,
      });
      guide.showBubble('!', 1.5);
      await this.wait(1.15);

      // 引路：居民往里走 4 格，玩家跟在后面
      const inward = inwardVector(gate.side);
      const steps = 4;
      const tx = gate.x + inward.x * steps;
      const ty = gate.y + inward.y * steps;
      const facing = dirName(inward);

      const { player } = this.deps.actors();
      guide.walkTo(tx, ty, 58);
      let guard = 300;
      while (!guide.atTarget && guard-- > 0) {
        await this.nextFrame();
        guide.face(facing);
        // 玩家跟在引路 NPC 身后一格半的位置
        const behindX = guide.x - inward.x * (TILE * 1.4);
        const behindY = guide.y - inward.y * (TILE * 1.4);
        player.x += (behindX - player.x) * 0.16;
        player.y += (behindY - player.y) * 0.16;
        player.face(facing);
        player.moving = true;
        player.animT += 0.02;
        player.frame = [1, 0, 2, 0][Math.floor(player.animT * 7) % 4];
        player.bob = player.frame === 0 ? 0 : -1;
      }
      guide.stopScript();
      guide.faceTowards(player.x, player.y);
      // 带完路，居民自己慢慢走回岗位上——不抢玩家的操作权
      guide.walkTo(guide.character.pos.x, guide.character.pos.y, 32);
      player.moving = false;
      player.frame = 0;
      player.bob = 0;
    }

    ui.hideTransition();
    await this.wait(0.25);
    ui.setInputLocked(false);
    this.graceTimer = 0.6;
    this.phase = 'idle';
    ui.toast(`到达 ${target.name}`);
    return target;
  }
}
