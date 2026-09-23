/**
 * 宫庙签筒的尺寸与籤束排布 —— 纯数学，不 import 任何东西，不碰 DOM。
 *
 * 这个模块只回答两件事：筒子多大、36 支竹籤各自站在哪。它之所以独立成一个
 * 不依赖 three 的模块，是因为「看得见的错」几乎都是几何错，而几何错只有在
 * 能被单元测试钉住的时候才抓得到。
 *
 * 坐标约定：筒轴沿 Y，筒底内面在 y = 0，筒口在 y = TUBE_H。竹籤直立时沿 +Y。
 *
 * 比例的依据：真实宫庙签筒又细又高，籤挤成密实的一束。旧版做成 4.8 高 × 4.8 宽
 * 的方筒，36 支 0.34×0.048 的籤只占筒内截面的 3.6% —— 于是它们只能各自站着，
 * 看起来像插在土里。密度是被筒宽决定的，所以这里先定死内半径，再回推其余尺寸。
 */

/* ── 筒身 ── */

/**
 * 筒高 —— **物理尺度的基准，别动它**。
 *
 * 中签那一支要爬多高才脱出（exitRise）是从它算出来的，而重力、棘轮、CHOSEN_LIFT
 * 全是以那个距离为前提调出来的。矮胖版第一次做的时候是把高度压掉来换比例，结果
 * 爬升距离缩到三分之一、力道没跟着变，中签那支 0.2 秒就飞出去，普通籤也差点被摇
 * 出筒口（实测 0.322，门槛只剩 0.35）。**要矮胖就加粗，不要压矮。**
 */
export const TUBE_H = 6.552;
/**
 * 高径比 1.2 : 1 —— 使用者試過 1.4 之後說「籤筒可以再更胖一點、更寬」（2026-09-23）。
 * 比 v3 第一版的 1.15 瘦一點：那一版像一只罐子。
 *
 * 以下是 1.4 時的說明：高径比 1.4 : 1 —— 參考圖本身約 1.5。v3 第一版為了「更寬更胖」壓到 1.15，結果像一只罐子；
 * 參考圖看起來胖，是因為正面一整片平的寬面、圖案撐滿、底部有圓角，不是因為杯子矮。
 *
 * 高径比原本 1.45 : 1 —— 矮胖的杯型，不是传统那种又细又高的筒。
 *
 * 旧值是 2.8，理由写的是「传统签筒又细又高，不是个桶」。那个判断没错，但这版要的
 * 是**可爱**：参考的日系籤筒就是一只矮杯。改法是把筒身加粗，高度不动。
 */
export const TUBE_ASPECT = 1.2;
/** 筒壁厚度。 */
export const TUBE_WALL = 0.12;
export const TUBE_R_OUT = TUBE_H / (2 * TUBE_ASPECT);
/** 筒内半径。筒身一加粗，籤就得跟着变宽，不然一束会散在筒里。 */
export const TUBE_R_IN = TUBE_R_OUT - TUBE_WALL;

/* ── 杯身的截面：圆角方柱，不是圆筒 ── */

/**
 * 超椭圆（Lamé 曲线）的指数。2 = 正圆，越大越方；4 附近就是参考图那种圆角方柱。
 *
 * 形状不是装饰细节 —— 圆筒的正面是弯的，图案贴上去会跟着曲面变形，怎么调都对不上
 * 参考图。圆角方柱的正面是**平的**，字才立得住。
 */
/** 3.8：正面要夠平，杯面的字與狗才立得住；四個角仍是圓的（v2 是 4.2）。 */
export const CUP_N = 3.8;

/**
 * 杯身在角度 theta 处的半径。
 *
 * |x/a|^n + |y/a|^n = 1 换成极座标。theta = 0 / 90° / … 落在平面中央（半径最小，
 * 等于 TUBE_R_OUT），45° 落在圆角上（半径最大）。
 */
export const cupRadius = (theta: number): number =>
  TUBE_R_OUT /
  Math.pow(
    Math.abs(Math.cos(theta)) ** CUP_N + Math.abs(Math.sin(theta)) ** CUP_N,
    1 / CUP_N,
  );

/** 四个圆角是杯身最外缘 —— 框景要用它，不然转到角对着镜头时会被切。 */
export const CUP_R_MAX = cupRadius(Math.PI / 4);

/* ── 竹籤 ── */

/**
 * 籤排成參考圖那種**整齊的扇形**，前、中、後三排：
 *
 * - 前排 7 支：正面一字排開，照參考圖；
 * - 中排 6 支：左右錯開半格，從前排的縫裡探出來；
 * - 後排 7 支：再高一點、往後傾。
 *
 * v3 第一版放了 60 支擠成一團，籤頭互相壓、很多斜著或只露半邊 —— 多是多了，可愛就沒了。
 * `z` 是這一排靠在筒口的前後位置（占籤心可落範圍的比例），`rest` 是籤底離筒底多高。
 */
