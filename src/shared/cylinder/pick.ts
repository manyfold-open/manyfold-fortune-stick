/**
 * 攪的時候「挑到每一支籤」—— 純數學，不 import three，不碰 DOM。
 *
 * 使用者的回饋：攪的感覺要更明顯，「挑選到每一個籤的感覺要出來」。整束一起轉、一起起伏
 * 只像在攪一桶東西；手真的伸進籤筒裡，是手指一支一支撥過去。所以手在畫面上經過哪一支
 * 籤頭，那一支就被撥得往上提一下，兩旁的少一點；每換到新的一支就響一聲（組件放聲音）。
 *
 * 位置都用畫面像素：手的 x 跟每支籤頭投影到畫面上的 x 比，才是「手碰到的那支」。
 */

/** 被手碰到那支最多往上提多少（世界單位，沿自己的籤軸）。是被撥了一下，不是被抽出去。 */
export const PICK_LIFT = 0.6;
/** 影響範圍：高斯的 σ，以同一排相鄰兩支的距離為單位。0.5 = 兩旁那支大約提 1/7。 */
export const PICK_REACH = 0.5;
/** 手離最近的籤頭多遠還算碰到（同一單位）。超過就是手在籤束外面。 */
const TOUCH_R = 0.8;
/** 跟手的彈簧（臨界阻尼）：約 0.2 秒跟上，放手約半秒落回，不回彈。 */
const RATE = 22;

export interface PickState {
  /** 每支籤被撥起來多高。 */
  lift: number[];
  vel: number[];
  /** 手現在碰到第幾支；沒碰到是 -1。 */
  touched: number;
}

export const createPick = (n: number): PickState => ({
  lift: new Array<number>(n).fill(0),
  vel: new Array<number>(n).fill(0),
  touched: -1,
});

/** 同一排籤頭之間的平均距離。量不出來（只有一支、全疊在一起）時給 1，不會除以 0。 */
export function headSpacing(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  if (v.length < 2) return 1;
  const gap = (Math.max(...v) - Math.min(...v)) / (v.length - 1);
  return gap > 1e-9 ? gap : 1;
}

/**
 * 推進一幀。
 *
 * @param hand     手的畫面 x；沒按著傳 null
 * @param heads    每支籤頭的畫面 x（跟 lift 同順序）
 * @param spacing  同一排相鄰兩支籤頭的距離（headSpacing）
 * @param strength 0..1，攪得多用力就挑得多高
 * @returns 這一格是不是換碰到了新的一支（組件拿它放聲音）
 */
export function stepPick(
  s: PickState,
  dt: number,
  hand: number | null,
  heads: number[],
  spacing: number,
  strength: number,
): boolean {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const sp = Number.isFinite(spacing) && spacing > 0 ? spacing : 1;
  const k = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0;
  const x = hand !== null && Number.isFinite(hand) ? hand : null;

  let touched = -1;
  if (x !== null) {
    let best = TOUCH_R * sp;
    for (let i = 0; i < heads.length; i += 1) {
      const d = Math.abs(x - heads[i]);
      if (d < best) {
        best = d;
        touched = i;
      }
    }
  }

  const e = Math.exp(-RATE * h);
  for (let i = 0; i < s.lift.length; i += 1) {
    const d = x === null || !Number.isFinite(heads[i]) ? Infinity : (x - heads[i]) / (PICK_REACH * sp);
    const target = PICK_LIFT * k * Math.exp(-0.5 * d * d);
    // 臨界阻尼朝目標走，這一格內目標不變：解析解，跟幀率無關
    const y0 = s.lift[i] - target;
    const c2 = s.vel[i] + RATE * y0;
    const y = (y0 + c2 * h) * e;
    s.vel[i] = (c2 - RATE * (y0 + c2 * h)) * e;
    s.lift[i] = y + target;
    if (!(s.lift[i] > 0)) {
      s.lift[i] = 0;
      s.vel[i] = Math.max(0, s.vel[i]);
    }
  }

  const changed = touched >= 0 && touched !== s.touched;
  s.touched = touched;
  return changed;
}
