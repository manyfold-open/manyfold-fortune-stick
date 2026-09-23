/**
 * 签筒的贴图 —— Canvas 2D 画底色与字，插画来自使用者给的 SVG（art.ts）。
 *
 * 只产出 HTMLCanvasElement，不 import three：「画什么」和「怎么贴」分开。
 * SVG 要先解码成图才画得进 canvas：每张贴图都是「先画底色和字、图好了再补上插画」，
 * 由 scene.ts 在 loadCylinderArt() 之后重画一次、标 needsUpdate。
 */

import { CUP_FACE_HALF, CUP_PERIMETER, STICK_LEN, STICK_W, TUBE_H } from '../../shared/cylinder/geometry';
import { hanNumber } from '../../shared/numerals';
import { CUP_FACE, HEAD_BOX, PIECE_BOX, STICK_ART, STICK_VARIANT_DETAIL, cylinderArt, type CylinderArt } from './art';

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

/** 籤上的中文與英文：跟 SVG 原檔同一組字型（.cn / .latin），canvas 寫的字跟插畫才像同一個人畫的 */
const CN = "'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif";
const LATIN = "'Arial Rounded MT Bold', 'Avenir Next', Arial, sans-serif";

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/* ── 配色：照 SVG 原檔 ──
 * 奶油色的日系籤筒：霧面、暖棕的字、朱紅的點綴。別用金色 —— 描金是廟裡那種莊嚴感，這版要的是可愛。
 */

/** 杯身：原檔 #pot 漸層（兩側 #f4dfbd／#dfb887、正中 #fff8e7）；3D 的光影再疊在上面 */
const POT_LIGHT = '#fff8e7';
const POT = '#f8e8cb';
const POT_DARK = '#e6c69d';
/** 杯口領子：原檔 #rim */
const RIM_LIGHT = '#fffdf1';
const RIM_DARK = '#e6c69d';
/** 籤身：原檔 #stick */
const STICK_STOPS: ReadonlyArray<[number, string]> = [
  [0, '#eed7b4'],
  [0.18, '#fff6e2'],
  [0.55, '#fff9e8'],
  [1, '#ecd4ae'],
];
/** 籤面內側那條淺線（原檔 #d8b98d） */
const STICK_LINE = '#d8b98d';
/** 字：原檔 .ink */
const INK = '#58382a';
/** 點：原檔 #68432f */
const DOT = '#68432f';

/** 一個小零件（原檔單位 PIECE_BOX 見方的圖）畫在 (x, y) 為中心、縮放 k */
function drawPiece(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, k: number): void {
  const size = PIECE_BOX * k;
  g.drawImage(img, x - size / 2, y - size / 2, size, size);
}

/**
 * 一支籤的正面：奶油底、內側一條淺線、迷你梅花與小星、框裡那一行字、GOOD LUCK、點、小圖。
 * 排版照 SVG 原檔最直的那支（富士山）量的距離（art.ts 的 STICK_ART），原檔單位乘 k。
 *
 * @param x       在畫布上從哪裡開始畫（貼圖集裡是第幾格 × 格寬；單張就是 0）
 * @param variant 小圖案是哪一種
 * @param label   框裡那一行：筒裡的籤是「御神籤」，抽出來那支才是「第 N 籤」
 * @param art     插畫；還沒載好就先只畫底色和字
 */
