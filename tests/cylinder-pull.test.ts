import { describe, expect, it } from 'vitest';
import * as P from '../src/shared/cylinder/pull';
import * as G from '../src/shared/cylinder/geometry';
import * as B from '../src/shared/cylinder/bundle';

/** 抽出過程取樣：每 20ms 一格，從放手一路到淡出演完。 */
const TIMES = Array.from({ length: Math.ceil(P.PULL_END / 20) + 1 }, (_, k) => k * 20);
const SLOTS = Array.from({ length: G.STICK_COUNT }, (_, i) => G.bundleSlot(i));
const HELD = G.bundleSlot(G.PULL_INDEX);

/** 籤底（沿籤軸往下半支） —— 獨立重算，不從 pull 拿。 */
const bottomOf = (p: P.PullPose) => ({
  x: p.cx - p.ax * (G.STICK_LEN / 2),
  y: p.cy - p.ay * (G.STICK_LEN / 2),
  z: p.cz - p.az * (G.STICK_LEN / 2),
});
/** 籤頭最高點。 */
const tipY = (ms: number): number => {
  const p = P.pullPose(HELD, ms);
  return p.cy + p.ay * G.STICK_TIP;
};
/** 籤頭往上的速度（u/s），中央差分 ±8ms。 */
const tipV = (ms: number): number => (tipY(ms + 8) - tipY(ms - 8)) / 0.016;

