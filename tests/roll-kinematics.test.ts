import { describe, expect, it } from 'vitest';
import * as K from '../src/shared/roll/kinematics';

describe('无滑动纯滚动锁定', () => {
  it('八张卡片严丝合缝地咬住一整个周长', () => {
    expect(K.CARD_LEN * K.N).toBeCloseTo(K.TWO_PI_R, 12);
    expect(K.TWO_PI_R).toBeCloseTo(2 * Math.PI * 1.75, 12);
  });

  it('旋转角就是 -s / R', () => {
    expect(K.spinAngle(0)).toBe(-0);
    expect(K.spinAngle(K.R)).toBeCloseTo(-1, 12);
    expect(K.spinAngle(K.TWO_PI_R)).toBeCloseTo(-K.TWO_PI, 12);
  });

  it('滚筒表面被压印点咬住的那一点 u，等于纸带在压印点的 u', () => {
    for (const s of [0, 0.3, 1.7, 5.5, K.TWO_PI_R, 41.9, 137.2]) {
      // 压印瞬间贴在地面的那块材料，滚转前的角位置是 φ = -spinAngle(s)
      expect(K.barrelUAtPhi(-K.spinAngle(s))).toBeCloseTo(K.nipU(s), 12);
    }
  });

  it('滚筒环上每个顶点的 u 都由它自己的角位置算出，整圈单调不折返', () => {
    for (let j = 0; j <= K.BARREL_SEGMENTS; j += 1) {
      expect(K.barrelU(j)).toBeCloseTo(K.barrelUAtPhi(K.barrelPhi(j)), 12);
      if (j > 0) expect(K.barrelU(j)).toBeGreaterThan(K.barrelU(j - 1));
    }
    // 接缝落在滚筒顶部（φ = π），不落在压印点上
    expect(K.barrelPhi(0)).toBeCloseTo(Math.PI, 12);
    expect(K.barrelRingY(Math.PI)).toBeCloseTo(K.R, 12);
    expect(K.barrelRingY(0)).toBeCloseTo(-K.R, 12);
    expect(K.barrelRingZ(0)).toBeCloseTo(0, 12);
  });
});

describe('卡片格与定格', () => {
  it('cardIndexAt 在 0..7 之间循环，负数也不越界', () => {
    expect(K.cardIndexAt(0)).toBe(0);
    expect(K.cardIndexAt(K.CARD_LEN * 0.999)).toBe(0);
    expect(K.cardIndexAt(K.CARD_LEN * 1.001)).toBe(1);
    expect(K.cardIndexAt(K.CARD_LEN * 7.5)).toBe(7);
    expect(K.cardIndexAt(K.CARD_LEN * 8.5)).toBe(0);
    expect(K.cardIndexAt(-K.CARD_LEN * 0.5)).toBe(7);
  });

  it('slotOppositeNip 给出的是此刻转到滚筒顶上、镜头看不见的那一格', () => {
    for (const s of [0, 2.2, 9.9, 55.1]) {
      expect(K.slotOppositeNip(s)).toBe((K.cardIndexAt(s) + K.N / 2) % K.N);
    }
  });

  it('solveStopS 停下来时，指定那一格正好落在压印点后 LAND_OFFSET 处', () => {
    for (const sNow of [0, 1.3, 17.6, 204.8]) {
      for (let slot = 0; slot < K.N; slot += 1) {
        const stop = K.solveStopS(sNow, slot);
        expect(stop).toBeGreaterThanOrEqual(sNow + K.MIN_ROLL - 1e-9);
        expect(K.cardIndexAt(stop - K.LAND_OFFSET)).toBe(slot);
        // 落定的那一格，中心恰好在压印点后 LAND_OFFSET
        const centre = Math.floor((stop - K.LAND_OFFSET) / K.CARD_LEN) * K.CARD_LEN + K.CARD_LEN / 2;
        expect(stop - centre).toBeCloseTo(K.LAND_OFFSET, 9);
      }
    }
  });

  it('至少滚一圈半才停 —— 定格要看得出是有意为之', () => {
    expect(K.MIN_ROLL).toBeCloseTo(1.5 * K.TWO_PI_R, 12);
  });
});

