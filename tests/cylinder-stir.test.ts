import { describe, expect, it } from 'vitest';
import * as S from '../src/shared/cylinder/stir';

const DT = 1 / 60;

/** 手繞圈：半徑 r px、每秒 hz 圈。回傳這一幀的位移。 */
const circle = (t: number, r = 60, hz = 1.5): [number, number] => {
  const a = 2 * Math.PI * hz * t;
  const b = 2 * Math.PI * hz * (t + DT);
  return [r * (Math.cos(b) - Math.cos(a)), r * (Math.sin(b) - Math.sin(a))];
};

/** 籤扇在畫面上多寬（px）—— 手機上實測約 145、桌機約 180。 */
const FAN = 160;

/** 攪 secs 秒；armed 決定這一局記不記帳。 */
const stir = (s: S.StirState, secs: number, armed = true, r = 60, hz = 1.5) => {
  for (let t = 0; t < secs; t += DT) {
    const [dx, dy] = circle(t, r, hz);
    S.pushStir(s, dx, dy, DT, armed, FAN);
    S.stepStir(s, DT, true);
  }
};

/** 一直攪到夠了，回傳花了幾秒（攪 20 秒還不夠就回傳 Infinity）。 */
const timeToDone = (r: number, hz: number, fan = FAN, frameDt = DT): number => {
  const s = S.createStir();
  for (let t = 0; t < 20; t += frameDt) {
    const a = 2 * Math.PI * hz * t;
    const b = 2 * Math.PI * hz * (t + frameDt);
    S.pushStir(s, r * (Math.cos(b) - Math.cos(a)), r * (Math.sin(b) - Math.sin(a)), frameDt, true, fan);
    S.stepStir(s, frameDt, true);
    if (S.stirDone(s)) return t + frameDt;
  }
  return Infinity;
};

