/**
 * 宫庙签筒的尺寸与籤束排布 —— 纯数学，不 import 任何东西，不碰 DOM。
 *
 * 这个模块只回答两件事：筒子多大、36 支竹籤各自站在哪。它之所以独立成一个
 * 不依赖 three 的模块，是因为「看得见的错」几乎都是几何错，而几何错只有在
 * 能被单元测试钉住的时候才抓得到。
 *
 * 坐标约定：筒轴沿 Y，筒底内面在 y = 0，筒口在 y = TUBE_H。竹籤直立时沿 +Y。
 *
 * 比例的依据：真实宫庙签筒又细又高，籤挤成密实的一束。旧版做成 4.8 高 × 4.8 宽
 * 的方筒，36 支 0.34×0.048 的籤只占筒内截面的 3.6% —— 于是它们只能各自站着，
 * 看起来像插在土里。密度是被筒宽决定的，所以这里先定死内半径，再回推其余尺寸。
 */

/* ── 筒身 ── */

/** 筒内半径。籤束密度由它决定，是这一整套比例的起点。 */
export const TUBE_R_IN = 1.05;
/** 筒壁厚度。 */
export const TUBE_WALL = 0.12;
export const TUBE_R_OUT = TUBE_R_IN + TUBE_WALL;
/** 高径比 2.8 : 1 —— 传统签筒的样子。 */
export const TUBE_ASPECT = 2.8;
export const TUBE_H = TUBE_ASPECT * (2 * TUBE_R_OUT);

/* ── 竹籤 ── */

export const STICK_COUNT = 36;
/** 扁竹籤的宽与厚。真实竹籤约 10mm × 3mm，比例照搬。 */
export const STICK_W = 0.34;
export const STICK_T = 0.10;
/** 籤比筒长，所以一定会露出筒口一截 —— 这是签筒最好认的特征。 */
export const STICK_LEN = TUBE_H * 1.37;

/** 竹籤横截面的外接圆半径：排布时用它保证籤不会穿出筒壁。 */
export const STICK_HALF_DIAG = Math.hypot(STICK_W, STICK_T) / 2;
/** 籤心可以落在的最大半径。 */
export const BUNDLE_R = TUBE_R_IN - STICK_HALF_DIAG;

/** 籤束填充率：36 支的截面积占筒内截面积多少。密实的一束应该在 30% 以上。 */
export const bundleFill = (): number =>
  (STICK_COUNT * STICK_W * STICK_T) / (Math.PI * TUBE_R_IN * TUBE_R_IN);

/* ── 排布 ── */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** 确定性伪随机（Lehmer / MINSTD）—— 同一支籤每次都站在同一个地方。 */
export function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface BundleSlot {
  /** 筒内平面坐标。 */
  x: number;
  z: number;
  /** 绕自身轴的朝向。籤各转各的角度，才不会像栅栏一样排排站。 */
  yaw: number;
  /** 静止时籤底离筒底多高 —— 让籤头参差不齐，而不是一个平面。 */
  rest: number;
  /** 微微的倾斜（弧度），籤束才有向外散开的样子。 */
  tiltX: number;
  tiltZ: number;
}

/**
 * 第 i 支籤在筒内站哪。用 Vogel 向日葵螺旋铺满圆盘 —— 它给出的是等面积分布，
 * 不会像同心圆那样在中心留洞、在外圈挤成一圈（旧版就是同心圆，6/12/18 三环，
 * 所以中间空、外圈规律，一眼假）。
 */
export function bundleSlot(i: number, count = STICK_COUNT): BundleSlot {
  const rand = pseudoRandom(9871 + i * 131);
  // sqrt 让样点等面积分布；+0.5 避免第一支正好压在圆心。
  // 抖动只加在**半径**上并夹在 BUNDLE_R 以内 —— 早先把同一个抖动量同时加到 x 和 z，
  // 等于往对角线推了 jitter×√2，第 34 支就这样戳穿了筒壁（单元测试当场抓到）。
  const spiral = BUNDLE_R * Math.sqrt((i + 0.5) / count);
  const r = Math.max(0, Math.min(BUNDLE_R, spiral + (rand() - 0.5) * 0.06));
  const theta = i * GOLDEN_ANGLE + (rand() - 0.5) * 0.3;
  return {
    x: Math.cos(theta) * r,
    z: Math.sin(theta) * r,
    yaw: rand() * Math.PI,
    rest: rand() * 0.55,
    // 越靠外的籤越往外倾，像真的一束被筒口束住、上端散开
    tiltX: ((Math.cos(theta) * r) / BUNDLE_R) * 0.055 + (rand() - 0.5) * 0.02,
    tiltZ: ((Math.sin(theta) * r) / BUNDLE_R) * 0.055 + (rand() - 0.5) * 0.02,
  };
}

/** 籤头露出筒口多少（静止、未被搖动时）。 */
export const stickProtrusion = (slot: BundleSlot): number =>
  slot.rest + STICK_LEN - TUBE_H;
