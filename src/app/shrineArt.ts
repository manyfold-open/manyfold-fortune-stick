/**
 * 神社場景的畫法 —— 頁面背景（ShrineBackdrop）與分享圖（share.ts）共用。
 *
 * 櫻花枝、花瓣、鳥居的形狀只在這裡定義一次：頁面用 SVG 畫枝與鳥居、用 canvas 畫花瓣；
 * 分享圖全用 canvas（Path2D 吃得下同一串 SVG 路徑）。兩邊長得一樣，是因為它們讀的是同一份資料。
 *
 * 分享圖的顏色寫死在這裡，不讀 CSS 變數 —— 誰分享出去都是同一張。
 */

import { createPetals, petalAt } from '../shared/sakura';

export const SEAL = '#c0321f';
export const SEAL_DEEP = '#9e2517';
export const CREAM = '#fbf3e6';
export const WOOD_EDGE = '#8f6a43';
export const WOOD = '#ecd9b8';
export const WOOD_HI = '#f5e8cf';
export const WOOD_INK = '#3b2a1e';
export const ROUND = '"Yuanti SC", "Yuanti TC", "Hiragino Maru Gothic ProN", "PingFang SC", sans-serif';

/*
 * ── 鳥居 ── 頁面上的尺寸（px，從頁面頂端量）；分享圖整組乘上一個倍率。
 * 由上而下：笠木＋島木（0～41）→ 注連繩（兩端 44、正中 52）→ 貫（64～78）→ 繪馬的紅繩從貫垂下。
 * 笠木、島木是 viewBox 0 0 1000 44 的路徑，水平方向撐滿寬度（只在水平方向拉，弧線還是順的）。
 */
export const TORII_KASAGI_VIEW = { w: 1000, h: 44 };
/** 島木：朱紅，貼在笠木下緣 */
export const TORII_SHIMAKI_D = 'M0 12 C150 26 350 32 500 32 C650 32 850 26 1000 12 L1000 21 C850 35 650 41 500 41 C350 41 150 35 0 21 Z';
/** 笠木：黑漆，中間厚、兩端薄而上翹 */
export const TORII_KASAGI_D = 'M0 0 C150 10 350 12 500 12 C650 12 850 10 1000 0 L1000 12 C850 26 650 32 500 32 C350 32 150 26 0 12 Z';
export const TORII_RED = '#b8321f';
export const TORII_LACQUER = ['#4a372d', '#2c211c', '#1f1713'] as const;
/** 注連繩那一條的上緣（離笠木頂） */
export const ROPE_TOP = 36;
/**
 * 注連繩的下垂：二次 Bézier 控制點在正中，x 對 t 是線性的，所以 y 直接寫成 u 的拋物線。
 * 紙垂要掛在繩子上，位置得跟繩子用同一條式子算。
 */
export const ROPE_Y0 = 8;
export const ROPE_SAG = 8;
export const ropeY = (u: number): number => ROPE_Y0 + 4 * ROPE_SAG * u * (1 - u);
/** 紙垂掛在繩上的位置（繩長的比例）。只掛兩旁：正中是繪馬的紅繩垂下來的地方 */
export const SHIDE_AT = [0.1, 0.24, 0.76, 0.9];
/** 紙垂：viewBox 0 0 14 38，一條紙摺成閃電形，一格一格左右錯開往下；頁面上畫成 20×54 */
export const SHIDE_VIEW = { w: 14, h: 38 };
export const SHIDE_D = 'M6 0h2v5h-2z M5 4h8v8h-8z M1 11h8v8h-8z M5 18h8v8h-8z M1 25h8v8h-8z M5 32h6l-3 5z';
export const SHIDE_SIZE = { w: 20, h: 54 };
/** 貫的上緣與厚度（離笠木頂） */
export const NUKI_TOP = 64;
export const NUKI_H = 14;

