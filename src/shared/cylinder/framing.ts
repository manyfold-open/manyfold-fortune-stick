/**
 * 鏡頭該站多遠 —— 純數學，不 import three，不碰 DOM。
 *
 * 距離是**算出來的**，不是對著畫面量的。量出來的數字會騙人：貼邊和差一點點切到，
 * 在縮圖上看起來一模一樣，換一台螢幕就露餡（這個坑踩過一次）。
 *
 * 兩件事決定它，少算一件就會切到：
 *
 * 1. **透視相機的 fov 是垂直的**，橫向視野等於縱向乘上畫布長寬比。竖屏畫布橫向少一截。
 * 2. **透視**：杯身正面、往前散開的籤頭都比注視點更靠近鏡頭，投影出來比同樣大小、
 *    站在注視點那個深度的東西更大。v2 拿世界尺寸去比注視點深度的視野，實測下緣只剩 2%。
 *    所以這裡逐點用它**自己的深度**去算。
 *
 * v3 籤筒固定不動、站正，不再掃傾角 —— 省下的空間全部拿來把籤筒放大。
 */

import {
  RIG_X,
  RIG_Y,
  STICK_COUNT,
  STICK_HEAD_GAP,
  STICK_HEAD_R,
  STICK_LEN,
  TUBE_H,
  PULL_INDEX,
  STICK_T,
  STICK_TIP,
  STICK_W,
  bundleSlot,
  cupRadius,
  stickPose,
} from './geometry';
import { HOLD_START, PULL_START, pullPose } from './pull';

/** 与 scene.ts 的 PerspectiveCamera 一致的垂直视角（度）。 */
export const FOV_DEG = 32;

/**
 * 画面边缘要留多少余裕。
 *
 * 1.0 = 籤筒刚好贴满整个画布，四边都擦着边 —— 那正是「被框住、被切掉」的观感。
 * 留一成，它才像放在页面上，而不是塞在一个盒子里。
 */
export const MARGIN = 1.1;

/** 杯口那圈領子比杯身寬多少（跟 scene.ts 的 collar 一致）。 */
const COLLAR = 1.055;

/**
 * 待機時畫面裡所有會被看到的點（世界座標）：杯身外緣上下兩圈，外加每支籤頭圓盤的
 * 外接盒八個角。用外接盒而不是圓盤本身，是寧可多留一點白，也不要算漏一角。
 */
const CONTENT: Array<[number, number, number]> = [];
for (let k = 0; k < 96; k += 1) {
  const th = (k / 96) * Math.PI * 2;
  const r = cupRadius(th) * COLLAR;
  for (const y of [0, TUBE_H]) CONTENT.push([RIG_X + Math.cos(th) * r, RIG_Y + y, Math.sin(th) * r]);
}
for (let i = 0; i < STICK_COUNT; i += 1) {
  const p = stickPose(bundleSlot(i));
  const hc = STICK_LEN / 2 + STICK_HEAD_GAP;
  const hx = RIG_X + p.cx + p.ax * hc;
  const hy = RIG_Y + p.cy + p.ay * hc;
  const hz = p.cz + p.az * hc;
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) {
    CONTENT.push([hx + dx * STICK_HEAD_R, hy + dy * STICK_HEAD_R, hz + dz * STICK_HEAD_R]);
  }
}

/** 待機鏡頭平視的高度：內容上下緣的正中間，籤筒才會在畫面裡上下置中。 */
export const IDLE_LOOK_Y = (() => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, y] of CONTENT) {
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return (lo + hi) / 2;
})();

/**
 * @param aspect 画布长宽比 = 宽 / 高
 */
export function idleCameraZ(aspect: number): number {
  // ResizeObserver 在元素还没量到尺寸时会给出 0，算出来就是 Infinity
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, Math.max(0.25, aspect)) : 1;
  const t = Math.tan((FOV_DEG / 2) * (Math.PI / 180));
  // 鏡頭在 (0, IDLE_LOOK_Y, d) 平視 -z：一點 (x, y, z) 的 NDC 是 x / ((d - z)·t·a)。
  // 要 |NDC| ≤ 1/MARGIN，逐點解出 d 的下限，取最大
  let d = 0;
  for (const [x, y, z] of CONTENT) {
    d = Math.max(d, (Math.abs(y - IDLE_LOOK_Y) * MARGIN) / t + z, (Math.abs(x) * MARGIN) / (t * a) + z);
  }
  return d;
}

