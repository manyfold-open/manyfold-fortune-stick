/**
 * 分享图：把页面上那张签纸原样画成一张竖图，适合手机保存和转发。
 *
 * 默认只放牌记、签号、等级、四字签名、签诗和一句话签意 —— 不放用户的问题、
 * 完整解读和追问，免得他把私密内容顺手转出去（产品文档第五节）。想放问题必须自己勾选。
 *
 * 这里的四个等级配色是 styles.css 里 `[data-tone]` 那一组的浅色版，写死在这
 * 是有意的：分享图不该跟着看图的人是深色还是浅色模式变样，谁分享出去都是同一张。
 */

import type { Language } from '../shared/lang';
import { withoutDashes } from '../shared/text';
import {
  LEVEL_LABEL,
  STICK_COUNT,
  stickText,
  type FortuneStick,
  type StickLevel,
} from '../shared/sticks';
import type { Interpretation } from '../shared/types';
import { LEVEL_TONE } from './constants';
import QRCode from 'qrcode';

const WIDTH = 840;
const APP_NAME = 'AI Fortune Stick';
const QR_SIZE = 104;
const SERIF = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';
const SERIF_EN = 'Charter, "Charter BT", Georgia, Palatino, "Noto Serif", "Iowan Old Style", "Times New Roman", serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const PAPER = '#fffefa';
const INK = '#17161a';
const INK_2 = '#4d4a53';
const INK_3 = '#85818d';

/** 与 styles.css 的 `[data-tone]` 保持一致（浅色那一组）。 */
const TONE: Record<StickLevel, { tone: string; ground: string }> = {
  上上签: { tone: '#3f5f92', ground: '#6c8bb6' },
  上签: { tone: '#9a7412', ground: '#cbab45' },
  中签: { tone: '#237a56', ground: '#4a9e79' },
  下签: { tone: '#8d5540', ground: '#ad7d68' },
};

export interface ShareInput {
  stick: FortuneStick;
  /** 这一局的语言 —— 决定整张图印哪一套字、竖排还是横排。 */
  language: Language;
  interpretation: Interpretation | null;
  question: string;
  includeQuestion: boolean;
}

