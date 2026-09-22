import { describe, expect, it } from 'vitest';
import * as S from '../src/shared/cylinder/stir';

const DT = 1 / 60;

/** 手繞圈：半徑 r px、每秒 hz 圈。回傳這一幀的位移。 */
const circle = (t: number, r = 60, hz = 1.5): [number, number] => {
  const a = 2 * Math.PI * hz * t;
  const b = 2 * Math.PI * hz * (t + DT);
  return [r * (Math.cos(b) - Math.cos(a)), r * (Math.sin(b) - Math.sin(a))];
};

/** 攪 secs 秒；armed 決定這一局記不記帳。 */
const stir = (s: S.StirState, secs: number, armed = true, r = 60, hz = 1.5) => {
  for (let t = 0; t < secs; t += DT) {
    const [dx, dy] = circle(t, r, hz);
    S.pushStir(s, dx, dy, DT);
    S.stepStir(s, DT, true, armed);
  }
};

describe('攪：手 → 籤束', () => {
  it('繞圈攪幾秒就攢夠 —— 正常力道約 3～5 秒', () => {
    const s = S.createStir();
    let t = 0;
    while (s.work < S.STIR_WORK_NEEDED && t < 20) {
      const [dx, dy] = circle(t);
      S.pushStir(s, dx, dy, DT);
      S.stepStir(s, DT, true, true);
      t += DT;
    }
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(6);
  });

  it('還沒寫問題時攪的不記帳 —— 不然一寫完隨手一碰就抽出去了', () => {
    const s = S.createStir();
    stir(s, 5, false);
    expect(s.work).toBe(0);
  });

  it('按著不動就不長', () => {
    const s = S.createStir();
    for (let t = 0; t < 5; t += DT) S.stepStir(s, DT, true, true);
    expect(s.work).toBe(0);
  });

  it('點一下的 1px 微抖不會被當成用力攪（取樣間隔下限）', () => {
    const s = S.createStir();
    S.pushStir(s, 2, 0, 0.001);
    expect(s.intensity).toBeLessThan(0.4);
  });

  it('手往右，籤束正面也往右轉 —— 方向跟著手', () => {
    const s = S.createStir();
    for (let t = 0; t < 0.3; t += DT) {
      S.pushStir(s, 6, 0, DT);
      S.stepStir(s, DT, true, true);
    }
    // 繞 +Y 轉正角度：正面 (0, z>0) 往 +x 走
    expect(s.phi).toBeGreaterThan(0.05);
  });

  it('再怎麼攪，籤束都只轉一個有限的角度 —— 轉過頭籤頭就變側面、看不到「籤」字', () => {
    const s = S.createStir();
    for (let t = 0; t < 4; t += DT) {
      S.pushStir(s, 40, 0, DT); // 一直往同一個方向猛拉
      S.stepStir(s, DT, true, true);
      expect(Math.abs(s.phi)).toBeLessThanOrEqual(S.SWIRL_MAX + 1e-9);
    }
  });

  it('放手之後一秒內轉回正面、停下來', () => {
    const s = S.createStir();
    stir(s, 3);
    for (let t = 0; t < 1; t += DT) S.stepStir(s, DT, false, true);
    expect(Math.abs(s.phi)).toBeLessThan(0.02);
    expect(Math.abs(s.omega)).toBeLessThan(0.1);
  });

  it('攪動會讓籤上下推擠，停手就歇下來', () => {
    const s = S.createStir();
    stir(s, 2);
    let peak = 0;
    for (let t = 0; t < 1; t += DT) {
      const [dx, dy] = circle(t);
      S.pushStir(s, dx, dy, DT);
      S.stepStir(s, DT, true, true);
      peak = Math.max(peak, Math.abs(s.jostle));
    }
    expect(peak).toBeGreaterThan(1);
    for (let t = 0; t < 2; t += DT) S.stepStir(s, DT, false, true);
    expect(Math.abs(s.jostle)).toBeLessThan(0.2);
  });

  it('壞掉的輸入不會算出 NaN', () => {
    const s = S.createStir();
    S.pushStir(s, NaN, 3, DT);
    S.pushStir(s, 3, Infinity, 0);
    S.stepStir(s, DT, true, true);
    for (const v of [s.phi, s.omega, s.intensity, s.work, s.jostle]) expect(Number.isFinite(v)).toBe(true);
  });
});
