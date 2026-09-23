/**
 * 抽籤那一段：像手把籤拿起來 —— 純數學，不 import three，不碰 DOM。
 *
 * v2 是「籤自己爬到筒口、翻出去、自由落體掉到地上」，使用者的回饋是「感覺籤自己跑出來，
 * 還會穿插整個籤筒，不是手把籤拿起來的感覺」。這裡改成一條**照劇本走的路徑**。
 *
 * v3 第一版把它拆成四段（抓住 → 抽出 → 拿到面前 → 拿著看），每段各自先慢後快再慢，
 * 使用者說「不是很絲滑」。量出來每個接縫的速度都歸零：抓住那一下先往上又往回掉、
 * 抽出跟拿到面前之間**完全停住再起步**、拿著看的兩秒整個凍住。現在是**一口氣**：
 *
 *   - 籤從放手那一刻起只有一條上升曲線，速度只有一個峰（前段），之後一路慢慢收；
 *   - 轉直、收向筒心、轉正都疊在上升過程裡，是高度的函數，不另排一段；
 *   - 拿到面前之後還在微微往上浮、輕輕晃起來，淡出的時候它還在動。
 *
 * 不畫手，「被拿起來」全靠這條曲線的節奏。沒有物理、沒有碰撞，所以要靠測試保證它
 * 在任何時刻都不穿出筒壁 —— 這是那句「穿插整個籤筒」唯一的解法。
 */

import { STICK_LEN, TUBE_H, type BundleSlot } from './geometry';

/** 放手到拿到面前。 */
export const RISE_MS = 2200;
/** 拿著看，給人讀籤號。 */
export const HOLD_MS = 1800;

export const HOLD_START = RISE_MS;
/** 整段演完，組件在這時開始淡出、交給籤紙頁。 */
export const PULL_DONE = HOLD_START + HOLD_MS;
/**
 * 淡出那段也還在動：時間軸延伸到這裡才停。組件的淡出（HANDOFF_FADE_MS）要比它短，
 * 畫面才不會在淡完之前先凍住。
 */
export const PULL_END = PULL_DONE + 500;

/** 抽出結束時，籤底離筒口多高。 */
export const CLEAR = 0.35;
/** 拿到面前時再提高多少。 */
export const PRESENT_LIFT = 1.0;
/** 拿著看的時候微微往上浮多少（整段慢慢浮完，淡出時還在浮）。 */
export const FLOAT = 0.25;
/** 拿著看時繞自己的軸輕晃的幅度（弧度）與週期。 */
const SWAY = 0.035;
const SWAY_MS = 2300;
/** 晃起來要多久：一到位就突然開始擺，看起來像被彈了一下。 */
const SWAY_IN_MS = 700;
/** 旁邊的籤被帶動：多近才會被帶到、最多跳多高。 */
const NUDGE_R = 1.6;
const NUDGE_MAX = 0.3;
/** 上升的前 40% 把傾角收直。 */
const STRAIGHTEN = 0.4;
/** 號碼淡入要多久。 */
export const NUMBER_FADE_MS = 300;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** 先慢、後快、再慢。 */
const ease = (u: number): number => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const smooth = (u: number): number => {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
};

/**
 * 一條只有一個速度峰的曲線：速度正比於 x·(1−x)^b，從 0 起步、峰在 1/(b+1)、收回 0。
 * b 越大，峰越前、尾巴越長。積出來是 1 − w^(b+1)·((b+2) − (b+1)·w)，w = 1 − x。
 *
 * 用它而不是 ease-in-out 接 ease-in-out：接縫只有一個（起點），中間不會有速度歸零的地方。
 */
const surge = (x: number, b: number): number => {
  const w = 1 - clamp01(x);
  return 1 - Math.pow(w, b + 1) * (b + 2 - (b + 1) * w);
};
/**
 * 上升：峰在 40%（約 0.9 秒），之後一路慢慢收到面前。浮用同一條曲線、拉長到整條時間軸 ——
 * 同一條曲線拉長之後處處比原本慢，所以浮的進度永遠不超過上升的進度。
 */
const SURGE_B = 1.5;

/** 壞掉的時間當成「還沒開始」或「已經演完」，不讓 NaN 流進畫面。 */
const sanitize = (ms: number): number => {
  if (Number.isNaN(ms) || ms === -Infinity) return 0;
  if (ms === Infinity) return PULL_END;
  return Math.min(PULL_END, Math.max(0, ms));
};

/** 上升進度 0..1（不含浮）。鏡頭也拿它當「籤被拿到哪了」。 */
export const riseProgress = (ms: number): number => surge(sanitize(ms) / RISE_MS, SURGE_B);
/** 浮的進度 0..1。永遠不超過上升進度 —— 鏡頭靠這條保證籤頭不會浮出畫面（framing.ts）。 */
export const floatProgress = (ms: number): number => surge(sanitize(ms) / PULL_END, SURGE_B);

/** 籤底要升到哪（不含浮）：離開筒口、再提高一段。 */
const TOP = TUBE_H + CLEAR + PRESENT_LIFT;

/** 籤底在哪（含浮）。上升和浮都是單調的，所以它只升不降。 */
const bottomAt = (slot: BundleSlot, ms: number): number =>
  slot.rest + (TOP - slot.rest) * riseProgress(ms) + FLOAT * floatProgress(ms);

/** 反解：籤底剛好升到 y 的那一刻。只升不降，二分就好。 */
const timeAtBottom = (slot: BundleSlot, y: number): number => {
  let lo = 0;
  let hi = RISE_MS;
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (bottomAt(slot, mid) < y) lo = mid;
    else hi = mid;
  }
  return hi;
};