describe('剥离微卷曲与弹簧', () => {
  it('卷曲段两端归零，峰值 CURL_LIFT 落在 q = 1/3', () => {
    expect(K.curlLift(0)).toBe(0);
    expect(K.curlLift(1)).toBe(0);
    expect(K.curlLift(1 / 3)).toBeCloseTo(K.CURL_LIFT, 12);
    for (let q = 0; q <= 1; q += 0.01) expect(K.curlLift(q)).toBeGreaterThanOrEqual(0);
    expect(K.curlLift(1.4)).toBe(0);
  });

  it('尾端斜率归零 —— 纸躺平的时候不能带折角', () => {
    expect(K.curlSlope(1)).toBe(0);
    expect(K.curlSlope(0)).toBeCloseTo(K.CURL_LIFT * 6.75, 12);
    expect(K.curlSlope(1 / 3)).toBeCloseTo(0, 12);
    expect(K.curlSlope(0.1)).toBeGreaterThan(0);
    expect(K.curlSlope(0.8)).toBeLessThan(0);
  });

  it('卷曲正好占 16 段', () => {
    expect(K.CURL_SEG).toBe(16);
    expect(K.CURL_LEN).toBeCloseTo(K.CURL_SEG * K.SEG_LEN, 12);
  });

  it('springK 就是 1 - e^(-2.6 dt)，且恒在 (0,1)', () => {
    expect(K.SPRING).toBe(2.6);
    for (const dt of [1 / 240, 1 / 60, 1 / 12]) {
      expect(K.springK(dt)).toBeCloseTo(1 - Math.exp(-2.6 * dt), 12);
      expect(K.springK(dt)).toBeGreaterThan(0);
      expect(K.springK(dt)).toBeLessThan(1);
    }
  });

  it('顶点预算写死：778 段、1558 个顶点', () => {
    expect(K.MAX_SEG).toBe(778);
    expect(K.VERTS).toBe((778 + 1) * 2);
    expect(K.VERTS).toBeLessThan(65536); // Uint16 索引装得下
  });
});

