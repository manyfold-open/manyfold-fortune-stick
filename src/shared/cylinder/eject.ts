/**
 * 脱出的那一支籤的自由落体 —— 纯数学，不 import three，不碰 DOM。
 *
 * 筒内是降维的约束解算（bundle.ts），一旦某支籤翻过筒口就交到这里，变成真正的刚体：
 * 重力、翻滚、落地弹跳、最后躺平。只有一个物体，所以可以做得细。
 */

export const GRAVITY = 9.81;
/** 落地回弹。竹子落在木案几上，闷、不弹。 */
export const RESTITUTION = 0.3;
/** 触地的水平摩擦与自旋衰减。 */
export const FRICTION = 0.62;
export const SPIN_DAMP = 0.72;
/** 低于这个速度就算停了，开始躺平。 */
export const SETTLE_SPEED = 0.55;
/** 躺平的收敛速率（每秒）。 */
export const SETTLE_RATE = 7.5;

export interface FreeStick {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 欧拉角，够用了：这是一根细杆，不会出现万向锁看得出来的姿态。 */
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  /** 已经躺定。 */
  resting: boolean;
  /** 躺平的插值进度 0..1。 */
  settle: number;
}

export const createFreeStick = (): FreeStick => ({
  x: 0, y: 0, z: 0,
  vx: 0, vy: 0, vz: 0,
  rx: 0, ry: 0, rz: 0,
  wx: 0, wy: 0, wz: 0,
  resting: false,
  settle: 0,
});

/**
 * 推进一帧，原地改写。
 *
 * @param groundY  案几平面
 * @param halfThick 籤的半厚 —— 躺平时重心离地就是这个高度
 */
export function stepFree(b: FreeStick, dt: number, groundY: number, halfThick: number): void {
  if (b.resting) return;

  b.vy -= GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.rx += b.wx * dt;
  b.ry += b.wy * dt;
  b.rz += b.wz * dt;

  const floor = groundY + halfThick;
  if (b.y <= floor) {
    b.y = floor;
    if (b.vy < 0) b.vy = -b.vy * RESTITUTION;
    const f = Math.exp(-FRICTION * 60 * dt);
    b.vx *= f;
    b.vz *= f;
    const s = Math.exp(-SPIN_DAMP * 60 * dt);
    b.wx *= s;
    b.wy *= s;
    b.wz *= s;

    const speed = Math.hypot(b.vx, b.vy, b.vz);
    if (speed < SETTLE_SPEED) {
      // 躺平：把俯仰与翻滚收敛到 0，只留下绕竖直轴的朝向
      b.settle = Math.min(1, b.settle + SETTLE_RATE * dt);
      const k = b.settle;
      b.rx += (Math.PI / 2 - b.rx) * k * dt * SETTLE_RATE;
      b.rz += (0 - b.rz) * k * dt * SETTLE_RATE;
      b.vx *= 1 - k;
      b.vz *= 1 - k;
      b.vy *= 1 - k;
      b.wx *= 1 - k;
      b.wy *= 1 - k;
      b.wz *= 1 - k;
      if (
        b.settle >= 1 &&
        Math.hypot(b.vx, b.vy, b.vz) < 0.02 &&
        Math.abs(b.rx - Math.PI / 2) < 0.02
      ) {
        b.rx = Math.PI / 2;
        b.rz = 0;
        b.vx = 0;
        b.vy = 0;
        b.vz = 0;
        b.wx = 0;
        b.wy = 0;
        b.wz = 0;
        b.resting = true;
      }
    }
  }
}
