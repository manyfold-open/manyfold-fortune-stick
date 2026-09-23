import { describe, expect, it } from 'vitest';
import * as B from '../src/shared/cylinder/bundle';
import * as G from '../src/shared/cylinder/geometry';

const traits = Array.from({ length: G.STICK_COUNT }, (_, i) => B.stickTrait(i));
const DT = 1 / 60;
/** 攪 `secs` 秒：推擠加速度走正弦，intensity 是归一化强度 0..1。 */
function shake(motions: B.StickMotion[], secs: number, amp: number, intensity = 1): void {
  const steps = Math.round(secs / DT);
  for (let s = 0; s < steps; s += 1) {
    const a = Math.sin(s * DT * 2 * Math.PI * 2.1) * amp;
    B.stepBundle(motions, traits, DT, a, intensity);
  }
}

describe('籤束：不变量', () => {
  it('不管怎么摇，没有一支籤穿得过筒底', () => {
    const m = B.createMotions(G.STICK_COUNT);
    for (let round = 0; round < 6; round += 1) {
      shake(m, 1.5, 14 + round * 9);
      for (const s of m) expect(s.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('停手之后整束会静下来，能量不会自己长出来', () => {
    const m = B.createMotions(G.STICK_COUNT);
    shake(m, 2, 18);
    const moving = B.bundleEnergy(m);
    expect(moving).toBeGreaterThan(0);
    // 不再施力，只剩重力与阻尼
    for (let s = 0; s < 60 * 8; s += 1) B.stepBundle(m, traits, DT, 0, 0);
    expect(B.bundleEnergy(m)).toBeLessThan(moving * 0.02);
    for (const s of m) expect(s.y).toBeLessThan(0.05);
  });

  it('不摇就爬不上去 —— 籤不会自己跑出来', () => {
    const m = B.createMotions(G.STICK_COUNT);
    for (let s = 0; s < 60 * 6; s += 1) B.stepBundle(m, traits, DT, 0, 0);
    const highest = Math.max(...m.map((s) => s.y));
    expect(highest).toBeLessThan(0.05);
  });

  it('攪再久，籤也只是在原地起伏 —— 不會被攪出筒口', () => {
    // v2 拿「籤心越過筒口」當門檻，那是它的脫出條件。v3 的籤是被拿出來的，
    // 這裡要守的是：攪動只讓籤上下起伏一小段，看起來永遠是插著的
    const m = B.createMotions(G.STICK_COUNT);
    shake(m, 8, 26); // 用力攪很久
    for (const s of m) expect(s.y).toBeLessThan(0.6);
  });

  it('持續攪動會把整束微微頂起來 —— 籤頭才有被攪得浮動的樣子', () => {
    const m = B.createMotions(G.STICK_COUNT);
    shake(m, 1, 20);
    const after1 = Math.max(...m.map((s) => s.y));
    shake(m, 2, 20);
    const after3 = Math.max(...m.map((s) => s.y));
    expect(after3).toBeGreaterThan(after1);
  });
});