/**
 * 在分享圖上畫整座鳥居，回傳貫的下緣 y（繪馬的紅繩從那裡垂下來）。
 * @param top 笠木頂的 y；@param k 倍率（頁面尺寸 × k）；柱子寬 pillarW、離左右邊 pillarX
 */
function drawTorii(g: CanvasRenderingContext2D, w: number, h: number, top: number, k: number, pillarX: number, pillarW: number): number {
  // 貫：兩柱之間，兩端穿出柱子一截
  const nukiY = top + NUKI_TOP * k;
  const nukiH = NUKI_H * k;
  const nuki = g.createLinearGradient(0, nukiY, 0, nukiY + nukiH);
  nuki.addColorStop(0, '#cf4a2f');
  nuki.addColorStop(0.55, TORII_RED);
  nuki.addColorStop(1, '#972717');
  g.fillStyle = nuki;
  g.fillRect(pillarX - 22 * k, nukiY, w - 2 * pillarX + 44 * k, nukiH);

  // 柱：左邊受光；柱腳一截黑漆
  const baseH = h * 0.09;
  for (const x of [pillarX, w - pillarX - pillarW]) {
    const pillar = g.createLinearGradient(x, 0, x + pillarW, 0);
    pillar.addColorStop(0, '#d85236');
    pillar.addColorStop(0.4, '#c23d26');
    pillar.addColorStop(0.8, '#a72d1c');
    pillar.addColorStop(1, '#8f2416');
    g.fillStyle = pillar;
    g.fillRect(x, top + 30 * k, pillarW, h - top - 30 * k);
    const base = g.createLinearGradient(x, 0, x + pillarW, 0);
    base.addColorStop(0, '#3a2a22');
    base.addColorStop(0.6, '#251b16');
    base.addColorStop(1, '#1c1410');
    g.fillStyle = base;
    g.fillRect(x - 2 * k, h - baseH, pillarW + 4 * k, baseH);
  }

  // 注連繩：左柱中心拉到右柱中心，三層描邊（深色底、麻色、擰紋）
  const x0 = pillarX + pillarW / 2;
  const x1 = w - x0;
  const ropeTop = top + ROPE_TOP * k;
  const rope = () => {
    g.beginPath();
    g.moveTo(x0, ropeTop + ROPE_Y0 * k);
    g.quadraticCurveTo(w / 2, ropeTop + (ROPE_Y0 + 2 * ROPE_SAG) * k, x1, ropeTop + ROPE_Y0 * k);
  };
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = '#9c7f4a';
  g.lineWidth = 13 * k;
  rope();
  g.stroke();
  g.strokeStyle = '#dcc48e';
  g.lineWidth = 11 * k;
  rope();
  g.stroke();
  g.lineCap = 'butt';
  g.strokeStyle = '#b99b5f';
  g.setLineDash([3 * k, 6 * k]);
  rope();
  g.stroke();
  g.restore();

  // 紙垂：掛在繩上，垂過貫的前面
  const shide = new Path2D(SHIDE_D);
  const sw = SHIDE_SIZE.w * k;
  const sh = SHIDE_SIZE.h * k;
  for (const u of SHIDE_AT) {
    g.save();
    g.translate(x0 + u * (x1 - x0) - sw / 2, ropeTop + (ropeY(u) - 2) * k);
    g.scale(sw / SHIDE_VIEW.w, sh / SHIDE_VIEW.h);
    g.shadowColor = 'rgba(60, 40, 20, 0.15)';
    g.shadowBlur = 2 * k;
    g.shadowOffsetY = 1 * k;
    g.fillStyle = '#fffdf6';
    g.fill(shide);
    g.shadowColor = 'transparent';
    g.strokeStyle = '#b9ad94';
    g.lineWidth = 0.7;
    g.stroke(shide);
    g.restore();
  }

  // 笠木＋島木：撐滿寬度，最後畫、壓在柱頂上
  g.save();
  g.translate(0, top);
  g.scale(w / TORII_KASAGI_VIEW.w, k);
  g.shadowColor = 'rgba(40, 24, 16, 0.22)';
  g.shadowBlur = 4 * k;
  g.shadowOffsetY = 3 * k;
  g.fillStyle = TORII_RED;
  g.fill(new Path2D(TORII_SHIMAKI_D));
  const lacquer = g.createLinearGradient(0, 0, 0, TORII_KASAGI_VIEW.h);
  lacquer.addColorStop(0, TORII_LACQUER[0]);
  lacquer.addColorStop(0.35 * (32 / 44), TORII_LACQUER[1]);
  lacquer.addColorStop(32 / 44, TORII_LACQUER[2]);
  g.fillStyle = lacquer;
  g.fill(new Path2D(TORII_KASAGI_D));
  g.restore();

  return nukiY + nukiH;
}

