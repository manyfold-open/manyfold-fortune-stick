/**
 * 签筒的程序化贴图 —— 全部用 Canvas 2D 现画，一张外部图片都不下载。
 *
 * 只产出 HTMLCanvasElement，不 import three：「画什么」和「怎么贴」分开，
 * 于是版面算术能在 node 下被测到，真正需要 2D context 的部分才留到浏览器里跑。
 */

import { CUP_FACE_HALF, CUP_PERIMETER, STICK_LEN, STICK_W, TUBE_H } from '../../shared/cylinder/geometry';
import { hanNumber } from '../../shared/numerals';

/* ── 竹籤贴图集：STICK_VARIANTS 格，每格是一種圖案的籤身正面（不印號碼） ── */

export const STICK_CELL_W = 128;
/**
 * 一格籤身的高 —— 照籤的真實長寬比算，一個像素在籤上才是正方形。
 * v2 寫死 1024（1:8），籤卻是 1:10.5，籤上的字全被拉長。
 */
export const STICK_CELL_H = Math.round((STICK_CELL_W * STICK_LEN) / STICK_W);
/**
 * 筒裡的籤有幾種圖案（梅花、雲、富士山、鳥居、達摩）。v3 籤身不印號碼，
 * 所以貼圖只要這幾格，不用一支一格 —— 一支一格在 36 支就已經 4608px，
 * 超過 WebGL 保證支援的 4096；60 支會到 7680。
 */
export const STICK_VARIANTS = 5;
export const STICK_ATLAS_W = STICK_CELL_W * STICK_VARIANTS;

export const stickCellRect = (i: number): { x: number; y: number; w: number; h: number } => ({
  x: i * STICK_CELL_W,
  y: 0,
  w: STICK_CELL_W,
  h: STICK_CELL_H,
});

/**
 * 圆体 —— 圆润的黑体。参考图的中文全是这一类，笔画等粗、末端收圆。
 * 旧版用的是楷书 serif（有提按、有撇捺），那是庙里签诗的气质，不是可爱杂货的气质。
 */
const ROUND =
  '"Yuanti SC", "Yuanti TC", "Hiragino Maru Gothic ProN", "PingFang SC", "Noto Sans TC", sans-serif';

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/* ── 日系黏土配色 ──
 *
 * 参考的是那种奶油色的日系籤筒：雾面、圆角、暖棕的字、朱红的点缀。
 * 关键是**别用金色**——描金是庙里那种庄严感，这版要的是可爱。
 */

/** 杯身与籤身的奶油底。 */
const CREAM = '#f0e7d4';
const CREAM_LIGHT = '#fbf5e9';
const CREAM_DARK = '#ddd0b6';
/** 字与线：深暖棕。 */
const INK = '#5c4632';
/** 朱红：梅花、蝴蝶结、腮红。 */
const RED = '#e2564a';

const SANS = '"Avenir Next", "Helvetica Neue", Arial, sans-serif';


/** 腮红的粉。 */
const BLUSH = 'rgba(232, 138, 130, 0.55)';

/** 五瓣梅花：五片圆花瓣 + 中心一点。参考图上散在四周的那些小红花。 */
function plum(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = RED;
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.45, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = CREAM_LIGHT;
  g.beginPath();
  g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** 四角闪 —— 籤身上那些小星点。 */
function sparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(0, -r);
  g.quadraticCurveTo(0, 0, r, 0);
  g.quadraticCurveTo(0, 0, 0, r);
  g.quadraticCurveTo(0, 0, -r, 0);
  g.quadraticCurveTo(0, 0, 0, -r);
  g.fill();
  g.restore();
}

