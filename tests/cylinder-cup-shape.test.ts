import { describe, expect, it } from 'vitest';
import * as G from '../src/shared/cylinder/geometry';

const TAU = Math.PI * 2;

describe('杯身截面：圆角方柱', () => {
  it('四个面的中央最窄，等于 TUBE_R_OUT —— 贴图的字就立在这四个平面上', () => {
    for (const k of [0, 1, 2, 3]) {
      expect(G.cupRadius((k * Math.PI) / 2)).toBeCloseTo(G.TUBE_R_OUT, 9);
    }
  });

  it('四个圆角最外，但不能外到变成菱形', () => {
    const ratio = G.CUP_R_MAX / G.TUBE_R_OUT;
    // 正圆是 1.0，正方形的角是 √2 ≈ 1.414；圆角方柱落在中间
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.3);
  });

  it('CUP_R_MAX 真的是最外缘 —— 框景拿它当包围半径，少算一点就会切到角', () => {
    for (let i = 0; i < 360; i += 1) {
      expect(G.cupRadius((i / 360) * TAU)).toBeLessThanOrEqual(G.CUP_R_MAX + 1e-9);
      expect(G.cupRadius((i / 360) * TAU)).toBeGreaterThanOrEqual(G.TUBE_R_OUT - 1e-9);
    }
  });

  it('四分之一圈对称 —— 四个面长得一样，转到哪一面都是同一只杯子', () => {
    for (let i = 0; i < 90; i += 1) {
      const t = (i / 360) * TAU;
      for (const k of [1, 2, 3]) {
        expect(G.cupRadius(t + (k * Math.PI) / 2)).toBeCloseTo(G.cupRadius(t), 9);
      }
    }
  });

  it('36 支籤全部落在内壁以内 —— 内壁用的是最窄那圈，所以圆角方柱只会更宽松', () => {
    for (let i = 0; i < G.STICK_COUNT; i += 1) {
      const slot = G.bundleSlot(i);
      const reach = Math.hypot(slot.x, slot.z) + G.STICK_HALF_DIAG;
      const theta = Math.atan2(slot.z, slot.x);
      expect(reach, `第 ${i + 1} 支`).toBeLessThanOrEqual(G.TUBE_R_IN);
      // 那个方向上的实际杯壁只会更远
      expect(cupInner(theta)).toBeGreaterThanOrEqual(reach);
    }
  });
});

/** 内壁：外缘往内缩一个壁厚。 */
const cupInner = (theta: number): number => G.cupRadius(theta) - G.TUBE_WALL;