describe('抽哪一支：筒心、最直、在前半邊', () => {
  it('被抽的那支幾乎直立，旁邊的籤都往外傾、離它而去 —— 往上拔才不會穿過別的籤', () => {
    expect(HELD.lean).toBeLessThan(0.05);
    expect(HELD.z).toBeGreaterThanOrEqual(0);
    for (const o of SLOTS) {
      if (o.z < 0) continue;
      expect(o.lean).toBeGreaterThanOrEqual(HELD.lean);
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

  it('還有一截在筒裡的時候只沿自己的軸往上滑：不橫移、不轉 —— 轉了就會掃過旁邊的籤', () => {
    for (const slot of SLOTS) {
      const rest = G.stickPose(slot);
      for (const t of TIMES) {
        const p = P.pullPose(slot, t);
        if (bottomOf(p).y >= G.TUBE_H) continue;
        expect(p.yaw, `t=${t}`).toBeCloseTo(slot.yaw, 9);
        // 籤軸通過筒口那一點不變（支點不動，只收傾角）
        const u = (G.TUBE_H - bottomOf(p).y) / p.ay;
        const ru = (G.TUBE_H - (rest.cy - rest.ay * (G.STICK_LEN / 2))) / rest.ay;
        const rb = { x: rest.cx - rest.ax * (G.STICK_LEN / 2), z: rest.cz - rest.az * (G.STICK_LEN / 2) };
        expect(bottomOf(p).x + p.ax * u).toBeCloseTo(rb.x + rest.ax * ru, 6);
        expect(bottomOf(p).z + p.az * u).toBeCloseTo(rb.z + rest.az * ru, 6);
      }
    }
  });

  it('從放手到淡出，只升不降 —— 抓住那一下不再往回掉', () => {
    let prev = -Infinity;
    for (let t = 0; t <= P.PULL_END; t += 5) {
      const y = bottomOf(P.pullPose(HELD, t)).y;
      expect(y, `t=${t}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
    expect(bottomOf(P.pullPose(HELD, P.HOLD_START)).y).toBeGreaterThan(G.TUBE_H);
  });

  it('一口氣拿起來：籤頭速度只有一個峰，中間不歸零、不往回走', () => {
    const vs: number[] = [];
    for (let t = 8; t <= P.HOLD_START; t += 10) vs.push(tipV(t));
    const peak = vs.indexOf(Math.max(...vs));
    // 峰前只增、峰後只減（容許浮點誤差）
    for (let k = 1; k <= peak; k += 1) expect(vs[k], `k=${k}`).toBeGreaterThanOrEqual(vs[k - 1] - 1e-6);
    for (let k = peak + 1; k < vs.length; k += 1) expect(vs[k], `k=${k}`).toBeLessThanOrEqual(vs[k - 1] + 1e-6);
    for (const v of vs) expect(v).toBeGreaterThanOrEqual(0);
    // 峰落在前半段：先抽出來，再慢慢拿到面前
    expect(peak * 10).toBeLessThan(P.HOLD_START / 2);
  });

  it('籤頭最快 6 u/s；從靜止起步，每 16ms 的速度變化有上限 —— 不會一下子被扯走', () => {
    expect(Math.abs(tipV(8))).toBeLessThan(0.3);
    let prev = tipV(8);
    for (let t = 24; t <= P.PULL_END - 8; t += 16) {
      const v = tipV(t);
      expect(v, `t=${t}`).toBeLessThanOrEqual(6);
      expect(Math.abs(v - prev), `t=${t}`).toBeLessThan(0.35);
      prev = v;
    }
  });

  it('拿到面前的時候還在動（微微往上浮）、淡出開始時也還在動 —— 不凍住', () => {
    for (const t of [P.HOLD_START, (P.HOLD_START + P.PULL_DONE) / 2, P.PULL_DONE]) {
      expect(tipV(t), `t=${t}`).toBeGreaterThan(0.01);
    }
    // 但只是浮，不是再拿一次
    expect(tipY(P.PULL_END) - tipY(P.HOLD_START)).toBeLessThan(0.4);
  });

  it('拿著看的時候：直立、在筒心正上方、正面朝鏡頭', () => {
    for (let t = P.HOLD_START; t <= P.PULL_END; t += 50) {
      const p = P.pullPose(HELD, t);
      expect(p.ay).toBeGreaterThan(0.995);
      expect(Math.hypot(p.cx, p.cz)).toBeLessThan(0.05);
      expect(Math.abs(p.yaw)).toBeLessThan(0.06);
      expect(bottomOf(p).y).toBeGreaterThan(G.TUBE_H);
    }
  });

  it('拿著時輕晃是慢慢晃起來的，不是一到位就突然開始擺', () => {
    const yawV = (t: number) => (P.pullPose(HELD, t + 8).yaw - P.pullPose(HELD, t - 8).yaw) / 0.016;
    let prev = yawV(P.HOLD_START - 200);
    for (let t = P.HOLD_START - 184; t <= P.HOLD_START + 600; t += 16) {
      const v = yawV(t);
      expect(Math.abs(v - prev), `t=${t}`).toBeLessThan(0.01);
      prev = v;
    }
  });

  it('減少動畫：一步到拿著看的樣子', () => {
    const a = P.pullPose(HELD, 0, true);
    const b = P.pullPose(HELD, P.HOLD_START);
    expect(a.cy).toBeCloseTo(b.cy, 6);
  });

  it('旁邊的籤被帶得跳一下再落回：只有附近的、只在它還在筒裡的時候、幅度有限', () => {
    const mid = (P.SLIDE_AT + P.CLEAR_AT) / 2;
    expect(P.neighborNudge(0.5, 0)).toBe(0);
    expect(P.neighborNudge(0.5, mid)).toBeGreaterThan(0);
    expect(P.neighborNudge(0.5, mid)).toBeLessThan(0.5);
    expect(P.neighborNudge(10, mid)).toBe(0);
    expect(P.neighborNudge(0.5, P.CLEAR_AT + 1)).toBe(0);
    // 從 0 長起、落回 0，不會啪一下跳上去
    expect(P.neighborNudge(0.5, P.SLIDE_AT + 16)).toBeLessThan(0.05);
    expect(P.neighborNudge(0.5, P.CLEAR_AT - 16)).toBeLessThan(0.05);
  });

  it('被帶動那段就是它穿過筒口那段', () => {
    expect(bottomOf(P.pullPose(HELD, P.CLEAR_AT - 5)).y).toBeLessThan(G.TUBE_H);
    expect(bottomOf(P.pullPose(HELD, P.CLEAR_AT + 5)).y).toBeGreaterThanOrEqual(G.TUBE_H);
    expect(P.SLIDE_AT).toBeLessThan(P.CLEAR_AT);
  });

  it('壞掉的時間不會算出 NaN', () => {
    for (const t of [NaN, -5, Infinity, -Infinity]) {
      const p = P.pullPose(HELD, t);
      for (const v of [p.cx, p.cy, p.cz, p.ax, p.ay, p.az, p.yaw]) expect(Number.isFinite(v)).toBe(true);
      expect(Number.isFinite(P.neighborNudge(0.5, t))).toBe(true);
      expect(Number.isFinite(P.numberFade(t))).toBe(true);
    }
  });
});

describe('號碼淡入，不是硬切換', () => {
  it('出現前是 0、之後單調變清楚、歷時至少 200ms', () => {
    let prev = 0;
    let full = Infinity;
    for (let t = 0; t <= P.PULL_END; t += 5) {
      const o = P.numberFade(t);
      if (t < P.NUMBER_AT) expect(o, `t=${t}`).toBe(0);
      expect(o, `t=${t}`).toBeGreaterThanOrEqual(prev);
      expect(o).toBeLessThanOrEqual(1);
      if (o >= 1 && full === Infinity) full = t;
      prev = o;
    }
    expect(full - P.NUMBER_AT).toBeGreaterThanOrEqual(200);
    // 拿到面前時已經完全清楚
    expect(full).toBeLessThanOrEqual(P.HOLD_START);
  });

  it('一過 NUMBER_AT 就看得到一點 —— 鈴聲那一格不會是空的', () => {
    expect(P.numberFade(P.NUMBER_AT + 16)).toBeGreaterThan(0.05);
  });

  it('淡入發生在轉正的途中（籤已經離開筒口，正在收向筒心）', () => {
    const p = P.pullPose(HELD, P.NUMBER_AT);
    expect(bottomOf(p).y).toBeGreaterThan(G.TUBE_H);
    expect(p.cz).toBeLessThan(HELD.z);
    expect(p.cz).toBeGreaterThan(0.05);
  });

  it('減少動畫：一開始就是清楚的', () => {
    expect(P.numberFade(0, true)).toBe(1);
  });
});

describe('其他籤在放手之後慢慢歇下來', () => {
  const run = (y0: number, vy0: number, secs: number, dt = 1 / 60) => {
    const m = { y: y0, vy: vy0 };
    const ys: number[] = [];
    for (let t = 0; t < secs - 1e-9; t += dt) {
      B.settleStep(m, dt);
      ys.push(m.y);
    }
    return { m, ys };
  };

  it('約半秒歇下來 —— 不是一下子掉回去（舊版 0.17 秒就停）', () => {
    expect(run(0.4, 0, 0.15).m.y).toBeGreaterThan(0.4 * 0.4);
    expect(run(0.4, 0, 0.8).m.y).toBeLessThan(0.4 * 0.05);
  });

  it('從靜止開始歇：只往下、不回彈、不穿筒底', () => {
    let prev = Infinity;
    for (const y of run(0.4, 0, 2).ys) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(prev + 1e-12);
      prev = y;
    }
  });

  it('放手時還在往下衝也不穿筒底', () => {
    for (const y of run(0.1, -4, 2).ys) expect(y).toBeGreaterThanOrEqual(0);
  });

  it('跟幀率無關：16ms 一格跟 50ms 一格走到同一個地方', () => {
    const a = run(0.4, 0.5, 0.6, 0.016).m.y;
    const b = run(0.4, 0.5, 0.6, 0.05).m.y;
    expect(Math.abs(a - b)).toBeLessThan(0.01);
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

  it('號碼那一聲落在號碼開始淡入的同一格 —— 這就是「聲音跟畫面對齊」', () => {
    for (const dt of [16, 33, 50]) {
      const reveal = run(() => dt).find(([c]) => c === 'reveal')!;
      // 組件在 ms >= NUMBER_AT 的第一格開始淡入；聲音也必須是那一格
      expect(reveal[1]).toBeGreaterThanOrEqual(P.NUMBER_AT);
      expect(reveal[1]).toBeLessThan(P.NUMBER_AT + dt);
      expect(P.numberFade(reveal[1] - dt)).toBe(0);
    }
  });

  it('抽出那一聲在籤真的開始往上滑的那一格', () => {
    const slide = run(() => 16).find(([c]) => c === 'slide')!;
    expect(slide[1]).toBeGreaterThanOrEqual(P.SLIDE_AT);
    expect(slide[1]).toBeLessThan(P.SLIDE_AT + 16);
    expect(tipV(P.SLIDE_AT)).toBeGreaterThan(0.5);
  });

  it('減少動畫：直接到結果，只響號碼那一聲', () => {
    expect(run(() => 16, true).map(([c]) => c)).toEqual(['reveal']);
  });
});