const ROWS: ReadonlyArray<{ n: number; z: number; rest: number; back: number }> = [
  { n: 7, z: 0.37, rest: 0.0, back: 0 },
  { n: 6, z: 0.0, rest: 0.25, back: 0 },
  { n: 7, z: -0.37, rest: 0.45, back: 0.1 },
];

/**
 * 筒裡放幾支籤 —— **不等於籤詩的數量**（`shared/sticks.ts` 只有 36 首）。
 *
 * v3 筒裡的籤不印號碼，只有升起來那一支才顯示第幾籤，所以支數只受「看起來滿不滿」
 * 約束：胖筒子放 36 支會散在筒裡，60 支才是一把。
 */
export const STICK_COUNT = ROWS.reduce((n, r) => n + r.n, 0);
/**
 * 籤的宽与厚。
 *
 * 旧版照搬真实竹籤的 10mm × 3mm，配细筒刚好。筒身加粗之后同样的细籤只剩 8% 填充率，
 * 36 支散在筒里像插在土里 —— 所以改成参考图那种**宽扁的槳形**，一把握住的那种。
 */
export const STICK_W = 1.1;
export const STICK_T = 0.2;
/**
 * 籤比筒长，所以一定会露出筒口一截 —— 这是签筒最好认的特征。
 * 杯子变矮之后这一截要跟着变长，不然看起来像插了一把短棍。约露出全长的 38%。
 */
export const STICK_LEN = TUBE_H * 1.76;

/** 圆籤头的半径。比籤身宽一点，像参考图那样探出两侧。 */
export const STICK_HEAD_R = STICK_W * 0.66;

/** 籤头那片圆盘的中心离籤身顶端多远（scene.ts 发网格时用同一个数，不然框景会差一截）。 */
export const STICK_HEAD_GAP = STICK_HEAD_R * 0.4;
/**
 * 從 mesh 原點到籤頭外緣 —— 框景要用它，不是 STICK_LEN / 2。
 *
 * 籤頭是掛在籤身頂端**外面**的一片圓盤，整支比籤身還長將近一個籤頭。拿 STICK_LEN
 * 去算鏡頭距離，退出來的位置剛好把籤頭切掉（v2 實測踩過）。
 */
export const STICK_TIP = STICK_LEN / 2 + STICK_HEAD_GAP + STICK_HEAD_R;

/**
 * 最外圈那支籤往外傾多少（弧度，約 24°）。前排 7 支要散得開、籤頭才不會疊成一坨。
 *
 * 參考圖的籤是一把花束：靠在筒口上、上端往外散開。v2 是直直一束（最多 3°），
 * 整體輪廓就只有筒口那麼寬，看起來瘦。越靠中心傾得越少，正中那支幾乎直立。
 */
export const FAN_TILT = 0.42;

/** 籤静止时籤底离筒底的最大高度（bundleSlot 的 rest 上限）。籤头参差不齐靠它。 */
export const STICK_REST_MAX = 0.45;

/* ── 整支籤筒摆在世界里的姿态。纯数字，不碰 three —— framing.ts 要用它算镜头距离。 ── */

/**
 * 静止时的斜持角度 —— v3 籤筒固定不動、站正，兩個都是 0。
 *
 * 以下是 v2 的說明：
 *
 * 旧值 -0.46（26°）是照真实求签的手势来的，但杯身上的图案会被压扁到看不清。
 * 现在筒子会跟着手转（aim.ts），摇起来自然会倒过去，所以静止这一刻让它站正一点，
 * 把正面留给设计。
 */
export const TILT_Z = 0;
export const TILT_X = 0;
/** 整支签筒在世界里的落点，让它悬在案几上方。 */
export const RIG_Y = -4.2;
/** v2 斜持時要把重心推回中軸；v3 站正，本來就在中軸上。 */
export const RIG_X = 0;
/** 鬆鬆包住整支籤筒的圆柱：从筒底量到站得最高那支籤的籤头。 */
export const RIG_LEN = STICK_REST_MAX + STICK_LEN + STICK_HEAD_R * 1.4;
export const RIG_R = CUP_R_MAX;

/* 传统斜持角度下的筒轴方向 = Euler(TILT_X, 0, TILT_Z) 作用在 (0,1,0) 上。 */
const DEF_AX = -Math.sin(TILT_Z) * Math.cos(TILT_X);
const DEF_AY = Math.cos(TILT_Z) * Math.cos(TILT_X);
const DEF_AZ = Math.sin(TILT_X);

