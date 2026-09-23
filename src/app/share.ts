/**
 * 分享图：把页面上那张御神籤原样画成一张竖图，适合手机保存和转发。
 *
 * 背景是跟页面同一个神社场景（shrineArt.ts）：暖色日光、鸟居柱、樱花枝、散落的花瓣。
 * 勾了「在图片中显示我的问题」，问题写在上方一块挂着的绘马上；中间是一张御神籤 ——
 * 朱红双线框、「御神签」表头、国字签号、等级大红印、签名、直排签诗与一句话签意、吉色。
 *
 * 默认只放签号、等级、签名、签诗和一句话签意 —— 不放用户的问题、完整解读和追问，
 * 免得他把私密内容顺手转出去（产品文档第五节）。想放问题必须自己勾选。
 *
 * 颜色写死在这里与 shrineArt.ts，不读 CSS 变量：谁分享出去都是同一张。
 * 四种签运不再换底色，只留在印外圈的光晕与吉色色点上，跟页面一致。
 */

import QRCode from 'qrcode';
import type { Language } from '../shared/lang';
import { withoutDashes } from '../shared/text';
import {
  LEVEL_LABEL,
  STICK_COUNT,
  stickText,
  type FortuneStick,
  type StickLevel,
} from '../shared/sticks';
import { hanNumber } from '../shared/numerals';
import type { Interpretation } from '../shared/types';
import { LEVEL_TONE } from './constants';
import { CREAM, ROUND, SEAL, SEAL_DEEP, drawEma, drawSakuraMark, drawSeal, drawWashiTape, paintShrine, spacedText } from './shrineArt';

export const LUCKY_ITEMS: Record<number, { zh: string; en: string }> = {
  1: { zh: '草莓大福', en: 'Strawberry Daifuku' },
  2: { zh: '熱焙茶', en: 'Hot Hojicha' },
  3: { zh: '手作御守', en: 'Handmade Omamori' },
  4: { zh: '晨間散步', en: 'Morning Walk' },
  5: { zh: '白桃煎茶', en: 'Peach Sencha' },
  6: { zh: '香氛蠟燭', en: 'Scented Candle' },
  7: { zh: '整理書桌', en: 'Tidy Workspace' },
  8: { zh: '抹茶拿鐵', en: 'Matcha Latte' },
  9: { zh: '翻一本好書', en: 'Reading a Book' },
  10: { zh: '溫暖熱湯', en: 'Warm Miso Soup' },
  11: { zh: '看天空雲朵', en: 'Cloud Watching' },
  12: { zh: '聽一首慢歌', en: 'Soft Lo-Fi Song' },
  13: { zh: '熱柚子茶', en: 'Warm Yuzu Tea' },
  14: { zh: '隨手筆記', en: 'Quick Journaling' },
  15: { zh: '曬曬太陽', en: 'Warm Sunshine' },
  16: { zh: '一杯溫水', en: 'Cup of Warm Water' },
  17: { zh: '伸個懶腰', en: 'Gentle Stretch' },
  18: { zh: '買一朵花', en: 'A Fresh Flower' },
  19: { zh: '清爽深呼吸', en: 'Deep Breaths' },
  20: { zh: '吃一顆糖', en: 'Sweet Candy' },
  21: { zh: '寫下感恩', en: 'Gratitude Note' },
  22: { zh: '整理相簿', en: 'Organizing Photos' },
  23: { zh: '品一口咖啡', en: 'Sip of Coffee' },
  24: { zh: '換上乾淨被單', en: 'Fresh Bedding' },
  25: { zh: '漫步樹蔭下', en: 'Tree Shade Stroll' },
  26: { zh: '欣賞落日', en: 'Sunset Glow' },
  27: { zh: '床頭小夜燈', en: 'Warm Bedside Lamp' },
  28: { zh: '給植物澆水', en: 'Watering Plants' },
  29: { zh: '煎一顆荷包蛋', en: 'Sunny-side Egg' },
  30: { zh: '吹吹傍晚的風', en: 'Evening Breeze' },
  31: { zh: '對鏡子笑笑', en: 'Smile in Mirror' },
  32: { zh: '泡個熱水澡', en: 'Warm Bath' },
  33: { zh: '聽窗外雨聲', en: 'Sound of Rain' },
  34: { zh: '仰望夜空微星', en: 'Night Stargazing' },
  35: { zh: '收拾隨身包', en: 'Tidying Your Bag' },
  36: { zh: '說聲辛苦了', en: 'Gentle Goodnight' },
};

