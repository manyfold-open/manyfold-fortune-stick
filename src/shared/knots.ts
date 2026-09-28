/**
 * 結籤：按「再求一籤」時，上一支籤摺成紙條綁到注連繩上，留在鳥居上。
 * （設計：docs/superpowers/specs/2026-09-28-collection-and-knots-design.md）
 *
 * 繩上最多 12 個結，排在繩長 0.3～0.7 之間 —— 紙垂掛在 0.1、0.24、0.76、0.9，不打架。
 * 新的結按固定順序放進下一個空格（先散開，不從左邊擠起），滿了就頂掉最舊那一個。
 * 每個結依籤號與格位帶一點固定的歪斜：看起來是手綁的，重新整理也不會跳。這裡只有純函式。
 */

import { isLanguage, type Language } from './lang';

export interface Knot {
  stickNo: number;
  /** 綁上去的 ISO 時間 */
  at: string;
  /** 0 … KNOT_SLOTS-1 */
  slot: number;
  /** 點開結時連到那一條記錄。最早的幾個結沒有 */
  readingId?: string;
  /** 那一局的語言（由問題推出來的）：點開的小籤紙用它印。沒有就跟界面 */
  language?: Language;
}

export type KnotMeta = Pick<Knot, 'readingId' | 'language'>;

export const KNOT_SLOTS = 12;
const KNOT_FROM = 0.3;
const KNOT_TO = 0.7;
/** 空格的填法：兩邊交錯往中間補，前幾個結就散在整段繩上 */
const FILL_ORDER = [2, 9, 5, 7, 0, 11, 4, 6, 1, 10, 3, 8];

/** 格位在繩上的位置（繩長的比例） */
export const knotU = (slot: number): number => KNOT_FROM + ((slot + 0.5) * (KNOT_TO - KNOT_FROM)) / KNOT_SLOTS;

/** 固定的歪斜：上下 ±2px、角度 ±6°。同一支籤綁在同一格，永遠長一樣 */
export function knotJitter(knot: Pick<Knot, 'stickNo' | 'slot'>): { dy: number; rot: number } {
  let h = (knot.stickNo * 2654435761 + knot.slot * 40503) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  const a = (h & 0xffff) / 0xffff;
  const b = (h >>> 16) / 0xffff;
  return { dy: Math.round((a * 4 - 2) * 10) / 10, rot: Math.round((b * 12 - 6) * 10) / 10 };
}

/** 綁一個新結。回傳新的整串（不改原陣列）。 */
export function tieKnot(knots: readonly Knot[], stickNo: number, at: string, meta: KnotMeta = {}): Knot[] {
  const taken = new Set(knots.map((knot) => knot.slot));
  const free = FILL_ORDER.find((slot) => !taken.has(slot));
  if (free !== undefined) return [...knots, { stickNo, at, slot: free, ...meta }];
  // 滿了：頂掉最舊的（時間一樣就是排在前面的那個）
  let oldest = 0;
  knots.forEach((knot, index) => {
    if (knot.at < knots[oldest].at) oldest = index;
  });
  const slot = knots[oldest].slot;
  return [...knots.filter((_, index) => index !== oldest), { stickNo, at, slot, ...meta }];
}

/** localStorage 裡讀回來的東西不能信：只留格式對、格位不重複的，最多 KNOT_SLOTS 個。 */
export function parseKnots(raw: unknown): Knot[] {
  if (!Array.isArray(raw)) return [];
  const knots: Knot[] = [];
  const taken = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { stickNo, at, slot, readingId, language } = item as Partial<Knot>;
    if (typeof stickNo !== 'number' || typeof at !== 'string' || typeof slot !== 'number') continue;
    if (!Number.isInteger(slot) || slot < 0 || slot >= KNOT_SLOTS || taken.has(slot)) continue;
    taken.add(slot);
    const knot: Knot = { stickNo, at, slot };
    if (typeof readingId === 'string' && readingId) knot.readingId = readingId;
    if (isLanguage(language)) knot.language = language;
    knots.push(knot);
  }
  return knots;
}
