/**
 * 全程序化的宣纸 / 老黑檀 / 黄铜贴图。一张外部图片都不下载。
 *
 * 这个模块只产出 HTMLCanvasElement，**不 import three** —— 「画什么」和「怎么贴」
 * 分开，于是版面算术（格子、预览签、伪随机）能在 node 下被测到，
 * 真正需要 2D context 的部分才留到浏览器里跑。
 *
 * 一张卡片有两副面孔：
 *   · 'paper' —— 印在地上那条澄心堂宣纸长卷上的墨迹；
 *   · 'block' —— 刻在滚筒上的老黑檀木刻版，阴刻、描金、而且是**反的**
 *     （真的雕版就是反着刻的，印出来才正。MIRROR_BLOCK 一行可关）。
 */

import type { Language } from '../../shared/lang';
import { LEVEL_LABEL, STICKS, stickText, type FortuneStick } from '../../shared/sticks';
import { N, W } from './kinematics';

/* ── 版面 ── */

/** 一格沿行进方向的像素数。440/480 ≈ CARD_LEN/W，误差 0.04%，看不出来。 */
export const CARD_PX = 440;
export const ATLAS_H = 480;
export const ATLAS_W = CARD_PX * N;

export const PAPER_FIBRES = 2500;
/** 真的雕版是反着刻的。改成 false 就变成「看得懂的」滚筒。 */
export const MIRROR_BLOCK = true;

const SERIF = '"Kaiti SC", "STKaiti", "BiauKai", "DFKai-SB", "Noto Serif TC", serif';
const LATIN = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

export const atlasCellRect = (slot: number): { x: number; y: number; w: number; h: number } => ({
  x: slot * CARD_PX,
  y: 0,
  w: CARD_PX,
  h: ATLAS_H,
});

/**
 * 滚筒上八格默认刻哪八支签。步长 5 与 36 互质，所以八格必不重复；
 * 而且它们都是真的签 —— 玩家凑近看滚筒，看到的是签文，不是占位符。
 */
export const previewStick = (slot: number): FortuneStick => STICKS[(slot * 5 + 2) % STICKS.length];

/** 确定性伪随机（Lehmer / MINSTD），和 FortuneCylinder 里那一套同源。 */
export function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* ── 底子 ── */

/** 宋代澄心堂手工宣纸：温润米白渐层 + 纵横随机分布的桑皮纤维。 */
function paintXuanPaper(g: CanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#f8f6f0');
  base.addColorStop(0.55, '#f5f1e7');
  base.addColorStop(1, '#f2eee3');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < PAPER_FIBRES; i += 1) {
    const warm = rand() > 0.42;
    g.fillStyle = warm
      ? `rgba(196, 176, 142, ${(0.03 + rand() * 0.07).toFixed(3)})`
      : `rgba(255, 253, 246, ${(0.05 + rand() * 0.10).toFixed(3)})`;
    const x = rand() * w;
    const y = rand() * h;
    if (rand() > 0.5) g.fillRect(x, y, 3 + rand() * 16, 0.6);
    else g.fillRect(x, y, 0.6, 3 + rand() * 14);
  }

  // 帘纹（抄纸竹帘留下的横向淡痕）
  g.fillStyle = 'rgba(180, 164, 132, 0.035)';
  for (let y = 5; y < h; y += 9) g.fillRect(0, y, w, 1);

  // 四角自然陈化的微黄
  const age = g.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.78);
  age.addColorStop(0, 'rgba(214, 190, 146, 0)');
  age.addColorStop(1, 'rgba(198, 168, 118, 0.14)');
  g.fillStyle = age;
  g.fillRect(0, 0, w, h);
}

