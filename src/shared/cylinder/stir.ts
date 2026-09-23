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
 * 什麼時候去跟伺服器要籤，看的是**手在籤上繞了多遠**（travel），不是手多快。
 * 以前拿手速的強度去積分：手速門檻照桌機訂，手機上溫柔地小圈攪只有三分之一的強度，
 * 要攪三秒半以上；累積又放在每一格裡、每格最多算 0.05 秒，卡的手機再慢幾成 ——
 * 很多人攪到一半就放手，看起來像抽不出來。現在：
 *
 * - 繞多遠用「籤扇在畫面上多寬」當單位，手機和桌機要繞的圈數一樣；
 * - 在指標事件裡累積，畫面幾格都不影響；
 * - 另外要攪滿一段時間（STIR_TIME_NEEDED），猛甩一下不算；
 * - 差一點點就放手也算（RELEASE_GRACE）。
 *
 * 強度（intensity）照舊看手速，只管畫面和聲音：攪得越兇籤晃得越厲害。
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
/**
 * 手要在籤上繞多遠才算數（單位：籤扇在畫面上的寬度）。約等於在籤上繞一圈，
 * 正常力道約 0.6 秒（被 STIR_TIME_NEEDED 墊著）、慢慢攪約 2～2.5 秒。
 * 使用者要「好抽一點」：以前約一圈半、慢慢攪要三秒半。
 *
 * 這不是「要攪多久」，是「真的攪了」的下限 —— 攪多久由使用者決定，想攪多久都行，
 * 放手就抽。曾經設成約 4 秒外加一條進度條，使用者的回饋是「好像有限時、要攪很久」。
 */
export const STIR_TRAVEL_NEEDED = 1.6;
/** 另外要真的在動的時間（秒）。下限只為了不讓甩一下就抽出去（測試釘著：0.25 秒的一甩不算）。 */
export const STIR_TIME_NEEDED = 0.6;
/** 攪到這個比例就放手，也算數 —— 差一點點的人不該以為抽不出來。 */
export const RELEASE_GRACE = 0.7;
/** 沒量到籤扇多寬時的預設（px）。 */
export const DEFAULT_FAN_PX = 160;
/**
 * 籤扇寬拿來當單位時的上下限（px）。大螢幕上籤筒畫得很大、籤扇量到 450px 以上，
 * 照比例就要繞上千 px —— 可是人攪的圈不會跟著螢幕變大，手還是那麼大。
 * 所以只往小的那邊跟（手機畫面小、圈也小），大的那邊封頂。
 */
export const FAN_PX_MIN = 120;
export const FAN_PX_MAX = 200;
/** 手速低於這個（px/s）當成手在抖，不算攪。 */
const MIN_MOVE_SPEED = 40;
/** 一次指標事件最多算多遠（籤扇寬）—— 切視窗、觸控誤判時指標會一下跳很遠。 */
const MAX_STEP = 0.6;
/** 兩次指標事件之間最多算多久（秒）—— 停一下再動，停的那段不算在攪。 */
const MAX_GAP = 0.1;

/** 籤束最多轉多少（弧度，約 31°）。再轉籤頭就變側面了。 */
export const SWIRL_MAX = 0.55;
/** 手的水平速度多少 px/s 對應籤束每秒轉 1 弧度。300 時使用者覺得攪動感不夠明顯。 */
const PX_PER_RAD = 230;
/** 按著的時候：籤束往手的轉速靠攏的速率，與把它拉回正面的弱彈簧。 */
const FOLLOW = 8;
const K_HELD = 6;
/** 放手之後：臨界阻尼的彈簧，一秒內轉回正面、不來回晃。 */
const K_FREE = 40;
const C_FREE = 2 * Math.sqrt(K_FREE);
/** 手的轉速訊號在沒有新移動時衰減得多快（半衰期，秒）。 */
const HAND_HALFLIFE = 0.08;
/** 籤束轉速變化 → 籤上下推擠的加速度。 */
const JOSTLE_GAIN = 1.3;
const JOSTLE_MAX = 50;

