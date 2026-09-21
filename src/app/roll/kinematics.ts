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
  q < 0 || q >= 1 ? 0 : CURL_LIFT * 6.75 * (1 - q) * (1 - 3 * q);

/* ── 压印点历史（环形缓冲） ── */

export interface Trail {
  x: Float32Array;
  z: Float32Array;
  /** 落这个点的时候，行进总弧长是多少。 */
  s: Float32Array;
  /** 最新的那个点的下标。 */
  head: number;
  /** 活着的点有几个（封顶 MAX_SEG + 1）。 */
  count: number;
}

const RING = MAX_SEG + 1;

export const createTrail = (): Trail => ({
  x: new Float32Array(RING),
  z: new Float32Array(RING),
  s: new Float32Array(RING),
  head: 0,
  count: 0,
});

export const resetTrail = (trail: Trail): void => {
  trail.head = 0;
  trail.count = 0;
};

/** 走满一个 SEG_LEN 才落一个点。返回这一次有没有真的落点。 */
export const pushTrail = (trail: Trail, x: number, z: number, s: number): boolean => {
  if (trail.count > 0 && s - trail.s[trail.head] < SEG_LEN) return false;
  trail.head = (trail.head + 1) % RING;
  trail.x[trail.head] = x;
  trail.z[trail.head] = z;
  trail.s[trail.head] = s;
  if (trail.count < RING) trail.count += 1;
  return true;
};

/** 从 head 往回数第 back 个点的下标，数过头就钉在最老的那个点上。 */
const sampleIndex = (trail: Trail, back: number): number => {
  const b = back < trail.count ? back : trail.count - 1;
  return (trail.head - b + RING) % RING;
};

/**
 * 最远端那个还活着的采样点的弧长 —— 着色器的 uTailS 用它。
 * 历史还是空的时候，writeRibbon 会合成一条笔直的尾巴，这里要跟它对上。
 */
export const tailS = (trail: Trail, sNow: number): number =>
  trail.count === 0 ? sNow - TRAIL_LEN : trail.s[sampleIndex(trail, trail.count - 1)];

/* ── 纸带顶点缓冲 ── */

export interface RibbonBuffers {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  /** 每个顶点自己的行进弧长，交给片元着色器做尾端溶解。 */
  aS: Float32Array;
}

export const createRibbonBuffers = (): RibbonBuffers => ({
  position: new Float32Array(VERTS * 3),
  normal: new Float32Array(VERTS * 3),
  uv: new Float32Array(VERTS * 2),
  aS: new Float32Array(VERTS),
});

/** 三角形索引只在初始化时算一次，之后永不变动 —— 顶点数是死的。 */
export const createRibbonIndices = (): Uint16Array => {
  const idx = new Uint16Array(MAX_SEG * 6);
  for (let i = 0; i < MAX_SEG; i += 1) {
    const a = i * 2;
    const o = i * 6;
    idx[o] = a;
    idx[o + 1] = a + 2;
    idx[o + 2] = a + 1;
    idx[o + 3] = a + 1;
    idx[o + 4] = a + 2;
    idx[o + 5] = a + 3;
  }
  return idx;
};

/* ── 中心线暂存：模块加载时分配一次，帧循环里只覆写，不再 new ── */

const cX = new Float32Array(RING);
const cY = new Float32Array(RING);
const cZ = new Float32Array(RING);
const cS = new Float32Array(RING);

/**
 * 把整条纸带写进预分配好的 TypedArray。这个函数里没有一个 `new`。
 *
 * 采样点 0 永远是当前压印点；1..MAX_SEG 取历史（不够就压在最老的那个点上，
 * 多出来的三角形面积为零，看不见，但顶点数一个不少）。
 */
export function writeRibbon(
  buf: RibbonBuffers,
  trail: Trail,
  nipX: number,
  nipZ: number,
  headX: number,
  headZ: number,
  sNow: number,
): void {
  // 1. 中心线
  cX[0] = nipX;
  cZ[0] = nipZ;
  cS[0] = sNow;
  if (trail.count === 0) {
    // 还没开始滚：合成一条笔直的尾巴，免得一上来是一个退化的点。
    for (let i = 1; i <= MAX_SEG; i += 1) {
      const d = i * SEG_LEN;
      cX[i] = nipX - headX * d;
      cZ[i] = nipZ - headZ * d;
      cS[i] = sNow - d;
    }
  } else {
    for (let i = 1; i <= MAX_SEG; i += 1) {
      const k = sampleIndex(trail, i - 1);
      cX[i] = trail.x[k];
      cZ[i] = trail.z[k];
      cS[i] = trail.s[k];
    }
  }

  // 2. 剥离微卷曲：只有离压印点不到 CURL_LEN 的那 16 段抬得起来。
  //    cS 沿 i 单调递减，所以 q 单调递增，越过 1 之后直接收工。
  for (let i = 0; i <= MAX_SEG; i += 1) {
    const q = (sNow - cS[i]) / CURL_LEN;
    if (q >= 1) {
      for (let k = i; k <= MAX_SEG; k += 1) cY[k] = GROUND_Y;
      break;
    }
    cY[i] = GROUND_Y + curlLift(q);
  }

  // 3. 顶点
  for (let i = 0; i <= MAX_SEG; i += 1) {
    // 切线：中心差分，端点退化成单侧差分。a 靠近滚筒，b 靠近纸尾，所以 t 指向前进方向。
    const a = i === 0 ? 0 : i - 1;
    const b = i === MAX_SEG ? MAX_SEG : i + 1;
    let tx = cX[a] - cX[b];
    let tz = cZ[a] - cZ[b];
    const len = Math.sqrt(tx * tx + tz * tz);
    if (len < 1e-6) {
      tx = headX;
      tz = headZ;
    } else {
      tx /= len;
      tz /= len;
    }

    // 水平左法线，半宽 W/2
    const lx = -tz * (W / 2);
    const lz = tx * (W / 2);

    // 表面法线：沿前进方向的坡度。d 是离压印点的距离，往前走 d 变小，所以要取负号。
    const q = (sNow - cS[i]) / CURL_LEN;
    const slope = q < 1 ? -curlSlope(q) / CURL_LEN : 0;
    let nx = -slope * tx;
    let ny = 1;
    let nz = -slope * tz;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;

    const u = cS[i] / TWO_PI_R;
    const v0 = i * 2;
    const v1 = v0 + 1;
    const p0 = v0 * 3;
    const p1 = v1 * 3;

    buf.position[p0] = cX[i] + lx;
    buf.position[p0 + 1] = cY[i];
    buf.position[p0 + 2] = cZ[i] + lz;
    buf.position[p1] = cX[i] - lx;
    buf.position[p1 + 1] = cY[i];
    buf.position[p1 + 2] = cZ[i] - lz;

    buf.normal[p0] = nx;
    buf.normal[p0 + 1] = ny;
    buf.normal[p0 + 2] = nz;
    buf.normal[p1] = nx;
    buf.normal[p1 + 1] = ny;
    buf.normal[p1 + 2] = nz;

    buf.uv[v0 * 2] = u;
    buf.uv[v0 * 2 + 1] = 0;
    buf.uv[v1 * 2] = u;
    buf.uv[v1 * 2 + 1] = 1;

    buf.aS[v0] = cS[i];
    buf.aS[v1] = cS[i];
  }
}