/** 老黑檀／紫檀雕版底：深沉木纹、导管棕眼、松烟墨渍。 */
function paintEbony(g: CanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#141416');
  base.addColorStop(0.45, '#261a14');
  base.addColorStop(0.78, '#1b1411');
  base.addColorStop(1, '#141416');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // 纵向导管与棕眼
  for (let i = 0; i < 520; i += 1) {
    g.fillStyle = `rgba(8, 5, 4, ${(0.04 + rand() * 0.09).toFixed(3)})`;
    g.fillRect(rand() * w, 0, 1 + rand() * 2.4, h);
  }
  for (let i = 0; i < 160; i += 1) {
    g.fillStyle = `rgba(148, 104, 66, ${(0.015 + rand() * 0.035).toFixed(3)})`;
    g.fillRect(rand() * w, 0, 1, h);
  }
  // 松烟墨渍
  for (let i = 0; i < 26; i += 1) {
    const r = 12 + rand() * 46;
    const bx = rand() * w;
    const by = rand() * h;
    const blot = g.createRadialGradient(bx, by, 0, bx, by, r);
    blot.addColorStop(0, 'rgba(5, 4, 4, 0.22)');
    blot.addColorStop(1, 'rgba(5, 4, 4, 0)');
    g.fillStyle = blot;
    g.fillRect(0, 0, w, h);
  }
}

/* ── 纹样 ── */

