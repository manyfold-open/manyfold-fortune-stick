import { describe, expect, it } from 'vitest';
import * as G from '../src/shared/cylinder/geometry';

describe('签筒比例', () => {
  it('高径比 2.8:1 —— 传统签筒又细又高，不是个桶', () => {
    expect(G.TUBE_H / (2 * G.TUBE_R_OUT)).toBeCloseTo(2.8, 6);
  });

  it('籤比筒长，所以一定露出筒口一截', () => {
    expect(G.STICK_LEN).toBeGreaterThan(G.TUBE_H);
    const out = G.STICK_LEN - G.TUBE_H;
    expect(out / G.STICK_LEN).toBeGreaterThan(0.2);
    expect(out / G.STICK_LEN).toBeLessThan(0.35);
  });

  it('籤束填充率要够高，籤才挤得成一束 —— 旧版只有 3.6%，所以像插在土里', () => {
    expect(G.bundleFill()).toBeGreaterThan(0.3);
    expect(G.bundleFill()).toBeLessThan(0.6);
  });
});

describe('籤束排布', () => {
  it('36 支全部落在筒内，一支都不许穿出筒壁', () => {
    for (let i = 0; i < G.STICK_COUNT; i += 1) {
      const s = G.bundleSlot(i);
      const reach = Math.hypot(s.x, s.z) + G.STICK_HALF_DIAG;
      expect(reach, `第 ${i + 1} 支穿出筒壁`).toBeLessThanOrEqual(G.TUBE_R_IN);
    }
  });

  it('是等面积铺满，不是同心圆 —— 中心不留洞、外圈不挤成一环', () => {
    const radii = Array.from({ length: G.STICK_COUNT }, (_, i) => {
      const s = G.bundleSlot(i);
      return Math.hypot(s.x, s.z);
    }).sort((a, b) => a - b);
    // 旧版是 6/12/18 三环，半径只有三个值。等面积分布应该处处不同。
    const distinct = new Set(radii.map((r) => r.toFixed(3)));
    expect(distinct.size).toBeGreaterThan(G.STICK_COUNT - 4);
    // 内外半圈应该各占一半面积 —— 这是 sqrt 分布的定义
    const mid = radii[Math.floor(G.STICK_COUNT / 2)];
    expect(mid / G.BUNDLE_R).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it('每支籤各转各的角度，不会像栅栏一样排排站', () => {
    const yaws = new Set(
      Array.from({ length: G.STICK_COUNT }, (_, i) => G.bundleSlot(i).yaw.toFixed(4)),
    );
    expect(yaws.size).toBe(G.STICK_COUNT);
  });

  it('排布是确定性的 —— 同一支籤每次都站在同一个地方', () => {
    for (const i of [0, 7, 22, 35]) {
      expect(G.bundleSlot(i)).toEqual(G.bundleSlot(i));
    }
  });

  it('籤头参差不齐，不是一个平面', () => {
    const rests = new Set(
      Array.from({ length: G.STICK_COUNT }, (_, i) => G.bundleSlot(i).rest.toFixed(4)),
    );
    expect(rests.size).toBeGreaterThan(30);
  });
});
