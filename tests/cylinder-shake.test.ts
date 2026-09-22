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
    S.stepShake(s, DT, true, true);
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
    for (let i = 0; i < 60 * 5; i += 1) S.stepShake(s, DT, true, true);
    expect(s.work).toBeLessThan(0.01);
  });

  it('按住不放但不拖，也不算搖 —— 進度不會自己長', () => {
    const s = S.createShake();
    S.pushHand(s, 120, DT); // 拉一下就不动了
    for (let i = 0; i < 60 * 6; i += 1) S.stepShake(s, DT, true, true);
    const w = s.work;
    for (let i = 0; i < 60 * 6; i += 1) S.stepShake(s, DT, true, true);
    expect(s.work - w).toBeLessThan(0.01);
  });
});

describe('搖動功只在「這一局可以抽籤」的時候才算', () => {
  /** 摇 secs 秒，armed 决定这些摇动算不算数。 */
  function dragArmed(s: S.ShakeState, secs: number, armed: boolean): void {
    let prev = 0;
    for (let i = 0; i < secs / DT; i += 1) {
      const y = Math.sin(i * DT * 2 * Math.PI * 2) * 70;
      S.pushHand(s, y - prev, DT);
      prev = y;
      S.stepShake(s, DT, true, armed);
    }
  }

  it('還沒寫問題時怎麼搖都不該累積進度', () => {
    const s = S.createShake();
    dragArmed(s, 12, false);
    expect(s.work, '没写问题时的摇动被记了下来').toBeLessThan(0.01);
  });

  it('不然寫完問題隨手一碰就直接掉籤 —— 這是實測踩到的', () => {
    const s = S.createShake();
    dragArmed(s, 12, false); // 写问题之前先摇很久
    dragArmed(s, 0.15, true); // 写完之后只碰一下
    expect(s.work, '写问题前的摇动漏进来，一碰就超过门槛').toBeLessThan(WORK_NEEDED);
  });

  it('armed 之後才開始算，而且照樣約兩秒出籤', () => {
    const s = S.createShake();
    let prev = 0;
    let hit = Infinity;
    for (let i = 0; i < 10 / DT; i += 1) {
      const y = Math.sin(i * DT * 2 * Math.PI * 2) * 70;
      S.pushHand(s, y - prev, DT);
      prev = y;
      S.stepShake(s, DT, true, true);
      if (hit === Infinity && s.work >= WORK_NEEDED) hit = i * DT;
    }
    expect(hit).toBeLessThan(4);
  });

  it('極短時間內的微小抖動不該被當成全速搖動', () => {
    // 点一下常常产生 1-2px、1ms 的移动。speed = dy/dt 会算出 2000px/s，
    // 直接顶满强度 —— 于是「点一下」被当成「用力甩」。
    const s = S.createShake();
    S.pushHand(s, 2, 0.001);
    expect(s.intensity, '一次微小抖动就顶满强度').toBeLessThan(0.5);
  });
});

describe('搖動強度：筒子的動作', () => {
  it('筒子跟得到手，但跟不緊 —— 跟不緊的那一點點就是重量感', () => {
    const s = S.createShake();
    S.pushHand(s, -150, DT); // 往上拉一个世界单位
    let maxLag = 0;
    for (let i = 0; i < 60; i += 1) {
      S.stepShake(s, DT, true, true);
      maxLag = Math.max(maxLag, Math.abs(s.handTarget - s.offset));
    }
    expect(maxLag).toBeGreaterThan(0.05); // 真的落后了
    expect(Math.abs(s.handTarget - s.offset)).toBeLessThan(0.1); // 但最后追上
  });

  it('筒子不會被拉出畫面', () => {
    const s = S.createShake();
    for (let i = 0; i < 600; i += 1) {
      S.pushHand(s, -400, DT); // 一直往同一个方向猛拉
      S.stepShake(s, DT, true, true);
      expect(Math.abs(s.offset)).toBeLessThanOrEqual(S.TUBE_SWING + 1e-9);
    }
  });

  it('放手之後筒子自己盪回原位', () => {
    const s = S.createShake();
    S.pushHand(s, -150, DT);
    for (let i = 0; i < 60 * 4; i += 1) S.stepShake(s, DT, false, true);
    expect(Math.abs(s.offset)).toBeLessThan(0.02);
    expect(Math.abs(s.vel)).toBeLessThan(0.05);
  });
});