describe('攪：手 → 籤束', () => {
  it('真的攪了一下就算數 —— 攪多久由使用者決定，不是限時任務（正常力道約 0.5～1.2 秒）', () => {
    const t = timeToDone(60, 1.5);
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(1.2);
  });

  it('慢慢攪也抽得出來：算的是手繞了多遠，不是多快 —— 繞一圈左右就夠', () => {
    // 手機上手指在籤上溫柔地小圈攪（半徑 40px、兩秒一圈，約 126px/s）。
    // 以前看手速：這樣要攪 3.5 秒以上，很多人攪到一半就放手，看起來像抽不出來
    const circles = timeToDone(40, 0.5) * 0.5;
    expect(circles).toBeLessThan(1.4);
    expect(circles).toBeGreaterThan(0.8);
  });

  it('繞幾圈才夠跟著籤扇在畫面上多大走 —— 手機小畫面不必比桌機多繞', () => {
    // 同樣繞籤扇半寬的圈：手機（籤扇 145px）和桌機（180px）要的圈數一樣
    const phone = timeToDone(145 * 0.35, 1, 145);
    const desk = timeToDone(180 * 0.35, 1, 180);
    expect(Math.abs(phone - desk)).toBeLessThan(0.05);
  });

  it('大螢幕上籤筒畫得再大，也不用繞更大的圈 —— 手還是那麼大', () => {
    const huge = timeToDone(40, 0.5, 460);
    const normal = timeToDone(40, 0.5, S.FAN_PX_MAX);
    expect(Math.abs(huge - normal)).toBeLessThan(0.05);
  });

  it('手機跑得卡也一樣好抽：攪動量只看手指的位移，不看畫面幾格', () => {
    // 以前在每一格裡累積、每格最多只算 0.05 秒 —— 12fps 的手機要多攪好幾成
    const smooth = timeToDone(60, 1.5, FAN, 1 / 60);
    const choppy = timeToDone(60, 1.5, FAN, 1 / 12);
    expect(Math.abs(choppy - smooth)).toBeLessThan(0.15);
  });

  it('隨手甩一下（0.25 秒）不算 —— 不然碰一下就抽出去了', () => {
    const s = S.createStir();
    for (let t = 0; t < 0.25; t += DT) {
      S.pushStir(s, 12, 0, DT, true, FAN);
      S.stepStir(s, DT, true);
    }
    expect(S.stirDone(s)).toBe(false);
    // 甩完放手也不算：差太多，不給寬限
    expect(S.releaseStir(s)).toBe(false);
  });

  it('攪到快好了就放手也算 —— 別讓差一點點的人以為抽不出來', () => {
    const s = S.createStir();
    while (S.stirProgress(s) < S.RELEASE_GRACE) {
      const [dx, dy] = circle(0);
      S.pushStir(s, dx, dy, DT, true, FAN);
    }
    expect(S.stirDone(s)).toBe(false);
    expect(S.releaseStir(s)).toBe(true);
    expect(S.stirDone(s)).toBe(true);
  });

  it('還差很多就放手不算，攪過的也不會歸零 —— 再攪幾圈就好', () => {
    const s = S.createStir();
    stir(s, 0.2);
    const before = S.stirProgress(s);
    expect(S.releaseStir(s)).toBe(false);
    expect(S.stirProgress(s)).toBe(before);
  });

  it('還沒寫問題時攪的不記帳 —— 不然一寫完隨手一碰就抽出去了', () => {
    const s = S.createStir();
    stir(s, 5, false);
    expect(S.stirProgress(s)).toBe(0);
    expect(S.releaseStir(s)).toBe(false);
  });

  it('按著不動就不長', () => {
    const s = S.createStir();
    for (let t = 0; t < 5; t += DT) S.stepStir(s, DT, true);
    expect(S.stirProgress(s)).toBe(0);
  });

  it('指標一下跳很遠（切視窗、觸控誤判）不會一步就攪滿', () => {
    const s = S.createStir();
    S.pushStir(s, 5000, 0, DT, true, FAN);
    expect(S.stirProgress(s)).toBeLessThan(0.3);
  });

  it('重新上膛：攪過的全部清掉', () => {
    const s = S.createStir();
    stir(s, 2);
    S.resetStirWork(s);
    expect(S.stirProgress(s)).toBe(0);
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
      S.stepStir(s, DT, true);
    }
    // 繞 +Y 轉正角度：正面 (0, z>0) 往 +x 走
    expect(s.phi).toBeGreaterThan(0.05);
  });

  it('再怎麼攪，籤束都只轉一個有限的角度 —— 轉過頭籤頭就變側面、看不到「籤」字', () => {
    const s = S.createStir();
    for (let t = 0; t < 4; t += DT) {
      S.pushStir(s, 40, 0, DT); // 一直往同一個方向猛拉
      S.stepStir(s, DT, true);
      expect(Math.abs(s.phi)).toBeLessThanOrEqual(S.SWIRL_MAX + 1e-9);
    }
  });

  it('放手之後一秒內轉回正面、停下來', () => {
    const s = S.createStir();
    stir(s, 3);
    for (let t = 0; t < 1; t += DT) S.stepStir(s, DT, false);
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
      S.stepStir(s, DT, true);
      peak = Math.max(peak, Math.abs(s.jostle));
    }
    expect(peak).toBeGreaterThan(1);
    for (let t = 0; t < 2; t += DT) S.stepStir(s, DT, false);
    expect(Math.abs(s.jostle)).toBeLessThan(0.2);
  });

  it('壞掉的輸入不會算出 NaN', () => {
    const s = S.createStir();
    S.pushStir(s, NaN, 3, DT, true, FAN);
    S.pushStir(s, 3, Infinity, 0, true, FAN);
    S.pushStir(s, 3, 3, DT, true, NaN);
    S.stepStir(s, DT, true);
    for (const v of [s.phi, s.omega, s.intensity, s.travel, s.stirTime, s.jostle, S.stirProgress(s)]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
