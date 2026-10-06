/**
 * 输入层
 * ------------------------------------------------------------------
 * 三种来源汇总成一个「方向 + 按键队列」的接口：
 *   1. 键盘（WASD / 方向键 / 空格 / E / M / Tab / Esc）
 *   2. 屏幕十字键（鼠标、触摸都能按，按住不放会持续走）
 *   3. 点击画面（点哪走哪，手机上很顺手）
 *
 * 游戏逻辑只问 input.axis 和 input.consume('action')，
 * 不关心玩家到底是用什么设备操作的。
 */

const DIR_KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

const ACTION_KEYS = { Space: 'action', KeyE: 'action', Enter: 'action' };
const MISC_KEYS = { KeyM: 'map', Tab: 'bag', Escape: 'esc', KeyR: 'reset' };

class Input {
  constructor() {
    /** 当前按住的虚拟方向（键盘 + 十字键合并） */
    this.held = new Set();
    /** 一次性按键事件队列，例如 action / map / bag / esc */
    this.queue = new Set();
    /** 鼠标/触摸点选的目标点（世界坐标），由主循环消费 */
    this.clickTarget = null;
    /** 对话打开时，方向键和点击移动要失效 */
    this.locked = false;
    this._bound = false;
  }

  bind() {
    if (this._bound) return;
    this._bound = true;

    window.addEventListener('keydown', (e) => {
      // 正在输入框里打字时，一律不劫持按键
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.code === 'Escape') document.activeElement.blur();
        return;
      }
      const dir = DIR_KEYS[e.code];
      if (dir) {
        this.held.add(dir);
        e.preventDefault();
        return;
      }
      const act = ACTION_KEYS[e.code];
      if (act) {
        this.queue.add(act);
        e.preventDefault();
        return;
      }
      const misc = MISC_KEYS[e.code];
      if (misc) {
        this.queue.add(misc);
        if (e.code === 'Tab') e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      const dir = DIR_KEYS[e.code];
      if (dir) this.held.delete(dir);
    });

    // 失焦时清空按键，避免「回来还在一直走」
    window.addEventListener('blur', () => this.held.clear());

    this._bindDpad();
    this._bindClickMove();
  }

  _bindDpad() {
    document.querySelectorAll('#dpad .dp').forEach((btn) => {
      const dir = btn.dataset.dir;
      const down = (e) => {
        e.preventDefault();
        this.held.add(dir);
        btn.classList.add('on');
      };
      const up = (e) => {
        e.preventDefault();
        this.held.delete(dir);
        btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });
  }

  /** 点画面走路：主循环拿到 clickTarget 后自己寻路（简单的直线趋近） */
  _bindClickMove() {
    const canvas = document.getElementById('game');
    if (!canvas) return;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      const rect = canvas.getBoundingClientRect();
      this.clickTarget = {
        // 换算到画布内部像素坐标（352x224）
        sx: ((e.clientX - rect.left) / rect.width) * canvas.width,
        sy: ((e.clientY - rect.top) / rect.height) * canvas.height,
      };
    });
  }

  /** 归一化后的方向向量，斜向不会变快 */
  get axis() {
    let x = 0;
    let y = 0;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('up')) y -= 1;
    if (this.held.has('down')) y += 1;
    if (x && y) {
      const k = Math.SQRT1_2;
      x *= k;
      y *= k;
    }
    return { x, y };
  }

  /** 取一次事件（取过就没了），用于「按一下触发一次」的交互 */
  consume(name) {
    if (!this.queue.has(name)) return false;
    this.queue.delete(name);
    return true;
  }

  /** 每帧末尾清掉没被消费的一次性事件，避免堆积 */
  endFrame() {
    this.queue.clear();
  }

  /** 程序化触发一次按键，方便调试和「点互动按钮」 */
  press(name) {
    this.queue.add(name);
  }
}

export const input = new Input();