/** 按宽度折行。中文逐字折，不需要考虑单词边界。 */
function wrapChars(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    if (char === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    if (context.measureText(line + char).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * 按词折行。英文必须这样折 —— 逐字折会把单词劈成两半（「one joint a / t a time」）。
 * 一个词自己就超过整行宽时，退回逐字折，否则它会顶出格子。
 */
function wrapWords(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      if (context.measureText(candidate).width > maxWidth && !line) {
        // 单个超长词：逐字切开，最后一段留着继续往下拼。
        const pieces = wrapChars(context, word, maxWidth);
        lines.push(...pieces.slice(0, -1));
        line = pieces[pieces.length - 1] ?? '';
        continue;
      }
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 按语言选折行方式。中文逐字，英文按词。 */
const wrapFor = (language: Language) => (language === 'en' ? wrapWords : wrapChars);

/** 横排的字，字间加空。canvas 的 letterSpacing 支持还不齐，所以自己逐字排。 */
function spaced(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  gap: number,
): void {
  const chars = [...text];
  const widths = chars.map((char) => context.measureText(char).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (chars.length - 1);
  let x = centerX - total / 2;
  const align = context.textAlign;
  context.textAlign = 'left';
  chars.forEach((char, index) => {
    context.fillText(char, x, y);
    x += widths[index] + gap;
  });
  context.textAlign = align;
}

interface VerticalBlock {
  text: string;
  font: string;
  color: string;
  /** 一个字占的高度 */
  step: number;
}

/**
 * 直排文字：一列写满就往左边起新的一列，整体在 centerX 上居中。
 * 和页面上的 `writing-mode: vertical-rl` 是同一种读法（从右往左）。
 */
function drawVertical(
  context: CanvasRenderingContext2D,
  blocks: VerticalBlock[],
  options: { centerX: number; top: number; height: number; gap: number },
): void {
  type Column = { chars: string[]; block: VerticalBlock; width: number };
  const columns: Column[] = [];

  for (const block of blocks) {
    context.font = block.font;
    const perColumn = Math.max(1, Math.floor(options.height / block.step));
    const chars = [...block.text];
    // 列宽按这一块里最宽的字算，免得标点把列挤窄。
    const width = Math.max(...chars.map((char) => context.measureText(char).width));
    for (let i = 0; i < chars.length; i += perColumn) {
      columns.push({ chars: chars.slice(i, i + perColumn), block, width });
    }
  }

  const total =
    columns.reduce((sum, column) => sum + column.width, 0) + options.gap * (columns.length - 1);
  // 最右边那一列先画，然后一路往左。
  let x = options.centerX + total / 2;
  context.textAlign = 'center';
  for (const column of columns) {
    x -= column.width;
    context.font = column.block.font;
    context.fillStyle = column.block.color;
    let y = options.top + column.block.step * 0.82;
    for (const char of column.chars) {
      context.fillText(char, x + column.width / 2, y);
      y += column.block.step;
    }
    x -= options.gap;
  }
}

/**
 * 横排的正文：同样四块内容，居中一行行往下排。
 * 和 drawVertical 是兄弟而不是它的一个分支 —— 竖排那套规则（列宽、每列几个字、
 * 从右往左）在英文里一条都不成立，塞进同一个函数会让两边都别扭。
 */
function drawHorizontal(
  context: CanvasRenderingContext2D,
  blocks: VerticalBlock[],
  options: {
    centerX: number;
    top: number;
    width: number;
    height: number;
    gap: number;
    wrapText: (c: CanvasRenderingContext2D, t: string, w: number) => string[];
  },
): void {
  type Line = { text: string; block: VerticalBlock };
  const lines: Line[] = [];
  for (const block of blocks) {
    context.font = block.font;
    for (const text of options.wrapText(context, block.text, options.width)) {
      lines.push({ text, block });
    }
  }

  const total =
    lines.reduce((sum, line) => sum + line.block.step, 0) + options.gap * (blocks.length - 1);
  // 整体在这一格里垂直居中，和竖排版本看起来占一样的位置。
  let y = options.top + Math.max(0, (options.height - total) / 2);
  context.textAlign = 'center';
  let previous: VerticalBlock | null = null;
  for (const line of lines) {
    if (previous && previous !== line.block) y += options.gap;
    context.font = line.block.font;
    context.fillStyle = line.block.color;
    y += line.block.step;
    context.fillText(line.text, options.centerX, y - line.block.step * 0.22);
    previous = line.block;
  }
}


/** 生成回到游戏首页的二维码。分享图可能离开当前页面，所以不保留 hash 路由。 */
async function loadShareQr(): Promise<HTMLImageElement | null> {
  try {
    const url = new URL(window.location.href);
    url.hash = '';
    const dataUrl = await QRCode.toDataURL(url.toString(), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: QR_SIZE,
      color: { dark: INK, light: PAPER },
    });
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('二维码加载失败。'));
      image.src = dataUrl;
    });
    return image;
  } catch {
    return null;
  }
}

/** 纸票上的纹章，和 StickFace 里那枚是同一个形状。 */
function drawEmblem(context: CanvasRenderingContext2D, cx: number, cy: number, r: number, tone: string): void {
  const diamond = (radius: number) => {
    context.beginPath();
    context.moveTo(cx, cy - radius);
    context.lineTo(cx + radius, cy);
    context.lineTo(cx, cy + radius);
    context.lineTo(cx - radius, cy);
    context.closePath();
  };

  context.save();
  context.fillStyle = tone;
  context.globalAlpha = 0.14;
  diamond(r);
  context.fill();
  context.restore();

  context.strokeStyle = tone;
  context.lineWidth = r * 0.06;
  diamond(r * 0.78);
  context.stroke();
  diamond(r * 0.5);
  context.stroke();

  context.fillStyle = tone;
  context.fillRect(cx - r * 0.25, cy - r * 0.25, r * 0.5, r * 0.5);
}

/** 四个角上的小三角，和签纸上那格等级是同一处细节。 */
function drawCorners(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  size: number,
): void {
  context.fillStyle = INK;
  const corner = (cx: number, cy: number, dx: number, dy: number) => {
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + dx * size, cy);
    context.lineTo(cx, cy + dy * size);
    context.closePath();
    context.fill();
  };
  corner(x, y, 1, 1);
  corner(x + width, y, -1, 1);
  corner(x, y + height, 1, -1);
  corner(x + width, y + height, -1, -1);
}