describe('纸带网格：零每帧堆分配', () => {
  const straight = (sNow: number) => {
    // 沿 -Z 笔直走，压印点在 (0, -sNow)
    const trail = K.createTrail();
    for (let s = 0; s <= sNow; s += K.SEG_LEN) K.pushTrail(trail, 0, -s, s);
    return trail;
  };

  it('索引只算一次，条数固定，装得进 Uint16', () => {
    const idx = K.createRibbonIndices();
    expect(idx).toBeInstanceOf(Uint16Array);
    expect(idx.length).toBe(K.MAX_SEG * 6);
    expect(Math.max(...idx)).toBe(K.VERTS - 1);
  });

  it('缓冲区长度写死，写多少帧都是同一批 TypedArray', () => {
    const buf = K.createRibbonBuffers();
    expect(buf.position.length).toBe(K.VERTS * 3);
    expect(buf.normal.length).toBe(K.VERTS * 3);
    expect(buf.uv.length).toBe(K.VERTS * 2);
    expect(buf.aS.length).toBe(K.VERTS);

    const before = [buf.position, buf.normal, buf.uv, buf.aS];
    const trail = straight(30);
    for (let f = 0; f < 200; f += 1) K.writeRibbon(buf, trail, 0, -30, 0, -1, 30);
    expect([buf.position, buf.normal, buf.uv, buf.aS]).toEqual(before);
    expect(buf.position.length).toBe(K.VERTS * 3);
  });

  it('pushTrail 走满一个 SEG_LEN 才落点', () => {
    const trail = K.createTrail();
    expect(K.pushTrail(trail, 0, 0, 0)).toBe(true);
    expect(K.pushTrail(trail, 0, -0.01, 0.01)).toBe(false);
    expect(trail.count).toBe(1);
    expect(K.pushTrail(trail, 0, -K.SEG_LEN, K.SEG_LEN)).toBe(true);
    expect(trail.count).toBe(2);
  });

  it('环形缓冲写满之后 count 封顶，不再增长', () => {
    const trail = K.createTrail();
    for (let i = 0; i < K.MAX_SEG * 3; i += 1) K.pushTrail(trail, 0, -i * K.SEG_LEN, i * K.SEG_LEN);
    expect(trail.count).toBe(K.MAX_SEG + 1);
  });

  it('UV 锁死在弧长上：任何一个采样点的 u 都等于它自己的 s/(2πR)', () => {
    const buf = K.createRibbonBuffers();
    const sNow = 26.4;
    K.writeRibbon(buf, straight(sNow), 0, -sNow, 0, -1, sNow);
    for (let i = 0; i <= K.MAX_SEG; i += 37) {
      const s = buf.aS[i * 2];
      expect(buf.uv[i * 2 * 2]).toBeCloseTo(s / K.TWO_PI_R, 6);
      expect(buf.aS[i * 2 + 1]).toBeCloseTo(s, 6);
      // 左右两条边共用同一个 u，只有 v 不同
      expect(buf.uv[(i * 2 + 1) * 2]).toBeCloseTo(buf.uv[i * 2 * 2], 6);
      expect(buf.uv[i * 2 * 2 + 1]).toBe(0);
      expect(buf.uv[(i * 2 + 1) * 2 + 1]).toBe(1);
    }
    // 压印点那一端的 u 就是 nipU
    expect(buf.uv[0]).toBeCloseTo(K.nipU(sNow), 6);
  });

  it('纸带宽度恒为 W，弧长沿纸带只减不增', () => {
    const buf = K.createRibbonBuffers();
    const sNow = 18.0;
    K.writeRibbon(buf, straight(sNow), 0, -sNow, 0, -1, sNow);
    for (let i = 0; i <= K.MAX_SEG; i += 53) {
      const ax = buf.position[i * 2 * 3];
      const az = buf.position[i * 2 * 3 + 2];
      const bx = buf.position[(i * 2 + 1) * 3];
      const bz = buf.position[(i * 2 + 1) * 3 + 2];
      expect(Math.hypot(ax - bx, az - bz)).toBeCloseTo(K.W, 5);
    }
    for (let i = 1; i <= K.MAX_SEG; i += 1) {
      expect(buf.aS[i * 2]).toBeLessThanOrEqual(buf.aS[(i - 1) * 2] + 1e-6);
    }
  });

  it('只有最靠近滚筒的 16 段被抬起来，其余全部躺在地面上', () => {
    const buf = K.createRibbonBuffers();
    const sNow = 22.0;
    K.writeRibbon(buf, straight(sNow), 0, -sNow, 0, -1, sNow);
    expect(buf.position[1]).toBeCloseTo(K.GROUND_Y, 6); // 压印点本身贴地
    let lifted = 0;
    for (let i = 0; i <= K.MAX_SEG; i += 1) {
      const y = buf.position[i * 2 * 3 + 1];
      expect(y).toBeGreaterThanOrEqual(K.GROUND_Y - 1e-9);
      expect(y).toBeLessThanOrEqual(K.GROUND_Y + K.CURL_LIFT + 1e-9);
      if (y > K.GROUND_Y + 1e-9) lifted += 1;
    }
    expect(lifted).toBeGreaterThan(0);
    expect(lifted).toBeLessThanOrEqual(K.CURL_SEG + 1);
  });

  it('三角形绕序和顶点法线同向 —— 反了纸带会被剔除或受光翻面', () => {
    const buf = K.createRibbonBuffers();
    const idx = K.createRibbonIndices();
    const sNow = 22.0;
    K.writeRibbon(buf, straight(sNow), 0, -sNow, 0, -1, sNow);
    const at = (v: number) => [buf.position[v * 3], buf.position[v * 3 + 1], buf.position[v * 3 + 2]];
    let checked = 0;
    for (let tri = 0; tri < K.MAX_SEG * 2; tri += 37) {
      const [i0, i1, i2] = [idx[tri * 3], idx[tri * 3 + 1], idx[tri * 3 + 2]];
      const o = at(i0);
      const e1 = at(i1).map((c, n) => c - o[n]);
      const e2 = at(i2).map((c, n) => c - o[n]);
      const face = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const area = Math.hypot(face[0], face[1], face[2]);
      if (area < 1e-9) continue; // 尾端的退化三角形没有朝向可言
      const vn = [buf.normal[i0 * 3], buf.normal[i0 * 3 + 1], buf.normal[i0 * 3 + 2]];
      const dot = face[0] * vn[0] + face[1] * vn[1] + face[2] * vn[2];
      expect(dot).toBeGreaterThan(0);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('法线沿纸带连续变化 —— 压印点那一排不能突然回正', () => {
    const buf = K.createRibbonBuffers();
    const sNow = 22.0;
    K.writeRibbon(buf, straight(sNow), 0, -sNow, 0, -1, sNow);
    const tilt = (i: number) => {
      const o = i * 2 * 3;
      return Math.atan2(Math.hypot(buf.normal[o], buf.normal[o + 2]), buf.normal[o + 1]);
    };
    // 卷曲段内相邻两排的法线夹角不许出现硬缝（10° 已经很宽松了）
    for (let i = 0; i < K.CURL_SEG; i += 1) {
      expect(Math.abs(tilt(i + 1) - tilt(i))).toBeLessThan((10 * Math.PI) / 180);
    }
    expect(tilt(0)).toBeGreaterThan(0); // 纸带着坡度离开压印点
  });

  it('法线是单位向量，躺平段朝正上方', () => {
    const buf = K.createRibbonBuffers();
    const sNow = 22.0;
    K.writeRibbon(buf, straight(sNow), 0, -sNow, 0, -1, sNow);
    for (let i = 0; i <= K.MAX_SEG; i += 61) {
      const o = i * 2 * 3;
      expect(Math.hypot(buf.normal[o], buf.normal[o + 1], buf.normal[o + 2])).toBeCloseTo(1, 6);
    }
    const far = K.MAX_SEG * 2 * 3;
    expect(buf.normal[far + 1]).toBeCloseTo(1, 6);
  });

  it('历史点不够时，多出来的顶点压在最老的那个点上（退化三角形，顶点数不变）', () => {
    const buf = K.createRibbonBuffers();
    const trail = K.createTrail();
    K.pushTrail(trail, 0, 0, 0);
    K.pushTrail(trail, 0, -K.SEG_LEN, K.SEG_LEN);
    K.pushTrail(trail, 0, -2 * K.SEG_LEN, 2 * K.SEG_LEN);
    K.writeRibbon(buf, trail, 0, -2 * K.SEG_LEN, 0, -1, 2 * K.SEG_LEN);
    const lastZ = buf.position[K.MAX_SEG * 2 * 3 + 2];
    const midZ = buf.position[400 * 2 * 3 + 2];
    expect(midZ).toBeCloseTo(lastZ, 9);
    expect(lastZ).toBeCloseTo(0, 9); // 最老的那个点就是起点
    expect(buf.position.length).toBe(K.VERTS * 3);
  });

  it('tailS 指着最远端那个还活着的采样点，起步时指着合成出来的直尾巴', () => {
    const empty = K.createTrail();
    expect(K.tailS(empty, 0)).toBeCloseTo(-K.TRAIL_LEN, 9);
    const trail = straight(40);
    expect(K.tailS(trail, 40)).toBeCloseTo(trail.s[(trail.head - trail.count + 1 + (K.MAX_SEG + 1) * 2) % (K.MAX_SEG + 1)], 6);
  });

  it('resetTrail 把历史清干净', () => {
    const trail = straight(10);
    K.resetTrail(trail);
    expect(trail.count).toBe(0);
    expect(trail.head).toBe(0);
  });
});

describe('滚筒网格', () => {
  it('三角形绕序和顶点法线同向 —— 反了滚筒会被剔除或受光翻面', () => {
    // 从 scene.ts 用的同一套 kinematics 函数重建滚筒顶点，别用它自己的独立实现，
    // 不然测的是测试自己写的镜像逻辑，钉不住真正的 buildBarrelGeometry。
    const idx = K.createBarrelIndices();
    const rings = K.BARREL_SEGMENTS + 1;
    const position = new Float32Array(rings * 2 * 3);
    const normal = new Float32Array(rings * 2 * 3);
    for (let j = 0; j < rings; j += 1) {
      const phi = K.barrelPhi(j);
      const y = K.barrelRingY(phi);
      const z = K.barrelRingZ(phi);
      for (let side = 0; side < 2; side += 1) {
        const v = j * 2 + side;
        position[v * 3] = K.barrelVertexX(side);
        position[v * 3 + 1] = y;
        position[v * 3 + 2] = z;
        // 朝外的顶点法线：局部坐标里滚筒轴沿 X，法线只有 y / z 分量。
        normal[v * 3] = 0;
        normal[v * 3 + 1] = y / K.R;
        normal[v * 3 + 2] = z / K.R;
      }
    }
    const at = (v: number) => [position[v * 3], position[v * 3 + 1], position[v * 3 + 2]];
    let checked = 0;
    for (let tri = 0; tri < K.BARREL_SEGMENTS * 2; tri += 1) {
      const [i0, i1, i2] = [idx[tri * 3], idx[tri * 3 + 1], idx[tri * 3 + 2]];
      const o = at(i0);
      const e1 = at(i1).map((c, n) => c - o[n]);
      const e2 = at(i2).map((c, n) => c - o[n]);
      const face = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const area = Math.hypot(face[0], face[1], face[2]);
      if (area < 1e-9) continue; // 圆柱侧壁不该有退化三角形，但保持和纸带那份测试同构
      const vn = [normal[i0 * 3], normal[i0 * 3 + 1], normal[i0 * 3 + 2]];
      const dot = face[0] * vn[0] + face[1] * vn[1] + face[2] * vn[2];
      expect(dot).toBeGreaterThan(0);
      checked += 1;
    }
    // 滚筒是闭合圆柱，不该有任何退化三角形——每一个都该被数到。
    expect(checked).toBe(K.BARREL_SEGMENTS * 2);
  });
});

import * as TEX from '../src/shared/roll/cards';
import { STICKS } from '../src/shared/sticks';

describe('贴图版面（纯计算部分）', () => {
  it('八格横向铺满 atlas，格子宽高比对上世界尺寸 CARD_LEN : W', () => {
    expect(TEX.ATLAS_W).toBe(TEX.CARD_PX * K.N);
    const cellAspect = TEX.CARD_PX / TEX.ATLAS_H;
    expect(cellAspect).toBeCloseTo(K.CARD_LEN / K.W, 2);
  });

  it('atlasCellRect 严丝合缝，不留缝也不重叠', () => {
    for (let slot = 0; slot < K.N; slot += 1) {
      const r = TEX.atlasCellRect(slot);
      expect(r.x).toBe(slot * TEX.CARD_PX);
      expect(r.y).toBe(0);
      expect(r.w).toBe(TEX.CARD_PX);
      expect(r.h).toBe(TEX.ATLAS_H);
    }
    expect(TEX.atlasCellRect(K.N - 1).x + TEX.CARD_PX).toBe(TEX.ATLAS_W);
  });

  it('八张预览签互不相同，而且都是真的签 —— 滚筒上没有占位文字', () => {
    const seen = new Set<number>();
    for (let slot = 0; slot < K.N; slot += 1) {
      const stick = TEX.previewStick(slot);
      expect(STICKS).toContain(stick);
      seen.add(stick.no);
    }
    expect(seen.size).toBe(K.N);
  });

  it('pseudoRandom 是确定性的 —— 同一颗种子每次都画出同一张纸', () => {
    const a = TEX.pseudoRandom(42);
    const b = TEX.pseudoRandom(42);
    for (let i = 0; i < 50; i += 1) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('按规范：每格 2500 条桑皮纤维，木刻版是镜像的', () => {
    expect(TEX.PAPER_FIBRES).toBe(2500);
    expect(TEX.MIRROR_BLOCK).toBe(true);
  });

  // wrapText 的量宽度由调用方注入，这里假装是 17px Charter 味衬线体的平均步进宽度；
  // maxWidth = 364 对应一张 440px 卡片的 rect.w - 76（英文卡实际的折行预算）。
  const measure = (s: string) => s.length * 9;
  const maxWidth = 364;

  it('wrapText：短字符串塞得下一行，原样返回，不折行', () => {
    const text = 'A short line';
    expect(TEX.wrapText(measure, text, maxWidth, 3)).toEqual([text]);
  });

  it('wrapText：长字符串按词折成多行，且每一行都量得进 maxWidth', () => {
    const text =
      'The rain has stopped and the mud is deep and the road is still wet underfoot this morning';
    const lines = TEX.wrapText(measure, text, maxWidth, 6);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(maxWidth);
  });

  it('wrapText：无论内容多长，输出行数都不会超过 maxLines', () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    for (const maxLines of [1, 2, 3, 5]) {
      expect(TEX.wrapText(measure, text, maxWidth, maxLines).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('wrapText：内容被截断时，最后一行以省略号收尾，而且仍然量得进 maxWidth', () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const lines = TEX.wrapText(measure, text, maxWidth, 2);
    expect(lines.length).toBe(2);
    const last = lines[lines.length - 1];
    expect(last.endsWith('…')).toBe(true);
    expect(measure(last)).toBeLessThanOrEqual(maxWidth);
  });

  it('wrapText：单个比 maxWidth 还宽的词，也照样吐出来，不会被吞掉（!line 保底）', () => {
    const hugeWord = 'x'.repeat(80); // 量出来 720，远超 364
    expect(TEX.wrapText(measure, hugeWord, maxWidth, 3)).toEqual([hugeWord]);
  });

  it('wrapText：真实签诗——stick #7 那句 57 字符的英文签诗，在卡片实际预算下最多折两行', () => {
    const stick7 = STICKS.find((s) => s.no === 7);
    expect(stick7).toBeDefined();
    const line = stick7!.en.poem[0];
    expect(line.length).toBe(57);
    const lines = TEX.wrapText(measure, line, maxWidth, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(maxWidth);
  });

  it('wrapText：STICKS 里每一支签的两句英文签诗，在卡片预算下都能在两行内塞完，不需要省略号', () => {
    const overflowing: string[] = [];
    for (const stick of STICKS) {
      for (const poemLine of stick.en.poem) {
        const lines = TEX.wrapText(measure, poemLine, maxWidth, 2);
        expect(lines.length).toBeLessThanOrEqual(2);
        for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(maxWidth);
        if (lines.some((l) => l.endsWith('…'))) overflowing.push(`#${stick.no}: "${poemLine}"`);
      }
    }
    expect(overflowing).toEqual([]);
  });
});