/* ── 拿著看那一鏡 ── */

/**
 * 近拍要框到籤身多深（占籤身全長的比例，從籤身頂端往下量）。
 *
 * 籤身貼圖上從頂端往下依序是：圓拱框裡的「第 N 籤」、GOOD LUCK、小圖案（畫在 33.5% 那一行）。
 * 框到 38% 才包得住小圖案 —— 那是每支籤不一樣的小驚喜，切掉一半很可惜。
 */
export const CLOSE_UP_BODY = 0.38;

export interface CloseUpShot {
  camY: number;
  camZ: number;
  lookY: number;
}

/**
 * 籤被拿到筒子正上方、正面朝鏡頭時，鏡頭該站哪（世界座標，x = 0，平視 -z）。
 *
 * 框的是**籤頭到號碼與小圖案**，不是整支：這一鏡的工作是讓人看清第幾籤。
 * 籤被提得夠高，框到這一段時杯身和其他籤頭都自然落在畫面下緣之外（測試釘著），
 * 所以不必像 v2 那樣把筒子淡掉。
 */
export function closeUpShot(aspect: number): CloseUpShot {
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, Math.max(0.25, aspect)) : 1;
  const t = Math.tan((FOV_DEG / 2) * (Math.PI / 180));
  const p = pullPose(bundleSlot(PULL_INDEX), HOLD_START);
  const top = RIG_Y + p.cy + STICK_TIP;
  const bodyTop = RIG_Y + p.cy + STICK_LEN / 2;
  const headY = bodyTop + STICK_HEAD_GAP;
  const bottom = bodyTop - CLOSE_UP_BODY * STICK_LEN;
  const lookY = (top + bottom) / 2;
  const x0 = RIG_X + p.cx;
  // 拿著時會繞自己的軸輕晃，籤頭圓盤的邊會往鏡頭擺出一點點：深度多留一個籤厚
  const front = p.cz + STICK_T;
  const pts: Array<[number, number]> = [
    [x0, top],
    [x0 - STICK_HEAD_R, headY],
    [x0 + STICK_HEAD_R, headY],
    [x0 - STICK_W / 2, bottom],
    [x0 + STICK_W / 2, bottom],
  ];
  let d = 0;
  for (const [x, y] of pts) {
    d = Math.max(d, (Math.abs(y - lookY) * MARGIN) / t + front, (Math.abs(x) * MARGIN) / (t * a) + front);
  }
  return { camY: lookY, camZ: d, lookY };
}

/**
 * 拿籤全程鏡頭該在哪：**跟著籤的高度走**，從待機鏡頭一路變成近拍。
 *
 * v3 第一版用固定時間表（1.0 秒才開始推、2.4 秒到位），籤卻在 0.3～1.3 秒就往上衝了
 * 七個多單位 —— 籤頭先衝出畫面頂端、鏡頭才追上去，看起來很怪。改成拿籤頭高度的進度
 * 當鏡頭進度：籤升多少，鏡頭就跟多少，像是視線跟著那隻手。
 *
 * 為什麼一定框得住：籤頭高度、鏡頭高度、鏡頭距離三者都是同一個進度 p 的線性函數，
 * 「籤頭在畫面裡」這個條件在 p 上也是線性的 —— 起點（待機）和終點（近拍）都成立，
 * 中間每一點就都成立。測試逐格驗過。
 */
export function pullCamera(ms: number, aspect: number, reduced = false): CloseUpShot {
  const cu = closeUpShot(aspect);
  if (reduced) return cu;
  const idleZ = idleCameraZ(aspect);
  const slot = bundleSlot(PULL_INDEX);
  const tipY = (t: number): number => {
    const p = pullPose(slot, t);
    return p.cy + p.ay * STICK_TIP;
  };
  const from = tipY(0);
  const to = tipY(HOLD_START);
  // 抓住那一下的輕提不算：鏡頭跟著它一抖一抖反而怪
  const t = Number.isFinite(ms) ? ms : 0;
  const p = t < PULL_START ? 0 : Math.min(1, Math.max(0, (tipY(t) - from) / (to - from)));
  return {
    camY: IDLE_LOOK_Y + (cu.camY - IDLE_LOOK_Y) * p,
    camZ: idleZ + (cu.camZ - idleZ) * p,
    lookY: IDLE_LOOK_Y + (cu.lookY - IDLE_LOOK_Y) * p,
  };
}
