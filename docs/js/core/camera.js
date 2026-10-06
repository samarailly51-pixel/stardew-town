/**
 * 相机
 * ------------------------------------------------------------------
 * 跟随主角 + 夹在场景边界内。场景比视口大时才有滚动，
 * 比视口小时（模板生成的小场景）就居中显示，避免出现黑边。
 */
export class Camera {
  constructor(viewW, viewH) {
    this.vw = viewW;
    this.vh = viewH;
    this.x = 0;
    this.y = 0;
  }

  /** 目标点（世界像素坐标），平滑跟随 */
  follow(tx, ty, mapW, mapH, dt, instant = false) {
    const maxX = Math.max(0, mapW - this.vw);
    const maxY = Math.max(0, mapH - this.vh);

    // 地图比视口小 → 居中；否则让目标点落在画面中心
    const wantX = maxX <= 0 ? -((this.vw - mapW) / 2) : tx - this.vw / 2;
    const wantY = maxY <= 0 ? -((this.vh - mapH) / 2) : ty - this.vh / 2;

    const clampedX = Math.min(Math.max(wantX, 0), maxX);
    const clampedY = Math.min(Math.max(wantY, 0), maxY);

    if (instant) {
      this.x = clampedX;
      this.y = clampedY;
      return;
    }
    // 指数平滑：帧率无关，切场景后不会「飘一下」
    const k = 1 - Math.pow(0.0025, dt);
    this.x += (clampedX - this.x) * k;
    this.y += (clampedY - this.y) * k;
  }

  snap(tx, ty, mapW, mapH) {
    this.follow(tx, ty, mapW, mapH, 0, true);
  }

  /** 世界坐标 → 屏幕坐标 */
  toScreen(wx, wy) {
    return { x: Math.round(wx - this.x), y: Math.round(wy - this.y) };
  }
}