const TYPICAL: BundleSlot = { x: 0, z: 0, yaw: 0, rest: 0, lean: 0, dirX: 0, dirZ: 0, row: 0 };
/** 抽出那一聲：籤真的開始往上滑（升過 0.1 單位）的那一刻。之前那一下是捏住的沙沙聲。 */
export const SLIDE_AT = Math.round(timeAtBottom(TYPICAL, 0.1));
/** 籤底升過筒口的那一刻：之前它還有一截在筒裡，旁邊的籤會被帶動。 */
export const CLEAR_AT = Math.round(timeAtBottom(TYPICAL, TUBE_H));
/**
 * 號碼開始淡入：已經離開筒口、收向筒心走了三成。鈴聲也在這一格（pullCues）。
 * 鏡頭推近途中看得到它出現（framing.ts 的 pullCamera）。
 */
export const NUMBER_AT = Math.round(timeAtBottom(TYPICAL, TUBE_H + (TOP - TUBE_H) * 0.4));

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
 * 籤靠在筒口那一點 (px, TUBE_H, pz) 上、往 (dx, dz) 方向傾 lean、籤底在 yb 時的姿態。
 *
 * 支點始終是**筒口那一點** —— 跟 geometry.ts 的 stickPose 同一個道理。傾角只會變小，
 * 所以筒口以下那一段只會往回收，不會比靜止時更靠近筒壁（測試逐格驗過）。
 */
function poseAt(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  lean: number,
  yb: number,
  yaw: number,
): PullPose {
  const sn = Math.sin(lean);
  const ax = dx * sn;
  const ay = Math.cos(lean);
  const az = dz * sn;
  const u = (yb - TUBE_H) / ay;
  const bx = px + ax * u;
  const bz = pz + az * u;
  const half = STICK_LEN / 2;
  return { cx: bx + ax * half, cy: yb + ay * half, cz: bz + az * half, ax, ay, az, yaw };
}

/**
 * 抽籤開始（放手）後 `ms` 毫秒，這一支該在哪。
 *
 * @param reduced 使用者開了「減少動畫」：直接到拿著看的樣子
 */
export function pullPose(slot: BundleSlot, ms: number, reduced = false): PullPose {
  const t = reduced ? Math.max(sanitize(ms), HOLD_START) : sanitize(ms);
  const { x: px, z: pz, dirX: dx, dirZ: dz } = slot;
  const lean = slot.lean * (1 - ease(riseProgress(t) / STRAIGHTEN));
  const yb = bottomAt(slot, t);
  // 收向筒心、轉正：只在整支離開筒口之後。還有一截在筒裡時轉，寬扁的籤身會掃過旁邊的籤
  const turn = smooth((yb - TUBE_H) / (TOP - TUBE_H));
  // 拿著看：只繞自己的軸輕輕晃，慢慢晃起來
  const s = t - HOLD_START;
  const sway = s > 0 ? SWAY * smooth(s / SWAY_IN_MS) * Math.sin((2 * Math.PI * s) / SWAY_MS) : 0;
  return poseAt(
    px * (1 - turn),
    pz * (1 - turn),
    dx,
    dz,
    lean,
    yb,
    slot.yaw * (1 - turn) + sway,
  );
}

/**
 * 號碼印上去的程度 0..1。組件把印著「第 N 籤」的那一面疊在籤身上，動它的不透明度。
 *
 * 先快後慢：一過 NUMBER_AT 就看得到一點，鈴聲那一格不會是空的。
 */
export function numberFade(ms: number, reduced = false): number {
  if (reduced) return 1;
  const u = clamp01((sanitize(ms) - NUMBER_AT) / NUMBER_FADE_MS);
  return 1 - (1 - u) * (1 - u);
}

/**
 * 旁邊的籤被帶得跳一下：離抽出那支 `dist` 遠的籤，在抽籤 `ms` 毫秒時往上多少。
 *
 * 只發生在它還有一截在筒裡的時候，越近跳越高。少了這個，那支籤像是從一束假籤裡穿出來的。
 */
export function neighborNudge(dist: number, ms: number): number {
  if (!(dist < NUDGE_R) || !Number.isFinite(ms)) return 0;
  const u = (ms - SLIDE_AT) / (CLEAR_AT - SLIDE_AT);
  if (!(u > 0 && u < 1)) return 0;
  const s = Math.sin(Math.PI * u);
  return NUDGE_MAX * (1 - Math.max(0, dist) / NUDGE_R) * s * s;
}

export type PullCue = 'grab' | 'slide' | 'reveal';

/**
 * 從上一格到這一格之間，該響哪些聲音。
 *
 * 聲音跟畫面對齊的做法是**用同一個時間軸**：號碼從 `ms >= NUMBER_AT` 那一格開始淡入，
 * 這裡的 reveal 也是跨過 NUMBER_AT 的那一格才響 —— 不管幀距多亂，兩者一定是同一格。
 * 以區間 (fromMs, toMs] 判斷，所以每個 cue 只會響一次。
 *
 * @param fromMs 上一格的時間；第一格傳 -1
 */
export function pullCues(fromMs: number, toMs: number, reduced = false): PullCue[] {
  const cues: Array<[PullCue, number]> = reduced
    ? [['reveal', 0]]
    : [['grab', 0], ['slide', SLIDE_AT], ['reveal', NUMBER_AT]];
  const out: PullCue[] = [];
  for (const [c, at] of cues) if (fromMs < at && at <= toMs) out.push(c);
  return out;
}
