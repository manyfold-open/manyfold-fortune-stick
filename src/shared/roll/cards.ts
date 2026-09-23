/**
 * 滚印签纸机版面里**不碰 DOM** 的那一半：格子算术、预览签选取、折行、伪随机。
 *
 * 放 src/shared 而不是 src/app，只为了一件事：测试要能加载它。tests/ 由
 * tsconfig.worker.json 编译（lib 只有 ES2022），测试一旦 import 到 src/app 底下
 * 碰 DOM 的模块，npm run check 就整个炸掉。纯函数本来就「两边都能跑」，放这里
 * 名正言顺，一行设定都不必改 —— 签筒那边也是同一个处理。
 */

import { STICKS, type FortuneStick } from '../sticks';
import { N } from './kinematics';

/* ── 版面 ── */

/** 一格沿行进方向的像素数。440/480 ≈ CARD_LEN/W，误差 0.04%，看不出来。 */
export const CARD_PX = 440;
export const ATLAS_H = 480;
export const ATLAS_W = CARD_PX * N;

export const PAPER_FIBRES = 2500;
/** 真的雕版是反着刻的。改成 false 就变成「看得懂的」滚筒。 */
export const MIRROR_BLOCK = true;

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