/**
 * 籤筒绕着转的那个点 —— 它自己的**中段**，不是筒底。
 *
 * 绕筒底转的话，筒子一被放倒，筒口就扫出一个半径等于**整支长度**的圆弧，直接甩出
 * 画面；镜头要框住那个圆弧就得退到很远，籤筒又变得很小。绕中段转，扫出来的半径
 * 只剩一半，任何角度的包围范围都差不多大。
 *
 * 数值取传统斜持角度下的筒身中点，所以不转的时候看起来跟旧版一模一样。
 */
export const PIVOT_X = RIG_X + DEF_AX * (RIG_LEN / 2);
export const PIVOT_Y = RIG_Y + DEF_AY * (RIG_LEN / 2);
export const PIVOT_Z = DEF_AZ * (RIG_LEN / 2);

/** 待机镜头注视的高度 —— 对准枢轴，籤筒转起来才是绕着画面中心转。 */
export const CAM_LOOK_Y = PIVOT_Y;

/** 竹籤横截面的外接圆半径：排布时用它保证籤不会穿出筒壁。 */
export const STICK_HALF_DIAG = Math.hypot(STICK_W, STICK_T) / 2;
/** 籤心可以落在的最大半径。 */
export const BUNDLE_R = TUBE_R_IN - STICK_HALF_DIAG;


/* ── 排布 ── */

/** 确定性伪随机（Lehmer / MINSTD）—— 同一支籤每次都站在同一个地方。 */
export function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface BundleSlot {
  /** 筒内平面坐标。 */
  x: number;
  z: number;
  /** 绕自身轴的朝向。籤各转各的角度，才不会像栅栏一样排排站。 */
  yaw: number;
  /** 静止时籤底离筒底多高 —— 让籤头参差不齐，而不是一个平面。 */
  rest: number;
  /** 傾多少（弧度）。 */
  lean: number;
  /**
   * 往哪個方向傾（水平單位向量；直立時是 0,0）。
   *
   * **不是**筒心 → 籤心的徑向：前排站在筒子前半邊，徑向會帶一個往鏡頭的分量，
   * 兩旁的籤往上走一段就從正中間那支的前面穿過去 —— 畫面上是一截平頂的方塊。
   * 所以扇形只往左右散，後排再往後倒一點，沒有任何一支往鏡頭倒。
   */
  dirX: number;
  dirZ: number;
  /** 第幾排：0 前、1 中、2 後。 */
  row: number;
}

/** 同一排往兩側每一格往後退多少：中間最前、越外越後，像手上握著一把牌。 */
const STAGGER = 0.05;
/** 左側多退的那一點點，見 bundleSlot。 */
const SIDE_BIAS = 0.02;

/**
 * 三排共用的左右間距：取「最寬那排的最外一支剛好落在可放範圍內」的那個值。
 * 往後退的那一段也算進去 —— 後排本來就在後面，外側再往後退就會頂到筒壁。
 */
const ROW_STEP = Math.min(
  ...ROWS.map((row) => {
    const half = Math.max(1, (row.n - 1) / 2);
    const z0 = row.z * BUNDLE_R;
    const worst = Math.max(Math.abs(z0), Math.abs(z0 - STAGGER * half - SIDE_BIAS));
    return (Math.sqrt(Math.max(0, BUNDLE_R * BUNDLE_R - worst * worst)) * 0.97) / half;
  }),
);

/**
 * 第 i 支籤靠在筒口的哪一點。排法見上面的 `ROWS`。
 *
 * 同一排的籤正面朝鏡頭、左右對稱鋪開，越外面的往外傾越多（扇形）。
 */
export function bundleSlot(i: number): BundleSlot {
  let k = i;
  let r = 0;
  while (r < ROWS.length - 1 && k >= ROWS[r].n) {
    k -= ROWS[r].n;
    r += 1;
  }
  const row = ROWS[r];
  // 三排共用同一個間距，中排才會剛好落在前排的縫裡
  const off = k - (row.n - 1) / 2;
  const x = ROW_STEP * off;
  // 左右對稱的兩支本來會在同一個深度，筒口附近又左右重疊 —— 同深度的兩個面會互相閃爍。
  // 左邊那支多退一點點打破對稱（比 STAGGER 小，「越中間越前面」不受影響）
  const z = row.z * BUNDLE_R - STAGGER * Math.abs(off) - (off < 0 ? SIDE_BIAS : 0);
  // 扇形只往左右；後排再往後倒一點。兩個分量用 tan 合成，籤軸才是 normalize(tx, 1, tz)
  const tx = Math.sign(x) * Math.tan((Math.abs(x) / BUNDLE_R) * FAN_TILT);
  const tz = -Math.tan(row.back);
  const t = Math.hypot(tx, tz);
  const rand = pseudoRandom(9871 + i * 131);
  return {
    x,
    z,
    // 正面朝鏡頭，只留一點點參差
    yaw: (rand() - 0.5) * 0.08,
    rest: row.rest,
    lean: Math.atan(t),
    dirX: t > 1e-12 ? tx / t : 0,
    dirZ: t > 1e-12 ? tz / t : 0,
    row: r,
  };
}

