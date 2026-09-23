import { describe, expect, it } from 'vitest';
import * as F from '../src/shared/cylinder/framing';
import * as G from '../src/shared/cylinder/geometry';
import * as P from '../src/shared/cylinder/pull';

const LANDSCAPE = 4 / 3;
const PORTRAIT = 3 / 4;
/** 使用者实际会遇到的各种画布：手机直式、方的、宽萤幕拉扁的。 */
const ASPECTS = [0.5, 0.6, PORTRAIT, 0.9, 1, 1.1, LANDSCAPE, 1.5, 1.8, 2.2, 3];

/**
 * 待機時畫面裡真正有東西的點 —— **獨立重算一次**，不從 framing 拿。
 *
 * 杯身取外緣一圈（含領子那 5.5%），籤取每一支的籤尖與籤頭圓盤四周。
 * 全部換成世界座標：籤筒站正、不轉，原點在 (RIG_X, RIG_Y, 0)。
 */
const idleContent = (): Array<[number, number, number]> => {
  const pts: Array<[number, number, number]> = [];
  for (let k = 0; k < 72; k += 1) {
    const th = (k / 72) * Math.PI * 2;
    const r = G.cupRadius(th) * 1.055;
    for (const y of [0, G.TUBE_H]) pts.push([G.RIG_X + Math.cos(th) * r, G.RIG_Y + y, Math.sin(th) * r]);
  }
  for (let i = 0; i < G.STICK_COUNT; i += 1) {
    const p = G.stickPose(G.bundleSlot(i));
    const hc = G.STICK_LEN / 2 + G.STICK_HEAD_GAP;
    const hx = p.cx + p.ax * hc, hy = p.cy + p.ay * hc, hz = p.cz + p.az * hc;
    pts.push([G.RIG_X + p.cx + p.ax * G.STICK_TIP, G.RIG_Y + p.cy + p.ay * G.STICK_TIP, p.cz + p.az * G.STICK_TIP]);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const R = G.STICK_HEAD_R;
      pts.push([G.RIG_X + hx + dx * R, G.RIG_Y + hy + dy * R, hz + dz * R]);
    }
  }
  return pts;
};

const idleFrame = (a: number) => {
  const cam: V3 = [0, F.IDLE_LOOK_Y, F.idleCameraZ(a)];
  const look: V3 = [0, F.IDLE_LOOK_Y, 0];
  return idleContent().map((p) => project(p as V3, cam, look, [0, 1, 0], a));
};