const WIDTH = 1080;
const HEIGHT = 1350;
const APP_NAME = 'AI Fortune Stick';
/** 二维码边长（px）。扫了回到游戏首页。 */
const QR_SIZE = 104;
const SERIF = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';
const SERIF_EN = 'Charter, "Charter BT", Georgia, Palatino, "Noto Serif", "Iowan Old Style", "Times New Roman", serif';

const PAPER = '#fffefa';
const INK = '#17161a';
const INK_2 = '#4d4a53';

/** 签运色：只用在吉色那一格（底色、邊框、色点）。与 styles.css 的 `[data-tone]` 一致。 */
const TONE: Record<StickLevel, string> = {
  上上签: '#3f5f92',
  上签: '#9a7412',
  中签: '#237a56',
  下签: '#8d5540',
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

/**
 * 折成幾行就讓每行差不多長：先照寬度折，再把寬度往內收到行數剛好不會多一行為止。
 * 不這樣做，英文籤詩常常剩一個字掛在第二行（「…finds its own way / through」）。
 */
function wrapBalanced(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines = wrapWords(context, text, maxWidth);
  if (lines.length < 2) return lines;
  let lo = maxWidth / lines.length;
  let hi = maxWidth;
  for (let k = 0; k < 14; k += 1) {
    const mid = (lo + hi) / 2;
    if (wrapWords(context, text, mid).length > lines.length) lo = mid;
    else hi = mid;
  }
  return wrapWords(context, text, hi);
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
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('这个浏览器不支持生成图片。');

  const { stick, language } = input;
  const en = language === 'en';
  const face = en ? SERIF_EN : SERIF;
  const text = stickText(stick, language);
  const tone = TONE[stick.level];
  const lucky = LEVEL_TONE[stick.level].luckyColor;
  const level = LEVEL_LABEL[language][stick.level];
  const meaning = withoutDashes(input.interpretation?.meaning ?? text.meaning);
  const question = withoutDashes(input.question);
  const qrImage = await loadShareQr();
  const center = WIDTH / 2;
  const paperW = 680;
  const paperX = center - paperW / 2;
  const withQuestion = input.includeQuestion && Boolean(question.trim());

  // 鳥居的貫下緣：繪馬的紅繩從那裡垂下來（紅繩長 40px，見 drawEma）
  const nukiBottom = paintShrine(g, WIDTH, HEIGHT);
  g.textAlign = 'center';

  // 纸的各段高度：表头带、签号、大红印、签名、签诗、吉色
  const PAD = 24;
  const BAND = 62;
  // 有繪馬時紙往下讓了一整塊（繪馬掛在鳥居的貫下面）：印、簽號、簽名各收一點，
  // 簽詩那一格才放得下英文折成四行的兩句 —— 不收的話簽意會壓到吉色那條線上
  const compact = withQuestion;
  const NO = compact ? 46 : 52;
  const SEAL_R = compact ? 74 : 88;
  const SEAL_BLOCK = SEAL_R * 2 + (compact ? 40 : 44);
  const TITLE = compact ? 70 : 78;
  // 底部放吉色与二维码（扫了回到游戏）：二维码 104 加一行说明
  const FOOT = qrImage ? 150 : 84;
  const FIXED = PAD + BAND + NO + SEAL_BLOCK + TITLE + FOOT + 18;
  const BODY_MAX = 360;

  // 问题写在绘马上，挂在纸的正上方、跟纸一样宽
  let paperTop: number;
  if (withQuestion) {
    const qFont = `500 36px ${face}`;
    g.font = qFont;
    const all = wrapFor(language)(g, question, paperW - 110);
    const lines = all.slice(0, 2);
    // 繪馬只寫得下兩行：多出來的收成刪節號，不要在句子中間無聲無息地斷掉
    if (all.length > 2) {
      let last = lines[1];
      while (last && g.measureText(`${last}…`).width > paperW - 110) last = [...last].slice(0, -1).join('');
      lines[1] = `${last.trimEnd()}…`;
    }
    const emaBottom = drawEma(g, center, nukiBottom + 40, paperW, lines, qFont, 52, en ? 'EMA · MAKE A WISH' : '絵馬 · 心願');
    paperTop = emaBottom + 34;
  } else {
    // 沒有繪馬：紙放在鳥居的貫與畫面下緣之間的正中
    paperTop = Math.round(nukiBottom + (HEIGHT - nukiBottom - (FIXED + BODY_MAX)) / 2);
  }
  // 問題折成兩行時繪馬變高：籤詩那一格讓出空間，紙才不會貼著畫面下緣
  const BODY = Math.max(300, Math.min(BODY_MAX, HEIGHT - 40 - paperTop - FIXED));
  const paperH = FIXED + BODY;

  // 纸：阴影、纸色、朱红双线框
  g.save();
  g.shadowColor = 'rgba(38, 26, 18, 0.22)';
  g.shadowBlur = 36;
  g.shadowOffsetY = 16;
  g.fillStyle = PAPER;
  g.fillRect(paperX, paperTop, paperW, paperH);
  g.restore();
  g.strokeStyle = SEAL;
  g.lineWidth = 4;
  g.strokeRect(paperX + 2, paperTop + 2, paperW - 4, paperH - 4);
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(192, 50, 31, 0.7)';
  g.strokeRect(paperX + 10, paperTop + 10, paperW - 20, paperH - 20);

  // 顶部的和纸胶带：半透明樱粉和纸、微撕边，像贴在手帐里的御神签
  drawWashiTape(g, center, paperTop + 4, 210, 30, -2.2);

  const innerX = paperX + PAD;
  const innerW = paperW - PAD * 2;
  let y = paperTop + PAD;

  // 表头带
  const band = g.createLinearGradient(0, y, 0, y + BAND);
  band.addColorStop(0, SEAL);
  band.addColorStop(1, SEAL_DEEP);
  g.fillStyle = band;
  g.fillRect(innerX, y, innerW, BAND);
  g.fillStyle = CREAM;
  g.font = en ? `700 26px ${face}` : `700 30px ${SERIF}`;
  spacedText(g, en ? 'OMIKUJI' : '御神签', center, y + BAND / 2 + 11, en ? 14 : 30);
  y += BAND;

  // 签号
  g.fillStyle = INK_2;
  g.font = `400 25px ${face}`;
  spacedText(g, en ? `NO. ${stick.no} OF ${STICK_COUNT}` : `第${hanNumber(stick.no)}签`, center, y + 38, en ? 4 : 10);
  y += NO;

  // 等级大红印：三个字的等级小一号，英文两个词各一行
  const sealLines = en ? level.split(' ') : [level];
  const sealFont = en ? `700 24px ${face}` : `800 ${[...level].length >= 3 ? 40 : 54}px ${SERIF}`;
  drawSeal(g, center, y + SEAL_BLOCK / 2, SEAL_R, sealLines, sealFont, en ? 30 : 54);
  y += SEAL_BLOCK;

  // 签名，左右各一条朱红细线
  g.fillStyle = INK;
  g.font = en ? `600 36px ${face}` : `600 40px ${SERIF}`;
  const titleGap = en ? 2 : 18;
  const titleW = [...text.title].reduce((w, c) => w + g.measureText(c).width, 0) + titleGap * ([...text.title].length - 1);
  spacedText(g, text.title, center, y + TITLE / 2 + 12, titleGap);
  g.strokeStyle = SEAL;
  g.lineWidth = 2;
  for (const dir of [-1, 1]) {
    const x0 = center + dir * (titleW / 2 + 22);
    g.beginPath();
    g.moveTo(x0, y + TITLE / 2);
    g.lineTo(x0 + dir * 40, y + TITLE / 2);
    g.stroke();
  }
  y += TITLE;

  // 签诗：上下两条淡朱红线
  g.strokeStyle = 'rgba(192, 50, 31, 0.35)';
  g.lineWidth = 1.6;
  for (const ly of [y, y + BODY]) {
    g.beginPath();
    g.moveTo(innerX, ly);
    g.lineTo(innerX + innerW, ly);
    g.stroke();
  }
  const soulMeaning = en ? `“${meaning}”` : `「${meaning}」`;
  if (en) {
    drawHorizontal(
      g,
      [
        { text: text.poem[0], font: `italic 500 32px ${face}`, color: INK, step: 44 },
        { text: text.poem[1], font: `italic 500 32px ${face}`, color: INK, step: 44 },
        { text: soulMeaning, font: `400 26px ${face}`, color: INK_2, step: 36 },
      ],
      { centerX: center, top: y + 20, width: innerW - 70, height: BODY - 40, gap: 22, wrapText: wrapBalanced },
    );
  } else {
    const poemStep = Math.min(42, Math.floor((BODY - 52) / 7));
    drawVertical(
      g,
      [
        // 七言一列要放得下：一個字的高度照這一格的高度算（BODY 會因為繪馬變高而縮）
        { text: text.poem[0], font: `500 ${Math.min(38, poemStep - 4)}px ${SERIF}`, color: INK, step: poemStep },
        { text: text.poem[1], font: `500 ${Math.min(38, poemStep - 4)}px ${SERIF}`, color: INK, step: poemStep },
        { text: soulMeaning, font: `400 29px ${SERIF}`, color: INK_2, step: 34 },
      ],
      { centerX: center, top: y + 26, height: BODY - 52, gap: 26 },
    );
  }
  y += BODY;

  // 今日幸運指南（Lucky Guide：吉色 + 開運小物）
  const luckyItem = LUCKY_ITEMS[stick.no] ?? { zh: '草莓大福', en: 'Strawberry Daifuku' };
  g.font = `600 21px ${face}`;
  const luckyText = en ? `Lucky tone · ${lucky.en}` : `吉色 · ${lucky.zh}`;
  const itemText = en ? `Lucky charm · ${luckyItem.en}` : `開運 · ${luckyItem.zh}`;
  const lw1 = g.measureText(luckyText).width + 64;
  const lw2 = g.measureText(itemText).width + 64;
  const guideCx = qrImage ? paperX + (paperW - QR_SIZE - PAD) / 2 : center;
  const ly1 = y + FOOT / 2 - 24;
  const ly2 = y + FOOT / 2 + 24;

  // 1. 吉色胶囊
  g.fillStyle = `${tone}14`;
  g.strokeStyle = `${tone}44`;
  g.lineWidth = 1.4;
  g.beginPath();
  g.roundRect(guideCx - lw1 / 2, ly1 - 18, lw1, 36, 18);
  g.fill();
  g.stroke();
  g.fillStyle = tone;
  g.beginPath();
  g.arc(guideCx - lw1 / 2 + 22, ly1, 5.5, 0, Math.PI * 2);
  g.fill();
  g.textAlign = 'left';
  g.fillText(luckyText, guideCx - lw1 / 2 + 36, ly1 + 7);

  // 2. 開運小物膠囊
  g.fillStyle = 'rgba(192, 50, 31, 0.08)';
  g.strokeStyle = 'rgba(192, 50, 31, 0.32)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.roundRect(guideCx - lw2 / 2, ly2 - 18, lw2, 36, 18);
  g.fill();
  g.stroke();
  drawSakuraMark(g, guideCx - lw2 / 2 + 22, ly2, 7, SEAL);
  g.fillStyle = SEAL_DEEP;
  g.fillText(itemText, guideCx - lw2 / 2 + 36, ly2 + 7);
  g.textAlign = 'center';

  // 3. 櫻花小印
  if (!qrImage) {
    drawSakuraMark(g, paperX + 46, y + FOOT / 2, 16, SEAL);
    drawSakuraMark(g, paperX + paperW - 46, y + FOOT / 2, 16, SEAL);
  } else {
    drawSakuraMark(g, paperX + 40, y + FOOT / 2, 14, SEAL);
  }

  // 二维码：扫了回到游戏首页，放在纸的右下角
  if (qrImage) {
    const qx = paperX + paperW - PAD - QR_SIZE - 8;
    const qy = y + (FOOT - QR_SIZE - 26) / 2;
    g.drawImage(qrImage, qx, qy, QR_SIZE, QR_SIZE);
    g.fillStyle = INK_2;
    g.font = `500 17px ${en ? face : ROUND}`;
    g.textAlign = 'center';
    g.fillText(en ? 'SCAN TO PLAY' : '扫码再玩一签', qx + QR_SIZE / 2, qy + QR_SIZE + 20);
  }

  // 以前紙下面還有兩行頁腳（「签为参考，路要自己走」和網址），使用者要拿掉；
  // 回到遊戲的路是右下角的二維碼

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
