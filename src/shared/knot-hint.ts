/**
 * 讓人知道繩上的結可以點：兩個只存在這台瀏覽器的旗子，加兩條規則。
 * （設計：docs/superpowers/specs/2026-09-28-knot-hint-and-ga4-design.md）
 *
 * - `seen`：這位使用者親手點開過一個結。自動解開不算，否則沒點過的人也被當成知道了。
 * - `peeked`：結已經為了提示自己解開過一次。只解開一次，不然每次再求一籤都在打擾。
 *
 * 結上的微光一直亮到 `seen`；自動解開只在第一次（`peeked` 之前）。這裡只有純函式，
 * 讀寫在 src/app/storage.ts。
 */

export interface KnotHint {
  seen: boolean;
  peeked: boolean;
}

/** 結周圍的微光：直到使用者親手點開過一個結 */
export const glowKnots = (hint: KnotHint): boolean => !hint.seen;

/** 新結綁上去時，要不要讓它自己解開一下：沒點過、也還沒解開給人看過 */
export const peekOnTie = (hint: KnotHint): boolean => !hint.seen && !hint.peeked;

/** 從 localStorage 取出的兩個字串還原成旗子；只有 "1" 算數 */
export const readKnotHint = (seen: string | null, peeked: string | null): KnotHint => ({
  seen: seen === '1',
  peeked: peeked === '1',
});
