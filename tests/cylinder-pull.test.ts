import { describe, expect, it } from 'vitest';
import * as P from '../src/shared/cylinder/pull';
import * as G from '../src/shared/cylinder/geometry';

/** 抽出過程取樣：每 20ms 一格，從抓住一路到拿著看完。 */
const TIMES = Array.from({ length: Math.ceil(P.PULL_DONE / 20) + 1 }, (_, k) => k * 20);
const SLOTS = Array.from({ length: G.STICK_COUNT }, (_, i) => G.bundleSlot(i));

/** 籤底（沿籤軸往下半支） —— 獨立重算，不從 pull 拿。 */
const bottomOf = (p: P.PullPose) => ({
  x: p.cx - p.ax * (G.STICK_LEN / 2),
  y: p.cy - p.ay * (G.STICK_LEN / 2),
  z: p.cz - p.az * (G.STICK_LEN / 2),
});

describe('抽哪一支：筒心、最直、在前半邊', () => {
  it('被抽的那支幾乎直立，旁邊的籤都往外傾、離它而去 —— 往上拔才不會穿過別的籤', () => {
    const s = G.bundleSlot(G.PULL_INDEX);
    expect(s.lean).toBeLessThan(0.05);
    expect(s.z).toBeGreaterThanOrEqual(0);
    for (const o of SLOTS) {
      if (o.z < 0) continue;
      expect(o.lean).toBeGreaterThanOrEqual(s.lean);
    }
  });
});

