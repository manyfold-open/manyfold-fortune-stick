/**
 * 抽籤那一段：像手把籤拿起來 —— 純數學，不 import three，不碰 DOM。
 *
 * v2 是「籤自己爬到筒口、翻出去、自由落體掉到地上」，使用者的回饋是「感覺籤自己跑出來，
 * 還會穿插整個籤筒，不是手把籤拿起來的感覺」。這裡改成一條**照劇本走的路徑**：
 *
 *   抓住（輕提、頓一下）→ 抽出（貼著筒口滑出、轉直）→ 拿到面前（再提高、轉正）→ 拿著看（輕晃）
 *
 * 不畫手，「被拿起來」全靠這幾個動作的節奏。沒有物理、沒有碰撞，所以要靠測試保證它
 * 在任何時刻都不穿出筒壁 —— 這是那句「穿插整個籤筒」唯一的解法。
 */

import { STICK_LEN, TUBE_H, type BundleSlot } from './geometry';

/** 抓住：其他籤停下，這支先輕提再頓回來。 */
export const GRAB_MS = 300;
/** 抽出：邊上升邊轉直，直到整支離開筒口。 */
export const PULL_MS = 1000;
/** 拿到面前：再提高一段、轉正面對鏡頭。 */
export const PRESENT_MS = 700;
/** 拿著看：輕晃，給人讀籤號。 */
export const HOLD_MS = 2000;

export const PULL_START = GRAB_MS;
export const PRESENT_START = PULL_START + PULL_MS;
export const HOLD_START = PRESENT_START + PRESENT_MS;
/** 整段演完，接著淡出交給籤紙頁。 */
export const PULL_DONE = HOLD_START + HOLD_MS;

/** 什麼時候換上印著「第 N 籤」的貼圖：轉正到一半，鏡頭推近途中看得到它出現（鏡頭見 framing.ts 的 pullCamera）。 */
export const NUMBER_AT = PRESENT_START + 350;

/** 抓住那一下往上提多少（世界單位）。是捏住的阻力，不是跳起來。 */
export const TUG = 0.14;
/** 抽出結束時，籤底離筒口多高。 */
export const CLEAR = 0.35;
/** 拿到面前時再提高多少。 */
export const PRESENT_LIFT = 1.0;
/** 旁邊的籤被帶動：多近才會被帶到、最多跳多高。 */
const NUDGE_R = 1.6;
const NUDGE_MAX = 0.3;
/** 抽出的前 40% 把傾角收直。 */
const STRAIGHTEN = 0.4;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** 先慢、後快、再慢。 */
const ease = (u: number): number => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** 壞掉的時間當成「還沒開始」或「已經演完」，不讓 NaN 流進畫面。 */
const sanitize = (ms: number): number => {
  if (Number.isNaN(ms) || ms === -Infinity) return 0;
  if (ms === Infinity) return PULL_DONE;
  return Math.min(PULL_DONE, Math.max(0, ms));
};

export interface PullPose {
  /** 籤心（mesh 原點），筒的局部座標：筒軸沿 Y、筒底內面 y = 0。 */
  cx: number;
  cy: number;
  cz: number;
  /** 籤軸（籤底 → 籤頭）的單位向量。 */
  ax: number;
  ay: number;
  az: number;
  /** 繞自己的軸轉多少。0 = 正面朝鏡頭。 */
  yaw: number;
}

/**
 * 籤靠在筒口那一點 (dx·r, TUBE_H, dz·r) 上、往外傾 lean、籤底在 yb 時的姿態。
 *
 * 支點始終是**筒口那一點**：傾角變小時籤底往外擺、但筒口以下最寬的地方仍是 r，
 * 所以只要 r ≤ BUNDLE_R 就不會穿出內壁 —— 跟 geometry.ts 的 stickPose 同一個道理。
 */
