/**
 * 連著幾天都來抽了籤 —— 寫在結果頁繪馬的小字上（「連續第 3 天」），給每天來的人一點回來的理由。
 *
 * 只用這台瀏覽器自己的記錄算（storage.ts 的 listRecords），不上傳、不需要帳號。
 * 「一天」照使用者自己的時區算：早上八點抽和晚上十一點抽是同一天。
 */

/** 本地時區的日期鍵，例如 2026-9-24。 */
const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * 截至 `today`（含）往回連續有抽籤的天數；今天還沒抽就是 0。
 * `dates` 是每一支籤的 createdAt（ISO 字串），順序、重複都不要緊，壞掉的日期略過。
 */
export function streakDays(dates: readonly string[], today: Date = new Date()): number {
  const days = new Set<string>();
  for (const iso of dates) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) days.add(dayKey(d));
  }
  let count = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