describe('抽出的路徑：像手把籤拿起來', () => {
  it('任何時刻、任何一支籤，筒口以下那段都在內壁以內、不穿筒底', () => {
    for (const slot of SLOTS) {
      for (const t of TIMES) {
        const p = P.pullPose(slot, t);
        const b = bottomOf(p);
        expect(b.y, `t=${t}`).toBeGreaterThanOrEqual(-1e-9);
        if (b.y >= G.TUBE_H) continue;
        for (let k = 0; k <= 12; k += 1) {
          const y = b.y + ((G.TUBE_H - b.y) * k) / 12;
          const u = (y - b.y) / p.ay;
          const r = Math.hypot(b.x + p.ax * u, b.z + p.az * u);
          expect(r, `t=${t} y=${y.toFixed(2)}`).toBeLessThanOrEqual(G.BUNDLE_R + 1e-9);
        }
      }
    }
  });

  it('抓住那一下：先輕提、再頓回來，幅度小 —— 是阻力，不是跳起來', () => {
    const slot = G.bundleSlot(G.PULL_INDEX);
    const rest = bottomOf(P.pullPose(slot, 0)).y;
    let peak = 0;
    for (let t = 0; t <= P.GRAB_MS; t += 10) peak = Math.max(peak, bottomOf(P.pullPose(slot, t)).y - rest);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(0.25);
    expect(bottomOf(P.pullPose(slot, P.GRAB_MS)).y - rest).toBeLessThan(0.02);
  });

  it('抓住之後只升不降，抽出結束時整支已經離開筒口', () => {
    const slot = G.bundleSlot(G.PULL_INDEX);
    let prev = -Infinity;
    for (let t = P.GRAB_MS; t <= P.PULL_DONE; t += 10) {
      const y = bottomOf(P.pullPose(slot, t)).y;
      expect(y, `t=${t}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
    expect(bottomOf(P.pullPose(slot, P.PRESENT_START)).y).toBeGreaterThan(G.TUBE_H);
  });

  it('拿著看的時候：直立、在筒心正上方、正面朝鏡頭', () => {
    const slot = G.bundleSlot(G.PULL_INDEX);
    for (let t = P.HOLD_START; t <= P.PULL_DONE; t += 50) {
      const p = P.pullPose(slot, t);
      expect(p.ay).toBeGreaterThan(0.995);
      expect(Math.hypot(p.cx, p.cz)).toBeLessThan(0.5);
      expect(Math.abs(p.yaw)).toBeLessThan(0.06);
      expect(bottomOf(p).y).toBeGreaterThan(G.TUBE_H);
    }
  });

  it('號碼在鏡頭推到位之前就換上，推近的那段看得到它出現', () => {
    // 鏡頭跟著籤走，籤在 HOLD_START 拿到面前，鏡頭也在那時到位
    expect(P.NUMBER_AT).toBeGreaterThanOrEqual(P.PRESENT_START);
    expect(P.NUMBER_AT).toBeLessThan(P.HOLD_START);
  });

  it('減少動畫：一步到拿著看的樣子', () => {
    const slot = G.bundleSlot(G.PULL_INDEX);
    const a = P.pullPose(slot, 0, true);
    const b = P.pullPose(slot, P.HOLD_START);
    expect(a.cy).toBeCloseTo(b.cy, 6);
  });

  it('旁邊的籤被帶得跳一下再落回：只有附近的、只在抽出那段、幅度有限', () => {
    expect(P.neighborNudge(0.5, 0)).toBe(0);
    expect(P.neighborNudge(0.5, P.PULL_START + P.PULL_MS / 2)).toBeGreaterThan(0);
    expect(P.neighborNudge(0.5, P.PULL_START + P.PULL_MS / 2)).toBeLessThan(0.5);
    expect(P.neighborNudge(10, P.PULL_START + P.PULL_MS / 2)).toBe(0);
    expect(P.neighborNudge(0.5, P.HOLD_START)).toBe(0);
  });

  it('壞掉的時間不會算出 NaN', () => {
    const slot = G.bundleSlot(G.PULL_INDEX);
    for (const t of [NaN, -5, Infinity, -Infinity]) {
      const p = P.pullPose(slot, t);
      for (const v of [p.cx, p.cy, p.cz, p.ax, p.ay, p.az, p.yaw]) expect(Number.isFinite(v)).toBe(true);
      expect(Number.isFinite(P.neighborNudge(0.5, t))).toBe(true);
    }
  });
});

describe('聲音跟畫面對齊：每個動作的聲音在同一格響、而且只響一次', () => {
  /** 用真實的幀距（不固定）跑完整段，收集每一個 cue 在第幾毫秒響。 */
  const run = (step: (i: number) => number, reduced = false) => {
    const fired: Array<[P.PullCue, number]> = [];
    let prev = -1;
    for (let i = 0, t = 0; t <= P.PULL_DONE + 100; i += 1) {
      for (const c of P.pullCues(prev, t, reduced)) fired.push([c, t]);
      prev = t;
      t += step(i);
    }
    return fired;
  };

  it('抓住、抽出、號碼出現各響一次，順序對', () => {
    for (const step of [() => 16, () => 33, (i: number) => (i % 3 === 0 ? 50 : 8)]) {
      const fired = run(step);
      expect(fired.map(([c]) => c)).toEqual(['grab', 'slide', 'reveal']);
    }
  });

  it('號碼那一聲落在換上號碼貼圖的同一格 —— 這就是「聲音跟畫面對齊」', () => {
    for (const dt of [16, 33, 50]) {
      const reveal = run(() => dt).find(([c]) => c === 'reveal')!;
      // 組件在 ms >= NUMBER_AT 的第一格換貼圖；聲音也必須是那一格
      expect(reveal[1]).toBeGreaterThanOrEqual(P.NUMBER_AT);
      expect(reveal[1]).toBeLessThan(P.NUMBER_AT + dt);
    }
  });

  it('抽出那一聲在籤真的開始往上走的那一格', () => {
    const slide = run(() => 16).find(([c]) => c === 'slide')!;
    expect(slide[1]).toBeGreaterThanOrEqual(P.PULL_START);
    expect(slide[1]).toBeLessThan(P.PULL_START + 16);
  });

  it('減少動畫：直接到結果，只響號碼那一聲', () => {
    expect(run(() => 16, true).map(([c]) => c)).toEqual(['reveal']);
  });
});