/**
 * canvas 不会等 webfont：字体还没到就直接用后备字体画完了，于是第一次分享出来的图
 * 和页面上看到的不是同一副长相。所以先把要用到的字重加载出来再下笔。
 */
async function waitForFonts(): Promise<void> {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`700 96px ${SERIF}`),
      document.fonts.load(`500 52px ${SERIF}`),
      document.fonts.load(`400 34px ${SERIF}`),
      document.fonts.load(`700 56px ${SERIF_EN}`),
      document.fonts.load(`500 40px ${SERIF_EN}`),
      document.fonts.load(`400 30px ${SERIF_EN}`),
    ]);
    await document.fonts.ready;
  } catch {
    // 字体没来就用后备字体画，总比不出图好。
  }
}

export async function renderShareImage(input: ShareInput): Promise<Blob> {
  await waitForFonts();
  const qrImage = await loadShareQr();

  const { stick, language } = input;
  const en = language === 'en';
  const face = en ? SERIF_EN : SERIF;
  const text = stickText(stick, language);
  const question = withoutDashes(input.question);
  const meaning = withoutDashes(input.interpretation?.meaning ?? text.meaning);
  const { tone } = TONE[stick.level];
  const center = WIDTH / 2;
  const withQuestion = input.includeQuestion && Boolean(question.trim());

  const qOffset = withQuestion ? 90 : 0;
  const HEIGHT = 1070 + qOffset;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('这个浏览器不支持生成图片。');

  // 整张图就是纯正签纸本身，无外围多余背景
  context.fillStyle = PAPER;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // 宣纸古典文武双边框与四角回纹
  context.strokeStyle = 'rgba(23, 22, 26, 0.65)';
  context.lineWidth = 1.5;
  context.strokeRect(18, 18, WIDTH - 36, HEIGHT - 36);

  context.strokeStyle = 'rgba(23, 22, 26, 0.18)';
  context.lineWidth = 0.6;
  context.strokeRect(22, 22, WIDTH - 44, HEIGHT - 44);

  drawCorners(context, 18, 18, WIDTH - 36, HEIGHT - 36, 12);

  const cellX = 64;
  const cellWidth = WIDTH - 2 * cellX;

  // 所求之事：直接融入签纸顶端神谕抬头部
  if (withQuestion) {
    const qBoxX = cellX;
    const qBoxY = 36;
    const qBoxWidth = cellWidth;
    const qBoxHeight = 74;

    context.fillStyle = 'rgba(23, 22, 26, 0.035)';
    context.fillRect(qBoxX, qBoxY, qBoxWidth, qBoxHeight);
    context.strokeStyle = 'rgba(23, 22, 26, 0.18)';
    context.lineWidth = 1;
    context.strokeRect(qBoxX, qBoxY, qBoxWidth, qBoxHeight);

    context.fillStyle = tone;
    context.font = `600 13px ${MONO}`;
    context.textAlign = 'left';
    context.fillText(en ? 'QUESTION' : '所求之事', qBoxX + 18, qBoxY + 24);

    context.fillStyle = INK;
    context.font = `500 20px ${face}`;
    const qLines = wrapFor(language)(context, question, qBoxWidth - 36).slice(0, 2);
    let qTextY = qBoxY + 52;
    for (const line of qLines) {
      context.fillText(line, qBoxX + 18, qTextY);
      qTextY += 26;
    }
  }

  const startY = withQuestion ? 134 : 44;

  context.textAlign = 'center';
  context.fillStyle = INK;
  context.font = `700 40px ${SERIF}`;
  spaced(context, APP_NAME.toUpperCase(), center, startY + 44, 7);

  context.fillStyle = INK_3;
  context.font = `500 17px ${MONO}`;
  spaced(context, 'A REFERENCE, NOT A ROUTE', center, startY + 80, 3);

  drawEmblem(context, center, startY + 138, 38, tone);

  // 一格等级
  const levelY = startY + 192;
  const levelH = 120;
  context.strokeStyle = INK;
  context.lineWidth = 1.8;
  context.strokeRect(cellX, levelY, cellWidth, levelH);
  drawCorners(context, cellX, levelY, cellWidth, levelH, 16);

  context.fillStyle = INK_3;
  context.font = `400 24px ${face}`;
  context.textAlign = 'left';
  context.fillText(en ? `NO. ${stick.no}` : `第 ${stick.no} 签`, cellX + 30, levelY + levelH / 2 + 9);
  context.textAlign = 'right';
  context.fillText(
    en ? `OF ${STICK_COUNT}` : '之 签 运',
    cellX + cellWidth - 30,
    levelY + levelH / 2 + 9,
  );
  context.textAlign = 'center';

  context.fillStyle = INK;
  context.font = en ? `700 48px ${face}` : `700 86px ${SERIF}`;
  spaced(
    context,
    LEVEL_LABEL[language][stick.level],
    center,
    levelY + levelH / 2 + (en ? 18 : 31),
    en ? 8 : 18,
  );

  // 一格四字签名
  const titleY = levelY + levelH;
  const titleH = 88;
  context.strokeRect(cellX, titleY, cellWidth, titleH);
  context.fillStyle = INK_2;
  if (en) {
    context.font = `500 36px ${face}`;
    if (context.measureText(text.title).width > cellWidth - 80) {
      context.font = `500 28px ${face}`;
      const lines = wrapWords(context, text.title, cellWidth - 80).slice(0, 2);
      let y = titleY + titleH / 2 - (lines.length - 1) * 16 + 8;
      for (const line of lines) {
        context.fillText(line, center, y);
        y += 30;
      }
    } else {
      spaced(context, text.title, center, titleY + titleH / 2 + 13, 4);
    }
  } else {
    context.font = `500 46px ${SERIF}`;
    spaced(context, text.title, center, titleY + titleH / 2 + 16, 24);
  }

  // 一格直排签诗与签意
  const bodyY = titleY + titleH;
  const bodyH = 430;
  context.strokeRect(cellX, bodyY, cellWidth, bodyH);
  const lucky = LEVEL_TONE[stick.level].luckyColor;
  if (en) {
    drawHorizontal(
      context,
      [
        { text: text.poem[0], font: `500 32px ${face}`, color: INK, step: 44 },
        { text: text.poem[1], font: `500 32px ${face}`, color: INK, step: 44 },
        { text: meaning, font: `400 26px ${face}`, color: INK_2, step: 36 },
        { text: `Lucky colour: ${lucky.en}`, font: `400 23px ${face}`, color: tone, step: 32 },
      ],
      {
        centerX: center,
        top: bodyY + 40,
        width: cellWidth - 100,
        height: bodyH - 80,
        gap: 24,
        wrapText: wrapWords,
      },
    );
  } else {
    drawVertical(
      context,
      [
        { text: text.poem[0], font: `500 42px ${SERIF}`, color: INK, step: 48 },
        { text: text.poem[1], font: `500 42px ${SERIF}`, color: INK, step: 48 },
        {
          text: meaning,
          font: `400 31px ${SERIF}`,
          color: INK_2,
          step: 37,
        },
        { text: `幸运色：${lucky.zh}`, font: `400 27px ${SERIF}`, color: tone, step: 34 },
      ],
      { centerX: center, top: bodyY + 40, height: bodyH - 80, gap: 20 },
    );
  }

  // 签纸底部：虚线分隔，内部整合二维码与名言
  const footerY = bodyY + bodyH + 18;
  context.save();
  context.strokeStyle = 'rgba(23, 22, 26, 0.25)';
  context.lineWidth = 1;
  context.setLineDash([5, 4]);
  context.beginPath();
  context.moveTo(cellX, footerY);
  context.lineTo(cellX + cellWidth, footerY);
  context.stroke();
  context.restore();

  if (qrImage) {
    const qrSize = QR_SIZE;
    const qrX = cellX + cellWidth - qrSize - 12;
    const qrY = footerY + 16;
    context.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    context.fillStyle = INK_3;
    context.font = `500 11px ${MONO}`;
    context.textAlign = 'center';
    context.fillText(en ? 'SCAN TO PLAY' : '扫码再玩一签', qrX + qrSize / 2, qrY + qrSize + 15);

    const textX = cellX + 10;
    context.textAlign = 'left';
    context.fillStyle = INK;
    context.font = `700 18px ${MONO}`;
    context.fillText(APP_NAME.toUpperCase(), textX, footerY + 44);

    context.fillStyle = INK_2;
    context.font = `500 15px ${face}`;
    context.fillText(en ? 'A REFERENCE, NOT A ROUTE' : '签为参考，路要自己走', textX, footerY + 74);

    context.fillStyle = INK_3;
    context.font = `400 13px ${MONO}`;
    context.fillText(location.host, textX, footerY + 102);
  } else {
    context.textAlign = 'center';
    context.fillStyle = INK_3;
    context.font = `400 18px ${MONO}`;
    spaced(
      context,
      en ? 'AI FORTUNE STICK · A REFERENCE, NOT A ROUTE' : 'AI FORTUNE STICK · 签为参考，路要自己走',
      center,
      footerY + 54,
      2,
    );
    context.fillStyle = 'rgba(22,21,25,0.5)';
    context.font = `400 14px ${MONO}`;
    context.fillText(location.host, center, footerY + 84);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片生成失败。'))),
      'image/png',
    );
  });
}

