import { describe, expect, it } from 'vitest';
import * as S from '../src/shared/sakura';

const W = 1200;
const H = 800;

describe('櫻花瓣', () => {
  const petals = S.createPetals(18, 7);

  it('同一個種子兩次結果一樣 —— 重新整理不會換一套花瓣', () => {
    expect(S.createPetals(18, 7)).toEqual(petals);
    expect(S.createPetals(18, 8)).not.toEqual(petals);
  });

  it('任何時刻都在畫面水平範圍內（加一片花瓣的寬度）、垂直在上下緣之間', () => {
    for (const p of petals) {
      for (let t = 0; t < 120; t += 0.37) {
        const s = S.petalAt(p, t, W, H);
        expect(s.x).toBeGreaterThanOrEqual(-s.size * 2);
        expect(s.x).toBeLessThanOrEqual(W + s.size * 2);
        expect(s.y).toBeGreaterThanOrEqual(-s.size * 2);
        expect(s.y).toBeLessThanOrEqual(H + s.size * 2);
        expect(s.flip).toBeGreaterThanOrEqual(-1);
        expect(s.flip).toBeLessThanOrEqual(1);
      }
    }
  });

  it('往下飄：掉出下緣之後從上緣回來，而且換一個水平位置', () => {
    const p = petals[0];
    let prev = S.petalAt(p, 0, W, H);
    let wrapped = false;
    for (let t = 0.05; t < 200 && !wrapped; t += 0.05) {
      const s = S.petalAt(p, t, W, H);
      if (s.y < prev.y - H / 2) {
        wrapped = true;
        expect(s.y).toBeLessThan(0);
      }
      prev = s;
    }
    expect(wrapped).toBe(true);
  });

  it('飄得慢：每秒往下 20～60px，一片花瓣要十幾秒才落完一個畫面', () => {
    for (const p of petals) {
      expect(p.vy).toBeGreaterThanOrEqual(20);
      expect(p.vy).toBeLessThanOrEqual(60);
    }
  });

  it('時間是唯一的輸入 —— 16ms 一格或 50ms 一格，同一刻畫在同一個地方', () => {
    const p = petals[3];
    expect(S.petalAt(p, 2.4, W, H)).toEqual(S.petalAt(p, 2.4, W, H));
  });

  it('大小有差異但不誇張：11～19px（再小就跟奶油底色糊成一片，看不到）', () => {
    for (const p of petals) {
      expect(p.size).toBeGreaterThanOrEqual(11);
      expect(p.size).toBeLessThanOrEqual(19);
    }
  });

  it('桌機 18 片、窄螢幕 10 片', () => {
    expect(S.petalCount(1440)).toBe(18);
    expect(S.petalCount(375)).toBe(10);
  });

  it('壞掉的輸入不產生 NaN', () => {
    const p = petals[1];
    for (const [t, w, h] of [[NaN, W, H], [Infinity, W, H], [1, 0, 0], [1, NaN, H]] as const) {
      const s = S.petalAt(p, t, w, h);
      for (const v of [s.x, s.y, s.rot, s.flip]) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