function poseAt(dx: number, dz: number, r: number, lean: number, yb: number, yaw: number): PullPose {
  const sn = Math.sin(lean);
  const ax = dx * sn;
  const ay = Math.cos(lean);
  const az = dz * sn;
  const u = (yb - TUBE_H) / ay;
  const bx = dx * r + ax * u;
  const bz = dz * r + az * u;
  const half = STICK_LEN / 2;
  return { cx: bx + ax * half, cy: yb + ay * half, cz: bz + az * half, ax, ay, az, yaw };
}

/**
 * 抽籤開始後 `ms` 毫秒，這一支該在哪。
 *
 * @param reduced 使用者開了「減少動畫」：直接到拿著看的樣子
 */
export function pullPose(slot: BundleSlot, ms: number, reduced = false): PullPose {
  const t = reduced ? Math.max(sanitize(ms), HOLD_START) : sanitize(ms);
  const r = Math.hypot(slot.x, slot.z);
  const dx = r > 1e-9 ? slot.x / r : 0;
  const dz = r > 1e-9 ? slot.z / r : 0;
  const out = TUBE_H + CLEAR;

  if (t < PULL_START) {
    // 抓住：捏住籤頭往上一提，被鄰居卡住，頓回原位
    const lift = TUG * Math.sin(Math.PI * (t / GRAB_MS));
    return poseAt(dx, dz, r, slot.lean, slot.rest + lift, slot.yaw);
  }
  if (t < PRESENT_START) {
    const p = ease((t - PULL_START) / PULL_MS);
    const lean = slot.lean * (1 - ease(p / STRAIGHTEN));
    return poseAt(dx, dz, r, lean, slot.rest + (out - slot.rest) * p, slot.yaw);
  }
  if (t < HOLD_START) {
    // 已經離開筒口，往筒心正上方收、再提高、轉正
    const p = ease((t - PRESENT_START) / PRESENT_MS);
    return poseAt(dx, dz, r * (1 - p), 0, out + PRESENT_LIFT * p, slot.yaw * (1 - p));
  }
  // 拿著看：只繞自己的軸輕輕晃，不上下晃（高度只升不降，看起來才是被拿穩的）
  const s = t - HOLD_START;
  return poseAt(dx, dz, 0, 0, out + PRESENT_LIFT, 0.035 * Math.sin((2 * Math.PI * s) / 2300));
}

/**
 * 旁邊的籤被帶得跳一下：離抽出那支 `dist` 遠的籤，在抽籤 `ms` 毫秒時往上多少。
 *
 * 只發生在抽出那一段，越近跳越高。少了這個，那支籤像是從一束假籤裡穿出來的。
 */
export function neighborNudge(dist: number, ms: number): number {
  if (!(dist < NUDGE_R) || !Number.isFinite(ms)) return 0;
  const u = (ms - PULL_START) / PULL_MS;
  if (!(u > 0 && u < 1)) return 0;
  return NUDGE_MAX * (1 - Math.max(0, dist) / NUDGE_R) * Math.sin(Math.PI * u);
}

export type PullCue = 'grab' | 'slide' | 'reveal';

/**
 * 從上一格到這一格之間，該響哪些聲音。
 *
 * 聲音跟畫面對齊的做法是**用同一個時間軸**：換號碼貼圖的條件是 `ms >= NUMBER_AT`，
 * 這裡的 reveal 也是跨過 NUMBER_AT 的那一格才響 —— 不管幀距多亂，兩者一定是同一格。
 * 以區間 (fromMs, toMs] 判斷，所以每個 cue 只會響一次。
 *
 * @param fromMs 上一格的時間；第一格傳 -1
 */
export function pullCues(fromMs: number, toMs: number, reduced = false): PullCue[] {
  const cues: Array<[PullCue, number]> = reduced
    ? [['reveal', 0]]
    : [['grab', 0], ['slide', PULL_START], ['reveal', NUMBER_AT]];
  const out: PullCue[] = [];
  for (const [c, at] of cues) if (fromMs < at && at <= toMs) out.push(c);
  return out;
}