function paintStick(
  g: CanvasRenderingContext2D,
  x: number,
  variant: number,
  label: string,
  art: CylinderArt | null,
): void {
  const w = STICK_CELL_W;
  const h = STICK_CELL_H;
  const k = w / STICK_ART.faceW;
  const cx = w / 2;
  /** 原檔的籤頂正中；籤只露出全長約 38%，排在那條線以下的東西全埋在筒子裡 */
  const top = h * 0.012;
  const at = (dy: number) => top + dy * k;
  g.save();
  g.translate(x, 0);
  g.clearRect(0, 0, w, h);

  const base = g.createLinearGradient(0, 0, w, 0);
  for (const [offset, color] of STICK_STOPS) base.addColorStop(offset, color);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // 內側淺線：沿籤頂一道弧、順著右緣往下（原檔 M232 148 Q266 162 297 148 L298 423）
  g.strokeStyle = STICK_LINE;
  g.lineWidth = 1.5 * k;
  g.beginPath();
  g.moveTo(10 * k, at(7));
  g.quadraticCurveTo(cx, at(21), w - 10 * k, at(7));
  g.lineTo(w - 9 * k, at(282));
  g.stroke();

  const detail = STICK_VARIANT_DETAIL[variant % STICK_VARIANT_DETAIL.length];
  if (art) {
    if (detail.miniPlum) drawPiece(g, art.miniPlum, cx + STICK_ART.miniPlum.dx * k, at(STICK_ART.miniPlum.dy), k);
    drawPiece(g, art.star, cx + STICK_ART.star.dx * k, at(STICK_ART.star.dy), k);
    drawPiece(g, art.stickIcons[variant % art.stickIcons.length], cx, at(STICK_ART.icon), k);
  }

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  // v3：筒裡的籤**不印號碼**（「御神籤」），抽出來那支才換成「第 N 籤」。
  // 原檔這裡是「上上籤」（17px）；四個字的號碼（第廿三籤）縮一點才塞得下
  g.font = `800 ${Math.round(([...label].length > 3 ? 14.5 : 17.5) * k)}px ${CN}`;
  g.fillText(label, cx, at(STICK_ART.label));
  g.font = `800 ${Math.round(16.5 * k)}px ${LATIN}`;
  g.fillText('GOOD', cx, at(STICK_ART.good));
  g.fillText('LUCK', cx, at(STICK_ART.luck));

  g.fillStyle = DOT;
  const gap = 18 * k;
  for (let d = 0; d < detail.dots; d += 1) {
    g.beginPath();
    g.arc(cx + (d - (detail.dots - 1) / 2) * gap, at(STICK_ART.dots), 2.5 * k, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** 筒裡那 STICK_VARIANTS 種籤身，並排在一張貼圖集上 */
export function paintStickAtlas(cv: HTMLCanvasElement, art: CylinderArt | null): void {
  const g = cv.getContext('2d');
  if (!g) return;
  for (let i = 0; i < STICK_VARIANTS; i += 1) paintStick(g, stickCellRect(i).x, i, '御神籤', art);
}

export function createStickAtlas(art: CylinderArt | null = cylinderArt()): HTMLCanvasElement {
  const cv = makeCanvas(STICK_ATLAS_W, STICK_CELL_H);
  paintStickAtlas(cv, art);
  return cv;
}

/**
 * 抽出來那一支的籤身：同樣的版面，框裡印「第 N 籤」。只在揭曉時為那一支畫一張。
 * 插畫在籤筒一開場就開始載入，到這裡通常早就好了；萬一還沒，呼叫端等 loadCylinderArt() 再重畫。
 *
 * @param no      伺服器抽到的籤號（1 起算）—— 這是號碼唯一的來源，動畫不決定它
 * @param variant 跟它在筒裡時同一種小圖案，換貼圖時才不會突然變樣
 */
export function paintNumberedStick(cv: HTMLCanvasElement, no: number, variant: number, art: CylinderArt | null): void {
  const g = cv.getContext('2d');
  if (!g) return;
  paintStick(g, 0, variant, `第${hanNumber(no)}籤`, art);
}

export function createNumberedStickCanvas(
  no: number,
  variant: number,
  art: CylinderArt | null = cylinderArt(),
): HTMLCanvasElement {
  const cv = makeCanvas(STICK_CELL_W, STICK_CELL_H);
  paintNumberedStick(cv, no, variant, art);
  return cv;
}

/** 圓籤頭：原檔的奶油圓盤、淺色外框、一圈細線、「籤」。插畫還沒好時先寫一個字 */
export function paintStickHead(cv: HTMLCanvasElement, art: CylinderArt | null): void {
  const g = cv.getContext('2d');
  if (!g) return;
  const S = cv.width;
  g.fillStyle = '#f7e6c6';
  g.fillRect(0, 0, S, S);
  if (art) {
    g.drawImage(art.head, 0, 0, S, S);
    return;
  }
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `800 ${Math.round((42 * S) / HEAD_BOX)}px ${CN}`;
  g.fillText('籤', S / 2, S / 2 + (15 * S) / HEAD_BOX);
}

export function createStickHeadCanvas(art: CylinderArt | null = cylinderArt()): HTMLCanvasElement {
  const cv = makeCanvas(256, 256);
  paintStickHead(cv, art);
  return cv;
}

/* ── 杯身：GOOD LUCK + 点线蝴蝶结 + 上上籤 + 两侧四字 + 梅花 + 吉祥物（全部來自 SVG 原檔） ── */

/** 杯身貼圖的高（像素）。寬由周長決定，見下。 */
const TUBE_TEX_H = 1024;
/**
 * 貼圖寬 = 高 × 周長 / 杯高：貼圖照弧長鋪（geometry.ts 的 cupArcU），這樣一個像素在
 * 杯壁上就是正方形，畫什麼就是什麼形狀。v2 用 1024 × 1024 去包一整圈（周長是杯高的
 * 兩倍多），字全被橫向拉扁，只能在畫的時候先擠回去 —— 那是補丁，這是解法。
 */
export const TUBE_TEX_W = Math.round((TUBE_TEX_H * CUP_PERIMETER) / TUBE_H);

/**
 * 貼圖上緣是杯口：最上面 14% 被領子蓋住（scene.ts 的 collar 高 TUBE_H × 0.14）。
 * 原檔的圖案框（art.ts 的 CUP_FACE）從領子下緣量到筒底，所以貼在 14%～100% 這一段、
 * 寬剛好是正面那一片：一個原檔單位在兩個方向都是同樣的像素數。
 */
const COLLAR = 0.14;

export function paintTubeCanvas(cv: HTMLCanvasElement, art: CylinderArt | null): void {
  const g = cv.getContext('2d');
  if (!g) return;
  const W = cv.width;
  const H = cv.height;
  const cx = W * 0.5;
  /** 正面那一片的半寬（像素）。圖案全部排在這裡面，超出去就爬上圓角了。 */
  const F = (CUP_FACE_HALF * H) / TUBE_H;

  // 底色：正面中央最亮，往兩側的圓角慢慢暗下去 —— 光打不到的地方本來就暗，
  // 這一點點漸層就是參考圖那種「軟軟的奶油塑膠」的體積感
  const fu = F / W;
  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0, POT_DARK);
  base.addColorStop(Math.max(0, 0.5 - fu * 1.9), POT_DARK);
  base.addColorStop(0.5 - fu * 1.05, POT);
  base.addColorStop(0.5, POT_LIGHT);
  base.addColorStop(0.5 + fu * 1.05, POT);
  base.addColorStop(Math.min(1, 0.5 + fu * 1.9), POT_DARK);
  base.addColorStop(1, POT_DARK);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  if (!art) return;
  const faceW = F * 2;
  const faceH = (CUP_FACE.h * faceW) / CUP_FACE.w;
  g.drawImage(art.cupFace, cx - F, H * COLLAR, faceW, faceH);
}

export function createTubeCanvas(art: CylinderArt | null = cylinderArt()): HTMLCanvasElement {
  const cv = makeCanvas(TUBE_TEX_W, TUBE_TEX_H);
  paintTubeCanvas(cv, art);
  return cv;
}

/** 杯口那一圈领子：原檔 #rim 的霧面奶油，中間亮、上下暗 —— 黏土上不该有金属拉丝 */
export function createBrassCanvas(): HTMLCanvasElement {
  const W = 256;
  const H = 32;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0.0, RIM_DARK);
  base.addColorStop(0.45, RIM_LIGHT);
  base.addColorStop(1.0, RIM_DARK);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  return cv;
}
