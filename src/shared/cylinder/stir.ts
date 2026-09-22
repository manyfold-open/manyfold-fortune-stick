/**
 * 攪籤：手 → 籤束 —— 純數學，不 import three，不碰 DOM。取代 v2 的 shake.ts（甩筒）與 aim.ts（筒子跟手轉）。
 *
 * 籤筒 v3 固定不動，動的是筒裡的籤。手在畫面上繞圈，籤束就跟著手的左右方向在筒裡
 * 來回轉（繞筒軸），同時互相推擠、上下起伏。兩件事要同時成立，攪起來才像攪：
 *
 * 1. **跟手**：手往右，籤束正面也往右轉；手停，它就慢下來。
 * 2. **轉不過頭**：籤頭是正面朝鏡頭才看得到「籤」字，所以最多只轉 SWIRL_MAX；
 *    放手之後像被筒口扶正一樣轉回正面。
 *
 * 攪動量（work）決定什麼時候去跟伺服器要籤；它只跟**手自己的速度**有關 ——
 * 手速是使用者直接控制的量，拿它當強度最跟手（v2 拿筒子的速度，慢拖時幾乎歸零，
 * 使用者拖了半天進度條不動）。
 */

/** 手速到這裡就算滿強度（px/s）。約等於正常力道繞圈攪的速度。 */
export const FULL_SPEED = 550;
/** 手停下來之後強度的半衰期（秒）。 */
export const INTENSITY_HALFLIFE = 0.13;
/**
 * 取樣間隔的下限（秒）。點一下常常產生 1-2px、1ms 的移動 —— 算出來 2000px/s，
 * 直接頂滿強度。真實的 pointermove 約 16ms 一次，低於 12ms 一律當 12ms 算。
 */
export const MIN_SAMPLE_DT = 0.012;
/** 攪到這個累積量才去跟服務端要籤。正常力道繞圈約 3～4 秒 —— 夠久才有儀式感，太久會煩。 */
export const STIR_WORK_NEEDED = 16;
/** 每秒滿強度攪動累積多少。 */
const WORK_RATE = 4.5;

/** 籤束最多轉多少（弧度，約 31°）。再轉籤頭就變側面了。 */
export const SWIRL_MAX = 0.55;
/** 手的水平速度多少 px/s 對應籤束每秒轉 1 弧度。 */
const PX_PER_RAD = 300;
/** 按著的時候：籤束往手的轉速靠攏的速率，與把它拉回正面的弱彈簧。 */
const FOLLOW = 8;
const K_HELD = 6;
/** 放手之後：臨界阻尼的彈簧，一秒內轉回正面、不來回晃。 */
const K_FREE = 40;
const C_FREE = 2 * Math.sqrt(K_FREE);
/** 手的轉速訊號在沒有新移動時衰減得多快（半衰期，秒）。 */
const HAND_HALFLIFE = 0.08;
/** 籤束轉速變化 → 籤上下推擠的加速度。 */
const JOSTLE_GAIN = 0.8;
const JOSTLE_MAX = 38;

export interface StirState {
  /** 籤束繞筒軸轉了多少（弧度）。正值 = 正面往 +x（畫面右邊）轉。 */
  phi: number;
  omega: number;
  /** 手最近一次的水平速度換算成的轉速（rad/s）。 */
  hand: number;
  /** 歸一化攪動強度 0..1。 */
  intensity: number;
  /** 累積的攪動量，到 STIR_WORK_NEEDED 就去要籤。 */
  work: number;
  /** 籤在筒內感受到的推擠加速度（給 bundle.ts 的上下起伏）。 */
  jostle: number;
}

export const createStir = (): StirState => ({
  phi: 0,
  omega: 0,
  hand: 0,
  intensity: 0,
  work: 0,
  jostle: 0,
});

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

/**
 * 一次指標移動。
 *
 * @param dx 畫面像素位移，向右為正
 * @param dy 畫面像素位移，向下為正
 * @param dt 距上次移動的秒數
 */
export function pushStir(s: StirState, dx: number, dy: number, dt: number): void {
  const x = finite(dx);
  const y = finite(dy);
  const gap = Math.max(MIN_SAMPLE_DT, finite(dt));
  const speed = Math.hypot(x, y) / gap;
  // 取最大值而不是累加：強度是「現在攪得多用力」，不是「總共動了多少」
  s.intensity = Math.max(s.intensity, Math.min(1, speed / FULL_SPEED));
  s.hand = x / gap / PX_PER_RAD;
}

/**
 * 推進一幀。
 *
 * @param dragging 手還按著嗎
 * @param armed    這一局現在可以抽籤嗎（問題寫了、還沒抽過）。不 armed 照樣跟手（手感），但不記帳。
 */
export function stepStir(s: StirState, dt: number, dragging: boolean, armed: boolean): void {
  const h = Math.max(0, finite(dt));
  if (h === 0) return;
  const prevOmega = s.omega;

  if (dragging) {
    s.omega += (s.hand - s.omega) * Math.min(1, FOLLOW * h);
    s.omega -= K_HELD * s.phi * h;
  } else {
    s.omega += (-K_FREE * s.phi - C_FREE * s.omega) * h;
  }
  s.phi += s.omega * h;
  if (s.phi > SWIRL_MAX) {
    s.phi = SWIRL_MAX;
    s.omega = Math.min(0, s.omega);
  } else if (s.phi < -SWIRL_MAX) {
    s.phi = -SWIRL_MAX;
    s.omega = Math.max(0, s.omega);
  }

  s.jostle = Math.max(-JOSTLE_MAX, Math.min(JOSTLE_MAX, ((s.omega - prevOmega) / h) * JOSTLE_GAIN));
  s.hand *= Math.pow(0.5, h / HAND_HALFLIFE);
  s.intensity *= Math.pow(0.5, h / INTENSITY_HALFLIFE);
  if (armed) s.work += s.intensity * h * WORK_RATE;
}