describe('待机镜头该站多远', () => {
  it('任何長寬比，整支籤筒連籤頭都在畫面裡，四邊留一成白 —— **含透視**', () => {
    // 上一輪量到下緣只剩 2%：舊算法拿世界尺寸去比樞軸那個距離的視野，
    // 忘了杯身正面比樞軸更靠近鏡頭，投影出來會更大
    for (const a of ASPECTS) {
      for (const q of idleFrame(a)) {
        expect(q.depth).toBeGreaterThan(0);
        expect(Math.abs(q.y), `aspect ${a} 縱向`).toBeLessThanOrEqual(1 / F.MARGIN + 1e-9);
        expect(Math.abs(q.x), `aspect ${a} 橫向`).toBeLessThanOrEqual(1 / F.MARGIN + 1e-9);
      }
    }
  });

  it('寬畫布上籤筒要撐滿畫面高度 —— 螢幕空間大，籤筒就要大', () => {
    for (const a of [LANDSCAPE, 1.5, 1.8, 2.2]) {
      const ys = idleFrame(a).map((q) => q.y);
      expect(Math.max(...ys) - Math.min(...ys), `aspect ${a}`).toBeGreaterThan(1.7);
    }
  });

  it('竖屏要退得比宽画布远，不然两侧的籤会被切掉', () => {
    expect(F.idleCameraZ(0.5)).toBeGreaterThan(F.idleCameraZ(LANDSCAPE));
  });

  it('画布越窄，镜头只会越远，不会反过来', () => {
    let prev = Infinity;
    for (let a = 0.4; a <= 3; a += 0.05) {
      const z = F.idleCameraZ(a);
      expect(z).toBeLessThanOrEqual(prev + 1e-9);
      prev = z;
    }
  });

  it('极端或坏掉的长宽比不会算出 NaN / 无穷大 / 负距离', () => {
    for (const a of [0, 0.01, 100, -3, NaN, Infinity]) {
      const z = F.idleCameraZ(a);
      expect(Number.isFinite(z)).toBe(true);
      expect(z).toBeGreaterThan(0);
      expect(z).toBeLessThan(140);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 * 出籤鏡頭
 * ────────────────────────────────────────────────────────────────────────── */

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * 把一个世界点投影到 NDC —— **独立重算一次**，不从 framing 拿任何中间量。
 *
 * 用的是 three.js lookAt 的那组基：z 轴朝后、x = up × z、y = z × x。framing 只给
 * 镜头站哪、看哪、哪边朝上；这里从那三个量自己把画面算出来，framing 算错才会红。
 */
const project = (
  p: V3,
  cam: V3,
  look: V3,
  up: V3,
  aspect: number,
): { x: number; y: number; depth: number } => {
  const zAxis = norm(sub(cam, look));
  const xAxis = norm(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);
  const v = sub(p, cam);
  const depth = -dot(v, zAxis);
  const t = Math.tan((F.FOV_DEG / 2) * (Math.PI / 180));
  return { x: dot(v, xAxis) / (depth * t * aspect), y: dot(v, yAxis) / (depth * t), depth };
};

describe('拿著看那一鏡：框住籤頭到號碼', () => {
  // 拿著的姿態是輸入，不是答案：從 pull 拿姿態，畫面自己算。近拍是**最後**那一格的樣子
  // （拿著時還在微微往上浮，鏡頭也還在慢慢推近）
  const hold = P.pullPose(G.bundleSlot(G.PULL_INDEX), P.PULL_END);
  const world = (x: number, y: number, z: number): V3 => [G.RIG_X + x, G.RIG_Y + y, z];
  const bodyTop = hold.cy + G.STICK_LEN / 2;
  const headC = hold.cy + G.STICK_LEN / 2 + G.STICK_HEAD_GAP;
  const bandBottom = bodyTop - F.CLOSE_UP_BODY * G.STICK_LEN;
  const subject: V3[] = [
    world(hold.cx, hold.cy + G.STICK_TIP, hold.cz),
    world(hold.cx - G.STICK_HEAD_R, headC, hold.cz + G.STICK_T / 2),
    world(hold.cx + G.STICK_HEAD_R, headC, hold.cz + G.STICK_T / 2),
    world(hold.cx - G.STICK_W / 2, bandBottom, hold.cz + G.STICK_T / 2),
    world(hold.cx + G.STICK_W / 2, bandBottom, hold.cz + G.STICK_T / 2),
  ];
  const frame = (a: number) => {
    const s = F.closeUpShot(a);
    const cam: V3 = [0, s.camY, s.camZ];
    const look: V3 = [0, s.lookY, 0];
    return (p: V3) => project(p, cam, look, [0, 1, 0], a);
  };

  it('籤頭到號碼（含下面的小圖案）整段都在畫面裡，四邊留一成白', () => {
    for (const a of ASPECTS) {
      const see = frame(a);
      for (const p of subject) {
        const q = see(p);
        expect(q.depth).toBeGreaterThan(0);
        expect(Math.abs(q.y), `aspect ${a}`).toBeLessThanOrEqual(1 / F.MARGIN + 1e-9);
        expect(Math.abs(q.x), `aspect ${a}`).toBeLessThanOrEqual(1 / F.MARGIN + 1e-9);
      }
    }
  });

  it('寬畫布上那一段要撐滿畫面高度 —— 推近就是要看清楚', () => {
    for (const a of [1, LANDSCAPE, 1.8]) {
      const ys = subject.map((p) => frame(a)(p).y);
      expect(Math.max(...ys) - Math.min(...ys), `aspect ${a}`).toBeGreaterThan(1.5);
    }
  });

  it('杯身和其他籤頭都不在這一鏡裡 —— 畫面上只剩拿在手上的那支', () => {
    for (const a of ASPECTS) {
      const see = frame(a);
      for (let k = 0; k < 36; k += 1) {
        const th = (k / 36) * Math.PI * 2;
        const r = G.cupRadius(th) * 1.055;
        expect(see(world(Math.cos(th) * r, G.TUBE_H, Math.sin(th) * r)).y).toBeLessThan(-1);
      }
      for (let i = 0; i < G.STICK_COUNT; i += 1) {
        if (i === G.PULL_INDEX) continue;
        const p = G.stickPose(G.bundleSlot(i));
        const top = world(p.cx + p.ax * G.STICK_TIP, p.cy + p.ay * G.STICK_TIP, p.cz + p.az * G.STICK_TIP);
        expect(see(top).y, `stick ${i}`).toBeLessThan(-1);
      }
    }
  });
});

describe('拿籤全程的鏡頭：視線跟著籤、推近慢一拍', () => {
  const slot = G.bundleSlot(G.PULL_INDEX);
  const tipAt = (ms: number): V3 => {
    const p = P.pullPose(slot, ms);
    return [G.RIG_X + p.cx + p.ax * G.STICK_TIP, G.RIG_Y + p.cy + p.ay * G.STICK_TIP, p.cz + p.az * G.STICK_TIP];
  };
  /** 鏡頭某個分量的速度（u/s），中央差分 ±8ms。 */
  const speed = (a: number, ms: number, k: 'camZ' | 'lookY') =>
    (F.pullCamera(ms + 8, a)[k] - F.pullCamera(ms - 8, a)[k]) / 0.016;

  it('被拿起來那支的籤頭，任何時刻都在畫面裡 —— 以前它往上衝出畫面頂端、鏡頭才追上去', () => {
    for (const a of ASPECTS) {
      for (let ms = 0; ms <= P.PULL_END; ms += 20) {
        const c = F.pullCamera(ms, a);
        const q = project(tipAt(ms), [0, c.camY, c.camZ], [0, c.lookY, 0], [0, 1, 0], a);
        expect(q.depth).toBeGreaterThan(0);
        expect(q.y, `aspect ${a} t=${ms}`).toBeLessThanOrEqual(1 / F.MARGIN + 1e-9);
        expect(q.y, `aspect ${a} t=${ms}`).toBeGreaterThan(0);
      }
    }
  });

  it('起點是待機鏡頭、最後就是近拍 —— 中間沒有跳接', () => {
    for (const a of [0.75, 1, 1.7]) {
      const c0 = F.pullCamera(0, a);
      expect(c0.camZ).toBeCloseTo(F.idleCameraZ(a), 6);
      expect(c0.lookY).toBeCloseTo(F.IDLE_LOOK_Y, 6);
      const cu = F.closeUpShot(a);
      const c1 = F.pullCamera(P.PULL_END, a);
      expect(c1.camZ).toBeCloseTo(cu.camZ, 6);
      expect(c1.lookY).toBeCloseTo(cu.lookY, 6);
    }
  });

  it('拿到面前時已經推了大半，拿著看的那兩秒還在極慢地推近 —— 不凍住', () => {
    for (const a of [0.75, 1.7]) {
      const idle = F.idleCameraZ(a);
      const cu = F.closeUpShot(a).camZ;
      const at = (ms: number) => (idle - F.pullCamera(ms, a).camZ) / (idle - cu);
      expect(at(P.HOLD_START)).toBeGreaterThan(0.75);
      for (const ms of [P.HOLD_START, P.PULL_DONE]) expect(-speed(a, ms, 'camZ'), `t=${ms}`).toBeGreaterThan(0.01);
      // 極慢：拿著看的時候比推近最快時慢得多
      expect(-speed(a, P.HOLD_START + 300, 'camZ')).toBeLessThan(3);
    }
  });

  it('推近慢一拍：籤頭先動，鏡頭後推；推近最快 15 u/s', () => {
    for (const a of [0.75, 1, 1.7]) {
      let zPeakAt = 0;
      let zPeak = 0;
      let tipPeakAt = 0;
      let tipPeak = 0;
      for (let ms = 8; ms <= P.PULL_END - 8; ms += 10) {
        const vz = -speed(a, ms, 'camZ');
        if (vz > zPeak) [zPeak, zPeakAt] = [vz, ms];
        const vt = (tipAt(ms + 8)[1] - tipAt(ms - 8)[1]) / 0.016;
        if (vt > tipPeak) [tipPeak, tipPeakAt] = [vt, ms];
      }
      expect(zPeak).toBeLessThanOrEqual(15);
      expect(zPeakAt).toBeGreaterThan(tipPeakAt);
      // 放手那一刻鏡頭幾乎不動
      expect(-speed(a, 8, 'camZ')).toBeLessThan(0.5);
    }
  });

  it('鏡頭的每個分量都是一口氣：速度單峰、每 16ms 的變化有上限', () => {
    for (const a of [0.75, 1.7]) {
      for (const k of ['camZ', 'lookY'] as const) {
        const vs: number[] = [];
        for (let ms = 8; ms <= P.PULL_END - 8; ms += 16) vs.push(Math.abs(speed(a, ms, k)));
        const peak = vs.indexOf(Math.max(...vs));
        for (let i = 1; i <= peak; i += 1) expect(vs[i], `${k} i=${i}`).toBeGreaterThanOrEqual(vs[i - 1] - 1e-3);
        for (let i = peak + 1; i < vs.length; i += 1) expect(vs[i], `${k} i=${i}`).toBeLessThanOrEqual(vs[i - 1] + 1e-3);
        for (let i = 1; i < vs.length; i += 1) expect(Math.abs(vs[i] - vs[i - 1]), `${k} i=${i}`).toBeLessThan(0.6);
      }
    }
  });

  it('鏡頭只往上、往前，不會回頭', () => {
    for (const a of [0.75, 1.7]) {
      let prev = F.pullCamera(0, a);
      for (let ms = 10; ms <= P.PULL_END; ms += 10) {
        const c = F.pullCamera(ms, a);
        expect(c.lookY).toBeGreaterThanOrEqual(prev.lookY - 1e-9);
        expect(c.camZ).toBeLessThanOrEqual(prev.camZ + 1e-9);
        prev = c;
      }
    }
  });

  it('減少動畫：直接是近拍', () => {
    const c = F.pullCamera(0, 1.5, true);
    expect(c.camZ).toBeCloseTo(F.closeUpShot(1.5).camZ, 6);
  });
});
