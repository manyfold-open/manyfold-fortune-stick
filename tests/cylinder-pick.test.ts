import { describe, expect, it } from 'vitest';
import * as K from '../src/shared/cylinder/pick';

/** 七支籤頭一字排開，間距 40px。 */
const HEADS = [100, 140, 180, 220, 260, 300, 340];
const SPACING = 40;
const DT = 1 / 60;

const run = (s: K.PickState, hand: (k: number) => number | null, frames: number, strength = 1) => {
  const ticks: number[] = [];
  for (let k = 0; k < frames; k += 1) {
    if (K.stepPick(s, DT, hand(k), HEADS, SPACING, strength)) ticks.push(s.touched);
  }
  return ticks;
};

describe('手碰到哪支，哪支就被挑起來', () => {
  it('手停在第 3 支上：它提得最高，兩旁的少一點，遠的不動', () => {
    const s = K.createPick(HEADS.length);
    run(s, () => 180, 60);
    expect(s.touched).toBe(2);
    expect(s.lift[2]).toBeGreaterThan(K.PICK_LIFT * 0.9);
    expect(s.lift[1]).toBeLessThan(s.lift[2]);
    expect(s.lift[1]).toBeGreaterThan(0.02);
    expect(s.lift[6]).toBeLessThan(0.005);
  });

  it('提起來的高度有上限 —— 是被撥了一下，不是被抽出去', () => {
    const s = K.createPick(HEADS.length);
    for (const x of [100, 180, 260, 340]) run(s, () => x, 40);
    for (const y of s.lift) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(K.PICK_LIFT + 1e-9);
    }
  });

  it('手掃過去：每一支依序被挑到，每換一支響一聲，同一支不重複響', () => {
    const s = K.createPick(HEADS.length);
    // 0.7 秒從最左掃到最右
    const ticks = run(s, (k) => 90 + (k / 42) * 260, 43);
    expect(ticks).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('被挑起來的那支跟著手走，不是一下子跳上去：一格之內提不到一半', () => {
    const s = K.createPick(HEADS.length);
    run(s, () => 180, 1);
    expect(s.lift[2]).toBeGreaterThan(0);
    expect(s.lift[2]).toBeLessThan(K.PICK_LIFT * 0.5);
  });

  it('手離開籤束外面：誰都不算被碰到', () => {
    const s = K.createPick(HEADS.length);
    run(s, () => 180, 20);
    run(s, () => 900, 60);
    expect(s.touched).toBe(-1);
    for (const y of s.lift) expect(y).toBeLessThan(0.005);
  });

  it('放手（hand = null）：約半秒內全部落回原位，不穿到原位以下', () => {
    const s = K.createPick(HEADS.length);
    run(s, () => 220, 40);
    const ys: number[] = [];
    for (let k = 0; k < 40; k += 1) {
      K.stepPick(s, DT, null, HEADS, SPACING, 1);
      ys.push(...s.lift);
    }
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(0);
    for (const y of s.lift) expect(y).toBeLessThan(0.01);
    expect(s.touched).toBe(-1);
  });

  it('攪得輕，挑得也輕；strength 0 等於沒碰', () => {
    const a = K.createPick(HEADS.length);
    const b = K.createPick(HEADS.length);
    run(a, () => 180, 60, 1);
    run(b, () => 180, 60, 0.4);
    expect(b.lift[2]).toBeLessThan(a.lift[2]);
    const c = K.createPick(HEADS.length);
    run(c, () => 180, 60, 0);
    expect(c.lift[2]).toBeLessThan(1e-9);
  });

  it('跟幀率無關：16ms 一格跟 50ms 一格停在差不多的地方', () => {
    const a = K.createPick(HEADS.length);
    const b = K.createPick(HEADS.length);
    for (let k = 0; k < 30; k += 1) K.stepPick(a, 0.016, 180, HEADS, SPACING, 1);
    for (let k = 0; k < 10; k += 1) K.stepPick(b, 0.048, 180, HEADS, SPACING, 1);
    expect(Math.abs(a.lift[2] - b.lift[2])).toBeLessThan(0.02);
  });

  it('壞掉的輸入不會算出 NaN', () => {
    const s = K.createPick(HEADS.length);
    for (const v of [NaN, Infinity, -Infinity]) {
      K.stepPick(s, DT, v, HEADS, SPACING, 1);
      K.stepPick(s, v, 180, HEADS, SPACING, 1);
      K.stepPick(s, DT, 180, HEADS, v, 1);
    }
    for (const y of s.lift) expect(Number.isFinite(y)).toBe(true);
  });
});

describe('籤頭間距（同一排）', () => {
  it('取相鄰兩支的平均距離，順序亂了也一樣', () => {
    expect(K.headSpacing([120, 0, 80, 40])).toBeCloseTo(40, 6);
  });

  it('只有一支或全疊在一起：給一個正的預設值，不會除以 0', () => {
    expect(K.headSpacing([5])).toBeGreaterThan(0);
    expect(K.headSpacing([5, 5, 5])).toBeGreaterThan(0);
    expect(K.headSpacing([])).toBeGreaterThan(0);
  });
});