/** 蝴蝶结：两片圆润的耳朵 + 中心结。 */
function bow(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = RED;
  for (const dir of [-1, 1]) {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(dir * s * 1.7, -s * 1.25, dir * s * 1.75, s * 1.0, 0, 0);
    g.fill();
  }
  g.beginPath();
  g.ellipse(0, 0, s * 0.42, s * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * 杯身下方那只垂耳小狗。
 *
 * 关键是**耳朵**：参考图上是两片深棕的大垂耳，从头顶两侧挂下来，比脸还长，
 * 下缘比上缘宽（水滴形）。画成脸两侧的小圆片就完全不是同一只狗了。
 */
function puppy(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // 身体：脸下面露出一截白身子
  g.fillStyle = CREAM_LIGHT;
  g.strokeStyle = INK;
  g.lineWidth = s * 0.075;
  g.beginPath();
  g.ellipse(0, s * 0.95, s * 0.82, s * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // 垂耳：挂在脸两侧的大耳朵，下缘要低过脸的中线。
  // 画小了就只会从头顶露出两个黑角，那是另一只动物。
  g.fillStyle = INK;
  for (const dir of [-1, 1]) {
    g.save();
    g.translate(dir * s * 0.92, s * 0.1);
    g.rotate(dir * 0.2);
    g.beginPath();
    g.ellipse(0, 0, s * 0.46, s * 0.76, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // 脸
  g.fillStyle = CREAM_LIGHT;
  g.beginPath();
  g.arc(0, 0, s, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = s * 0.075;
  g.strokeStyle = INK;
  g.stroke();

  // 豆豆眼
  g.fillStyle = INK;
  for (const dir of [-1, 1]) {
    g.beginPath();
    g.ellipse(dir * s * 0.33, s * 0.02, s * 0.105, s * 0.14, 0, 0, Math.PI * 2);
    g.fill();
  }
  // 小嘴
  g.lineWidth = s * 0.06;
  g.beginPath();
  g.moveTo(-s * 0.1, s * 0.34);
  g.quadraticCurveTo(0, s * 0.45, s * 0.1, s * 0.34);
  g.stroke();

  // 腮红
  g.fillStyle = BLUSH;
  for (const dir of [-1, 1]) {
    g.beginPath();
    g.ellipse(dir * s * 0.63, s * 0.28, s * 0.17, s * 0.11, 0, 0, Math.PI * 2);
    g.fill();
  }

  // 怀里那朵梅花
  plum(g, 0, s * 0.92, s * 0.36);

  // 两侧的动感线
  g.strokeStyle = RED;
  g.lineWidth = s * 0.07;
  for (const dir of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const yy = s * (0.62 + k * 0.28);
      g.beginPath();
      g.moveTo(dir * s * (1.26 + k * 0.06), yy);
      g.lineTo(dir * s * (1.62 + k * 0.06), yy - s * 0.1);
      g.stroke();
    }
  }
  g.restore();
}

/** 籤身下方的小图案 —— 每支不一样，抽到哪一支都有点小惊喜。 */
function stickIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number, kind: number): void {
  g.save();
  g.translate(x, y);
  g.lineWidth = Math.max(1.6, s * 0.15);
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (kind) {
    case 0: // 梅花（红的，跟杯身呼应）
      plum(g, 0, 0, s);
      break;
    case 1: { // 笑脸云
      g.beginPath();
      g.moveTo(-s, s * 0.42);
      g.arc(-s * 0.5, s * 0.06, s * 0.46, Math.PI * 0.86, Math.PI * 1.7);
      g.arc(s * 0.12, -s * 0.2, s * 0.56, Math.PI * 1.2, Math.PI * 2);
      g.arc(s * 0.62, s * 0.1, s * 0.42, Math.PI * 1.55, Math.PI * 0.16);
      g.lineTo(-s, s * 0.42);
      g.closePath();
      g.stroke();
      g.fillStyle = INK;
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.arc(dir * s * 0.28, s * 0.04, s * 0.09, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 2: // 富士山
      g.beginPath();
      g.moveTo(-s, s * 0.52);
      g.lineTo(-s * 0.1, -s * 0.66);
      g.quadraticCurveTo(0, -s * 0.78, s * 0.1, -s * 0.66);
      g.lineTo(s, s * 0.52);
      g.closePath();
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.moveTo(-s * 0.38, -s * 0.06);
      g.lineTo(-s * 0.1, -s * 0.66);
      g.quadraticCurveTo(0, -s * 0.78, s * 0.1, -s * 0.66);
      g.lineTo(s * 0.38, -s * 0.06);
      g.lineTo(s * 0.16, -s * 0.26);
      g.lineTo(0, -s * 0.06);
      g.lineTo(-s * 0.18, -s * 0.28);
      g.closePath();
      g.fill();
      break;
    case 3: // 鸟居
      g.beginPath();
      g.moveTo(-s * 1.05, -s * 0.46);
      g.lineTo(s * 1.05, -s * 0.46);
      g.moveTo(-s * 0.82, -s * 0.12);
      g.lineTo(s * 0.82, -s * 0.12);
      g.moveTo(-s * 0.56, -s * 0.46);
      g.lineTo(-s * 0.56, s * 0.66);
      g.moveTo(s * 0.56, -s * 0.46);
      g.lineTo(s * 0.56, s * 0.66);
      g.stroke();
      break;
    default: { // 达摩
      g.fillStyle = RED;
      g.beginPath();
      g.moveTo(-s * 0.62, s * 0.6);
      g.quadraticCurveTo(-s * 0.9, -s * 0.85, 0, -s * 0.85);
      g.quadraticCurveTo(s * 0.9, -s * 0.85, s * 0.62, s * 0.6);
      g.closePath();
      g.fill();
      g.fillStyle = CREAM_LIGHT;
      g.beginPath();
      g.ellipse(0, -s * 0.12, s * 0.42, s * 0.34, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK;
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.arc(dir * s * 0.18, -s * 0.16, s * 0.08, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
  }
  g.restore();
}

/** 字距 —— canvas 没有 letter-spacing，只能自己一个字一个字排。 */
function trackedText(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number,
): void {
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  for (let i = 0; i < text.length; i += 1) {
    g.fillText([...text][i], x + widths[i] / 2, y);
    x += widths[i] + spacing;
  }
}

/**
 * 一支籤的正面：奶油底、圆拱外框、框裡那一行字、GOOD LUCK、小图案。
 *
 * @param x       在畫布上從哪裡開始畫（貼圖集裡是第幾格 × 格寬；單張就是 0）
 * @param variant 小圖案是哪一種
 * @param label   框裡那一行：筒裡的籤是「御神籤」，抽出來那支才是「第 N 籤」
 */
function paintStick(g: CanvasRenderingContext2D, x: number, variant: number, label: string): void {
  const r = { w: STICK_CELL_W, h: STICK_CELL_H };
  g.save();
  g.translate(x, 0);

  const base = g.createLinearGradient(0, 0, r.w, 0);
  base.addColorStop(0.0, CREAM_DARK);
  base.addColorStop(0.3, CREAM);
  base.addColorStop(0.54, CREAM_LIGHT);
  base.addColorStop(1.0, CREAM_DARK);
  g.fillStyle = base;
  g.fillRect(0, 0, r.w, r.h);

  const cx = r.w / 2;
  // 圆拱外框
  const fx = r.w * 0.13;
  const fw = r.w - fx * 2;
  // 籤只露出全长的 38%，画在那条线以下的东西全都埋在筒子里看不见
  const fy = r.h * 0.03;
  const fh = r.h * 0.26;
  g.strokeStyle = INK;
  g.lineWidth = 3.2;
  g.beginPath();
  g.roundRect(fx, fy, fw, fh, [fw * 0.5, fw * 0.5, 5, 5]);
  g.stroke();

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK;

  // 小闪（参考图里散在框内上方）
  sparkle(g, cx - fw * 0.27, fy + fh * 0.2, 7);
  sparkle(g, cx + fw * 0.29, fy + fh * 0.3, 5.5);
  sparkle(g, cx - fw * 0.31, fy + fh * 0.58, 5);

  // v3：筒裡的籤**不印號碼**（「御神籤」），抽出來那支才換成「第 N 籤」。
  // 版面跟參考圖的「上上籤」同一個位置；三個字寬的號碼（第廿三籤是四個字）縮一點才塞得下
  g.font = `700 ${[...label].length > 3 ? 22 : 24}px ${ROUND}`;
  g.fillText(label, cx, fy + fh * 0.44);

  // GOOD LUCK 两行
  g.font = `800 23px ${SANS}`;
  g.fillText('GOOD', cx, fy + fh * 0.65);
  g.fillText('LUCK', cx, fy + fh * 0.83);

  stickIcon(g, cx, r.h * 0.335, r.w * 0.21, variant % 5);
  g.restore();
}

export function createStickAtlas(): HTMLCanvasElement {
  const cv = makeCanvas(STICK_ATLAS_W, STICK_CELL_H);
  const g = cv.getContext('2d');
  if (!g) return cv;
  for (let i = 0; i < STICK_VARIANTS; i += 1) paintStick(g, stickCellRect(i).x, i, '御神籤');
  return cv;
}

/**
 * 抽出來那一支的籤身：同樣的版面，框裡印「第 N 籤」。只在揭曉時為那一支畫一張。
 *
 * @param no      伺服器抽到的籤號（1 起算）—— 這是號碼唯一的來源，動畫不決定它
 * @param variant 跟它在筒裡時同一種小圖案，換貼圖時才不會突然變樣
 */
export function createNumberedStickCanvas(no: number, variant: number): HTMLCanvasElement {
  const cv = makeCanvas(STICK_CELL_W, STICK_CELL_H);
  const g = cv.getContext('2d');
  if (!g) return cv;
  paintStick(g, 0, variant, `第${hanNumber(no)}籤`);
  return cv;
}

/** 圆籤头：奶油圆片 + 双圈 + 一个「籤」。参考图最好认的特征。 */
export function createStickHeadCanvas(): HTMLCanvasElement {
  const S = 256;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.fillStyle = CREAM_LIGHT;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.445, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.365, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 124px ${ROUND}`;
  g.fillText('籤', S / 2, S / 2 + 8);
  return cv;
}

/* ── 杯身：GOOD LUCK + 点线蝴蝶结 + 上上籤 + 两侧四字 + 梅花 + 垂耳狗 ── */

/** 杯身貼圖的高（像素）。寬由周長決定，見下。 */
const TUBE_TEX_H = 1024;
/**
 * 貼圖寬 = 高 × 周長 / 杯高：貼圖照弧長鋪（geometry.ts 的 cupArcU），這樣一個像素在
 * 杯壁上就是正方形，畫什麼就是什麼形狀。v2 用 1024 × 1024 去包一整圈（周長是杯高的
 * 兩倍多），字全被橫向拉扁，只能在畫的時候先擠回去 —— 那是補丁，這是解法。
 */
export const TUBE_TEX_W = Math.round((TUBE_TEX_H * CUP_PERIMETER) / TUBE_H);

export function createTubeCanvas(): HTMLCanvasElement {
  const W = TUBE_TEX_W;
  const H = TUBE_TEX_H;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  if (!g) return cv;

  const cx = W * 0.5;
  /** 正面那一片的半寬（像素）。圖案全部排在這裡面，超出去就爬上圓角了。 */
  const F = (CUP_FACE_HALF * H) / TUBE_H;

  // 底色：正面中央最亮，往兩側的圓角慢慢暗下去 —— 光打不到的地方本來就暗，
  // 這一點點漸層就是參考圖那種「軟軟的奶油塑膠」的體積感
  const fu = F / W;
  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0, CREAM_DARK);
  base.addColorStop(Math.max(0, 0.5 - fu * 1.9), CREAM_DARK);
  base.addColorStop(0.5 - fu * 1.05, CREAM);
  base.addColorStop(0.5, CREAM_LIGHT);
  base.addColorStop(0.5 + fu * 1.05, CREAM);
  base.addColorStop(Math.min(1, 0.5 + fu * 1.9), CREAM_DARK);
  base.addColorStop(1, CREAM_DARK);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK;

  // 貼圖上緣是杯口：最上面約 14% 被領子蓋住，最下面約 8% 是圓角，圖案都排在中間。
  // 比例照參考圖：GOOD LUCK 橫跨正面約七成、上上籤三個大字、狗占下半部、寬度超過正面一半

  // GOOD LUCK，寬字距，撐到正面寬度的七成
  g.font = `800 58px ${SANS}`;
  {
    const target = F * 1.42;
    const w = g.measureText('GOOD LUCK').width + 8 * 8;
    g.font = `800 ${Math.round((58 * target) / w)}px ${SANS}`;
  }
  trackedText(g, 'GOOD LUCK', cx, H * 0.215, 8);

  // 点线 + 蝴蝶结
  for (let k = -9; k <= 9; k += 1) {
    if (Math.abs(k) < 2) continue;
    g.beginPath();
    g.arc(cx + (k * F * 0.8) / 9, H * 0.282, 4.2, 0, Math.PI * 2);
    g.fill();
  }
  bow(g, cx, H * 0.282, 19);

  // 「上上籤」直排大字
  g.font = `800 92px ${ROUND}`;
  // 間距收緊一點：「籤」的下緣要跟狗的耳朵留一段空，貼在一起就糊成一團
  for (let k = 0; k < 3; k += 1) g.fillText('上上籤'[k], cx, H * 0.372 + k * H * 0.084);

  // 两侧竖排四字
  g.font = `700 46px ${ROUND}`;
  const side = ['萬事順利', '心想事成'];
  for (let c = 0; c < 2; c += 1) {
    const x = cx + (c === 0 ? -1 : 1) * F * 0.6;
    for (let k = 0; k < side[c].length; k += 1) g.fillText(side[c][k], x, H * 0.4 + k * H * 0.056);
  }

  // 四朵梅花
  plum(g, cx - F * 0.6, H * 0.335, 20);
  plum(g, cx + F * 0.6, H * 0.335, 20);
  plum(g, cx - F * 0.74, H * 0.705, 19);
  plum(g, cx + F * 0.74, H * 0.705, 19);

  // 垂耳狗：坐著、抱著梅花，寬度約正面的一半多
  puppy(g, cx, H * 0.745, F * 0.34);
  return cv;
}

/** 杯口那一圈领子。雾面实色 —— 黏土上不该有金属拉丝。 */
export function createBrassCanvas(): HTMLCanvasElement {
  const W = 256;
  const H = 32;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0.0, CREAM_DARK);
  base.addColorStop(0.45, CREAM_LIGHT);
  base.addColorStop(1.0, CREAM_DARK);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  return cv;
}
