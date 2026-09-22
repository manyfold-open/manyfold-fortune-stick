import { describe, expect, it } from 'vitest';
import * as S from '../src/shared/cylinder/shake';

const DT = 1 / 60;
/** 组件里的门槛。改这个数字的时候，下面那几条时间断言就是它的护栏。 */
const WORK_NEEDED = 16;

/**
 * 模拟一个人来回拖：振幅 ampPx、频率 hz，跑 secs 秒。
 * 回传达到门槛花了几秒（没达到就回传 Infinity）。
 */
function dragFor(secs: number, ampPx: number, hz: number): number {
  const s = S.createShake();
  let prev = 0;
  let hit = Infinity;
  const steps = Math.round(secs / DT);
  for (let i = 0; i < steps; i += 1) {
    const t = i * DT;
    const y = Math.sin(t * 2 * Math.PI * hz) * ampPx;
    S.pushHand(s, y - prev, DT);
    prev = y;
    S.stepShake(s, DT, true);
    if (hit === Infinity && s.work >= WORK_NEEDED) hit = t;
  }
  return hit;
}

describe('搖動強度：拖多久才出籤', () => {
  it('正常力道來回拖，幾秒內就出籤', () => {
    const t = dragFor(10, 70, 2.0);
    expect(t, '正常力道摇不出来').toBeLessThan(4);
    expect(t, '还没摇就出来了').toBeGreaterThan(0.6);
  });

  it('用力猛搖會更快，但不會快到還沒搖就出來', () => {
    const fast = dragFor(10, 110, 3.0);
    const normal = dragFor(10, 70, 2.0);
    expect(fast).toBeLessThan(normal);
    expect(fast).toBeGreaterThan(0.4);
  });

  it('輕輕慢慢拖也出得來，只是要久一點 —— 不能讓人拖到放棄', () => {
    const t = dragFor(20, 45, 1.0);
    expect(t, '轻拖完全出不来，使用者会以为坏了').toBeLessThan(9);
  });

  it('完全不動就不會有進度', () => {
    const s = S.createShake();
    for (let i = 0; i < 60 * 5; i += 1) S.stepShake(s, DT, true);
    expect(s.work).toBeLessThan(0.01);
  });

  it('按住不放但不拖，也不算搖 —— 進度不會自己長', () => {
    const s = S.createShake();
    S.pushHand(s, 120, DT); // 拉一下就不动了
    for (let i = 0; i < 60 * 6; i += 1) S.stepShake(s, DT, true);
    const w = s.work;
    for (let i = 0; i < 60 * 6; i += 1) S.stepShake(s, DT, true);
    expect(s.work - w).toBeLessThan(0.01);
  });
});

describe('搖動強度：筒子的動作', () => {
  it('筒子跟得到手，但跟不緊 —— 跟不緊的那一點點就是重量感', () => {
    const s = S.createShake();
    S.pushHand(s, -150, DT); // 往上拉一个世界单位
    let maxLag = 0;
    for (let i = 0; i < 60; i += 1) {
      S.stepShake(s, DT, true);
      maxLag = Math.max(maxLag, Math.abs(s.handTarget - s.offset));
    }
    expect(maxLag).toBeGreaterThan(0.05); // 真的落后了
    expect(Math.abs(s.handTarget - s.offset)).toBeLessThan(0.1); // 但最后追上
  });

  it('筒子不會被拉出畫面', () => {
    const s = S.createShake();
    for (let i = 0; i < 600; i += 1) {
      S.pushHand(s, -400, DT); // 一直往同一个方向猛拉
      S.stepShake(s, DT, true);
      expect(Math.abs(s.offset)).toBeLessThanOrEqual(S.TUBE_SWING + 1e-9);
    }
  });

  it('放手之後筒子自己盪回原位', () => {
    const s = S.createShake();
    S.pushHand(s, -150, DT);
    for (let i = 0; i < 60 * 4; i += 1) S.stepShake(s, DT, false);
    expect(Math.abs(s.offset)).toBeLessThan(0.02);
    expect(Math.abs(s.vel)).toBeLessThan(0.05);
  });
});
