/**
 * 飄落的櫻花瓣 —— 純數學，不碰 DOM。
 *
 * 每片花瓣的位置是**時間的解析函式**，不是一格一格累加出來的：
 * 同一刻永遠畫在同一個地方，跟幀率無關，也不會因為分頁被丟到背景、回來時一格跳很大而亂掉。
 * 掉出下緣就從上緣回來 —— 第幾輪用 floor 算，每一輪換一個水平位置（用花瓣自己的種子雜湊）。
 */

import { pseudoRandom } from './cylinder/geometry';

export interface Petal {
  seed: number;
  /** 花瓣長邊（px）。 */
  size: number;
  /** t = 0 時在第一輪裡的高度（0..1，乘上一輪的長度）。 */
  y0: number;
  /** 往下的速度（px/s）。 */
  vy: number;
  /** 左右擺的幅度（px）與頻率（rad/s）、相位。 */
  amp: number;
  freq: number;
  phase: number;
  /** 風：每秒往右飄多少（px/s），一輪之內累積。 */
  drift: number;
  /** 自轉（rad/s）與翻面的頻率（rad/s）。 */
  spin: number;
  flipRate: number;
}

export interface PetalState {
  x: number;
  y: number;
  size: number;
  rot: number;
  /** 水平縮放 −1..1：翻面時花瓣先變窄、再翻到背面。 */
  flip: number;
}

export function createPetals(count: number, seed: number): Petal[] {
  const rand = pseudoRandom(seed * 7919 + 17);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => ({
    seed: seed * 1000 + i + 1,
    size: 8 + rand() * 8,
    y0: rand(),
    vy: 20 + rand() * 40,
    amp: 12 + rand() * 30,
    freq: 0.5 + rand() * 0.9,
    phase: rand() * Math.PI * 2,
    drift: 4 + rand() * 14,
    spin: (rand() - 0.5) * 1.6,
    flipRate: 0.8 + rand() * 1.6,
  }));
}

/** 第 cycle 輪的水平起點 0..1 —— 花瓣自己的種子加輪數雜湊，確定性。 */
const laneOf = (seed: number, cycle: number): number => pseudoRandom(seed * 131 + cycle * 977 + 3)();

const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

export function petalAt(p: Petal, tSec: number, w: number, h: number): PetalState {
  const t = Math.max(0, finite(tSec, 0));
  const W = Math.max(1, finite(w, 1));
  const H = Math.max(1, finite(h, 1));
  // 一輪：從上緣外一片花瓣高，落到下緣外一片花瓣高
  const span = H + p.size * 2;
  const travel = p.y0 * span + p.vy * t;
  const cycle = Math.floor(travel / span);
  const within = travel - cycle * span;
  const y = within - p.size;
  // 這一輪落了多久：風只在一輪之內累積，回到上緣就歸零
  const tIn = within / p.vy;
  const base = laneOf(p.seed, cycle) * W;
  // 擺動加風之後可能超出畫面：折回 [−size, W + size]
  let x = base + p.amp * Math.sin(p.freq * t + p.phase) + p.drift * tIn;
  const lo = -p.size;
  const hi = W + p.size;
  const range = hi - lo;
  x = lo + ((((x - lo) % range) + range) % range);
  return {
    x,
    y,
    size: p.size,
    rot: p.spin * t + p.phase,
    flip: Math.cos(p.flipRate * t + p.phase * 1.7),
  };
}

export const petalCount = (width: number): number => (width >= 900 ? 18 : 10);
