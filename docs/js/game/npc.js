/**
 * 小镇居民（场景内的实体）
 * ------------------------------------------------------------------
 * 一个 Npc 只管三件事：站着、随便踱两步、看到玩家就转过来。
 * 「脑子」（要不要问 DeepSeek、聊过什么）在 ai/agents.js 里，两边分开。
 */
import { TILE } from '../art/tiles.js';

const SPEED = 22;

export class Npc {
  /**
   * @param {object} o
   * @param {object} o.character  名册里的那个人
   * @param {object} o.sprites    makeCharacterSprites 的产物
   * @param {import('../world/world.js').World} o.world
   */
  constructor({ character, sprites, world }) {
    this.character = character;
    this.sprites = sprites;
    this.world = world;
    this.home = { x: character.pos.x * TILE + TILE / 2, y: character.pos.y * TILE + TILE - 4 };
    this.x = this.home.x;
    this.y = this.home.y;
    this.dir = 'down';
    this.frame = 0;
    this.bob = 0;
    this.animT = 0;
    this.moving = false;

    /** 踱步状态机 */
    this.wanderTimer = 1 + Math.random() * 3;
    this.moveDir = null;
    this.moveTimer = 0;

    /** 被引路时会临时接管移动 */
    this.scripted = null;   // { tx, ty, speed }

    /** 头顶的提示气泡：'!' 表示可以搭话 */
    this.bubble = null;
    this.bubbleT = 0;
  }

  get id() {
    return this.character.id;
  }

  get baseY() {
    return this.y;
  }

  face(dir) {
    this.dir = dir;
  }

  faceTowards(wx, wy) {
    const dx = wx - this.x;
    const dy = wy - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else this.dir = dy > 0 ? 'down' : 'up';
  }

  /** 让居民走向某格（引路用），返回是否已经到达 */
  walkTo(tx, ty, speed = 46) {
    this.scripted = { tx: tx * TILE + TILE / 2, ty: ty * TILE + TILE - 4, speed };
  }

  stopScript() {
    this.scripted = null;
    this.moving = false;
  }

  get atTarget() {
    if (!this.scripted) return true;
    return Math.hypot(this.scripted.tx - this.x, this.scripted.ty - this.y) < 2.5;
  }

  update(dt, player, distToPlayer) {
    /* ---- 引路模式：直奔目标格 ---- */
    if (this.scripted) {
      const dx = this.scripted.tx - this.x;
      const dy = this.scripted.ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 2.5) {
        this.moving = false;
        this.frame = 0;
        this.bob = 0;
        return;
      }
      const step = Math.min(d, this.scripted.speed * dt);
      // 引路走的是我们预先选好的路线，不做逐格碰撞，避免卡在拐角
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      if (Math.abs(dx) >= Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
      else this.dir = dy > 0 ? 'down' : 'up';
      this.moving = true;
      this.animT += dt;
      this.frame = [1, 0, 2, 0][Math.floor(this.animT * 7) % 4];
      this.bob = this.frame === 0 ? 0 : -1;
      return;
    }

    /* ---- 玩家就在旁边：站住，转过来看着玩家 ---- */
    if (distToPlayer < 34) {
      this.moving = false;
      this.frame = 0;
      this.bob = 0;
      this.faceTowards(player.x, player.y);
      return;
    }

    /* ---- 平时：在自家门口两格范围内踱步 ---- */
    this.wanderTimer -= dt;
    if (this.moveTimer > 0) {
      this.moveTimer -= dt;
      const dir = this.moveDir;
      const v = {
        up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
        left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
      }[dir];
      const nx = this.x + v.x * SPEED * dt;
      const ny = this.y + v.y * SPEED * dt;
      const backHome = Math.hypot(nx - this.home.x, ny - this.home.y) < TILE * 1.6;
      if (backHome && this.world.free(nx - 5, ny - 6, 10, 6)) {
        this.x = nx;
        this.y = ny;
        this.dir = dir;
        this.moving = true;
        this.animT += dt;
        this.frame = [1, 0, 2, 0][Math.floor(this.animT * 6) % 4];
        this.bob = this.frame === 0 ? 0 : -1;
      } else {
        this.moveTimer = 0;
      }
      if (this.moveTimer <= 0) this.wanderTimer = 1.5 + Math.random() * 3;
      return;
    }

    this.moving = false;
    this.frame = 0;
    this.bob = 0;
    if (this.wanderTimer <= 0) {
      this.moveDir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
      this.moveTimer = 0.5 + Math.random() * 1.2;
    }
  }

  /** 弹一个提示气泡（'!' 可以搭话，'♪' 表示刚收过礼） */
  showBubble(ch, seconds = 1.4) {
    this.bubble = ch;
    this.bubbleT = seconds;
  }

  tickBubble(dt) {
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.bubble = null;
    }
  }

  draw(ctx, t) {
    const dirFrames = this.sprites[this.dir] ?? this.sprites.down;
    const img = dirFrames[this.frame] ?? dirFrames[0];
    const px = Math.round(this.x - 8);
    const py = Math.round(this.y - 23 + this.bob);
    ctx.drawImage(img, px, py);

    // 头顶气泡
    if (this.bubble) {
      const bx = Math.round(this.x);
      const by = Math.round(this.y - 32 + Math.sin(t * 4) * 1.2);
      ctx.fillStyle = '#fdf6e6';
      ctx.fillRect(bx - 6, by - 6, 12, 11);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(bx - 6, by - 6, 12, 1);
      ctx.fillRect(bx - 6, by + 4, 12, 1);
      ctx.fillRect(bx - 6, by - 6, 1, 11);
      ctx.fillRect(bx + 5, by - 6, 1, 11);
      ctx.fillRect(bx - 1, by + 5, 2, 2);
      ctx.fillStyle = '#c0392b';
      ctx.font = '8px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.bubble, bx, by + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
}
