/**
 * 手势 → 摇动强度 —— 纯数学，不 import three，不碰 DOM。
 *
 * 这一段本来埋在组件里，于是「要摇多久才出签」只能靠猜，而我这台机器的预览面板
 * 只有 1 fps，根本摇不出手感。抽出来之后它就能被测试钉住：一个人用正常力道拖，
 * 几秒钟会出签，这是可以断言的事。
 *
 * 强度取自**手自己的速度**（px/s），不是筒子的速度。手的速度是使用者直接控制的量，
 * 拿它当强度最跟手；筒子的速度经过弹簧滤过一层，慢拖时几乎归零 —— 早先就是这么写的，
 * 结果使用者拖了半天进度条不动。
 */

/** 手速到这里就算满强度。约等于「正常力道来回甩」的峰值。 */
export const FULL_SPEED = 550;
/** 手停下来之后强度的半衰期（秒）。留一点余韵，手势之间的空档不会掉到零。 */
export const INTENSITY_HALFLIFE = 0.13;
/**
 * 取样间隔的下限。
 *
 * 强度是 dy/dt，而点一下常常产生 1-2px、1ms 的移动 —— 算出来 2000px/s，直接顶满。
 * 于是「点一下」会被当成「用力甩」。真实的 pointermove 间隔约 16ms，低于这个值
 * 一律当 12ms 算。
 */
export const MIN_SAMPLE_DT = 0.012;
/** 拖多少像素等于一个世界单位。 */
export const PIXELS_PER_UNIT = 150;
/** 筒子沿自己的轴能被拉动的行程。 */
export const TUBE_SWING = 1.05;
/** 弹簧：跟得到手，但跟不紧 —— 跟不紧的那一点点就是重量感。 */
export const SPRING_K = 190;
export const SPRING_C = 15;

export interface ShakeState {
  /** 手把筒子拉到哪（世界单位，沿筒轴）。 */
  handTarget: number;
  /** 筒子实际到了哪，以及速度。 */
  offset: number;
  vel: number;
  /** 归一化摇动强度 0..1。 */
  intensity: number;
  /** 籤在筒内感受到的惯性加速度。 */
  shakeA: number;
  /** 累积的摇动功。到达门槛就去要签。 */
  work: number;
}

export const createShake = (): ShakeState => ({
  handTarget: 0,
  offset: 0,
  vel: 0,
  intensity: 0,
  shakeA: 0,
  work: 0,
});

/** 一次指标移动：dy 是像素位移，dt 是距上次移动的秒数。 */
export function pushHand(s: ShakeState, dy: number, dt: number): void {
  s.handTarget = Math.max(
    -TUBE_SWING,
    Math.min(TUBE_SWING, s.handTarget - dy / PIXELS_PER_UNIT),
  );
  {
    const speed = Math.abs(dy) / Math.max(MIN_SAMPLE_DT, dt);
    // 取最大值而不是累加：强度是「现在摇得多用力」，不是「总共动了多少」
    s.intensity = Math.max(s.intensity, Math.min(1, speed / FULL_SPEED));
  }
}

/**
 * 推进一帧。
 *
 * @param dragging 手还按着吗 —— 放开之后筒子自己荡回原位
 * @param armed    这一局现在可以抽签吗（问题写了、还没抽过）。
 *
 * armed 是必需的，不是可选的优化：摇动功原本无条件累积，而「能不能抽签」的判断在
 * 组件那边，于是使用者在还没写问题时摇的那些全被默默存了起来 —— 一写完问题，随手
 * 一碰就直接掉签。实测踩到的。筒子照样跟手动（那是手感），只是不记账。
 */
export function stepShake(
  s: ShakeState,
  dt: number,
  dragging: boolean,
  armed: boolean,
): void {
  if (!dragging) s.handTarget *= Math.exp(-7 * dt);

  const accel = (s.handTarget - s.offset) * SPRING_K - s.vel * SPRING_C;
  const prevVel = s.vel;
  s.vel += accel * dt;
  s.offset += s.vel * dt;
  if (s.offset > TUBE_SWING) {
    s.offset = TUBE_SWING;
    s.vel *= -0.3;
  }
  if (s.offset < -TUBE_SWING) {
    s.offset = -TUBE_SWING;
    s.vel *= -0.3;
  }

  // 筒子往上加速时，籤因为惯性相对往下沉；筒子一停，它们就往上冲
  const tubeAccel = (s.vel - prevVel) / dt;
  s.shakeA = Math.max(-38, Math.min(38, -tubeAccel * 0.5));

  s.intensity *= Math.pow(0.5, dt / INTENSITY_HALFLIFE);
  if (armed) s.work += s.intensity * dt * 10;
}
