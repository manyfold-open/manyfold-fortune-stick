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
  TUBE_R_OUT,
  PULL_INDEX,
  STICK_T,
  STICK_TIP,
  STICK_W,
  bundleSlot,
  cupRadius,
  stickPose,
} from './geometry';
import { PICK_LIFT } from './pick';
import { PULL_END, pullPose, riseProgress } from './pull';
import { SWIRL_MAX } from './stir';

/** 与 scene.ts 的 PerspectiveCamera 一致的垂直视角（度）。 */
export const FOV_DEG = 32;

/**
 * 近拍（拿著看那一鏡）画面边缘要留多少余裕。
 *
 * 1.0 = 籤刚好贴满整个画布，四边都擦着边 —— 那正是「被框住、被切掉」的观感。
 * 留一成，它才像放在页面上，而不是塞在一个盒子里。
 */
export const MARGIN = 1.1;

/**
 * 待機鏡頭的余裕。使用者：「籤筒可以再大一點」。
 *
 * 以前待機也留一成，那一成其實是在替「攪的時候籤會動」預留 —— 但攪動算下來只多用了 0.4%
 * （籤頭撥高 PICK_LIFT、籤束轉 SWIRL_MAX 最多到 0.913，靜止 0.909）。現在把這兩個極端直接
 * 算進 CONTENT，余裕只留 2%：籤筒大約大 7%，攪到最極端也不會被切。
 * 畫布本身是透明的、四周沒有框，貼近畫布邊緣看不出「被塞在盒子裡」。
 */
export const IDLE_MARGIN = 1.02;

/** 杯口那圈領子比杯身寬多少（跟 scene.ts 的 collar 一致）。 */
const COLLAR = 1.055;

/**
 * 待機時畫面裡所有會被看到的點（世界座標）：杯身外緣上下兩圈，外加每支籤頭圓盤的
 * 外接盒八個角。用外接盒而不是圓盤本身，是寧可多留一點白，也不要算漏一角。
 *
 * REST 是靜止時的；CONTENT 再加上攪動的極端 —— 籤頭被手撥高 PICK_LIFT、籤束繞筒軸轉到
 * ±SWIRL_MAX（跟 FortuneCylinder3D 的 place() 一樣繞垂直軸轉，往前轉的籤頭離鏡頭更近、投影更大）。
 */
const REST: Array<[number, number, number]> = [];
const CONTENT: Array<[number, number, number]> = [];
for (let k = 0; k < 96; k += 1) {
  const th = (k / 96) * Math.PI * 2;
  const r = cupRadius(th) * COLLAR;
  for (const y of [0, TUBE_H]) {
    const pt: [number, number, number] = [RIG_X + Math.cos(th) * r, RIG_Y + y, Math.sin(th) * r];
    REST.push(pt);
    CONTENT.push(pt);
  }
}
for (let i = 0; i < STICK_COUNT; i += 1) {
  const p = stickPose(bundleSlot(i));
  for (const lift of [0, PICK_LIFT]) {
    for (const phi of [0, -SWIRL_MAX, SWIRL_MAX]) {
      const hc = STICK_LEN / 2 + STICK_HEAD_GAP + lift;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) {
        const x = p.cx + p.ax * hc + dx * STICK_HEAD_R;
        const z = p.cz + p.az * hc + dz * STICK_HEAD_R;
        const pt: [number, number, number] = [RIG_X + x * c + z * sn, RIG_Y + p.cy + p.ay * hc + dy * STICK_HEAD_R, -x * sn + z * c];
        CONTENT.push(pt);
        if (lift === 0 && phi === 0) REST.push(pt);
      }
    }
  }
}

/** 靜止時畫面裡會被看到的點（測試用：待機鏡頭要把它們全部框住） */
export const IDLE_REST_CONTENT: ReadonlyArray<readonly [number, number, number]> = REST;

/** 待機鏡頭平視的高度：靜止時內容上下緣的正中間，籤筒才會在畫面裡上下置中。 */
export const IDLE_LOOK_Y = (() => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, y] of REST) {
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
  // 要 |NDC| ≤ 1/IDLE_MARGIN，逐點解出 d 的下限，取最大
  let d = 0;
  for (const [x, y, z] of CONTENT) {
    d = Math.max(d, (Math.abs(y - IDLE_LOOK_Y) * IDLE_MARGIN) / t + z, (Math.abs(x) * IDLE_MARGIN) / (t * a) + z);
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
/**
 * 筒口往下再多框多少（世界單位）：框到杯面上那行 GOOD LUCK，筒子才像是還站在那裡。
 * 只框到領子（0.45）時筒子剩一條邊，看起來還是「只剩籤」。
 */
export const RIM_SHOW = 1.6;

export interface CloseUpShot {
  camY: number;
  camZ: number;
  lookY: number;
}

/**
 * 籤被抽出一截、停在筒裡時，鏡頭最後停在哪（世界座標，x = 0，平視 -z）。
 *
 * 上緣是籤頭，下緣是**筒口正面**：推得越近號碼越大，但筒口不能出框 —— 第二版推到只剩籤，
 * 使用者說「籤筒往下移消失、只剩籤，很怪」。所以這一鏡是「籤頭貼上緣、筒口貼下緣」
 * 兩個條件一起解出來的：鏡頭高度與距離兩個未知數，剛好兩條式子。
 *
 * 橫向只要求籤頭圓盤在框內；窄螢幕上杯子兩側可以被切，筒口正中間那段一定在
 * （測試釘著）。要是籤頭跟筒口連在一起都框不下籤的寬度（極窄的畫布），就退後到框得下為止。
 */
export function closeUpShot(aspect: number): CloseUpShot {
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, Math.max(0.25, aspect)) : 1;
  const t = Math.tan((FOV_DEG / 2) * (Math.PI / 180));
  const m = 1 / MARGIN;
  const p = pullPose(bundleSlot(PULL_INDEX), PULL_END);
  // 籤頭：拿著的時候前後有一點點厚度，深度多留一個籤厚
  const topY = RIG_Y + p.cy + STICK_TIP;
  const topZ = p.cz + STICK_T;
  // 筒口正面（含領子）再往下一點
  const botY = RIG_Y + TUBE_H - RIM_SHOW;
  const botZ = TUBE_R_OUT * COLLAR;
  // 上：(topY − L) = m·t·(Z − topZ)；下：(L − botY) = m·t·(Z − botZ)
  let camZ = (topY - botY) / (2 * m * t) + (topZ + botZ) / 2;
  // 橫向：籤頭圓盤要在框內（也要框得下號碼那一段的籤寬）
  const x0 = Math.abs(RIG_X + p.cx);
  camZ = Math.max(camZ, (x0 + STICK_HEAD_R) / (m * t * a) + topZ, (x0 + STICK_W / 2) / (m * t * a) + botZ);
  // 退後了的話籤頭仍貼上緣，筒口就多露一點
  const lookY = topY - m * t * (camZ - topZ);
  return { camY: lookY, camZ, lookY };
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
