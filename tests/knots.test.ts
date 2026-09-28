import { describe, expect, it } from 'vitest';
import { KNOT_SLOTS, knotJitter, knotU, parseKnots, tieKnot, type Knot } from '../src/shared/knots';

const tieMany = (count: number): Knot[] => {
  let knots: Knot[] = [];
  for (let i = 0; i < count; i += 1) knots = tieKnot(knots, i + 1, `2026-09-28T10:${String(i).padStart(2, '0')}:00Z`);
  return knots;
};

describe('注連繩上的結', () => {
  it('每一格都在繩長 0.3～0.7 之間，避開紙垂', () => {
    for (let slot = 0; slot < KNOT_SLOTS; slot += 1) {
      expect(knotU(slot)).toBeGreaterThan(0.3);
      expect(knotU(slot)).toBeLessThan(0.7);
    }
  });

  it('沒滿之前每個結一格，格位不重複', () => {
    const knots = tieMany(KNOT_SLOTS);
    expect(new Set(knots.map((k) => k.slot)).size).toBe(KNOT_SLOTS);
  });

  it('前兩個結不擠在一起', () => {
    const [a, b] = tieMany(2);
    expect(Math.abs(knotU(a.slot) - knotU(b.slot))).toBeGreaterThan(0.15);
  });

  it('滿了就頂掉最舊那一個的格位', () => {
    const full = tieMany(KNOT_SLOTS);
    const oldest = full[0];
    const next = tieKnot(full, 99, '2026-09-29T00:00:00Z');
    expect(next).toHaveLength(KNOT_SLOTS);
    expect(next.find((k) => k.stickNo === oldest.stickNo)).toBeUndefined();
    expect(next.find((k) => k.stickNo === 99)?.slot).toBe(oldest.slot);
  });

  it('歪斜是固定的，而且不大', () => {
    const j = knotJitter({ stickNo: 12, slot: 3 });
    expect(knotJitter({ stickNo: 12, slot: 3 })).toEqual(j);
    for (let no = 1; no <= 36; no += 1) {
      const { dy, rot } = knotJitter({ stickNo: no, slot: no % KNOT_SLOTS });
      expect(Math.abs(dy)).toBeLessThanOrEqual(2);
      expect(Math.abs(rot)).toBeLessThanOrEqual(6);
    }
  });

  it('壞掉的存檔只留格式對、格位不重複的', () => {
    expect(parseKnots('x')).toEqual([]);
    expect(
      parseKnots([
        { stickNo: 1, at: 't', slot: 0 },
        { stickNo: 2, at: 't', slot: 0 },
        { stickNo: 3, at: 't', slot: 12 },
        { stickNo: 4, slot: 1 },
        null,
        { stickNo: 5, at: 't', slot: 1 },
      ]),
    ).toEqual([
      { stickNo: 1, at: 't', slot: 0 },
      { stickNo: 5, at: 't', slot: 1 },
    ]);
  });
});
