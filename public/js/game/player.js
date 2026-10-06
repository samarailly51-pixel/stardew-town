/**
 * 主角
 * ------------------------------------------------------------------
 * 脚底中心是坐标原点，碰撞盒也只有脚下一小块（10x7），
 * 这样上半身可以「探进」树冠和屋檐下面，走位手感更接近星露谷。
 */
import { TILE } from '../art/tiles.js';

const BOX_W = 10;
const BOX_H = 7;
const SPEED = 66;          // 像素/秒
const RUN_MULT = 1.45;

export class Player {
  constructor(sprites, x, y) {
    this.sprites = sprites;
    this.x = x;
    this.y = y;
    this.dir = 'down';
    this.moving = false;
    this.animT = 0;
    this.frame = 0;
    /** 走路时脚底上下浮动一点点，像素角色的「活气」全在这儿 */
    this.bob = 0;
  }

  get baseY() {
    return this.y;
  }

  get box() {
    return { x: this.x - BOX_W / 2, y: this.y - BOX_H, w: BOX_W, h: BOX_H };
  }

  /** 主角前方一格的中心点，用来判断「我在跟谁说话 / 朝哪棵树摘」 */
  facingPoint(distTiles = 0.45) {
    const d = distTiles * TILE;
    switch (this.dir) {
      case 'up': return { x: this.x, y: this.y - d };
      case 'down': return { x: this.x, y: this.y + d };
      case 'left': return { x: this.x - d, y: this.y - 2 };
      default: return { x: this.x + d, y: this.y - 2 };
    }
  }

  tile() {
    return { x: Math.floor(this.x / TILE), y: Math.floor((this.y - 2) / TILE) };
  }

  /** 从外部强制设定朝向（引路时 NPC 说完话转向他） */
  face(dir) {
    this.dir = dir;
  }

  faceTowards(wx, wy) {
    const dx = wx - this.x;
    const dy = wy - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else this.dir = dy > 0 ? 'down' : 'up';
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number}} axis  归一化方向
   * @param {import('../world/world.js').World} world
   * @param {boolean} running
   */
  update(dt, axis, world, running = false) {
    const moving = axis.x !== 0 || axis.y !== 0;
    this.moving = moving;

    if (moving) {
      const speed = SPEED * (running ? RUN_MULT : 1);
      const dx = axis.x * speed * dt;
      const dy = axis.y * speed * dt;

      // 分轴移动：撞墙时还能沿着墙滑行，不会「卡住不动」
      const tryX = (amount) => {
        const nx = this.x + amount;
        if (world.free(nx - BOX_W / 2, this.y - BOX_H, BOX_W, BOX_H)) {
          this.x = nx;
          return true;
        }
        return false;
      };
      const tryY = (amount) => {
        const ny = this.y + amount;
        if (world.free(this.x - BOX_W / 2, ny - BOX_H, BOX_W, BOX_H)) {
          this.y = ny;
          return true;
        }
        return false;
      };

      if (dx !== 0 && !tryX(dx)) tryX(dx * 0.35);   // 贴墙时缓一下，不至于急停
      if (dy !== 0 && !tryY(dy)) tryY(dy * 0.35);

      // 朝向：横向优先，斜着走时看起来更自然
      if (Math.abs(axis.x) >= Math.abs(axis.y)) this.dir = axis.x > 0 ? 'right' : 'left';
      else this.dir = axis.y > 0 ? 'down' : 'up';

      this.animT += dt * (running ? 1.5 : 1);
      this.frame = [1, 0, 2, 0][Math.floor(this.animT * 7) % 4];
      this.bob = this.frame === 0 ? 0 : -1;
    } else {
      this.animT = 0;
      this.frame = 0;
      this.bob = 0;
    }
  }

  /** 场景切换时直接落位 */
  placeAt(x, y) {
    this.x = x;
    this.y = y;
  }

  draw(ctx) {
    const dirFrames = this.sprites[this.dir] ?? this.sprites.down;
    const img = dirFrames[this.frame] ?? dirFrames[0];
    const px = Math.round(this.x - 8);
    const py = Math.round(this.y - 23 + this.bob);
    ctx.drawImage(img, px, py);
  }
}
