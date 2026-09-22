import { describe, expect, it } from 'vitest';
import * as G from '../src/shared/cylinder/geometry';

describe('签筒比例', () => {
  it('高径比回到 1.4 左右 —— 參考圖本身約 1.5；「胖」交給杯面圖案撐滿與圓角，不是把杯子壓成罐子', () => {
    const ratio = G.TUBE_H / (2 * G.TUBE_R_OUT);
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(1.5);
  });

  it('要矮胖是靠**加粗**，不是压矮 —— 筒高是物理尺度的基准', () => {
    expect(G.TUBE_H).toBeCloseTo(6.552, 6);
  });

  it('籤比筒长，露出筒口一大截', () => {
    expect(G.STICK_LEN).toBeGreaterThan(G.TUBE_H);
    const out = G.STICK_LEN - G.TUBE_H;
    expect(out / G.STICK_LEN).toBeGreaterThan(0.38);
    expect(out / G.STICK_LEN).toBeLessThan(0.45);
  });

  it('每支籤的籤心都在筒口以下 —— 一半以上插在筒裡，看起來才是插著、不是快掉出來', () => {
    for (let i = 0; i < G.STICK_COUNT; i += 1) {
      const p = G.stickPose(G.bundleSlot(i));
      expect(p.cy).toBeLessThan(G.TUBE_H);
    }
  });

  it('籤身的小圖案整個露在筒口上面 —— 參考圖每支都看得到，v3 第一版被筒口吃掉一半', () => {
    // 小圖案畫在籤身頂端往下 33.5% 那一行，再往下留半個圖案高
    for (let i = 0; i < G.STICK_COUNT; i += 1) {
      const s = G.bundleSlot(i);
      const p = G.stickPose(s);
      const iconBottom = p.cy + p.ay * (G.STICK_LEN / 2 - 0.36 * G.STICK_LEN);
      expect(iconBottom, `第 ${i + 1} 支`).toBeGreaterThan(G.TUBE_H + 0.15);
    }
  });
});