export interface StirState {
  /** 籤束繞筒軸轉了多少（弧度）。正值 = 正面往 +x（畫面右邊）轉。 */
  phi: number;
  omega: number;
  /** 手最近一次的水平速度換算成的轉速（rad/s）。 */
  hand: number;
  /** 歸一化攪動強度 0..1。 */
  intensity: number;
  /** 手在籤上繞了多遠（籤扇寬），到 STIR_TRAVEL_NEEDED 才算數。只在 armed 時記。 */
  travel: number;
  /** 真的在攪的時間（秒），到 STIR_TIME_NEEDED 才算數。只在 armed 時記。 */
  stirTime: number;
  /** 籤在筒內感受到的推擠加速度（給 bundle.ts 的上下起伏）。 */
  jostle: number;
}

export const createStir = (): StirState => ({
  phi: 0,
  omega: 0,
  hand: 0,
  intensity: 0,
  travel: 0,
  stirTime: 0,
  jostle: 0,
});

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

/**
 * 一次指標移動。
 *
 * @param dx 畫面像素位移，向右為正
 * @param dy 畫面像素位移，向下為正
 * @param dt 距上次移動的秒數
 * @param armed 這一局現在可以抽籤嗎（問題寫了、還沒抽過）。不 armed 照樣跟手（手感），但不記帳 ——
 *   不然寫問題之前攪的會全部存起來，一寫完隨手一碰就掉籤。
 * @param fanPx 籤扇在畫面上多寬（px）—— 繞多遠用它當單位
 */
export function pushStir(
  s: StirState,
  dx: number,
  dy: number,
  dt: number,
  armed = false,
  fanPx = DEFAULT_FAN_PX,
): void {
  const x = finite(dx);
  const y = finite(dy);
  const gap = Math.max(MIN_SAMPLE_DT, finite(dt));
  const dist = Math.hypot(x, y);
  const speed = dist / gap;
  // 取最大值而不是累加：強度是「現在攪得多用力」，不是「總共動了多少」
  s.intensity = Math.max(s.intensity, Math.min(1, speed / FULL_SPEED));
  s.hand = x / gap / PX_PER_RAD;
  if (armed && speed >= MIN_MOVE_SPEED) {
    const fan = Number.isFinite(fanPx) ? Math.min(FAN_PX_MAX, Math.max(FAN_PX_MIN, fanPx)) : DEFAULT_FAN_PX;
    s.travel += Math.min(MAX_STEP, dist / fan);
    s.stirTime += Math.min(MAX_GAP, gap);
  }
}

/** 攪了多少 0..1 —— 繞的距離和攪的時間都要到，取比較落後的那個。 */
export const stirProgress = (s: StirState): number =>
  Math.min(1, s.travel / STIR_TRAVEL_NEEDED, s.stirTime / STIR_TIME_NEEDED);

/** 攪夠了，可以去要籤了。 */
export const stirDone = (s: StirState): boolean => stirProgress(s) >= 1;

/**
 * 放手那一刻：差一點點（≥ RELEASE_GRACE）就當作攪夠了。回傳現在夠了沒。
 * 差太多就不動 —— 攪過的照樣留著，再攪幾圈就好。
 */
export function releaseStir(s: StirState): boolean {
  if (stirProgress(s) >= RELEASE_GRACE) {
    s.travel = Math.max(s.travel, STIR_TRAVEL_NEEDED);
    s.stirTime = Math.max(s.stirTime, STIR_TIME_NEEDED);
  }
  return stirDone(s);
}

/** 這一抽失敗了、要讓使用者重新攪：攪過的全部清掉。 */
export function resetStirWork(s: StirState): void {
  s.travel = 0;
  s.stirTime = 0;
}

/**
 * 推進一幀。
 *
 * @param dragging 手還按著嗎
 */
export function stepStir(s: StirState, dt: number, dragging: boolean): void {
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
}
