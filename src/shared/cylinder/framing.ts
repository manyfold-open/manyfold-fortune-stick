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
import { PULL_END, pullPose, riseProgress } from './pull';

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
 * 籤被拿到筒子正上方、正面朝鏡頭時，鏡頭最後停在哪（世界座標，x = 0，平視 -z）。
 *
 * 框的是**最後那一格**（拿著時還在微微往上浮，浮完才是這裡）、**籤頭到號碼與小圖案**，
 * 不是整支：這一鏡的工作是讓人看清第幾籤。
 * 籤被提得夠高，框到這一段時杯身和其他籤頭都自然落在畫面下緣之外（測試釘著），
 * 所以不必像 v2 那樣把筒子淡掉。
 */
export function closeUpShot(aspect: number): CloseUpShot {
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, Math.max(0.25, aspect)) : 1;
  const t = Math.tan((FOV_DEG / 2) * (Math.PI / 180));
  const p = pullPose(bundleSlot(PULL_INDEX), PULL_END);
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
 * 推近的進度：速度正比於 x²·(1−x)^b —— 起步比籤慢（x² 那一項），峰在 2/(b+2)，尾巴很長。
 * 積出來是 w^(b+1)、w^(b+2)、w^(b+3) 的組合，w = 1 − x。
 */
const lagged = (x: number, b: number): number => {
  const w = 1 - Math.min(1, Math.max(0, x));
  const term = (k: number) => (1 - Math.pow(w, k)) / k;
  const full = 1 / (b + 1) - 2 / (b + 2) + 1 / (b + 3);
  return (term(b + 1) - 2 * term(b + 2) + term(b + 3)) / full;
};
/**
 * 推近分兩層疊起來：主推在 PUSH_MS 內推完九成，峰在 40%（約 1.1 秒，籤頭的峰在 0.9 秒）；
 * 剩下一成拉滿整條時間軸，拿著看的時候還在極慢地推、淡出時也還沒停。
 * 主推在尾巴長起來之前早就在減速，兩層疊起來仍只有一個速度峰（測試釘著）。
 */
const PUSH_MS = 2800;
const PUSH_TAIL = 0.1;
const pushProgress = (t: number): number =>
  (1 - PUSH_TAIL) * lagged(t / PUSH_MS, 3) + PUSH_TAIL * lagged(t / PULL_END, 2);

/**
 * 拿籤全程鏡頭該在哪：拆成兩個通道，從待機鏡頭一路變成近拍。
 *
 * - **推近**（camZ）走自己的時間表，慢一拍、拉得長：籤先動，鏡頭後推，拿著看的時候還在
 *   極慢地推完。v3 第一版把推近綁死在籤頭高度上，籤一衝鏡頭就跟著衝（峰值 43 u/s）。
 * - **視線高度**（lookY）跟著籤走：給定這一格站多遠，直接解出要看多高，籤頭才會落在
 *   畫面上預定的那一條高度。那條高度從待機時籤頭的位置，隨上升進度移到近拍時的位置。
 *
 * 為什麼一定框得住：解的是一支「虛擬籤頭」—— 把浮的量跟著上升進度一起算。真正的籤頭
 * 浮得比上升慢（pull.ts 的 floatProgress ≤ riseProgress），所以永遠不高於虛擬那支，
 * 也就永遠不高於預定那條線；那條線夾在待機與近拍兩個籤頭位置之間，兩個都在框裡。
 * 最後一格上升和浮都走完，虛擬籤頭就是真籤頭，鏡頭剛好停在近拍。測試逐格驗過。
 */
export function pullCamera(ms: number, aspect: number, reduced = false): CloseUpShot {
  const cu = closeUpShot(aspect);
  if (reduced) return cu;
  const t = Number.isFinite(ms) ? Math.min(PULL_END, Math.max(0, ms)) : 0;
  const th = Math.tan((FOV_DEG / 2) * (Math.PI / 180));
  const idleZ = idleCameraZ(aspect);
  const slot = bundleSlot(PULL_INDEX);
  const tipOf = (at: number) => {
    const p = pullPose(slot, at);
    return { y: RIG_Y + p.cy + p.ay * STICK_TIP, z: p.cz + p.az * STICK_TIP };
  };
  const t0 = tipOf(0);
  const t1 = tipOf(PULL_END);
  // 籤頭在畫面上的高度（NDC）：待機時、近拍時
  const y0 = (t0.y - IDLE_LOOK_Y) / ((idleZ - t0.z) * th);
  const y1 = (t1.y - cu.lookY) / ((cu.camZ - t1.z) * th);

  const camZ = idleZ + (cu.camZ - idleZ) * pushProgress(t);
  const r = riseProgress(t);
  const tipY = t0.y + (t1.y - t0.y) * r;
  const lookY = tipY - (y0 + (y1 - y0) * r) * (camZ - tipOf(t).z) * th;
  return { camY: lookY, camZ, lookY };
}
