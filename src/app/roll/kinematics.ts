/**
 * 滚印签纸机的纯数学核心 —— 复刻 thebuggeddev/paper-roll 的无滑动纯滚动锁定。
 *
 * 这个模块**不 import three，也不碰 document**，所以 vitest 的 node 环境能直接加载它。
 * 这不是洁癖：滚到哪印到哪是这台机器唯一不能出错的地方，它必须是能被单元测试钉死的。
 *
 * 坐标约定（整台机器都按这一套，别的地方不要再自己定义一次）：
 *   · 滚筒自己的局部坐标里，轴沿 X，前进方向是 -Z，地面是 y = 0。
 *   · 压印点（nip）在滚筒正下方，局部方向 (0, -1, 0)。
 *   · 滚筒表面某点的角位置 φ 从压印点量起，朝前进方向为正。
 *   · 行进总弧长 s 只增不减；滚筒自转角 θ = spinAngle(s) = -s / R。
 */

/* ── 尺寸与咬合 ── */

export const R = 1.75;
export const W = 1.5;
export const N = 8;

export const TWO_PI = Math.PI * 2;
export const TWO_PI_R = TWO_PI * R;
/** 单张卡片沿行进方向的长度。八张严丝合缝地咬住一整个周长。 */
export const CARD_LEN = TWO_PI_R / N;

/* ── 纸带顶点预算（固定，永不增长） ── */

export const SEG_LEN = 0.055;
export const MAX_SEG = 778;
export const VERTS = (MAX_SEG + 1) * 2;
/** 纸带能铺出去的最远距离 ≈ 42.8，超过这个长度的历史直接丢掉。 */
export const TRAIL_LEN = MAX_SEG * SEG_LEN;

/* ── 剥离微卷曲 ── */

export const CURL_SEG = 16;
export const CURL_LEN = CURL_SEG * SEG_LEN;
/** 抬起的峰值高度（世界单位）。重型滚筒把宣纸挤出来时的那一点重力微垂感。 */
export const CURL_LIFT = 0.045;
/** 纸带离地的极小抬升，纯粹为了不和案几平面打架（z-fighting）。 */
export const GROUND_Y = 0.0015;

/* ── 尾端溶解 ── */

export const TAIL_FADE = 3.0;

/* ── 定格 ── */

/** 停下来时，落定那张卡片的中心离压印点有多远（镜头正好看着这里）。 */
export const LAND_OFFSET = 2.0;
/** 至少滚一圈半才准停 —— 定格要看得出是有意为之，不是卡住了。 */
export const MIN_ROLL = 1.5 * TWO_PI_R;

/* ── 滚筒网格 ── */

export const BARREL_SEGMENTS = 128;

/* ── 弹簧阻尼 ── */

export const SPRING = 2.6;
/** 帧率无关的指数趋近系数。dt 大的时候也不会冲过头。 */
export const springK = (dt: number): number => 1 - Math.exp(-SPRING * dt);

/* ── 无滑动锁定 ── */

export const spinAngle = (s: number): number => -s / R;

/**
 * 滚筒环上第 j 个顶点的角位置。接缝（j = 0 与 j = BARREL_SEGMENTS 重合的那一道）
 * 特意放在 φ = π，也就是滚筒**顶部** —— 压印点上不能有接缝。
 */
export const barrelPhi = (j: number): number => Math.PI + (TWO_PI * j) / BARREL_SEGMENTS;

/**
 * 角位置 φ 对应的贴图 u。这一行就是整台机器的锁：
 *   压印瞬间贴在地面的材料，滚转前的角位置是 φ = -θ = s / R，
 *   代进来得到 0.5 + (s/R - π)/2π = s / (2πR) = nipU(s)，
 * 和纸带在压印点写下的 u 逐字相同。没有需要手调的相位常数，也就没有漂移。
 */
export const barrelUAtPhi = (phi: number): number => 0.5 + (phi - Math.PI) / TWO_PI;

export const barrelU = (j: number): number => barrelUAtPhi(barrelPhi(j));

/** 纸带在压印点写下的 u。 */
export const nipU = (s: number): number => s / TWO_PI_R;

/** 角位置 φ 的滚筒表面点（局部坐标，轴沿 X，所以只有 y / z）。 */
export const barrelRingY = (phi: number): number => -R * Math.cos(phi);
export const barrelRingZ = (phi: number): number => -R * Math.sin(phi);

/* ── 卡片格 ── */

export const cardIndexAt = (s: number): number => {
  const raw = Math.floor(s / CARD_LEN) % N;
  return raw < 0 ? raw + N : raw;
};

/**
 * 此刻转到滚筒**顶部**、镜头完全看不见的那一格。
 * 签一落库就重画这一格，玩家看不到任何一张卡片在眼前变过内容。
 */
export const slotOppositeNip = (s: number): number => cardIndexAt(s + TWO_PI_R / 2);

/**
 * 解出停车弧长：让第 slot 格的中心正好停在压印点后 LAND_OFFSET 处，
 * 并且至少还要再滚 MIN_ROLL。
 */
export const solveStopS = (sNow: number, slot: number): number => {
  const centre0 = (slot + 0.5) * CARD_LEN;
  const m = Math.ceil((sNow + MIN_ROLL - LAND_OFFSET - centre0) / TWO_PI_R);
  return centre0 + m * TWO_PI_R + LAND_OFFSET;
};

/* ── 剥离微卷曲剖面 ── */

/**
 * 三次曲线：h(0) = h(1) = 0，h'(1) = 0，峰值 CURL_LIFT 落在 q = 1/3。
 * 27/4 = 6.75 是把 q(1-q)² 的峰值 4/27 归一化回 1 的系数。
 */
export const curlLift = (q: number): number =>
  q <= 0 || q >= 1 ? 0 : CURL_LIFT * 6.75 * q * (1 - q) * (1 - q);

/** dh/dq。躺平那一端斜率归零，纸尾才不会带出一道折角。 */
export const curlSlope = (q: number): number =>
  q <= 0 || q >= 1 ? 0 : CURL_LIFT * 6.75 * (1 - q) * (1 - 3 * q);
