/**
 * 籤譜：這台瀏覽器抽到過哪幾支籤（36 支裡收了幾支）。抽到沒收過的，籤紙上蓋一個「新收 8/36」，
 * 給人一個抽下一支的理由（設計：docs/superpowers/specs/2026-09-28-collection-and-knots-design.md）。
 *
 * 跟求籤記錄分開存：記錄會刪、有 100 筆上限，收集只增不減。第一次用的時候從記錄回填，
 * 老玩家一打開就有進度。這裡只有純函式；讀寫在 src/app/storage.ts。
 */

import { STICKS } from './sticks';

/** 籤號 → 第一次抽到的 ISO 時間 */
export type Collection = Record<number, string>;

export const STICK_TOTAL = STICKS.length;

const isStickNo = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= STICK_TOTAL;

/**
 * 從求籤記錄回填。`excludeId` 是這一局本身 —— 記錄在出籤前就寫好了，
 * 不排除的話第一支籤永遠不算新。同一支抽過好幾次，留最早那一次。
 */
export function collectionFrom(
  records: readonly { id: string; stickNo: number; createdAt: string }[],
  excludeId?: string,
): Collection {
  const collection: Collection = {};
  for (const record of records) {
    if (record.id === excludeId || !isStickNo(record.stickNo)) continue;
    const seen = collection[record.stickNo];
    if (!seen || record.createdAt < seen) collection[record.stickNo] = record.createdAt;
  }
  return collection;
}

/** localStorage 裡讀回來的東西不能信：只留合法籤號、字串時間。不是物件就當沒有（null → 回填）。 */
export function parseCollection(raw: unknown): Collection | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const collection: Collection = {};
  for (const [key, value] of Object.entries(raw)) {
    const no = Number(key);
    if (isStickNo(no) && typeof value === 'string') collection[no] = value;
  }
  return collection;
}

export const collectedCount = (collection: Collection): number => Object.keys(collection).length;

/** 登記一支籤。收過的不動（第一次的時間才算數），回傳的 isNew 決定要不要蓋「新收」。 */
export function addToCollection(
  collection: Collection,
  stickNo: number,
  at: string,
): { collection: Collection; isNew: boolean } {
  if (!isStickNo(stickNo) || collection[stickNo]) return { collection, isNew: false };
  return { collection: { ...collection, [stickNo]: at }, isNew: true };
}
