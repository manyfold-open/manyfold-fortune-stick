/**
 * 筒內籤束的上下起伏 —— 純數學，不 import three，不碰 DOM。
 *
 * 60 根、20 根細長桿在筒裡做全剛體模擬，實務上一定抖動、穿透、炸開。這裡用**降維**
 * 的模型：每支籤只有沿自己籤軸的位移與速度，外加彼此之間的摩擦耦合。
 *
 * v3 起它只負責「攪的時候籤互相推擠、上下起伏」。v2 靠它把中籤那支一格一格頂出筒口
 * （棘輪 + CHOSEN_LIFT），v3 的籤是被拿出來的（pull.ts），那一整套已經拿掉。
 * 留下來的不變量由測試釘著：不穿筒底、能量不會自己長出來、停手一定會停、
 * 攪再久也只是原地起伏。
 */

import { pseudoRandom } from './geometry';

export const GRAVITY = 9.81;
/** 每秒的速度衰減（空氣與竹皮摩擦）。 */
export const DAMP = 1.9;
/** 籤与籤之间的摩擦耦合：整束会一起动，而不是各弹各的。 */
export const COUPLING = 3.2;
/** 撞到筒底的回弹系数。竹子撞木头，弹不高。 */
export const FLOOR_RESTITUTION = 0.16;
/**
 * 攪動把籤往上頂的峰值加速度（強度 = 1 時）。
 *
 * 必須**小於**重力，否則光靠攪就能把整束籤頂出筒外：這支最貪心的籤峰值也只有
 * RATCHET × climb_max = 5.8 × 1.45 ≈ 8.4 < 9.81，所以籤只會被頂起來又落回去。
 */
export const RATCHET = 5.8;

/**
 * 摩擦咬合：低于这个强度，籤束挤在一起互相卡住，谁都不会自己滑下去。
 * 停手 = 停在原地（慢慢歇回去），不會自己亂跳。
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
 * 推进一帧。out 就是传进来的 motions，原地改写 —— 帧循环里不分配。
 *
 * @param jostle    籤束轉速變化帶來的推擠加速度（stir.ts），有正負
 * @param intensity **归一化**的攪動强度 0..1
 */
export function stepBundle(
  motions: StickMotion[],
  traits: StickTrait[],
  dt: number,
  jostle: number,
  intensity: number,
): void {
  const n = motions.length;
  if (n === 0) return;

  let meanV = 0;
  for (let i = 0; i < n; i += 1) meanV += motions[i].vy;
  meanV /= n;

  const decay = Math.exp(-DAMP * dt);
  const drive = Math.min(1, Math.max(0, intensity));
  // 不攪的时候籤束靠摩擦咬死；攪到 GRIP_RELEASE 就完全松开
  const grip = Math.max(0, 1 - drive / GRIP_RELEASE);
  const hold = 1 - grip * (1 - GRIP_HOLD);

  for (let i = 0; i < n; i += 1) {
    const m = motions[i];
    const t = traits[i];
    m.vy += (-GRAVITY + jostle * t.resp + drive * RATCHET * t.climb) * dt;
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

/**
 * 放手之後其他籤怎麼歇下來：臨界阻尼彈簧，約半秒回到原位。
 *
 * 舊版是 `y *= exp(-6·dt)`：一開始就是最快的速度往下掉，0.17 秒就停，看起來是「啪」一下
 * 落回去。臨界阻尼從它當下的速度接著走，先慢慢轉向、再收回原位，不回彈。
 * 每一格用解析解推進，跟幀率無關。
 */
export const SETTLE_RATE = 8;

export function settleStep(m: StickMotion, dt: number): void {
  if (!(dt > 0)) return;
  const w = SETTLE_RATE;
  const c2 = m.vy + w * m.y;
  const e = Math.exp(-w * dt);
  const y = (m.y + c2 * dt) * e;
  m.vy = (c2 - w * (m.y + c2 * dt)) * e;
  m.y = y;
  if (m.y < 0) {
    m.y = 0;
    m.vy = 0;
  }
}