export interface StickPose {
  /** 籤心（mesh 原點）在筒的局部座標：筒軸沿 Y，筒底內面 y = 0。 */
  cx: number;
  cy: number;
  cz: number;
  /** 籤軸（籤底 → 籤頭）的單位向量。 */
  ax: number;
  ay: number;
  az: number;
}

/**
 * 一支籤靜止時怎麼擺。
 *
 * 支點在**筒口**：籤靠在筒口那一圈上，上端往外、下端往內。要是繞籤心傾斜，
 * 筒口那一段會往外頂出筒壁（外圈的籤會直接穿出杯身）。支點放在筒口，
 * 筒內那一段往反方向收（測試逐點驗過都在 BUNDLE_R 以內）。
 */
export function stickPose(slot: BundleSlot): StickPose {
  const dx = slot.dirX;
  const dz = slot.dirZ;
  const sn = Math.sin(slot.lean);
  const ax = dx * sn;
  const ay = Math.cos(slot.lean);
  const az = dz * sn;
  // 籤底落在 y = rest，沿籤軸量到筒口那一點是 (slot.x, TUBE_H, slot.z)
  const toRim = (TUBE_H - slot.rest) / ay;
  const bx = slot.x - ax * toRim;
  const bz = slot.z - az * toRim;
  const half = STICK_LEN / 2;
  return { cx: bx + ax * half, cy: slot.rest + ay * half, cz: bz + az * half, ax, ay, az };
}

/** 籤头露出筒口多少（静止、未被搖动时）。 */
export const stickProtrusion = (slot: BundleSlot): number =>
  slot.rest + STICK_LEN - TUBE_H;

/**
 * 抽籤時被拿起來的是哪一支（筒裡的索引）。
 *
 * 筒裡的籤不印號碼，所以「伺服器抽到第幾籤」跟「哪一支實體籤被拿起來」可以分開：
 * 號碼在揭曉時才印上去，永遠是伺服器那一個。實體上就固定拿**筒心、最直、在前半邊**
 * 的那支 —— 其他籤都往外傾、離它而去，往上拔的時候才不會穿過任何一支。
 * 要是照號碼去拿外圈那支，它一轉直就會撞進往外傾的鄰居裡，實測就是「穿插整個籤筒」。
 */
export const PULL_INDEX = (() => {
  let best = 0;
  let bestLean = Infinity;
  for (let i = 0; i < STICK_COUNT; i += 1) {
    const s = bundleSlot(i);
    if (s.z >= 0 && s.lean < bestLean) {
      bestLean = s.lean;
      best = i;
    }
  }
  return best;
})();


/* ── 杯身貼圖：照弧長鋪 ── */

const ARC_N = 2048;
/** 從正後方 (θ = -π/2) 起算的累積弧長表。 */
const ARC: number[] = (() => {
  const out = [0];
  let prev = [0, -cupRadius(-Math.PI / 2)];
  for (let k = 1; k <= ARC_N; k += 1) {
    const th = -Math.PI / 2 + (k / ARC_N) * Math.PI * 2;
    const r = cupRadius(th);
    const p = [Math.cos(th) * r, Math.sin(th) * r];
    out.push(out[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  return out;
})();

/** 杯身外緣一整圈的長度。 */
export const CUP_PERIMETER = ARC[ARC_N];

/**
 * 角度 θ 在貼圖上的橫座標 0..1 —— **照弧長**，不是照角度。
 *
 * v2 用 u = θ/2π，而圓角方柱的平面上每一度對到的杯壁長度都不一樣（越靠方角越長），
 * 加上貼圖是正方形、一圈周長卻是杯高的兩倍半，杯面上的字全被橫向拉扁、越靠邊越扁。
 * 照弧長鋪，再讓貼圖寬 = 高 × 周長 / 杯高，一個像素在杯壁上就是正方形。
 */
export function cupArcU(theta: number): number {
  const t = ((theta + Math.PI / 2) / (Math.PI * 2)) * ARC_N;
  const k = Math.max(0, Math.min(ARC_N - 1, Math.floor(t)));
  const frac = Math.max(0, Math.min(1, t - k));
  return (ARC[k] + (ARC[k + 1] - ARC[k]) * frac) / CUP_PERIMETER;
}

/** 正面那一片的半寬（世界單位）：量到方角的正中間為止，圖案要畫在這裡面才不會爬上圓角。 */
export const CUP_FACE_HALF = (cupRadius(Math.PI / 4) * Math.SQRT1_2);
