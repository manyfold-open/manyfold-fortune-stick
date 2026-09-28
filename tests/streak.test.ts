import { describe, expect, it } from 'vitest';
import { drawnBeforeToday, streakDays } from '../src/shared/streak';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe('連續抽籤天數', () => {
  const today = new Date(2026, 8, 24, 20);

  it('今天、昨天、前天都抽了就是 3；同一天抽好幾支只算一天', () => {
    expect(streakDays([at(2026, 9, 24), at(2026, 9, 24, 8), at(2026, 9, 23), at(2026, 9, 22)], today)).toBe(3);
  });

  it('中間斷一天就從斷掉那天之後重算', () => {
    expect(streakDays([at(2026, 9, 24), at(2026, 9, 22), at(2026, 9, 21)], today)).toBe(1);
  });

  it('今天還沒抽就是 0，就算昨天抽過', () => {
    expect(streakDays([at(2026, 9, 23)], today)).toBe(0);
  });

  it('跨月也接得起來；壞掉的日期略過', () => {
    expect(streakDays([at(2026, 10, 1), at(2026, 9, 30), 'not a date'], new Date(2026, 9, 1, 9))).toBe(2);
  });
});

describe('是不是今天以前抽的', () => {
  const today = new Date(2026, 8, 29, 9);

  it('昨天深夜抽的算以前；今天清晨抽的不算', () => {
    expect(drawnBeforeToday(at(2026, 9, 28, 23), today)).toBe(true);
    expect(drawnBeforeToday(new Date(2026, 8, 29, 0, 5).toISOString(), today)).toBe(false);
  });

  it('壞掉的日期不算以前（寧可停在原來那支）', () => {
    expect(drawnBeforeToday('nope', today)).toBe(false);
  });
});