export type ShareOutcome = 'shared' | 'downloaded';

/** 能调系统分享就调；不能就下载。两条路都走不通时抛错，由调用方降级到复制文字。 */
export async function shareImage(
  blob: Blob,
  stick: FortuneStick,
  language: Language,
): Promise<ShareOutcome> {
  const en = language === 'en';
  const name = en ? `fortune-stick-${stick.no}.png` : `问一签-第${stick.no}签.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const shareData = {
    files: [file],
    title: APP_NAME,
    text: en
      ? `No. ${stick.no} · ${LEVEL_LABEL.en[stick.level]}`
      : `第 ${stick.no} 签 · ${stick.level}`,
  };
  if (navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch (error) {
      // 用户自己取消了，不算失败，也不该再触发一次下载。
      if ((error as Error)?.name === 'AbortError') return 'shared';
      throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** 分享全都失败时的最后一招：一段可以直接粘的短文字。 */
export const shareText = (stick: FortuneStick, meaning: string, language: Language): string => {
  const text = stickText(stick, language);
  const cleanMeaning = withoutDashes(meaning);
  if (language === 'en') {
    return `${APP_NAME} · No. ${stick.no} · ${LEVEL_LABEL.en[stick.level]}\n${text.poem[0]} / ${text.poem[1]}\n${cleanMeaning}`;
  }
  return `${APP_NAME} · 第 ${stick.no} 签 · ${stick.level}\n${text.poem[0]}，${text.poem[1]}\n${cleanMeaning}`;
};
