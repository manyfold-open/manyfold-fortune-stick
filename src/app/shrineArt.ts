/**
 * 神社場景的畫法 —— 頁面背景（ShrineBackdrop）與分享圖（share.ts）共用。
 *
 * 櫻花枝的形狀、花瓣的形狀只在這裡定義一次：頁面用 SVG 畫枝、用 canvas 畫花瓣；
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

/** 神社的日光：暖漸層、左上日光、兩側鳥居柱與笠木、兩角櫻花枝、散落的花瓣。 */
export function paintShrine(g: CanvasRenderingContext2D, w: number, h: number): void {
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

  // 鳥居柱：景深外，淡一點
  g.save();
  g.globalAlpha = 0.72;
  for (const x of [34, w - 34 - 72]) {
    const pillar = g.createLinearGradient(x, 0, x + 72, 0);
    pillar.addColorStop(0, '#a3281b');
    pillar.addColorStop(0.45, '#d2482f');
    pillar.addColorStop(1, '#ad2e1e');
    g.fillStyle = pillar;
    g.fillRect(x, 0, 72, h);
  }
  // 笠木與貫：只畫出畫面邊緣那一截，放在最上面 —— 低了會撞到繪馬與籤紙的上緣
  g.fillStyle = '#2f231d';
  g.fillRect(-10, 30, 160, 34);
  g.fillRect(w - 150, 30, 160, 34);
  g.fillStyle = '#b83522';
  g.fillRect(-10, 100, 130, 18);
  g.fillRect(w - 120, 100, 130, 18);
  g.restore();

  drawBranch(g, -40, 110, 420, false);
  drawBranch(g, w + 40, 110, 420, true);

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
 * 等級大紅印：外圈籤運色的光暈、朱紅圓印、一圈奶油細環、反白的字。
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
  aura: string,
): void {
  const halo = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.7);
  halo.addColorStop(0, `${aura}55`);
  halo.addColorStop(1, `${aura}00`);
  g.fillStyle = halo;
  g.beginPath();
  g.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
  g.fill();

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
