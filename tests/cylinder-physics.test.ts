import { describe, expect, it } from 'vitest';
import * as B from '../src/shared/cylinder/bundle';
import * as E from '../src/shared/cylinder/eject';
import * as G from '../src/shared/cylinder/geometry';

const traits = Array.from({ length: G.STICK_COUNT }, (_, i) => B.stickTrait(i));
const DT = 1 / 60;
/** 筒斜持 26°，重力沿筒轴的分量。 */
const AXIS_G = B.GRAVITY * Math.cos(0.46);

/** 摇 `secs` 秒：手的加速度走正弦，intensity 是归一化强度 0..1。 */
function shake(motions: B.StickMotion[], secs: number, amp: number, chosen = -1, intensity = 1): void {
  const steps = Math.round(secs / DT);
  for (let s = 0; s < steps; s += 1) {
    const a = Math.sin(s * DT * 2 * Math.PI * 2.1) * amp;
    B.stepBundle(motions, traits, DT, AXIS_G, a, intensity, chosen);
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
    for (let s = 0; s < 60 * 8; s += 1) B.stepBundle(m, traits, DT, AXIS_G, 0, 0, -1);
    expect(B.bundleEnergy(m)).toBeLessThan(moving * 0.02);
    for (const s of m) expect(s.y).toBeLessThan(0.05);
  });

  it('不摇就爬不上去 —— 籤不会自己跑出来', () => {
    const m = B.createMotions(G.STICK_COUNT);
    for (let s = 0; s < 60 * 6; s += 1) B.stepBundle(m, traits, DT, AXIS_G, 0, 0, -1);
    const highest = Math.max(...m.map((s) => s.y));
    expect(highest).toBeLessThan(0.05);
  });

  it('光靠摇动送不出筒口 —— 否则不用抽签，摇久了自己就掉一堆出来', () => {
    const m = B.createMotions(G.STICK_COUNT);
    shake(m, 8, 26); // 用力摇很久，而且没有抽中任何一支
    const exit = Math.min(...Array.from({ length: G.STICK_COUNT }, (_, i) =>
      B.exitRise(G.bundleSlot(i).rest)));
    for (const s of m) expect(s.y).toBeLessThan(exit);
  });

  it('棘轮：持续摇动会把整束慢慢顶上去', () => {
    const m = B.createMotions(G.STICK_COUNT);
    shake(m, 1, 20);
    const after1 = Math.max(...m.map((s) => s.y));
    shake(m, 2, 20);
    const after3 = Math.max(...m.map((s) => s.y));
    expect(after3).toBeGreaterThan(after1);
  });
});

describe('籤束：中签那一支要爬得出来', () => {
  it('重心越过筒口才算脱出，而不是整支离开筒子', () => {
    // 整支离开要爬 6.5 个单位，摇到天亮也掉不出来；重心判准只要约 1.8
    const slot = G.bundleSlot(17);
    expect(B.exitRise(slot.rest)).toBeLessThan(2.4);
    expect(B.exitRise(slot.rest)).toBeGreaterThan(0.9);
    expect(G.TUBE_H - slot.rest).toBeGreaterThan(5);
  });

  it('抽中之后，在合理的摇动时间内爬到脱出高度', () => {
    const chosen = 17;
    const m = B.createMotions(G.STICK_COUNT);
    const need = B.exitRise(G.bundleSlot(chosen).rest);
    shake(m, 1.2, 20); // 先摇一阵子才抽到签
    let t = 0;
    const steps = Math.round(4 / DT);
    for (let s = 0; s < steps; s += 1) {
      const a = Math.sin(s * DT * 2 * Math.PI * 2.1) * 20;
      B.stepBundle(m, traits, DT, AXIS_G, a, 1, chosen);
      t += DT;
      if (m[chosen].y >= need) break;
    }
    expect(m[chosen].y, '中签那一支没爬出来').toBeGreaterThanOrEqual(need);
    expect(t, '爬出来花太久').toBeLessThan(3.5);
  });

  it('停手之後那一支停在原地 —— 不沉回去，也不自己往上飄', () => {
    // 籤束挤在一起，靠摩擦互相卡住。摇它才松动往上爬，停手就卡在原地。
    // 早先为了修「停手会沉回去」，把 CHOSEN_LIFT 拉到大于重力，结果那支籤变成
    // 无条件往上飘 —— 不是摇出来的，是浮上来的，实测回报「也太怪」。
    const chosen = 11;
    const m = B.createMotions(G.STICK_COUNT);
    shake(m, 2.2, 20, chosen);
    const held = m[chosen].y;
    expect(held, '摇的时候没爬起来').toBeGreaterThan(0.3);

    // 完全停手 4 秒
    for (let s = 0; s < 60 * 4; s += 1) B.stepBundle(m, traits, DT, AXIS_G, 0, 0, chosen);
    const after = m[chosen].y;
    expect(after, '停手之后沉回去了').toBeGreaterThan(held - 0.12);
    expect(after, '停手之后还在自己往上飘').toBeLessThan(held + 0.12);
  });

  it('只有持續搖動才爬得出去 —— 籤是搖出來的，不是自己浮上來的', () => {
    const chosen = 11;
    const need = B.exitRise(G.bundleSlot(chosen).rest);

    // 摇一小段就停手：这时还没到脱出高度
    const stopped = B.createMotions(G.STICK_COUNT);
    shake(stopped, 0.3, 20, chosen);
    const atRelease = stopped[chosen].y;
    expect(atRelease, '才摇 0.3 秒就出去了，太快').toBeLessThan(need);

    // 停手八秒：它应该停在原地，不会自己爬完剩下的路
    for (let s = 0; s < 60 * 8; s += 1) B.stepBundle(stopped, traits, DT, AXIS_G, 0, 0, chosen);
    expect(stopped[chosen].y, '停手之后居然自己爬出去了').toBeLessThan(need);
    expect(stopped[chosen].y, '停手之后沉回去了').toBeGreaterThan(atRelease - 0.12);

    // 一直摇就出得来
    const kept = B.createMotions(G.STICK_COUNT);
    shake(kept, 6, 20, chosen);
    expect(kept[chosen].y, '一直摇却摇不出来').toBeGreaterThanOrEqual(need);
  });

  it('中签的那一支爬得比其他所有籤都高', () => {
    const chosen = 5;
    const m = B.createMotions(G.STICK_COUNT);
    shake(m, 2.5, 20, chosen);
    const others = m.filter((_, i) => i !== chosen).map((s) => s.y);
    expect(m[chosen].y).toBeGreaterThan(Math.max(...others));
  });
});

