/**
 * 筒内籤束的约束解算 —— 纯数学，不 import three，不碰 DOM。
 *
 * 36 根细长桿在窄筒里做全刚体模拟，实务上几乎一定会抖动、穿透、炸开。这里改用
 * **降维**的模型：每支籤只有沿筒轴的位移与速度，外加彼此之间的摩擦耦合。筒内稳定，
 * 而真正需要细致的只有脱出的那一支 —— 那一支交给 eject.ts 做真的自由落体。
 *
 * 会动的物理都在这里，于是「摇多久才掉」「掉之前像不像一整束」这种只能靠手感判断
 * 的事，至少它的不变量（不穿筒底、能量不会自己长出来、一定会停）是被测试钉住的。
 */

import { STICK_LEN, TUBE_H, pseudoRandom } from './geometry';

export const GRAVITY = 9.81;
/** 每秒的速度衰减（空气与竹皮摩擦）。 */
export const DAMP = 1.9;
/** 籤与籤之间的摩擦耦合：整束会一起动，而不是各弹各的。 */
export const COUPLING = 3.2;
/** 撞到筒底的回弹系数。竹子撞木头，弹不高。 */
export const FLOOR_RESTITUTION = 0.16;
/**
 * 棘轮效应的**峰值**加速度（intensity = 1 时）。摇动让籤一格一格往上爬，
 * 就是巴西坚果效应。
 *
 * 这个值必须**小于**重力沿轴的分量（约 8.79），否则光靠摇就能把整束籤送出筒外 ——
 * 第一版写成随原始加速度线性放大，摇两秒半 36 支全部飞到 y≈16，单元测试当场抓到。
 * 最贪心的那支籤峰值也只有 RATCHET × climb_max = 5.2 × 1.45 ≈ 7.5 < 8.79，
 * 所以普通籤只会被顶起来又落回去 —— 这正是筒口那一片籤头翻滚的样子。
 */
export const RATCHET = 5.2;
/**
 * 中签那一支额外得到的向上驱力，**乘上摇动强度**。
 *
 * 一定要乘：写成常数的话那支籤会无条件往上飘，变成「它自己浮上来」而不是
 * 「被你摇出来」—— 实测回报「也太怪」。籤是摇出来的，停手就不该继续爬。
 *
 * 满强度时净得 11.2 + 棘轮 − 8.79 > 0，摇着就爬；强度归零时这一项也归零。
 */
export const CHOSEN_LIFT = 11.2;

/**
 * 摩擦咬合：低于这个强度，籤束挤在一起互相卡住，谁都不会自己滑下去。
 *
 * 没有它，停手之后中签那支会沉回筒底，使用者就永远等不到籤 —— 也是实测踩到的。
 * 有了它，停手 = 停在原地：不沉回去，也不自己往上飘。这两件事要同时成立。
 */
export const GRIP_RELEASE = 0.25;
/** 完全卡死时每帧保留多少速度。留一点点，免得看起来像被冻住。 */
export const GRIP_HOLD = 0.1;

export interface StickMotion {
  /** 沿筒轴离静止位置的位移，向上为正。永远 >= 0（不会穿过筒底）。 */
  y: number;
  vy: number;
}

/** 每支籤的个体差异：反应快慢与爬升倾向。没有它整束会像一块铁板一起动。 */
export interface StickTrait {
  resp: number;
  climb: number;
}

export const createMotions = (count: number): StickMotion[] =>
  Array.from({ length: count }, () => ({ y: 0, vy: 0 }));

export const stickTrait = (i: number): StickTrait => {
  const rand = pseudoRandom(5501 + i * 211);
  return { resp: 0.72 + rand() * 0.56, climb: 0.55 + rand() * 0.9 };
};

/**
 * 中签那一支要爬多高才会翻出筒口。
 *
 * 判准是**重心**越过筒口：重心一出去，斜持的筒子靠重力就会把它带倒、滑出去。
 * 用「整支籤完全离开筒子」当判准是错的 —— 那要爬 6.5 个单位，摇到天亮都掉不出来。
 */
export const exitRise = (rest: number): number =>
  Math.max(0.35, TUBE_H - STICK_LEN / 2 - rest);

/**
 * 推进一帧。out 就是传进来的 motions，原地改写 —— 帧循环里不分配。
 *
 * @param axisGravity 重力沿筒轴的分量（筒子斜持，所以不是整个 g）
 * @param shakeA      手的加速度沿筒轴的分量，有正负
 * @param intensity   **归一化**的摇动强度 0..1，驱动棘轮（不是原始加速度）
 * @param chosen      中签的下标；-1 表示还没抽到
 */
export function stepBundle(
  motions: StickMotion[],
  traits: StickTrait[],
  dt: number,
  axisGravity: number,
  shakeA: number,
  intensity: number,
  chosen: number,
): void {
  const n = motions.length;
  if (n === 0) return;

  let meanV = 0;
  for (let i = 0; i < n; i += 1) meanV += motions[i].vy;
  meanV /= n;

  const decay = Math.exp(-DAMP * dt);
  const drive = Math.min(1, Math.max(0, intensity));
  // 不摇的时候籤束靠摩擦咬死；摇到 GRIP_RELEASE 就完全松开
  const grip = Math.max(0, 1 - drive / GRIP_RELEASE);
  const hold = 1 - grip * (1 - GRIP_HOLD);

  for (let i = 0; i < n; i += 1) {
    const m = motions[i];
    const t = traits[i];
    let a = -axisGravity + shakeA * t.resp + drive * RATCHET * t.climb;
    if (i === chosen) a += drive * CHOSEN_LIFT;
    m.vy += a * dt;
    // 邻籤摩擦：往整束的平均速度靠拢
    m.vy += (meanV - m.vy) * Math.min(1, COUPLING * dt);
    m.vy *= decay;
    // 咬合：静止时速度被压掉，籤就卡在原地不动
    m.vy *= hold;
    m.y += m.vy * dt;
    if (m.y < 0) {
      m.y = 0;
      if (m.vy < 0) m.vy = -m.vy * FLOOR_RESTITUTION;
    }
  }
}

/** 整束的动能 —— 测试用它确认摇停之后能量会归零，不会自己长出来。 */
export const bundleEnergy = (motions: StickMotion[]): number =>
  motions.reduce((s, m) => s + m.vy * m.vy, 0);