describe('籤束排布：參考圖那種整齊的扇形，前後三排', () => {
  const slots = Array.from({ length: G.STICK_COUNT }, (_, i) => G.bundleSlot(i));

  it('20 支上下，比參考圖多，但排得整齊', () => {
    expect(G.STICK_COUNT).toBeGreaterThanOrEqual(18);
    expect(G.STICK_COUNT).toBeLessThanOrEqual(24);
  });

  it('全部靠在筒口內側，一支都不穿出筒壁', () => {
    for (const [i, s] of slots.entries()) {
      expect(Math.hypot(s.x, s.z) + G.STICK_HALF_DIAG, `第 ${i + 1} 支`).toBeLessThanOrEqual(G.TUBE_R_IN);
    }
  });

  it('分成前、中、後三排，越後面的越高 —— 後排的籤頭才從前排的縫裡探出來', () => {
    const rows = [...new Set(slots.map((s) => s.row))].sort();
    expect(rows).toEqual([0, 1, 2]);
    const avg = (r: number, f: (s: G.BundleSlot) => number) => {
      const xs = slots.filter((s) => s.row === r).map(f);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(avg(0, (s) => s.z)).toBeGreaterThan(avg(1, (s) => s.z));
    expect(avg(1, (s) => s.z)).toBeGreaterThan(avg(2, (s) => s.z));
    expect(avg(1, (s) => s.rest)).toBeGreaterThan(avg(0, (s) => s.rest));
    expect(avg(2, (s) => s.rest)).toBeGreaterThan(avg(1, (s) => s.rest));
  });

  it('相鄰兩排左右錯開半格 —— 對齊的話後排整支被前排擋掉', () => {
    const xs = (r: number) => slots.filter((s) => s.row === r).map((s) => s.x).sort((a, b) => a - b);
    const front = xs(0);
    for (const x of xs(1)) {
      const nearest = Math.min(...front.map((f) => Math.abs(f - x)));
      expect(nearest).toBeGreaterThan(0.15);
    }
  });

  it('同一排左右對稱 —— 參考圖的扇形是對稱的', () => {
    for (const r of [0, 1, 2]) {
      const xs = slots.filter((s) => s.row === r).map((s) => s.x);
      expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
    }
  });

  it('排布是确定性的 —— 同一支籤每次都站在同一个地方', () => {
    for (const i of [0, 7, 13, G.STICK_COUNT - 1]) expect(G.bundleSlot(i)).toEqual(G.bundleSlot(i));
  });
});

describe('杯身貼圖照**弧長**鋪，不是照角度', () => {
  it('從背面起算：正後方 0、正前方 0.5、繞一圈回到 1', () => {
    expect(G.cupArcU(-Math.PI / 2)).toBeCloseTo(0, 9);
    expect(G.cupArcU(Math.PI / 2)).toBeCloseTo(0.5, 9);
    expect(G.cupArcU((3 * Math.PI) / 2)).toBeCloseTo(1, 9);
  });

  it('每一小段杯壁分到的貼圖寬度跟它的實際長度成正比 —— 字才不會越靠邊越扁', () => {
    // 獨立重算：直接量相鄰兩點的弦長
    const N = 720;
    for (let k = 0; k < N; k += 1) {
      const a = -Math.PI / 2 + (k / N) * Math.PI * 2;
      const b = -Math.PI / 2 + ((k + 1) / N) * Math.PI * 2;
      const pa = [Math.cos(a) * G.cupRadius(a), Math.sin(a) * G.cupRadius(a)];
      const pb = [Math.cos(b) * G.cupRadius(b), Math.sin(b) * G.cupRadius(b)];
      const chord = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      expect((G.cupArcU(b) - G.cupArcU(a)) * G.CUP_PERIMETER).toBeCloseTo(chord, 3);
    }
  });

  it('正面那一片的半寬落在方角之內', () => {
    expect(G.CUP_FACE_HALF).toBeGreaterThan(G.TUBE_R_OUT * 0.6);
    expect(G.CUP_FACE_HALF).toBeLessThan(G.CUP_R_MAX);
  });
});
describe('籤束像一把花束：靠在筒口上、上端往外散開', () => {
  const poses = Array.from({ length: G.STICK_COUNT }, (_, i) => {
    const s = G.bundleSlot(i);
    return { s, p: G.stickPose(s) };
  });

  it('籤軸是單位向量，而且大致朝上', () => {
    for (const { p } of poses) {
      expect(Math.hypot(p.ax, p.ay, p.az)).toBeCloseTo(1, 9);
      // 扇形開到 24°、後排再往後傾 0.1：最外那支約 30°（cos ≈ 0.87）。再斜就不是插著、是倒著了
      expect(p.ay).toBeGreaterThan(0.85);
    }
  });

  it('從籤底到筒口，每一支都不穿出內壁、不穿過筒底', () => {
    // 獨立重算：沿籤軸從籤底走到筒口高度，逐點量離筒軸多遠
    for (const { s, p } of poses) {
      const bottomY = p.cy - p.ay * (G.STICK_LEN / 2);
      expect(bottomY).toBeGreaterThanOrEqual(-1e-9);
      for (let k = 0; k <= 20; k += 1) {
        const y = bottomY + ((G.TUBE_H - bottomY) * k) / 20;
        const u = (y - p.cy) / p.ay;
        const x = p.cx + p.ax * u;
        const z = p.cz + p.az * u;
        expect(Math.hypot(x, z), `slot rest=${s.rest.toFixed(2)}`).toBeLessThanOrEqual(G.BUNDLE_R + 1e-9);
      }
    }
  });

  it('外圈的籤明顯往外傾、中心的幾乎直立 —— 這才散得開', () => {
    const lean = (p: { ax: number; ay: number; az: number }) => Math.acos(p.ay);
    const radial = ({ s, p }: (typeof poses)[number]) => {
      const r = Math.hypot(s.x, s.z);
      return r < 1e-9 ? 0 : (p.ax * s.x + p.az * s.z) / r;
    };
    const outer = poses.filter(({ s }) => Math.hypot(s.x, s.z) > G.BUNDLE_R * 0.85);
    const inner = poses.filter(({ s }) => Math.hypot(s.x, s.z) < G.BUNDLE_R * 0.25);
    expect(outer.length).toBeGreaterThan(0);
    expect(inner.length).toBeGreaterThan(0);
    for (const o of outer) {
      expect(lean(o.p)).toBeGreaterThan(0.25);
      expect(radial(o)).toBeGreaterThan(0); // 往外，不是往內
    }
    for (const n of inner) expect(lean(n.p)).toBeLessThan(0.1);
  });

  it('籤頭大致朝著鏡頭 —— 參考圖的籤頭全是正面，「籤」字才看得到', () => {
    for (const { s } of poses) expect(Math.abs(s.yaw)).toBeLessThanOrEqual(0.4);
  });
});

describe('籤跟籤不穿插 —— 前排中間那支曾被兩旁往前倒的籤「切斷」，露出一截平頂的方塊', () => {
  const all = Array.from({ length: G.STICK_COUNT }, (_, i) => {
    const s = G.bundleSlot(i);
    return { i, s, p: G.stickPose(s) };
  });
  /** 籤身在高度 y 時的籤心座標（沿籤軸，獨立重算）。 */
  const at = (p: G.StickPose, y: number) => {
    const u = (y - p.cy) / p.ay;
    return { x: p.cx + p.ax * u, z: p.cz + p.az * u };
  };
  const tipY = (p: G.StickPose) => p.cy + p.ay * (G.STICK_LEN / 2);

  it('沒有一支籤往鏡頭那邊倒 —— 往前倒就會從前面那支的身上穿過去', () => {
    for (const { i, p } of all) expect(p.az, `第 ${i + 1} 支`).toBeLessThanOrEqual(1e-9);
  });

  it('同一排相鄰兩支：筒口以上前後順序從頭到尾不變（順序一翻就是穿過去了）', () => {
    for (const a of all) {
      for (const b of all) {
        if (a.i >= b.i || a.s.row !== b.s.row) continue;
        const top = Math.min(tipY(a.p), tipY(b.p));
        let sign = 0;
        for (let k = 0; k <= 16; k += 1) {
          const y = G.TUBE_H + ((top - G.TUBE_H) * k) / 16;
          const pa = at(a.p, y);
          const pb = at(b.p, y);
          // 只看左右有重疊的那一段 —— 沒重疊的地方前後順序無所謂
          if (Math.abs(pa.x - pb.x) >= G.STICK_W) continue;
          const d = Math.sign(pa.z - pb.z);
          expect(d, `第 ${a.i + 1} 與第 ${b.i + 1} 支疊在同一個深度`).not.toBe(0);
          if (sign === 0) sign = d;
          expect(d, `第 ${a.i + 1} 與第 ${b.i + 1} 支在 y=${y.toFixed(2)} 穿過彼此`).toBe(sign);
        }
      }
    }
  });

  it('前、中、後三排在筒口以上各自待在自己的深度，連籤厚都算進去也不重疊', () => {
    const zRange = (r: number) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const { s, p } of all) {
        if (s.row !== r) continue;
        for (const y of [G.TUBE_H, tipY(p)]) {
          const z = at(p, y).z;
          lo = Math.min(lo, z - G.STICK_T);
          hi = Math.max(hi, z + G.STICK_T);
        }
      }
      return { lo, hi };
    };
    expect(zRange(0).lo).toBeGreaterThan(zRange(1).hi);
    expect(zRange(1).lo).toBeGreaterThan(zRange(2).hi);
  });

  it('同一排越靠中間越前面 —— 像手上握著一把牌', () => {
    for (const r of [0, 1, 2]) {
      const row = all.filter(({ s }) => s.row === r);
      for (const a of row) for (const b of row) {
        if (Math.abs(a.s.x) + 1e-6 < Math.abs(b.s.x)) expect(a.p.cz).toBeGreaterThan(b.p.cz);
      }
    }
  });
});