/* ── 櫻花枝：viewBox 0 0 280 180，右邊那枝是左邊鏡像 ── */

export const BRANCH_VIEW = { w: 280, h: 180 };
export const BRANCH_STROKES: ReadonlyArray<{ d: string; width: number }> = [
  { d: 'M-10 20 C 60 34, 120 30, 170 62 S 250 96, 282 118', width: 5 },
  { d: 'M96 38 C 110 58, 130 70, 150 88', width: 3 },
  { d: 'M40 30 C 44 60, 42 84, 42 104', width: 2.5 },
];
export const BRANCH_COLOR = '#6b4a36';
/** [cx, cy, r] */
export const BRANCH_FLOWERS: ReadonlyArray<[number, number, number]> = [
  [70, 58, 15], [118, 40, 12], [150, 88, 14], [205, 60, 11], [42, 104, 12], [236, 104, 9],
];
export const FLOWER_PINK = ['#fbd9e0', '#f7c6d1'] as const;
export const FLOWER_EYE = '#d9576f';

/** 一片櫻花瓣：尖端有個小缺口，原點在中心，長邊沿 y。 */
export function drawPetal(g: CanvasRenderingContext2D, s: number): void {
  const w = s * 0.62;
  const h = s;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.bezierCurveTo(w * 0.9, h * 0.25, w * 0.75, -h * 0.45, w * 0.18, -h / 2);
  g.lineTo(0, -h * 0.36);
  g.lineTo(-w * 0.18, -h / 2);
  g.bezierCurveTo(-w * 0.75, -h * 0.45, -w * 0.9, h * 0.25, 0, h / 2);
  g.closePath();
  const grad = g.createLinearGradient(0, h / 2, 0, -h / 2);
  grad.addColorStop(0, '#f19fb3');
  grad.addColorStop(1, '#fde3ea');
  g.fillStyle = grad;
  g.fill();
  // 一圈淡淡的深粉邊：沒有它，花瓣在奶油底上會糊掉
  g.strokeStyle = 'rgba(212, 110, 136, 0.55)';
  g.lineWidth = Math.max(0.8, s * 0.06);
  g.stroke();
}

