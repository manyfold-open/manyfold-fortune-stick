/**
 * 分享图：把页面上那张签纸原样画成一张竖图，适合手机保存和转发。
 *
 * 默认只放牌记、签号、等级、四字签名、签诗和一句话签意 —— 不放用户的问题、
 * 完整解读和追问，免得他把私密内容顺手转出去（产品文档第五节）。想放问题必须自己勾选。
 *
 * 这里的四个等级配色是 styles.css 里 `[data-tone]` 那一组的浅色版，写死在这
 * 是有意的：分享图不该跟着看图的人是深色还是浅色模式变样，谁分享出去都是同一张。
 */

import { stickText, type FortuneStick, type StickLevel } from '../shared/sticks';
import type { Interpretation } from '../shared/types';
import { LEVEL_TONE } from './constants';

const WIDTH = 1080;
const HEIGHT = 1350;
const SERIF = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';
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
  interpretation: Interpretation | null;
  question: string;
  includeQuestion: boolean;
}

/** 按宽度折行。中文逐字折，不需要考虑单词边界。 */
function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

/** 底色上的那层格纹，和页面上是同一套图形。 */
function paintGround(context: CanvasRenderingContext2D, ground: string): void {
  context.fillStyle = ground;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const tile = 108;
  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.42)';
  context.globalAlpha = 0.5;
  context.lineWidth = 1.4;
  for (let y = 0; y < HEIGHT + tile; y += tile) {
    for (let x = 0; x < WIDTH + tile; x += tile) {
      const cx = x + tile / 2;
      const cy = y + tile / 2;
      context.beginPath();
      context.moveTo(cx, y + 4);
      context.lineTo(x + tile - 4, cy);
      context.lineTo(cx, y + tile - 4);
      context.lineTo(x + 4, cy);
      context.closePath();
      context.stroke();

      context.beginPath();
      context.arc(cx, cy, tile * 0.17, 0, Math.PI * 2);
      context.stroke();
      context.strokeRect(cx - tile * 0.09, cy - tile * 0.09, tile * 0.18, tile * 0.18);
    }
  }
  context.restore();
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
    ]);
    await document.fonts.ready;
  } catch {
    // 字体没来就用后备字体画，总比不出图好。
  }
}

export async function renderShareImage(input: ShareInput): Promise<Blob> {
  await waitForFonts();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('这个浏览器不支持生成图片。');

  const { stick } = input;
  const text = stickText(stick, 'zh');
  const { tone, ground } = TONE[stick.level];
  const center = WIDTH / 2;
  const withQuestion = input.includeQuestion && Boolean(input.question.trim());

  paintGround(context, ground);
  context.textAlign = 'center';

  // 问题印在纸的外面，和页面上一样 —— 纸是纸，问的事是问的事。
  if (withQuestion) {
    context.fillStyle = 'rgba(22,21,25,0.72)';
    context.font = `500 34px ${SERIF}`;
    let y = 122;
    for (const line of wrap(context, input.question, WIDTH - 260).slice(0, 3)) {
      context.fillText(line, center, y);
      y += 46;
    }
  }

  const cardTop = withQuestion ? 240 : 172;
  const cardHeight = 1044;
  context.fillStyle = 'rgba(0,0,0,0.16)';
  context.fillRect(96, cardTop + 16, WIDTH - 192, cardHeight);
  context.fillStyle = PAPER;
  context.fillRect(90, cardTop, WIDTH - 180, cardHeight);

  context.fillStyle = INK;
  context.font = `700 44px ${SERIF}`;
  spaced(context, '问一签', center, cardTop + 104, 16);

  context.fillStyle = INK_3;
  context.font = `500 19px ${MONO}`;
  spaced(context, 'WEN YI QIAN · FORTUNE PRINTER', center, cardTop + 146, 3);

  drawEmblem(context, center, cardTop + 216, 46, tone);

  const cellX = 150;
  const cellWidth = WIDTH - 300;

  // 一格等级
  const levelY = cardTop + 286;
  const levelH = 130;
  context.strokeStyle = INK;
  context.lineWidth = 2;
  context.strokeRect(cellX, levelY, cellWidth, levelH);
  drawCorners(context, cellX, levelY, cellWidth, levelH, 18);

  context.fillStyle = INK_3;
  context.font = `400 26px ${SERIF}`;
  context.textAlign = 'left';
  context.fillText(`第 ${stick.no} 签`, cellX + 34, levelY + levelH / 2 + 10);
  context.textAlign = 'right';
  context.fillText('之 签 运', cellX + cellWidth - 34, levelY + levelH / 2 + 10);
  context.textAlign = 'center';

  context.fillStyle = INK;
  context.font = `700 92px ${SERIF}`;
  spaced(context, stick.level, center, levelY + levelH / 2 + 34, 20);

  // 一格四字签名
  const titleY = levelY + levelH;
  const titleH = 100;
  context.strokeRect(cellX, titleY, cellWidth, titleH);
  context.fillStyle = INK_2;
  context.font = `500 50px ${SERIF}`;
  spaced(context, text.title, center, titleY + titleH / 2 + 18, 26);

  // 一格直排签诗与签意
  const bodyY = titleY + titleH;
  const bodyH = 458;
  context.strokeRect(cellX, bodyY, cellWidth, bodyH);
  drawVertical(
    context,
    [
      { text: text.poem[0], font: `500 44px ${SERIF}`, color: INK, step: 50 },
      { text: text.poem[1], font: `500 44px ${SERIF}`, color: INK, step: 50 },
      {
        text: input.interpretation?.meaning ?? text.meaning,
        font: `400 33px ${SERIF}`,
        color: INK_2,
        step: 39,
      },
      { text: `幸运色：${LEVEL_TONE[stick.level].luckyColor.zh}`, font: `400 29px ${SERIF}`, color: tone, step: 35 },
    ],
    { centerX: center, top: bodyY + 44, height: bodyH - 88, gap: 22 },
  );

  context.fillStyle = INK_3;
  context.font = `400 20px ${MONO}`;
  spaced(context, '问一签 · 签为参考，路要自己走', center, cardTop + cardHeight - 30, 3);

  context.fillStyle = 'rgba(22,21,25,0.5)';
  context.font = `400 24px ${MONO}`;
  context.fillText(location.host, center, HEIGHT - 26);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片生成失败。'))),
      'image/png',
    );
  });
}

export type ShareOutcome = 'shared' | 'downloaded';

/** 能调系统分享就调；不能就下载。两条路都走不通时抛错，由调用方降级到复制文字。 */
export async function shareImage(blob: Blob, stick: FortuneStick): Promise<ShareOutcome> {
  const file = new File([blob], `问一签-第${stick.no}签.png`, { type: 'image/png' });
  const shareData = { files: [file], title: '问一签', text: `第 ${stick.no} 签 · ${stick.level}` };
  if (navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch (error) {
      // 用户自己取消了，不算失败，也不该再触发一次下载。
      if ((error as Error)?.name === 'AbortError') return 'shared';
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
export const shareText = (stick: FortuneStick, meaning: string): string => {
  const text = stickText(stick, 'zh');
  return `问一签 · 第 ${stick.no} 签 · ${stick.level}\n${text.poem[0]}，${text.poem[1]}\n${meaning}`;
};