describe('真實搖動：36 支都要出得來', () => {
  /**
   * 真实的摇动：强度跟着手速走，折返点归零，平均只有 0.64 —— 不是恒定 1。
   * 上面那些用恒定 1 的测试会给出过于乐观的结论，这一条是护栏。
   */
  function shakeReal(chosen: number, secs: number): { exit: number; maxOther: number } {
    const m = B.createMotions(G.STICK_COUNT);
    const need = B.exitRise(G.bundleSlot(chosen).rest);
    let exit = Infinity;
    for (let s = 0; s < secs / DT; s += 1) {
      const ph = s * DT * 2 * Math.PI * 2.1;
      B.stepBundle(m, traits, DT, AXIS_G, Math.sin(ph) * 20, Math.abs(Math.cos(ph)), chosen);
      if (exit === Infinity && m[chosen].y >= need) exit = s * DT;
    }
    return { exit, maxOther: Math.max(...m.map((x, i) => (i === chosen ? -1 : x.y))) };
  }

  it('不管抽中哪一支，都要在合理時間內搖出來', () => {
    const times: number[] = [];
    for (let i = 0; i < G.STICK_COUNT; i += 1) {
      const r = shakeReal(i, 12);
      expect(r.exit, `第 ${i + 1} 支摇不出来`).toBeLessThan(3);
      times.push(r.exit);
    }
    // 别快到还没摇就出来
    expect(Math.min(...times)).toBeGreaterThan(0.6);
  });

  it('搖動平均強度只有 0.64，恆定 1 是過於樂觀的假設', () => {
    let sum = 0;
    const n = 600;
    for (let s = 0; s < n; s += 1) sum += Math.abs(Math.cos(s * DT * 2 * Math.PI * 2.1));
    expect(sum / n).toBeLessThan(0.7);
  });

  it('中籤那一支出去了，其他 35 支還留在筒裡', () => {
    const r = shakeReal(17, 12);
    const smallestExit = Math.min(
      ...Array.from({ length: G.STICK_COUNT }, (_, i) => B.exitRise(G.bundleSlot(i).rest)),
    );
    expect(r.maxOther, '别的籤也跟着跑出来了').toBeLessThan(smallestExit);
  });
});

describe('脱出：自由落体', () => {
  const HALF_T = G.STICK_T / 2;

  function drop(v: Partial<E.FreeStick> = {}): E.FreeStick {
    const b = E.createFreeStick();
    b.y = 4;
    b.vx = 1.4;
    b.vy = 0.6;
    b.wz = 5.5;
    b.wx = 3.1;
    Object.assign(b, v);
    return b;
  }

  it('永远不会掉到案几底下', () => {
    const b = drop();
    for (let s = 0; s < 60 * 12; s += 1) {
      E.stepFree(b, DT, 0, HALF_T);
      expect(b.y).toBeGreaterThanOrEqual(HALF_T - 1e-9);
    }
  });

  it('会在有限时间内停下来，而且是躺平的', () => {
    const b = drop();
    let t = 0;
    for (let s = 0; s < 60 * 20 && !b.resting; s += 1) {
      E.stepFree(b, DT, 0, HALF_T);
      t += DT;
    }
    expect(b.resting, '籤一直没停下来').toBe(true);
    expect(t, '停得太慢').toBeLessThan(9);
    expect(b.rx).toBeCloseTo(Math.PI / 2, 2); // 躺平，不是立着
    expect(Math.hypot(b.vx, b.vy, b.vz)).toBe(0);
  });

  it('弹跳一次比一次低 —— 不会越弹越高', () => {
    const b = drop({ vx: 0, vz: 0, wx: 0, wz: 0, y: 3 });
    const peaks: number[] = [];
    let prev = b.y;
    let rising = false;
    for (let s = 0; s < 60 * 12; s += 1) {
      E.stepFree(b, DT, 0, HALF_T);
      if (b.y > prev && !rising) rising = true;
      if (b.y < prev && rising) {
        peaks.push(prev);
        rising = false;
      }
      prev = b.y;
    }
    for (let i = 1; i < peaks.length; i += 1) {
      expect(peaks[i]).toBeLessThan(peaks[i - 1]);
    }
  });

  it('停了之后就不再动 —— resting 是终态', () => {
    const b = drop();
    for (let s = 0; s < 60 * 20 && !b.resting; s += 1) E.stepFree(b, DT, 0, HALF_T);
    const snap = { ...b };
    for (let s = 0; s < 120; s += 1) E.stepFree(b, DT, 0, HALF_T);
    expect(b).toEqual(snap);
  });
});
