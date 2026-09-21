import { describe, expect, it } from 'vitest';
import * as K from '../src/app/roll/kinematics';

describe('无滑动纯滚动锁定', () => {
  it('八张卡片严丝合缝地咬住一整个周长', () => {
    expect(K.CARD_LEN * K.N).toBeCloseTo(K.TWO_PI_R, 12);
    expect(K.TWO_PI_R).toBeCloseTo(2 * Math.PI * 1.75, 12);
  });

  it('旋转角就是 -s / R', () => {
    expect(K.spinAngle(0)).toBe(-0);
    expect(K.spinAngle(K.R)).toBeCloseTo(-1, 12);
    expect(K.spinAngle(K.TWO_PI_R)).toBeCloseTo(-K.TWO_PI, 12);
  });

  it('滚筒表面被压印点咬住的那一点 u，等于纸带在压印点的 u', () => {
    for (const s of [0, 0.3, 1.7, 5.5, K.TWO_PI_R, 41.9, 137.2]) {
      // 压印瞬间贴在地面的那块材料，滚转前的角位置是 φ = -spinAngle(s)
      expect(K.barrelUAtPhi(-K.spinAngle(s))).toBeCloseTo(K.nipU(s), 12);
    }
  });

  it('滚筒环上每个顶点的 u 都由它自己的角位置算出，整圈单调不折返', () => {
    for (let j = 0; j <= K.BARREL_SEGMENTS; j += 1) {
      expect(K.barrelU(j)).toBeCloseTo(K.barrelUAtPhi(K.barrelPhi(j)), 12);
      if (j > 0) expect(K.barrelU(j)).toBeGreaterThan(K.barrelU(j - 1));
    }
    // 接缝落在滚筒顶部（φ = π），不落在压印点上
    expect(K.barrelPhi(0)).toBeCloseTo(Math.PI, 12);
    expect(K.barrelRingY(Math.PI)).toBeCloseTo(K.R, 12);
    expect(K.barrelRingY(0)).toBeCloseTo(-K.R, 12);
    expect(K.barrelRingZ(0)).toBeCloseTo(0, 12);
  });
});

describe('卡片格与定格', () => {
  it('cardIndexAt 在 0..7 之间循环，负数也不越界', () => {
    expect(K.cardIndexAt(0)).toBe(0);
    expect(K.cardIndexAt(K.CARD_LEN * 0.999)).toBe(0);
    expect(K.cardIndexAt(K.CARD_LEN * 1.001)).toBe(1);
    expect(K.cardIndexAt(K.CARD_LEN * 7.5)).toBe(7);
    expect(K.cardIndexAt(K.CARD_LEN * 8.5)).toBe(0);
    expect(K.cardIndexAt(-K.CARD_LEN * 0.5)).toBe(7);
  });

  it('slotOppositeNip 给出的是此刻转到滚筒顶上、镜头看不见的那一格', () => {
    for (const s of [0, 2.2, 9.9, 55.1]) {
      expect(K.slotOppositeNip(s)).toBe((K.cardIndexAt(s) + K.N / 2) % K.N);
    }
  });

  it('solveStopS 停下来时，指定那一格正好落在压印点后 LAND_OFFSET 处', () => {
    for (const sNow of [0, 1.3, 17.6, 204.8]) {
      for (let slot = 0; slot < K.N; slot += 1) {
        const stop = K.solveStopS(sNow, slot);
        expect(stop).toBeGreaterThanOrEqual(sNow + K.MIN_ROLL - 1e-9);
        expect(K.cardIndexAt(stop - K.LAND_OFFSET)).toBe(slot);
        // 落定的那一格，中心恰好在压印点后 LAND_OFFSET
        const centre = Math.floor((stop - K.LAND_OFFSET) / K.CARD_LEN) * K.CARD_LEN + K.CARD_LEN / 2;
        expect(stop - centre).toBeCloseTo(K.LAND_OFFSET, 9);
      }
    }
  });

  it('至少滚一圈半才停 —— 定格要看得出是有意为之', () => {
    expect(K.MIN_ROLL).toBeCloseTo(1.5 * K.TWO_PI_R, 12);
  });
});

describe('剥离微卷曲与弹簧', () => {
  it('卷曲段两端归零，峰值 CURL_LIFT 落在 q = 1/3', () => {
    expect(K.curlLift(0)).toBe(0);
    expect(K.curlLift(1)).toBe(0);
    expect(K.curlLift(1 / 3)).toBeCloseTo(K.CURL_LIFT, 12);
    for (let q = 0; q <= 1; q += 0.01) expect(K.curlLift(q)).toBeGreaterThanOrEqual(0);
    expect(K.curlLift(1.4)).toBe(0);
  });

  it('尾端斜率归零 —— 纸躺平的时候不能带折角', () => {
    expect(K.curlSlope(1)).toBe(0);
    expect(K.curlSlope(1 / 3)).toBeCloseTo(0, 12);
    expect(K.curlSlope(0.1)).toBeGreaterThan(0);
    expect(K.curlSlope(0.8)).toBeLessThan(0);
  });

  it('卷曲正好占 16 段', () => {
    expect(K.CURL_SEG).toBe(16);
    expect(K.CURL_LEN).toBeCloseTo(K.CURL_SEG * K.SEG_LEN, 12);
  });

  it('springK 就是 1 - e^(-2.6 dt)，且恒在 (0,1)', () => {
    expect(K.SPRING).toBe(2.6);
    for (const dt of [1 / 240, 1 / 60, 1 / 12]) {
      expect(K.springK(dt)).toBeCloseTo(1 - Math.exp(-2.6 * dt), 12);
      expect(K.springK(dt)).toBeGreaterThan(0);
      expect(K.springK(dt)).toBeLessThan(1);
    }
  });

  it('顶点预算写死：778 段、1558 个顶点', () => {
    expect(K.MAX_SEG).toBe(778);
    expect(K.VERTS).toBe((778 + 1) * 2);
    expect(K.VERTS).toBeLessThan(65536); // Uint16 索引装得下
  });
});