/** 朱砂防伪方印。 */
function paintSeal(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, glyphs: string): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = 'rgba(158, 32, 27, 0.90)';
  g.strokeStyle = 'rgba(158, 32, 27, 0.95)';
  g.lineWidth = Math.max(2, size * 0.055);
  g.strokeRect(-size / 2, -size / 2, size, size);
  g.font = `700 ${Math.floor(size * 0.36)}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...glyphs];
  const half = size * 0.23;
  // 印文按古法从右上起、竖读
  const spots = [
    [half, -half],
    [half, half],
    [-half, -half],
    [-half, half],
  ];
  for (let i = 0; i < chars.length && i < 4; i += 1) {
    g.fillText(chars[i], spots[i][0], spots[i][1]);
  }
  g.restore();
}

/** 底部海水江崖木刻纹样。 */
function paintWaveBorder(g: CanvasRenderingContext2D, w: number, y: number, ink: string): void {
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 1.4;
  for (let band = 0; band < 3; band += 1) {
    g.beginPath();
    const amp = 5 - band * 1.2;
    const yy = y + band * 6;
    for (let x = 0; x <= w; x += 2) {
      const v = yy + Math.sin((x / w) * Math.PI * 14 + band * 1.1) * amp;
      if (x === 0) g.moveTo(x, v);
      else g.lineTo(x, v);
    }
    g.stroke();
  }
  // 江崖：三座立石
  g.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const bx = w * (0.28 + i * 0.22);
    g.moveTo(bx - 13, y + 20);
    g.lineTo(bx, y - 10 - i * 4);
    g.lineTo(bx + 13, y + 20);
  }
  g.stroke();
  g.restore();
}

/** 直排文字。中文竖着一个字一个字落下来。 */
function paintVertical(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  yTop: number,
  step: number,
  max: number,
): void {
  const chars = [...text];
  for (let i = 0; i < chars.length && i < max; i += 1) {
    g.fillText(chars[i], x, yTop + i * step);
  }
}

/**
 * 按空格折行，最多 maxLines 行；塞不下的尾巴用省略号收掉。
 *
 * 量宽度这件事由调用方注入（浏览器里传 measureText），于是折行逻辑本身是纯的，
 * 能在 node 下被测到 —— 这个模块其余部分都没有自动测试可言。
 */
export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let overflow = false;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    if (lines.length + 1 === maxLines) {
      overflow = true;
      break;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (overflow && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/**
 * 把一行字压进给定宽度：从 basePx 按整数级往下缩，缩到 minPx 为止。
 * 设置 g.font 作为副作用，返回最终用的字号。
 */
export function fitFont(
  g: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  basePx: number,
  minPx: number,
  weight: string,
  family: string,
): number {
  let size = basePx;
  g.font = `${weight} ${size}px ${family}`;
  while (size > minPx && g.measureText(text).width > maxWidth) {
    size -= 1;
    g.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

/* ── 一张卡片 ── */

const SEAL_TEXTS = ['天后宮藏', '甲子元亨', '籤詩正印', '香火綿長', '有求必應', '風調雨順', '國泰民安', '心誠則靈'];

function paintCard(
  g: CanvasRenderingContext2D,
  slot: number,
  stick: FortuneStick,
  language: Language,
  mode: 'paper' | 'block',
): void {
  const rect = atlasCellRect(slot);
  const text = stickText(stick, language);
  const level = LEVEL_LABEL[language][stick.level];
  const rand = pseudoRandom(1000 + stick.no * 37 + slot);
  const paper = mode === 'paper';
  const ink = paper ? 'rgba(26, 20, 16, 0.92)' : 'rgba(228, 196, 128, 0.82)';
  const faint = paper ? 'rgba(26, 20, 16, 0.34)' : 'rgba(206, 168, 96, 0.40)';

  g.save();
  g.beginPath();
  g.rect(rect.x, rect.y, rect.w, rect.h);
  g.clip();
  g.translate(rect.x, rect.y);

  if (paper) paintXuanPaper(g, rect.w, rect.h, rand);
  else paintEbony(g, rect.w, rect.h, rand);

  // 雕版反着刻，印出来才正
  if (!paper && MIRROR_BLOCK) {
    g.translate(rect.w, 0);
    g.scale(-1, 1);
  }

  // 文武框
  g.strokeStyle = faint;
  g.lineWidth = 3;
  g.strokeRect(14, 14, rect.w - 28, rect.h - 28);
  g.lineWidth = 1;
  g.strokeRect(22, 22, rect.w - 44, rect.h - 44);

  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // 顶部：朱砂方印（雕版上是阴刻，用金线勾）
  g.save();
  if (!paper) {
    g.fillStyle = 'rgba(206, 168, 96, 0.55)';
    g.strokeStyle = 'rgba(206, 168, 96, 0.65)';
  }
  paintSeal(g, rect.w - 58, 60, 52, SEAL_TEXTS[slot % SEAL_TEXTS.length]);
  g.restore();

  if (language === 'zh') {
    // 中部直排：签号等级大字 + 两行签诗 + 签意，共四列，自右向左
    g.fillStyle = ink;
    g.font = `800 34px ${SERIF}`;
    paintVertical(g, `第${stick.no}签`, 56, 64, 38, 6);
    g.font = `800 30px ${SERIF}`;
    g.fillStyle = paper ? 'rgba(146, 30, 26, 0.88)' : 'rgba(228, 196, 128, 0.9)';
    paintVertical(g, level, 56, 262, 34, 4);

    g.fillStyle = ink;
    g.font = `600 26px ${SERIF}`;
    paintVertical(g, text.poem[0], rect.w - 132, 110, 30, 11);
    paintVertical(g, text.poem[1], rect.w - 174, 110, 30, 11);
    g.font = `500 19px ${SERIF}`;
    g.fillStyle = faint;
    paintVertical(g, text.meaning, rect.w - 212, 110, 22, 15);

    // 签名四字，横过中路
    g.fillStyle = ink;
    g.font = `800 44px ${SERIF}`;
    g.fillText(text.title, rect.w / 2 + 10, rect.h - 96);
  } else {
    const maxW = rect.w - 76;
    const measure = (s: string) => g.measureText(s).width;

    g.font = `700 22px ${LATIN}`;
    g.fillText(`NO. ${stick.no}`, 88, 62);
    g.fillStyle = paper ? 'rgba(146, 30, 26, 0.88)' : 'rgba(228, 196, 128, 0.9)';
    g.font = `700 20px ${LATIN}`;
    g.fillText(level, 88, 92);

    g.fillStyle = ink;
    fitFont(g, text.title, maxW, 34, 22, '700', LATIN);
    g.fillText(text.title, rect.w / 2, 158);

    // 两句诗各自最多折两行，排完才知道签意从哪一行起 —— 所以先排诗再排签意。
    g.font = `italic 17px ${LATIN}`;
    let y = 200;
    for (const line of [text.poem[0], text.poem[1]]) {
      for (const part of wrapText(measure, line, maxW, 2)) {
        g.fillText(part, rect.w / 2, y);
        y += 23;
      }
    }

    g.fillStyle = faint;
    g.font = `15px ${LATIN}`;
    y += 3;
    for (const part of wrapText(measure, text.meaning, maxW, 3)) {
      g.fillText(part, rect.w / 2, y);
      y += 19;
    }
  }

  paintWaveBorder(g, rect.w, rect.h - 62, faint);
  g.restore();
}

/* ── 对外 ── */

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

function paintAll(canvas: HTMLCanvasElement, language: Language, mode: 'paper' | 'block'): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  for (let slot = 0; slot < N; slot += 1) paintCard(g, slot, previewStick(slot), language, mode);
}

/** 地上那条宣纸长卷的 Atlas —— 八组独特版画。 */
export function createAtlasCanvas(language: Language): HTMLCanvasElement {
  const cv = makeCanvas(ATLAS_W, ATLAS_H);
  paintAll(cv, language, 'paper');
  return cv;
}

/** 滚筒身上那八块老黑檀木刻版。 */
export function createBlockCanvas(language: Language): HTMLCanvasElement {
  const cv = makeCanvas(ATLAS_W, ATLAS_H);
  paintAll(cv, language, 'block');
  return cv;
}

/** 只重画一格 —— 签落库之后，把那一格换成真的那支签。 */
export function repaintSlot(
  canvas: HTMLCanvasElement,
  slot: number,
  stick: FortuneStick,
  language: Language,
  mode: 'paper' | 'block',
): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const rect = atlasCellRect(slot);
  g.clearRect(rect.x, rect.y, rect.w, rect.h);
  paintCard(g, slot, stick, language, mode);
}

/** 黄铜端盖：精密车削同心圆拉丝。 */
export function createBrassCanvas(): HTMLCanvasElement {
  const S = 512;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const rand = pseudoRandom(7);
  const c = S / 2;

  const base = g.createRadialGradient(c * 0.72, c * 0.66, S * 0.04, c, c, c);
  base.addColorStop(0, '#f0d79a');
  base.addColorStop(0.42, '#c89b3c');
  base.addColorStop(0.82, '#9a742a');
  base.addColorStop(1, '#6d4f1c');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);

  // 车削同心圆
  for (let r = 6; r < c; r += 2.4) {
    g.strokeStyle = `rgba(255, 238, 190, ${(0.02 + rand() * 0.06).toFixed(3)})`;
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = `rgba(60, 40, 12, ${(0.02 + rand() * 0.05).toFixed(3)})`;
    g.beginPath();
    g.arc(c, c, r + 1.2, 0, Math.PI * 2);
    g.stroke();
  }
  // 轴心与八颗铆钉
  g.fillStyle = 'rgba(64, 44, 16, 0.55)';
  g.beginPath();
  g.arc(c, c, S * 0.055, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    g.fillStyle = 'rgba(255, 240, 198, 0.5)';
    g.beginPath();
    g.arc(c + Math.cos(a) * c * 0.72, c + Math.sin(a) * c * 0.72, 6, 0, Math.PI * 2);
    g.fill();
  }
  return cv;
}

/** 滚筒正下方的高斯柔焦接触阴影。 */
export function createBlobCanvas(): HTMLCanvasElement {
  const S = 512;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const c = S / 2;
  // 沿滚筒轴向拉长：接触的是一条线，不是一个点
  g.translate(c, c);
  g.scale(1, W / (2 * 1.4));
  g.translate(-c, -c);
  const gr = g.createRadialGradient(c, c, 16, c, c, S * 0.47);
  gr.addColorStop(0.0, 'rgba(18, 12, 8, 0.62)');
  gr.addColorStop(0.3, 'rgba(18, 12, 8, 0.38)');
  gr.addColorStop(0.62, 'rgba(18, 12, 8, 0.13)');
  gr.addColorStop(1.0, 'rgba(18, 12, 8, 0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return cv;
}