function drawBranch(g: CanvasRenderingContext2D, x: number, y: number, width: number, mirror: boolean): void {
  const k = width / BRANCH_VIEW.w;
  g.save();
  g.translate(x, y);
  if (mirror) g.scale(-1, 1);
  g.scale(k, k);
  g.strokeStyle = BRANCH_COLOR;
  g.lineCap = 'round';
  for (const s of BRANCH_STROKES) {
    g.lineWidth = s.width;
    g.stroke(new Path2D(s.d));
  }
  BRANCH_FLOWERS.forEach(([cx, cy, r], i) => {
    g.save();
    g.translate(cx, cy);
    g.rotate((i * 23 * Math.PI) / 180);
    g.fillStyle = FLOWER_PINK[i % 2];
    for (let a = 0; a < 5; a += 1) {
      g.save();
      g.rotate((a * 72 * Math.PI) / 180);
      g.beginPath();
      g.ellipse(0, -r * 0.55, r * 0.42, r * 0.58, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = FLOWER_EYE;
    g.beginPath();
    g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
  g.restore();
}

/** 分享圖上鳥居的位置與倍率：笠木頂、頁面尺寸 × SHARE_TORII_K、柱子 */
const SHARE_TORII_TOP = 20;
const SHARE_TORII_K = 1.3;
const SHARE_PILLAR_X = 28;
const SHARE_PILLAR_W = 70;

/**
 * 神社的日光：暖漸層、左上日光、一整座鳥居（跟頁面上那座同一份形狀）、兩角櫻花枝、散落的花瓣。
 * 回傳貫的下緣 y：繪馬的紅繩從那裡垂下來。
 *
 * 以前這裡只畫兩根淡掉的紅柱，加上畫面邊緣兩截灰色方塊當笠木與貫 —— 使用者：「分享卡裡的神社不夠逼真、跟原本的不一樣」。
 */
export function paintShrine(g: CanvasRenderingContext2D, w: number, h: number): number {
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#f3e6cb');
  base.addColorStop(1, '#dcc7a3');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  const sun = g.createRadialGradient(w * 0.14, -h * 0.04, 0, w * 0.14, -h * 0.04, w * 0.75);
  sun.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
  sun.addColorStop(1, 'rgba(255, 244, 214, 0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);

  const nukiBottom = drawTorii(g, w, h, SHARE_TORII_TOP, SHARE_TORII_K, SHARE_PILLAR_X, SHARE_PILLAR_W);

  // 櫻花枝壓在笠木上，跟頁面一樣從笠木底下探出來
  drawBranch(g, -40, SHARE_TORII_TOP + 24, 420, false);
  drawBranch(g, w + 40, SHARE_TORII_TOP + 24, 420, true);

  // 花瓣：跟頁面同一套動力學，固定在同一刻 —— 每張分享圖的花瓣都在同一個地方
  for (const p of createPetals(18, 7)) {
    const s = petalAt({ ...p, size: p.size * 1.8 }, 7.3, w, h);
    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.rot);
    g.scale(Math.max(0.15, Math.abs(s.flip)), 1);
    g.globalAlpha = 0.9;
    drawPetal(g, s.size);
    g.restore();
  }

  return nukiBottom;
}

/** 一朵五瓣的櫻花小印。 */
export function drawSakuraMark(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  for (let a = 0; a < 5; a += 1) {
    g.save();
    g.rotate((a * 72 * Math.PI) / 180);
    g.beginPath();
    g.ellipse(0, -r * 0.5, r * 0.34, r * 0.48, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = CREAM;
  g.beginPath();
  g.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** 字距自己排（canvas 的 letterSpacing 支持還不齊），整行在 cx 上置中。 */
export function spacedText(g: CanvasRenderingContext2D, text: string, cx: number, y: number, gap: number): void {
  const chars = [...text];
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((s, v) => s + v, 0) + gap * (chars.length - 1);
  let x = cx - total / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  chars.forEach((c, i) => {
    g.fillText(c, x, y);
    x += widths[i] + gap;
  });
  g.textAlign = align;
}

/** 水引：兩條橫線中間一個蝴蝶結（跟 Ema.tsx 的 SVG 同一個形狀，viewBox 160 × 18）。 */
function drawMizuhiki(g: CanvasRenderingContext2D, cx: number, cy: number, width: number): void {
  const k = width / 160;
  g.save();
  g.translate(cx - width / 2, cy - 9 * k);
  g.scale(k, k);
  g.strokeStyle = SEAL;
  g.lineCap = 'round';
  g.lineWidth = 1.2;
  g.stroke(new Path2D('M4 9 H62 M98 9 H156'));
  g.lineWidth = 1.4;
  g.stroke(new Path2D('M80 9 C 70 0, 62 2, 64 9 C 62 16, 70 18, 80 9 C 90 0, 98 2, 96 9 C 98 16, 90 18, 80 9 Z'));
  g.lineWidth = 1.2;
  g.stroke(new Path2D('M80 9 L 72 17 M80 9 L 88 17'));
  g.restore();
}

/**
 * 一塊掛著的繪馬，問題寫在上面。回傳繪馬底緣的 y。
 *
 * @param top 牌子上緣（紅繩在它上面 40px）
 */
export function drawEma(
  g: CanvasRenderingContext2D,
  cx: number,
  top: number,
  width: number,
  lines: string[],
  font: string,
  lineHeight: number,
  caption: string,
): number {
  const cut = 36;
  const height = 34 + 30 + lines.length * lineHeight + 44;
  const x = cx - width / 2;
  const shape = (inset: number, c: number) => {
    g.beginPath();
    g.moveTo(x + inset, top + inset + c);
    g.lineTo(x + inset + c, top + inset);
    g.lineTo(x + width - inset - c, top + inset);
    g.lineTo(x + width - inset, top + inset + c);
    g.lineTo(x + width - inset, top + height - inset);
    g.lineTo(x + inset, top + height - inset);
    g.closePath();
  };

  // 紅繩：倒 V，中間一個結
  g.strokeStyle = '#b8321f';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 56, top + 2);
  g.lineTo(cx, top - 40);
  g.lineTo(cx + 56, top + 2);
  g.stroke();
  g.fillStyle = '#b8321f';
  g.beginPath();
  g.arc(cx, top - 40, 6, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.shadowColor = 'rgba(92, 62, 32, 0.28)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 8;
  g.fillStyle = WOOD_EDGE;
  shape(0, cut);
  g.fill();
  g.restore();

  const face = g.createLinearGradient(0, top, 0, top + height);
  face.addColorStop(0, WOOD_HI);
  face.addColorStop(1, WOOD);
  g.fillStyle = face;
  shape(5, cut - 3);
  g.fill();

  // 細木紋
  g.save();
  shape(5, cut - 3);
  g.clip();
  g.strokeStyle = 'rgba(120, 84, 46, 0.07)';
  g.lineWidth = 2;
  for (let gx = x; gx < x + width; gx += 14) {
    g.beginPath();
    g.moveTo(gx, top);
    g.lineTo(gx + 6, top + height);
    g.stroke();
  }
  g.restore();

  g.textAlign = 'center';
  g.fillStyle = SEAL;
  g.font = `700 20px ${ROUND}`;
  spacedText(g, caption, cx, top + 44, 6);

  g.fillStyle = WOOD_INK;
  g.font = font;
  let y = top + 34 + 30 + lineHeight * 0.78;
  for (const line of lines) {
    g.fillText(line, cx, y);
    y += lineHeight;
  }

  drawMizuhiki(g, cx, top + height - 26, 260);
  return top + height;
}

/**
 * 等級大紅印：朱紅圓印、一圈奶油細環、反白的字。
 * 印外圈的籤運色光暈拿掉了，跟頁面一致（使用者：「這個綠色圓圈特效 remove」）。
 *
 * @param lines 印上的字，一行一個元素（英文兩個詞各一行）
 */
export function drawSeal(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  lines: string[],
  font: string,
  lineHeight: number,
): void {
  const fill = g.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r);
  fill.addColorStop(0, '#d4432c');
  fill.addColorStop(0.55, SEAL);
  fill.addColorStop(1, SEAL_DEEP);
  g.save();
  g.shadowColor = 'rgba(120, 30, 20, 0.3)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  g.fillStyle = fill;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.restore();

  g.strokeStyle = 'rgba(251, 243, 230, 0.85)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, r - 10, 0, Math.PI * 2);
  g.stroke();

  g.fillStyle = CREAM;
  g.font = font;
  g.textAlign = 'center';
  const top = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    g.fillText(line, cx, top + i * lineHeight + lineHeight * 0.34);
  });
}
