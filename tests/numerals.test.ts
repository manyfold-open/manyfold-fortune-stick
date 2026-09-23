import { describe, expect, it } from 'vitest';
import { hanNumber } from '../src/shared/numerals';

describe('國字籤號', () => {
  it('籤筒上那種寫法：十、十一、廿、廿三、卅、卅六', () => {
    const cases: Array<[number, string]> = [
      [1, '一'], [9, '九'], [10, '十'], [11, '十一'], [17, '十七'],
      [20, '廿'], [23, '廿三'], [30, '卅'], [36, '卅六'],
    ];
    for (const [n, s] of cases) expect(hanNumber(n)).toBe(s);
  });

  it('1..36 每一個都有字、沒有「〇」混進十位以上', () => {
    for (let n = 1; n <= 36; n += 1) {
      const s = hanNumber(n);
      expect(s.length).toBeGreaterThan(0);
      if (n >= 10) expect(s).not.toContain('〇');
    }
  });
});
