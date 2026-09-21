# 东方木刻 3D 滚印签纸机（Fortune Paper Roll Engine）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third 求签器具 to 问一签 — a WebGL roller that carves the drawn stick onto a woodblock barrel and prints it onto an endless 宣纸 ribbon as it rolls across the table, with the ribbon's UVs locked to the roller's rotation by an exact no-slip condition.

**Architecture:** Three-layer split so the load-bearing part is testable. `roll/kinematics.ts` is **pure math** — no `three`, no `document`, no allocation after module load — and therefore loads directly in the Node vitest environment this repo already uses. `roll/textures.ts` paints HTML5 canvases and returns `HTMLCanvasElement` (it never imports `three`, so "what to draw" stays separate from "how to map it"). `roll/scene.ts` assembles the Three.js graph from those two. `components/FortunePaperRoll.tsx` is a thin React shell: lifecycle, RAF loop, pointer steering, state machine, WebGL fallback. The no-slip lock is enforced *by construction*, not by a tuned phase constant: the barrel's UVs are hand-authored from each ring vertex's angular position measured from the printing nip, which makes the barrel's `u` under the nip algebraically identical to the ribbon's `u` at the nip.

**Tech Stack:** TypeScript 5.9 (strict, `noUnusedLocals`, `noUnusedParameters`), React 19, Three.js 0.186 (already a dependency), Vite 8, vitest 4 (`environment: 'node'`). **No new dependencies.**

---

## Global Constraints

- **No new runtime dependencies.** `package.json` `dependencies` stays exactly `hono`, `react`, `react-dom`, `three`.
- **Branch:** all work happens on `feat/3d-paper-roll`, branched from the current `feat/3d-fortune-cylinder`. **Never check out, merge, rebase, cherry-pick or push `origin/feat/slip-fx-audio-and-followup` (PR #7).** Do not run any `git` command that names it.
- **Zero assets.** Every texture is generated with Canvas 2D at runtime. No image file is added to `public/` or imported.
- **Zero per-frame heap allocation** inside the RAF loop. No `new THREE.Vector3()`, no array literals, no `.map`/`.filter`/`.slice`, no template strings, no closures created per frame. All scratch space is allocated once at module load or at mount.
- **`npx tsc --noEmit` must be clean.** Note `tsconfig.app.json` sets `noUnusedLocals` and `noUnusedParameters` — an unused import or parameter is a build failure, not a warning. The repo's own gate is `npm run check` (tsc + vite build + wrangler dry-run) plus `npm test`.
- **AGENTS.md invariant 4 & 5 hold.** The stick is drawn server-side when the print key is pressed and is never re-rolled. This component **plays back** an already-fixed stick; it must never choose, derive or influence a stick number. `onShake()` is the only way it asks for a draw.
- **AGENTS.md invariant 9 holds.** `language` is a required prop and is the *round's* language (`sheet.language` once a sheet exists, interface language before that) — exactly how `FortuneCylinder` is already wired in `FortuneGame`.
- **AGENTS.md invariant 13 holds.** `src/app/` is browser-only. The pure-math module is still placed under `src/app/roll/` because it is browser-feature code; it stays Node-loadable only by importing nothing browser-specific, which the tests enforce.
- **Exact physical constants, copied verbatim from the spec:** `R = 1.75`, `W = 1.5`, `N = 8`, `CARD_LEN = (2πR)/N`, `MAX_SEG = 778`, `VERTS = (MAX_SEG + 1) * 2`, `CURL_SEG = 16`, tail fade `smoothstep(uTailS, uTailS + 3.0, vS)`, camera FOV `32°`, spring `k = 1 - e^(-2.6·dt)`, brass caps `metalness: 0.75` / `roughness: 0.35` / `color: #c89b3c`, barrel wood `#141416`–`#261a14`, 宣纸 `#f8f6f0`–`#f2eee3`, `2500` 桑皮纤维 per card.
- **Every commit leaves `npm run check` and `npm test` green.**
- Commit messages follow the repo's voice (declarative, Chinese, explaining the *why*) and end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## Two spec deviations, decided up front

Both are places where the spec and the existing codebase disagree. They are resolved here so no task has to guess.

1. **"四句七言詩文" → two poem lines plus the meaning.** `FortuneStick` in `src/shared/sticks.ts` carries `poem: [string, string]` and `meaning: string` — two lines, not four, and that data is the product's content base (AGENTS.md: the AI may not change a word of it). The card therefore typesets **three vertical columns**: poem line 1, poem line 2, meaning. This mirrors `StickFace`'s own `slip-grid-columns` layout, so the printed paper matches the 2D slip the rest of the app shows. English rounds typeset horizontally, as `StickFace` already does.
2. **The barrel's carving is mirrored.** A real 木刻 printing block is cut in reverse so the impression reads correctly. `MIRROR_BLOCK = true` in `textures.ts` applies `ctx.scale(-1, 1)` in block mode. It is a single named constant so it can be flipped in one line if it reads as a bug rather than as authenticity.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/app/roll/kinematics.ts` (create) | Pure math. Constants, no-slip lock, card-slot arithmetic, stop solving, curl profile, trail ring buffer, ribbon vertex writer, barrel UV authoring, spring. Imports nothing. |
| `src/app/roll/textures.ts` (create) | Canvas 2D painters. Atlas (8 宣纸 cards), barrel woodblock, brass cap, blob shadow. Returns `HTMLCanvasElement`. Imports only `src/shared/sticks`, `src/shared/lang`, and constants from `kinematics.ts`. |
| `src/app/roll/scene.ts` (create) | Three.js assembly. Renderer, 32° camera, studio lights, barrel + brass caps + blob, ribbon `BufferGeometry` with the `aS`/`uTailS` shader patch, ground table. Returns a handle the component drives. |
| `src/app/components/FortunePaperRoll.tsx` (create) | React shell: props, mount/unmount, resize, RAF loop, pointer steering, `idle`/`ready`/`shaking`/`ejecting` state machine, sound gating, WebGL fallback, on-canvas hint/action strip. |
| `src/app/sound.ts` (modify) | Add `paperRollRumble`, `paperUnfurl`, `woodblockPress`. |
| `src/app/components/FortuneGame.tsx` (modify) | Third `vessel` value `'roll'`: toggle button, render branch, draw-time sound branch, eject duration. |
| `src/app/styles.css` (modify) | `.roll-slot`, `.roll-stage`, `.roll-canvas-wrapper`, `.roll-hint`, `.roll-fallback`. |
| `tests/roll-kinematics.test.ts` (create) | Node unit tests for every pure function above. |

---

### Task 1: Branch and the no-slip core

**Files:**
- Create: `src/app/roll/kinematics.ts`
- Test: `tests/roll-kinematics.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `R`, `W`, `N`, `TWO_PI`, `TWO_PI_R`, `CARD_LEN`, `SEG_LEN`, `MAX_SEG`, `VERTS`, `CURL_SEG`, `CURL_LEN`, `CURL_LIFT`, `GROUND_Y`, `TAIL_FADE`, `LAND_OFFSET`, `MIN_ROLL`, `BARREL_SEGMENTS`, `SPRING`; `springK(dt: number): number`, `spinAngle(s: number): number`, `cardIndexAt(s: number): number`, `slotOppositeNip(s: number): number`, `solveStopS(sNow: number, slot: number): number`, `curlLift(q: number): number`, `curlSlope(q: number): number`, `barrelPhi(j: number): number`, `barrelUAtPhi(phi: number): number`, `barrelU(j: number): number`, `nipU(s: number): number`, `barrelRingY(phi: number): number`, `barrelRingZ(phi: number): number`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick
git status --porcelain
git switch -c feat/3d-paper-roll
```

Expected: `git status --porcelain` prints nothing (clean tree), then `Switched to a new branch 'feat/3d-paper-roll'`.

- [ ] **Step 2: Write the failing test**

Create `tests/roll-kinematics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as K from '../src/app/roll/kinematics';

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

  it('尾端斜率归零 —— 纸躺平的时候不能带折角；压印点那一端反而要有坡度', () => {
    expect(K.curlSlope(1)).toBe(0);
    // 纸是带着坡度离开压印点的。这里归零会在画面最显眼处留下一道光照硬缝。
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
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx vitest run tests/roll-kinematics.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/app/roll/kinematics"`.

- [ ] **Step 4: Write the implementation**

Create `src/app/roll/kinematics.ts`:

```ts
/**
 * 滚印签纸机的纯数学核心 —— 复刻 thebuggeddev/paper-roll 的无滑动纯滚动锁定。
 *
 * 这个模块**不 import three，也不碰 document**，所以 vitest 的 node 环境能直接加载它。
 * 这不是洁癖：滚到哪印到哪是这台机器唯一不能出错的地方，它必须是能被单元测试钉死的。
 *
 * 坐标约定（整台机器都按这一套，别的地方不要再自己定义一次）：
 *   · 滚筒自己的局部坐标里，轴沿 X，前进方向是 -Z，地面是 y = 0。
 *   · 压印点（nip）在滚筒正下方，局部方向 (0, -1, 0)。
 *   · 滚筒表面某点的角位置 φ 从压印点量起，朝前进方向为正。
 *   · 行进总弧长 s 只增不减；滚筒自转角 θ = spinAngle(s) = -s / R。
 */

/* ── 尺寸与咬合 ── */

export const R = 1.75;
export const W = 1.5;
export const N = 8;

export const TWO_PI = Math.PI * 2;
export const TWO_PI_R = TWO_PI * R;
/** 单张卡片沿行进方向的长度。八张严丝合缝地咬住一整个周长。 */
export const CARD_LEN = TWO_PI_R / N;

/* ── 纸带顶点预算（固定，永不增长） ── */

export const SEG_LEN = 0.055;
export const MAX_SEG = 778;
export const VERTS = (MAX_SEG + 1) * 2;
/** 纸带能铺出去的最远距离 ≈ 42.8，超过这个长度的历史直接丢掉。 */
export const TRAIL_LEN = MAX_SEG * SEG_LEN;

/* ── 剥离微卷曲 ── */

export const CURL_SEG = 16;
export const CURL_LEN = CURL_SEG * SEG_LEN;
/** 抬起的峰值高度（世界单位）。重型滚筒把宣纸挤出来时的那一点重力微垂感。 */
export const CURL_LIFT = 0.045;
/** 纸带离地的极小抬升，纯粹为了不和案几平面打架（z-fighting）。 */
export const GROUND_Y = 0.0015;

/* ── 尾端溶解 ── */

export const TAIL_FADE = 3.0;

/* ── 定格 ── */

/** 停下来时，落定那张卡片的中心离压印点有多远（镜头正好看着这里）。 */
export const LAND_OFFSET = 2.0;
/** 至少滚一圈半才准停 —— 定格要看得出是有意为之，不是卡住了。 */
export const MIN_ROLL = 1.5 * TWO_PI_R;

/* ── 滚筒网格 ── */

export const BARREL_SEGMENTS = 128;

/* ── 弹簧阻尼 ── */

export const SPRING = 2.6;
/** 帧率无关的指数趋近系数。dt 大的时候也不会冲过头。 */
export const springK = (dt: number): number => 1 - Math.exp(-SPRING * dt);

/* ── 无滑动锁定 ── */

export const spinAngle = (s: number): number => -s / R;

/**
 * 滚筒环上第 j 个顶点的角位置。接缝（j = 0 与 j = BARREL_SEGMENTS 重合的那一道）
 * 特意放在 φ = π，也就是滚筒**顶部** —— 压印点上不能有接缝。
 */
export const barrelPhi = (j: number): number => Math.PI + (TWO_PI * j) / BARREL_SEGMENTS;

/**
 * 角位置 φ 对应的贴图 u。这一行就是整台机器的锁：
 *   压印瞬间贴在地面的材料，滚转前的角位置是 φ = -θ = s / R，
 *   代进来得到 0.5 + (s/R - π)/2π = s / (2πR) = nipU(s)，
 * 和纸带在压印点写下的 u 逐字相同。没有需要手调的相位常数，也就没有漂移。
 */
export const barrelUAtPhi = (phi: number): number => 0.5 + (phi - Math.PI) / TWO_PI;

export const barrelU = (j: number): number => barrelUAtPhi(barrelPhi(j));

/** 纸带在压印点写下的 u。 */
export const nipU = (s: number): number => s / TWO_PI_R;

/** 角位置 φ 的滚筒表面点（局部坐标，轴沿 X，所以只有 y / z）。 */
export const barrelRingY = (phi: number): number => -R * Math.cos(phi);
export const barrelRingZ = (phi: number): number => -R * Math.sin(phi);

/* ── 卡片格 ── */

export const cardIndexAt = (s: number): number => {
  const raw = Math.floor(s / CARD_LEN) % N;
  return raw < 0 ? raw + N : raw;
};

/**
 * 此刻转到滚筒**顶部**、镜头完全看不见的那一格。
 * 签一落库就重画这一格，玩家看不到任何一张卡片在眼前变过内容。
 */
export const slotOppositeNip = (s: number): number => cardIndexAt(s + TWO_PI_R / 2);

/**
 * 解出停车弧长：让第 slot 格的中心正好停在压印点后 LAND_OFFSET 处，
 * 并且至少还要再滚 MIN_ROLL。
 */
export const solveStopS = (sNow: number, slot: number): number => {
  const centre0 = (slot + 0.5) * CARD_LEN;
  const m = Math.ceil((sNow + MIN_ROLL - LAND_OFFSET - centre0) / TWO_PI_R);
  return centre0 + m * TWO_PI_R + LAND_OFFSET;
};

/* ── 剥离微卷曲剖面 ── */

/**
 * 三次曲线：h(0) = h(1) = 0，h'(1) = 0，峰值 CURL_LIFT 落在 q = 1/3。
 * 27/4 = 6.75 是把 q(1-q)² 的峰值 4/27 归一化回 1 的系数。
 */
export const curlLift = (q: number): number =>
  q <= 0 || q >= 1 ? 0 : CURL_LIFT * 6.75 * q * (1 - q) * (1 - q);

/**
 * dh/dq。躺平那一端斜率归零，纸尾才不会带出一道折角。
 *
 * q = 0 这一端**不**归零：纸是带着坡度离开压印点的，这就是「剥离」。
 * 写成 q <= 0 会让压印点那一排顶点的法线突然回正，在整个画面最显眼的地方
 * （纸刚从滚筒底下出来那一道）留下一道 14.7° 的光照硬缝。
 */
export const curlSlope = (q: number): number =>
  q < 0 || q >= 1 ? 0 : CURL_LIFT * 6.75 * (1 - q) * (1 - 3 * q);
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx vitest run tests/roll-kinematics.test.ts
```

Expected: PASS — 11 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx tsc --noEmit -p tsconfig.app.json && npm test
git add src/app/roll/kinematics.ts tests/roll-kinematics.test.ts
git commit -m "$(cat <<'MSG'
feat(roll): 滚印签纸机的无滑动纯滚动数学核心

滚到哪印到哪是这台机器唯一不能出错的地方，所以把它整块抽成不 import three、
不碰 document 的纯函数，让 vitest 的 node 环境能直接钉死它。

锁在 barrelUAtPhi 这一行：滚筒表面的 u 由顶点自己的角位置算出，压印瞬间贴地的
那一点代进去恰好等于纸带写下的 s/(2πR)。没有需要手调的相位常数，也就没有漂移。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: The zero-allocation ribbon writer

**Files:**
- Modify: `src/app/roll/kinematics.ts` (append)
- Test: `tests/roll-kinematics.test.ts` (append)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `interface Trail { x: Float32Array; z: Float32Array; s: Float32Array; head: number; count: number }`, `createTrail(): Trail`, `resetTrail(trail: Trail): void`, `pushTrail(trail: Trail, x: number, z: number, s: number): boolean`, `tailS(trail: Trail, sNow: number): number`, `interface RibbonBuffers { position: Float32Array; normal: Float32Array; uv: Float32Array; aS: Float32Array }`, `createRibbonBuffers(): RibbonBuffers`, `createRibbonIndices(): Uint16Array`, `writeRibbon(buf: RibbonBuffers, trail: Trail, nipX: number, nipZ: number, headX: number, headZ: number, sNow: number): void`.

- [ ] **Step 0: Correct `curlSlope`'s guard at q = 0**

Task 1 shipped `curlSlope` guarded as `q <= 0 || q >= 1`. That is wrong at the
nip: the paper leaves the contact line *already rising* — that is what peeling
is — so the true one-sided derivative at `q = 0` is `CURL_LIFT * 6.75 ≈ 0.304`,
not 0. Returning 0 snaps the nip row's normal back to straight-up while its
immediate neighbour sits at 14.7°, leaving a hard lighting seam exactly where
the paper emerges from under the roller. Change the guard in
`src/app/roll/kinematics.ts` and widen the existing Task 1 assertion:

```ts
export const curlSlope = (q: number): number =>
  q < 0 || q >= 1 ? 0 : CURL_LIFT * 6.75 * (1 - q) * (1 - 3 * q);
```

and in `tests/roll-kinematics.test.ts`, inside the existing
`it('尾端斜率归零 …')`, add after the `curlSlope(1)` assertion:

```ts
    expect(K.curlSlope(0)).toBeCloseTo(K.CURL_LIFT * 6.75, 12);
```

Run `npx vitest run tests/roll-kinematics.test.ts` and confirm it is green
before continuing.

- [ ] **Step 1: Write the failing test**

Append to `tests/roll-kinematics.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx vitest run tests/roll-kinematics.test.ts
```

Expected: FAIL — `K.createTrail is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/app/roll/kinematics.ts`:

```ts
/* ── 压印点历史（环形缓冲） ── */

export interface Trail {
  x: Float32Array;
  z: Float32Array;
  /** 落这个点的时候，行进总弧长是多少。 */
  s: Float32Array;
  /** 最新的那个点的下标。 */
  head: number;
  /** 活着的点有几个（封顶 MAX_SEG + 1）。 */
  count: number;
}

const RING = MAX_SEG + 1;

export const createTrail = (): Trail => ({
  x: new Float32Array(RING),
  z: new Float32Array(RING),
  s: new Float32Array(RING),
  head: 0,
  count: 0,
});

export const resetTrail = (trail: Trail): void => {
  trail.head = 0;
  trail.count = 0;
};

/** 走满一个 SEG_LEN 才落一个点。返回这一次有没有真的落点。 */
export const pushTrail = (trail: Trail, x: number, z: number, s: number): boolean => {
  if (trail.count > 0 && s - trail.s[trail.head] < SEG_LEN) return false;
  trail.head = (trail.head + 1) % RING;
  trail.x[trail.head] = x;
  trail.z[trail.head] = z;
  trail.s[trail.head] = s;
  if (trail.count < RING) trail.count += 1;
  return true;
};

/** 从 head 往回数第 back 个点的下标，数过头就钉在最老的那个点上。 */
const sampleIndex = (trail: Trail, back: number): number => {
  const b = back < trail.count ? back : trail.count - 1;
  return (trail.head - b + RING) % RING;
};

/**
 * 最远端那个还活着的采样点的弧长 —— 着色器的 uTailS 用它。
 * 历史还是空的时候，writeRibbon 会合成一条笔直的尾巴，这里要跟它对上。
 */
export const tailS = (trail: Trail, sNow: number): number =>
  trail.count === 0 ? sNow - TRAIL_LEN : trail.s[sampleIndex(trail, trail.count - 1)];

/* ── 纸带顶点缓冲 ── */

export interface RibbonBuffers {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  /** 每个顶点自己的行进弧长，交给片元着色器做尾端溶解。 */
  aS: Float32Array;
}

export const createRibbonBuffers = (): RibbonBuffers => ({
  position: new Float32Array(VERTS * 3),
  normal: new Float32Array(VERTS * 3),
  uv: new Float32Array(VERTS * 2),
  aS: new Float32Array(VERTS),
});

/** 三角形索引只在初始化时算一次，之后永不变动 —— 顶点数是死的。 */
export const createRibbonIndices = (): Uint16Array => {
  const idx = new Uint16Array(MAX_SEG * 6);
  for (let i = 0; i < MAX_SEG; i += 1) {
    const a = i * 2;
    const o = i * 6;
    idx[o] = a;
    idx[o + 1] = a + 2;
    idx[o + 2] = a + 1;
    idx[o + 3] = a + 1;
    idx[o + 4] = a + 2;
    idx[o + 5] = a + 3;
  }
  return idx;
};

/* ── 中心线暂存：模块加载时分配一次，帧循环里只覆写，不再 new ── */

const cX = new Float32Array(RING);
const cY = new Float32Array(RING);
const cZ = new Float32Array(RING);
const cS = new Float32Array(RING);

/**
 * 把整条纸带写进预分配好的 TypedArray。这个函数里没有一个 `new`。
 *
 * 采样点 0 永远是当前压印点；1..MAX_SEG 取历史（不够就压在最老的那个点上，
 * 多出来的三角形面积为零，看不见，但顶点数一个不少）。
 */
export function writeRibbon(
  buf: RibbonBuffers,
  trail: Trail,
  nipX: number,
  nipZ: number,
  headX: number,
  headZ: number,
  sNow: number,
): void {
  // 1. 中心线
  cX[0] = nipX;
  cZ[0] = nipZ;
  cS[0] = sNow;
  if (trail.count === 0) {
    // 还没开始滚：合成一条笔直的尾巴，免得一上来是一个退化的点。
    for (let i = 1; i <= MAX_SEG; i += 1) {
      const d = i * SEG_LEN;
      cX[i] = nipX - headX * d;
      cZ[i] = nipZ - headZ * d;
      cS[i] = sNow - d;
    }
  } else {
    for (let i = 1; i <= MAX_SEG; i += 1) {
      const k = sampleIndex(trail, i - 1);
      cX[i] = trail.x[k];
      cZ[i] = trail.z[k];
      cS[i] = trail.s[k];
    }
  }

  // 2. 剥离微卷曲：只有离压印点不到 CURL_LEN 的那 16 段抬得起来。
  //    cS 沿 i 单调递减，所以 q 单调递增，越过 1 之后直接收工。
  for (let i = 0; i <= MAX_SEG; i += 1) {
    const q = (sNow - cS[i]) / CURL_LEN;
    if (q >= 1) {
      for (let k = i; k <= MAX_SEG; k += 1) cY[k] = GROUND_Y;
      break;
    }
    cY[i] = GROUND_Y + curlLift(q);
  }

  // 3. 顶点
  for (let i = 0; i <= MAX_SEG; i += 1) {
    // 切线：中心差分，端点退化成单侧差分。a 靠近滚筒，b 靠近纸尾，所以 t 指向前进方向。
    const a = i === 0 ? 0 : i - 1;
    const b = i === MAX_SEG ? MAX_SEG : i + 1;
    let tx = cX[a] - cX[b];
    let tz = cZ[a] - cZ[b];
    const len = Math.sqrt(tx * tx + tz * tz);
    if (len < 1e-6) {
      tx = headX;
      tz = headZ;
    } else {
      tx /= len;
      tz /= len;
    }

    // 水平左法线，半宽 W/2
    const lx = -tz * (W / 2);
    const lz = tx * (W / 2);

    // 表面法线：沿前进方向的坡度。d 是离压印点的距离，往前走 d 变小，所以要取负号。
    const q = (sNow - cS[i]) / CURL_LEN;
    const slope = q < 1 ? -curlSlope(q) / CURL_LEN : 0;
    let nx = -slope * tx;
    let ny = 1;
    let nz = -slope * tz;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;

    const u = cS[i] / TWO_PI_R;
    const v0 = i * 2;
    const v1 = v0 + 1;
    const p0 = v0 * 3;
    const p1 = v1 * 3;

    buf.position[p0] = cX[i] + lx;
    buf.position[p0 + 1] = cY[i];
    buf.position[p0 + 2] = cZ[i] + lz;
    buf.position[p1] = cX[i] - lx;
    buf.position[p1 + 1] = cY[i];
    buf.position[p1 + 2] = cZ[i] - lz;

    buf.normal[p0] = nx;
    buf.normal[p0 + 1] = ny;
    buf.normal[p0 + 2] = nz;
    buf.normal[p1] = nx;
    buf.normal[p1 + 1] = ny;
    buf.normal[p1 + 2] = nz;

    buf.uv[v0 * 2] = u;
    buf.uv[v0 * 2 + 1] = 0;
    buf.uv[v1 * 2] = u;
    buf.uv[v1 * 2 + 1] = 1;

    buf.aS[v0] = cS[i];
    buf.aS[v1] = cS[i];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx vitest run tests/roll-kinematics.test.ts
```

Expected: PASS — 22 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx tsc --noEmit -p tsconfig.app.json && npm test
git add src/app/roll/kinematics.ts tests/roll-kinematics.test.ts
git commit -m "$(cat <<'MSG'
feat(roll): 零每帧堆分配的动态纸带网格

顶点预算写死（778 段 / 1558 顶点），索引只算一次，帧循环里只覆写 TypedArray。
历史点不够的时候把多出来的顶点压在最老的那一个上 —— 三角形面积为零，看不见，
但顶点数一个不少，于是不用重建 geometry。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Procedural 宣纸 / 黑檀 / 黄铜 textures

**Files:**
- Create: `src/app/roll/textures.ts`
- Test: `tests/roll-kinematics.test.ts` (append — only the pure helpers; canvas painting is verified in Task 8's browser pass, because vitest runs `environment: 'node'`)

**Interfaces:**
- Consumes: `N`, `CARD_LEN`, `W` from `kinematics.ts`; `FortuneStick`, `stickText`, `LEVEL_LABEL`, `STICKS` from `src/shared/sticks`; `Language` from `src/shared/lang`.
- Produces: `CARD_PX`, `ATLAS_H`, `ATLAS_W`, `MIRROR_BLOCK`, `PAPER_FIBRES`, `atlasCellRect(slot: number): { x: number; y: number; w: number; h: number }`, `previewStick(slot: number): FortuneStick`, `pseudoRandom(seed: number): () => number`, `createAtlasCanvas(language: Language): HTMLCanvasElement`, `createBlockCanvas(language: Language): HTMLCanvasElement`, `repaintSlot(canvas: HTMLCanvasElement, slot: number, stick: FortuneStick, language: Language, mode: 'paper' | 'block'): void`, `createBrassCanvas(): HTMLCanvasElement`, `createBlobCanvas(): HTMLCanvasElement`.

- [ ] **Step 1: Write the failing test**

Append to `tests/roll-kinematics.test.ts`:

```ts
import * as TEX from '../src/app/roll/textures';
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx vitest run tests/roll-kinematics.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/app/roll/textures"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/roll/textures.ts`:

```ts
/**
 * 全程序化的宣纸 / 老黑檀 / 黄铜贴图。一张外部图片都不下载。
 *
 * 这个模块只产出 HTMLCanvasElement，**不 import three** —— 「画什么」和「怎么贴」
 * 分开，于是版面算术（格子、预览签、伪随机）能在 node 下被测到，
 * 真正需要 2D context 的部分才留到浏览器里跑。
 *
 * 一张卡片有两副面孔：
 *   · 'paper' —— 印在地上那条澄心堂宣纸长卷上的墨迹；
 *   · 'block' —— 刻在滚筒上的老黑檀木刻版，阴刻、描金、而且是**反的**
 *     （真的雕版就是反着刻的，印出来才正。MIRROR_BLOCK 一行可关）。
 */

import type { Language } from '../../shared/lang';
import { LEVEL_LABEL, STICKS, stickText, type FortuneStick } from '../../shared/sticks';
import { N, W } from './kinematics';

/* ── 版面 ── */

/** 一格沿行进方向的像素数。440/480 ≈ CARD_LEN/W，误差 0.04%，看不出来。 */
export const CARD_PX = 440;
export const ATLAS_H = 480;
export const ATLAS_W = CARD_PX * N;

export const PAPER_FIBRES = 2500;
/** 真的雕版是反着刻的。改成 false 就变成「看得懂的」滚筒。 */
export const MIRROR_BLOCK = true;

const SERIF = '"Kaiti SC", "STKaiti", "BiauKai", "DFKai-SB", "Noto Serif TC", serif';
const LATIN = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

export const atlasCellRect = (slot: number): { x: number; y: number; w: number; h: number } => ({
  x: slot * CARD_PX,
  y: 0,
  w: CARD_PX,
  h: ATLAS_H,
});

/**
 * 滚筒上八格默认刻哪八支签。步长 5 与 36 互质，所以八格必不重复；
 * 而且它们都是真的签 —— 玩家凑近看滚筒，看到的是签文，不是占位符。
 */
export const previewStick = (slot: number): FortuneStick => STICKS[(slot * 5 + 2) % STICKS.length];

/** 确定性伪随机（Lehmer / MINSTD），和 FortuneCylinder 里那一套同源。 */
export function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* ── 底子 ── */

/** 宋代澄心堂手工宣纸：温润米白渐层 + 纵横随机分布的桑皮纤维。 */
function paintXuanPaper(g: CanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#f8f6f0');
  base.addColorStop(0.55, '#f5f1e7');
  base.addColorStop(1, '#f2eee3');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < PAPER_FIBRES; i += 1) {
    const warm = rand() > 0.42;
    g.fillStyle = warm
      ? `rgba(196, 176, 142, ${(0.03 + rand() * 0.07).toFixed(3)})`
      : `rgba(255, 253, 246, ${(0.05 + rand() * 0.10).toFixed(3)})`;
    const x = rand() * w;
    const y = rand() * h;
    if (rand() > 0.5) g.fillRect(x, y, 3 + rand() * 16, 0.6);
    else g.fillRect(x, y, 0.6, 3 + rand() * 14);
  }

  // 帘纹（抄纸竹帘留下的横向淡痕）
  g.fillStyle = 'rgba(180, 164, 132, 0.035)';
  for (let y = 5; y < h; y += 9) g.fillRect(0, y, w, 1);

  // 四角自然陈化的微黄
  const age = g.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.78);
  age.addColorStop(0, 'rgba(214, 190, 146, 0)');
  age.addColorStop(1, 'rgba(198, 168, 118, 0.14)');
  g.fillStyle = age;
  g.fillRect(0, 0, w, h);
}

/** 老黑檀／紫檀雕版底：深沉木纹、导管棕眼、松烟墨渍。 */
function paintEbony(g: CanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#141416');
  base.addColorStop(0.45, '#261a14');
  base.addColorStop(0.78, '#1b1411');
  base.addColorStop(1, '#141416');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // 纵向导管与棕眼
  for (let i = 0; i < 520; i += 1) {
    g.fillStyle = `rgba(8, 5, 4, ${(0.04 + rand() * 0.09).toFixed(3)})`;
    g.fillRect(rand() * w, 0, 1 + rand() * 2.4, h);
  }
  for (let i = 0; i < 160; i += 1) {
    g.fillStyle = `rgba(148, 104, 66, ${(0.015 + rand() * 0.035).toFixed(3)})`;
    g.fillRect(rand() * w, 0, 1, h);
  }
  // 松烟墨渍
  for (let i = 0; i < 26; i += 1) {
    const r = 12 + rand() * 46;
    const blot = g.createRadialGradient(rand() * w, rand() * h, 0, rand() * w, rand() * h, r);
    blot.addColorStop(0, 'rgba(5, 4, 4, 0.22)');
    blot.addColorStop(1, 'rgba(5, 4, 4, 0)');
    g.fillStyle = blot;
    g.fillRect(0, 0, w, h);
  }
}

/* ── 纹样 ── */

/** 朱砂防伪方印。 */
function paintSeal(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, glyphs: string): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = 'rgba(158, 32, 27, 0.90)';
  g.strokeStyle = 'rgba(158, 32, 27, 0.95)';
  g.lineWidth = Math.max(2, size * 0.055);
  g.strokeRect(-size / 2, -size / 2, size, size);
  g.font = `700 ${Math.floor(size * 0.36)}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...glyphs];
  const half = size * 0.23;
  // 印文按古法从右上起、竖读
  const spots = [
    [half, -half],
    [half, half],
    [-half, -half],
    [-half, half],
  ];
  for (let i = 0; i < chars.length && i < 4; i += 1) {
    g.fillText(chars[i], spots[i][0], spots[i][1]);
  }
  g.restore();
}

/** 底部海水江崖木刻纹样。 */
function paintWaveBorder(g: CanvasRenderingContext2D, w: number, y: number, ink: string): void {
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 1.4;
  for (let band = 0; band < 3; band += 1) {
    g.beginPath();
    const amp = 5 - band * 1.2;
    const yy = y + band * 6;
    for (let x = 0; x <= w; x += 2) {
      const v = yy + Math.sin((x / w) * Math.PI * 14 + band * 1.1) * amp;
      if (x === 0) g.moveTo(x, v);
      else g.lineTo(x, v);
    }
    g.stroke();
  }
  // 江崖：三座立石
  g.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const bx = w * (0.28 + i * 0.22);
    g.moveTo(bx - 13, y + 20);
    g.lineTo(bx, y - 10 - i * 4);
    g.lineTo(bx + 13, y + 20);
  }
  g.stroke();
  g.restore();
}

/** 直排文字。中文竖着一个字一个字落下来。 */
function paintVertical(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  yTop: number,
  step: number,
  max: number,
): void {
  const chars = [...text];
  for (let i = 0; i < chars.length && i < max; i += 1) {
    g.fillText(chars[i], x, yTop + i * step);
  }
}

/* ── 一张卡片 ── */

const SEAL_TEXTS = ['天后宮藏', '甲子元亨', '籤詩正印', '香火綿長', '有求必應', '風調雨順', '國泰民安', '心誠則靈'];

function paintCard(
  g: CanvasRenderingContext2D,
  slot: number,
  stick: FortuneStick,
  language: Language,
  mode: 'paper' | 'block',
): void {
  const rect = atlasCellRect(slot);
  const text = stickText(stick, language);
  const level = LEVEL_LABEL[language][stick.level];
  const rand = pseudoRandom(1000 + stick.no * 37 + slot);
  const paper = mode === 'paper';
  const ink = paper ? 'rgba(26, 20, 16, 0.92)' : 'rgba(228, 196, 128, 0.82)';
  const faint = paper ? 'rgba(26, 20, 16, 0.34)' : 'rgba(206, 168, 96, 0.40)';

  g.save();
  g.beginPath();
  g.rect(rect.x, rect.y, rect.w, rect.h);
  g.clip();
  g.translate(rect.x, rect.y);

  if (paper) paintXuanPaper(g, rect.w, rect.h, rand);
  else paintEbony(g, rect.w, rect.h, rand);

  // 雕版反着刻，印出来才正
  if (!paper && MIRROR_BLOCK) {
    g.translate(rect.w, 0);
    g.scale(-1, 1);
  }

  // 文武框
  g.strokeStyle = faint;
  g.lineWidth = 3;
  g.strokeRect(14, 14, rect.w - 28, rect.h - 28);
  g.lineWidth = 1;
  g.strokeRect(22, 22, rect.w - 44, rect.h - 44);

  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // 顶部：朱砂方印（雕版上是阴刻，用金线勾）
  g.save();
  if (!paper) {
    g.fillStyle = 'rgba(206, 168, 96, 0.55)';
    g.strokeStyle = 'rgba(206, 168, 96, 0.65)';
  }
  paintSeal(g, rect.w - 58, 60, 52, SEAL_TEXTS[slot % SEAL_TEXTS.length]);
  g.restore();

  if (language === 'zh') {
    // 中部直排：签号等级大字 + 两行签诗 + 签意，共四列，自右向左
    g.fillStyle = ink;
    g.font = `800 34px ${SERIF}`;
    paintVertical(g, `第${stick.no}籤`, 56, 64, 38, 6);
    g.font = `800 30px ${SERIF}`;
    g.fillStyle = paper ? 'rgba(146, 30, 26, 0.88)' : 'rgba(228, 196, 128, 0.9)';
    paintVertical(g, level, 56, 262, 34, 4);

    g.fillStyle = ink;
    g.font = `600 26px ${SERIF}`;
    paintVertical(g, text.poem[0], rect.w - 132, 110, 30, 11);
    paintVertical(g, text.poem[1], rect.w - 174, 110, 30, 11);
    g.font = `500 19px ${SERIF}`;
    g.fillStyle = faint;
    paintVertical(g, text.meaning, rect.w - 212, 110, 22, 15);

    // 签名四字，横过中路
    g.fillStyle = ink;
    g.font = `800 44px ${SERIF}`;
    g.fillText(text.title, rect.w / 2 + 10, rect.h - 96);
  } else {
    g.font = `700 22px ${LATIN}`;
    g.fillText(`NO. ${stick.no}`, 88, 62);
    g.fillStyle = paper ? 'rgba(146, 30, 26, 0.88)' : 'rgba(228, 196, 128, 0.9)';
    g.font = `700 20px ${LATIN}`;
    g.fillText(level, 88, 92);
    g.fillStyle = ink;
    g.font = `700 34px ${LATIN}`;
    g.fillText(text.title, rect.w / 2, 160);
    g.font = `italic 19px ${LATIN}`;
    g.fillText(text.poem[0], rect.w / 2, 216);
    g.fillText(text.poem[1], rect.w / 2, 244);
    g.fillStyle = faint;
    g.font = `16px ${LATIN}`;
    g.fillText(text.meaning.slice(0, 54), rect.w / 2, 296);
  }

  paintWaveBorder(g, rect.w, rect.h - 62, faint);
  g.restore();
}

/* ── 对外 ── */

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

function paintAll(canvas: HTMLCanvasElement, language: Language, mode: 'paper' | 'block'): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  for (let slot = 0; slot < N; slot += 1) paintCard(g, slot, previewStick(slot), language, mode);
}

/** 地上那条宣纸长卷的 Atlas —— 八组独特版画。 */
export function createAtlasCanvas(language: Language): HTMLCanvasElement {
  const cv = makeCanvas(ATLAS_W, ATLAS_H);
  paintAll(cv, language, 'paper');
  return cv;
}

/** 滚筒身上那八块老黑檀木刻版。 */
export function createBlockCanvas(language: Language): HTMLCanvasElement {
  const cv = makeCanvas(ATLAS_W, ATLAS_H);
  paintAll(cv, language, 'block');
  return cv;
}

/** 只重画一格 —— 签落库之后，把那一格换成真的那支签。 */
export function repaintSlot(
  canvas: HTMLCanvasElement,
  slot: number,
  stick: FortuneStick,
  language: Language,
  mode: 'paper' | 'block',
): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const rect = atlasCellRect(slot);
  g.clearRect(rect.x, rect.y, rect.w, rect.h);
  paintCard(g, slot, stick, language, mode);
}

/** 黄铜端盖：精密车削同心圆拉丝。 */
export function createBrassCanvas(): HTMLCanvasElement {
  const S = 512;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const rand = pseudoRandom(7);
  const c = S / 2;

  const base = g.createRadialGradient(c * 0.72, c * 0.66, S * 0.04, c, c, c);
  base.addColorStop(0, '#f0d79a');
  base.addColorStop(0.42, '#c89b3c');
  base.addColorStop(0.82, '#9a742a');
  base.addColorStop(1, '#6d4f1c');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);

  // 车削同心圆
  for (let r = 6; r < c; r += 2.4) {
    g.strokeStyle = `rgba(255, 238, 190, ${(0.02 + rand() * 0.06).toFixed(3)})`;
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = `rgba(60, 40, 12, ${(0.02 + rand() * 0.05).toFixed(3)})`;
    g.beginPath();
    g.arc(c, c, r + 1.2, 0, Math.PI * 2);
    g.stroke();
  }
  // 轴心与八颗铆钉
  g.fillStyle = 'rgba(64, 44, 16, 0.55)';
  g.beginPath();
  g.arc(c, c, S * 0.055, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    g.fillStyle = 'rgba(255, 240, 198, 0.5)';
    g.beginPath();
    g.arc(c + Math.cos(a) * c * 0.72, c + Math.sin(a) * c * 0.72, 6, 0, Math.PI * 2);
    g.fill();
  }
  return cv;
}

/** 滚筒正下方的高斯柔焦接触阴影。 */
export function createBlobCanvas(): HTMLCanvasElement {
  const S = 512;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  if (!g) return cv;
  const c = S / 2;
  // 沿滚筒轴向拉长：接触的是一条线，不是一个点
  g.translate(c, c);
  g.scale(1, W / (2 * 1.4));
  g.translate(-c, -c);
  const gr = g.createRadialGradient(c, c, 16, c, c, S * 0.47);
  gr.addColorStop(0.0, 'rgba(18, 12, 8, 0.62)');
  gr.addColorStop(0.3, 'rgba(18, 12, 8, 0.38)');
  gr.addColorStop(0.62, 'rgba(18, 12, 8, 0.13)');
  gr.addColorStop(1.0, 'rgba(18, 12, 8, 0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return cv;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx vitest run tests/roll-kinematics.test.ts && npx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS — 27 tests; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick
git add src/app/roll/textures.ts tests/roll-kinematics.test.ts
git commit -m "$(cat <<'MSG'
feat(roll): 澄心堂宣纸与老黑檀木刻版的纯程序化贴图

一张外部图片都不下载。滚筒上那八格刻的是真的签，不是占位文字 —— 凑近看
也经得起看。雕版按古法反着刻（MIRROR_BLOCK），印到纸上才是正的。

只产出 canvas、不 import three，于是版面算术能在 node 下被测到。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: The Three.js scene

**Files:**
- Create: `src/app/roll/scene.ts`

**Interfaces:**
- Consumes: all of `kinematics.ts` and `textures.ts`.
- Produces:

```ts
export interface RollScene {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  yawGroup: THREE.Group;
  spinGroup: THREE.Group;
  blob: THREE.Mesh;
  ribbonGeo: THREE.BufferGeometry;
  buffers: RibbonBuffers;
  trail: Trail;
  atlasCanvas: HTMLCanvasElement;
  blockCanvas: HTMLCanvasElement;
  atlasTex: THREE.CanvasTexture;
  blockTex: THREE.CanvasTexture;
  setTailS: (v: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}
export function createRollScene(host: HTMLElement, language: Language): RollScene | null;
```

`createRollScene` returns `null` when WebGL is unavailable, which is the component's fallback signal.

- [ ] **Step 1: Write the implementation**

Create `src/app/roll/scene.ts`:

```ts
/**
 * 把纯数学和纯贴图装配成一个 Three.js 场景。这里只管「怎么摆」，不管「怎么动」——
 * 每一帧往哪儿推，是 FortunePaperRoll 的事。
 *
 * 层级（坐标约定见 kinematics.ts 开头）：
 *   scene
 *     └ yawGroup      位置 = 滚筒中心，rotation.y = 行进朝向
 *         └ spinGroup rotation.x = spinAngle(s)
 *             ├ barrel   手搓的圆柱侧壁，UV 由顶点自己的角位置算出
 *             └ cap ×2   黄铜端盖
 *     ├ ribbon        纸带，顶点每帧覆写
 *     ├ blob          柔焦接触阴影，跟着滚筒走
 *     └ table         案几地面
 */

import * as THREE from 'three';
import type { Language } from '../../shared/lang';
import {
  BARREL_SEGMENTS,
  R,
  TAIL_FADE,
  W,
  barrelRingY,
  barrelRingZ,
  barrelPhi,
  barrelU,
  createRibbonBuffers,
  createRibbonIndices,
  createTrail,
  type RibbonBuffers,
  type Trail,
} from './kinematics';
import { createAtlasCanvas, createBlobCanvas, createBlockCanvas, createBrassCanvas } from './textures';

/** 案几的颜色。纸带尾端就是溶进这个颜色里，所以两处必须是同一个值。 */
const TABLE_COLOR = 0x2b211a;

export interface RollScene {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  yawGroup: THREE.Group;
  spinGroup: THREE.Group;
  blob: THREE.Mesh;
  ribbonGeo: THREE.BufferGeometry;
  buffers: RibbonBuffers;
  trail: Trail;
  atlasCanvas: HTMLCanvasElement;
  blockCanvas: HTMLCanvasElement;
  atlasTex: THREE.CanvasTexture;
  blockTex: THREE.CanvasTexture;
  setTailS: (v: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

/** 手搓圆柱侧壁：接缝放在滚筒顶部，u 由顶点自己的角位置算出，和纸带同一套算术。 */
function buildBarrelGeometry(): THREE.BufferGeometry {
  const rings = BARREL_SEGMENTS + 1;
  const position = new Float32Array(rings * 2 * 3);
  const normal = new Float32Array(rings * 2 * 3);
  const uv = new Float32Array(rings * 2 * 2);
  const index = new Uint16Array(BARREL_SEGMENTS * 6);

  for (let j = 0; j < rings; j += 1) {
    const phi = barrelPhi(j);
    const y = barrelRingY(phi);
    const z = barrelRingZ(phi);
    const u = barrelU(j);
    for (let side = 0; side < 2; side += 1) {
      const v = j * 2 + side;
      position[v * 3] = (side - 0.5) * W;
      position[v * 3 + 1] = y;
      position[v * 3 + 2] = z;
      normal[v * 3] = 0;
      normal[v * 3 + 1] = y / R;
      normal[v * 3 + 2] = z / R;
      uv[v * 2] = u;
      uv[v * 2 + 1] = side;
    }
  }
  for (let j = 0; j < BARREL_SEGMENTS; j += 1) {
    const a = j * 2;
    const o = j * 6;
    index[o] = a;
    index[o + 1] = a + 1;
    index[o + 2] = a + 2;
    index[o + 3] = a + 1;
    index[o + 4] = a + 3;
    index[o + 5] = a + 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

export function createRollScene(host: HTMLElement, language: Language): RollScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null; // 没有 WebGL —— 调用方去铺静态兜底
  }

  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(TABLE_COLOR, 1);
  host.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(TABLE_COLOR, 26, 62);

  // 32° 长焦，俯视留景深
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.4, 140);
  camera.position.set(0, 4.2, 7.0);
  camera.lookAt(0, 0, 0);

  // ── 摄影棚光 ──
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x3a2c22, 0.85));
  const key = new THREE.DirectionalLight(0xfff6e8, 1.35);
  key.position.set(5, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 34;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffe9cf, 0.3);
  fill.position.set(-7, 5, -6);
  scene.add(fill);

  // ── 案几 ──
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: TABLE_COLOR, roughness: 0.94, metalness: 0.02 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  // ── 贴图 ──
  const atlasCanvas = createAtlasCanvas(language);
  const blockCanvas = createBlockCanvas(language);
  const atlasTex = new THREE.CanvasTexture(atlasCanvas);
  atlasTex.wrapS = THREE.RepeatWrapping;
  atlasTex.wrapT = THREE.ClampToEdgeWrapping;
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const blockTex = new THREE.CanvasTexture(blockCanvas);
  blockTex.wrapS = THREE.RepeatWrapping;
  blockTex.wrapT = THREE.ClampToEdgeWrapping;
  blockTex.colorSpace = THREE.SRGBColorSpace;
  blockTex.anisotropy = atlasTex.anisotropy;

  // ── 滚筒 ──
  const yawGroup = new THREE.Group();
  yawGroup.position.set(0, R, 0);
  scene.add(yawGroup);
  const spinGroup = new THREE.Group();
  yawGroup.add(spinGroup);

  const barrel = new THREE.Mesh(
    buildBarrelGeometry(),
    new THREE.MeshStandardMaterial({ map: blockTex, roughness: 0.62, metalness: 0.08 }),
  );
  barrel.castShadow = true;
  spinGroup.add(barrel);

  const brassTex = new THREE.CanvasTexture(createBrassCanvas());
  brassTex.colorSpace = THREE.SRGBColorSpace;
  const brassMat = new THREE.MeshStandardMaterial({
    map: brassTex,
    color: 0xc89b3c,
    metalness: 0.75,
    roughness: 0.35,
  });
  for (let side = 0; side < 2; side += 1) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R * 1.04, 64), brassMat);
    cap.position.x = (side - 0.5) * (W + 0.04);
    cap.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    cap.castShadow = true;
    spinGroup.add(cap);
  }

  // ── 柔焦接触阴影 ──
  const blobTex = new THREE.CanvasTexture(createBlobCanvas());
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 4.4, R * 4.4),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.006;
  blob.renderOrder = 1;
  scene.add(blob);

  // ── 纸带 ──
  const buffers = createRibbonBuffers();
  const trail = createTrail();
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(buffers.position, 3));
  ribbonGeo.setAttribute('normal', new THREE.BufferAttribute(buffers.normal, 3));
  ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(buffers.uv, 2));
  ribbonGeo.setAttribute('aS', new THREE.BufferAttribute(buffers.aS, 1));
  ribbonGeo.setIndex(new THREE.BufferAttribute(createRibbonIndices(), 1));
  // 顶点每帧动，包围盒靠不住；直接给一个大球，别让 three 去剔除它。
  ribbonGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);
  ribbonGeo.frustumCulled = false;

  const tailUniform = { value: 0 };
  const ribbonMat = new THREE.MeshStandardMaterial({
    map: atlasTex,
    roughness: 0.88,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  ribbonMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTailS = tailUniform;
    shader.uniforms.uTableColor = { value: new THREE.Color(TABLE_COLOR) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aS;\nvarying float vS;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTailS;\nuniform vec3 uTableColor;\nvarying float vS;',
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float tailMix = smoothstep(uTailS, uTailS + ${TAIL_FADE.toFixed(1)}, vS);
        gl_FragColor.rgb = mix(uTableColor, gl_FragColor.rgb, tailMix);`,
      );
  };

  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbon.frustumCulled = false;
  ribbon.receiveShadow = true;
  scene.add(ribbon);

  const resize = (w: number, h: number): void => {
    const rw = Math.max(1, w);
    const rh = Math.max(1, h);
    renderer.setSize(rw, rh);
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
  };

  const dispose = (): void => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    });
    atlasTex.dispose();
    blockTex.dispose();
    brassTex.dispose();
    blobTex.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    renderer,
    camera,
    scene,
    yawGroup,
    spinGroup,
    blob,
    ribbonGeo,
    buffers,
    trail,
    atlasCanvas,
    blockCanvas,
    atlasTex,
    blockTex,
    setTailS: (v) => {
      tailUniform.value = v;
    },
    resize,
    dispose,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx tsc --noEmit -p tsconfig.app.json
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick
git add src/app/roll/scene.ts
git commit -m "$(cat <<'MSG'
feat(roll): 摄影棚场景装配与尾端溶解着色器

滚筒侧壁是手搓的：接缝放在顶部（压印点上不能有缝），UV 由顶点自己的角位置算出，
和纸带走的是同一套算术，于是咬合是构造出来的，不是调出来的。

纸带尾端用 aS / uTailS 的 smoothstep 溶进案几色，避免出现一道锐利的断口。
顶点每帧动，包围盒靠不住，所以直接关掉视锥剔除。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Sound

**Files:**
- Modify: `src/app/sound.ts` (append at the end of the file, after `stampSound`)

**Interfaces:**
- Consumes: the file's existing private `ctx()` and `noiseBuffer()` helpers.
- Produces: `paperRollRumble(ms: number): () => void`, `paperUnfurl(): void`, `woodblockPress(gain?: number): void`.

- [ ] **Step 1: Write the implementation**

Append to `src/app/sound.ts`:

```ts
/**
 * 滚印签纸机：沉重木滚筒碾过案几的低频隆隆 + 宣纸被压出来的连续沙沙。
 * 返回一个停止函数，用法和 motor / bambooRattle 一样。
 */
export function paperRollRumble(ms: number): () => void {
  const audio = ctx();
  if (!audio) return () => undefined;
  const start = audio.currentTime;
  const seconds = ms / 1000;

  // 1. 实木滚筒碾过案几的低频体震
  const body = audio.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(52, start);
  body.frequency.linearRampToValueAtTime(63, start + seconds * 0.35);
  body.frequency.linearRampToValueAtTime(46, start + seconds);
  const bodyGain = audio.createGain();
  bodyGain.gain.setValueAtTime(0.0001, start);
  bodyGain.gain.exponentialRampToValueAtTime(0.07, start + 0.12);
  bodyGain.gain.setValueAtTime(0.07, Math.max(start + 0.12, start + seconds - 0.18));
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  // 2. 木轴与铜箍的摩擦嗡鸣
  const axle = audio.createOscillator();
  axle.type = 'sawtooth';
  axle.frequency.setValueAtTime(122, start);
  axle.frequency.linearRampToValueAtTime(138, start + seconds);
  const axleFilter = audio.createBiquadFilter();
  axleFilter.type = 'lowpass';
  axleFilter.frequency.setValueAtTime(320, start);
  axleFilter.Q.setValueAtTime(1.1, start);
  const axleGain = audio.createGain();
  axleGain.gain.setValueAtTime(0.0001, start);
  axleGain.gain.exponentialRampToValueAtTime(0.026, start + 0.16);
  axleGain.gain.setValueAtTime(0.026, Math.max(start + 0.16, start + seconds - 0.14));
  axleGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  // 3. 宣纸被碾出来的连续沙沙
  const paper = audio.createBufferSource();
  paper.buffer = noiseBuffer(audio, seconds, 0.2);
  const paperFilter = audio.createBiquadFilter();
  paperFilter.type = 'bandpass';
  paperFilter.frequency.setValueAtTime(1900, start);
  paperFilter.Q.setValueAtTime(0.75, start);
  const paperGain = audio.createGain();
  paperGain.gain.setValueAtTime(0.0001, start);
  paperGain.gain.exponentialRampToValueAtTime(0.03, start + 0.2);
  paperGain.gain.setValueAtTime(0.03, Math.max(start + 0.2, start + seconds - 0.12));
  paperGain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  body.connect(bodyGain).connect(audio.destination);
  axle.connect(axleFilter).connect(axleGain).connect(audio.destination);
  paper.connect(paperFilter).connect(paperGain).connect(audio.destination);

  body.start(start);
  body.stop(start + seconds + 0.05);
  axle.start(start);
  axle.stop(start + seconds + 0.05);
  paper.start(start);

  return () => {
    try {
      body.stop();
      axle.stop();
      paper.stop();
    } catch {
      /* 已经停止 */
    }
  };
}

/** 长卷铺开：宣纸从滚筒底下舒展出去、落定在案几上的一声轻响。 */
export function paperUnfurl(): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  const noise = audio.createBufferSource();
  noise.buffer = noiseBuffer(audio, 0.5, 0.9);
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, start);
  filter.frequency.exponentialRampToValueAtTime(2600, start + 0.34);
  filter.Q.setValueAtTime(1.3, start);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.045, start + 0.07);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.46);
  noise.connect(filter).connect(gain).connect(audio.destination);
  noise.start(start);
}

/** 雕版落印：实木压上宣纸的一记闷实顿挫。 */
export function woodblockPress(gain = 0.24): void {
  const audio = ctx();
  if (!audio) return;
  const start = audio.currentTime;

  const thud = audio.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(128, start);
  thud.frequency.exponentialRampToValueAtTime(41, start + 0.075);
  const thudGain = audio.createGain();
  thudGain.gain.setValueAtTime(gain, start);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
  thud.connect(thudGain).connect(audio.destination);
  thud.start(start);
  thud.stop(start + 0.1);

  const grain = audio.createBufferSource();
  grain.buffer = noiseBuffer(audio, 0.05, 22);
  const grainFilter = audio.createBiquadFilter();
  grainFilter.type = 'bandpass';
  grainFilter.frequency.setValueAtTime(1050, start);
  grainFilter.Q.setValueAtTime(1.6, start);
  const grainGain = audio.createGain();
  grainGain.gain.setValueAtTime(gain * 0.55, start);
  grainGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
  grain.connect(grainFilter).connect(grainGain).connect(audio.destination);
  grain.start(start);
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx tsc --noEmit -p tsconfig.app.json && npm test
git add src/app/sound.ts
git commit -m "$(cat <<'MSG'
feat(sound): 滚印签纸机的木滚隆隆、长卷铺展与雕版落印

照旧全部 WebAudio 合成，不下载任何音频文件。paperRollRumble 的返回值是停止函数，
和 motor / bambooRattle 同一个用法，FortuneGame 那边不用改调用形状。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: The React component

**Files:**
- Create: `src/app/components/FortunePaperRoll.tsx`

**Interfaces:**
- Consumes: `createRollScene` / `RollScene` from `../roll/scene`, everything from `../roll/kinematics`, `repaintSlot` from `../roll/textures`, `paperRollRumble` / `paperUnfurl` / `woodblockPress` from `../sound`.
- Produces: `export interface FortunePaperRollProps { state: 'idle' | 'ready' | 'shaking' | 'ejecting'; sheet: Reading | null; fault?: { code: string; text: string } | null; language: Language; soundEnabled?: boolean; onShake: () => void; disabled?: boolean }` and `export default function FortunePaperRoll(props: FortunePaperRollProps): JSX.Element`.

- [ ] **Step 1: Write the implementation**

Create `src/app/components/FortunePaperRoll.tsx`:

```tsx
/**
 * 东方木刻 3D 滚印签纸机。
 *
 * 一只老黑檀木刻印滚在案几上碾过去，身后铺出一条没有尽头的澄心堂宣纸长卷，
 * 滚到哪印到哪 —— 无滑动纯滚动锁定由 roll/kinematics.ts 保证，这里只负责「往哪儿推」。
 *
 * 这个组件**不抽签**。签是按下印键那一刻服务端定死的（AGENTS.md 第 4、5 条），
 * 它只把已经定下来的那一张印出来：sheet 一到，就重画此刻转到滚筒顶上、镜头完全
 * 看不见的那一格，再解出停车弧长，让那一格不偏不倚地停在镜头正中。
 *
 * 帧循环里没有一个 new：所有暂存都在挂载时分配好了。
 */

import { useEffect, useRef, useState } from 'react';
import type { Language } from '../../shared/lang';
import type { Reading } from '../../shared/types';
import {
  CURL_LEN,
  LAND_OFFSET,
  N,
  R,
  cardIndexAt,
  pushTrail,
  resetTrail,
  slotOppositeNip,
  solveStopS,
  spinAngle,
  springK,
  tailS,
  writeRibbon,
} from '../roll/kinematics';
import { createRollScene, type RollScene } from '../roll/scene';
import { previewStick, repaintSlot } from '../roll/textures';
import { paperRollRumble, paperUnfurl, woodblockPress } from '../sound';

export interface FortunePaperRollProps {
  state: 'idle' | 'ready' | 'shaking' | 'ejecting';
  sheet: Reading | null;
  fault?: { code: string; text: string } | null;
  language: Language;
  soundEnabled?: boolean;
  onShake: () => void;
  disabled?: boolean;
}

/** 巡航与冲刺速度（世界单位 / 秒）。 */
const CRUISE = 2.6;
const SPRINT = 5.2;
/** 进入停车段之前还剩多少距离时开始减速。 */
const DECEL_LEN = 4.0;
/** 滑鼠左右滑一个视口宽度，最多能把朝向拧多少（弧度 / 秒）。 */
const YAW_RATE_MAX = 1.15;

/** 帧循环用得到、但不该触发重渲染的那些量，全部塞进一个可变对象里。 */
interface Drive {
  s: number;
  v: number;
  yaw: number;
  yawRate: number;
  yawRateTarget: number;
  nipX: number;
  nipZ: number;
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  camReady: boolean;
  stopS: number | null;
  landed: boolean;
  last: number;
}

export default function FortunePaperRoll(props: FortunePaperRollProps) {
  const { state, sheet, fault, language, soundEnabled, onShake, disabled } = props;
  const en = language === 'en';

  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RollScene | null>(null);
  const [failed, setFailed] = useState(false);

  const driveRef = useRef<Drive>({
    s: 0,
    v: 0,
    yaw: 0,
    yawRate: 0,
    yawRateTarget: 0,
    nipX: 0,
    nipZ: 0,
    camX: 0,
    camY: 4.2,
    camZ: 7,
    lookX: 0,
    lookY: 0,
    lookZ: 0,
    camReady: false,
    stopS: null,
    landed: false,
    last: 0,
  });

  // 帧循环要读、但改了不该重建场景的 props
  const stateRef = useRef(state);
  const soundRef = useRef(soundEnabled ?? false);
  stateRef.current = state;
  soundRef.current = soundEnabled ?? false;

  /* ── 场景生命周期：只建一次 ── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const rolls = createRollScene(host, language);
    if (!rolls) {
      setFailed(true);
      return;
    }
    sceneRef.current = rolls;

    const d = driveRef.current;
    d.last = performance.now();

    let raf = 0;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - d.last) / 1000);
      d.last = now;
      if (dt <= 0) return;

      const k = springK(dt);
      const phase = stateRef.current;

      // 1. 转向：滑鼠横移 → 角速度目标 → 弹簧平滑 → 朝向
      if (phase !== 'ready') d.yawRateTarget = 0;
      d.yawRate += (d.yawRateTarget - d.yawRate) * k;
      d.yaw += d.yawRate * dt;

      // 2. 速度
      let target = 0;
      if (phase === 'ready') target = CRUISE;
      else if (phase === 'shaking') target = SPRINT;
      else if (phase === 'ejecting') target = SPRINT;
      if (d.stopS !== null) {
        const remain = d.stopS - d.s;
        const ease = remain <= 0 ? 0 : remain >= DECEL_LEN ? 1 : remain / DECEL_LEN;
        target = Math.min(target, SPRINT * ease * ease * (3 - 2 * ease));
      }
      d.v += (target - d.v) * k;

      // 3. 前进。局部前进方向是 -Z，所以世界朝向向量是 (-sin yaw, 0, -cos yaw)。
      let step = d.v * dt;
      if (d.stopS !== null && d.s + step >= d.stopS) {
        step = d.stopS - d.s;
        d.v = 0;
        if (!d.landed) {
          d.landed = true;
          if (soundRef.current) woodblockPress();
        }
      }
      d.s += step;
      const fx = -Math.sin(d.yaw);
      const fz = -Math.cos(d.yaw);
      d.nipX += fx * step;
      d.nipZ += fz * step;

      // 4. 滚筒姿态
      rolls.yawGroup.position.set(d.nipX, R, d.nipZ);
      rolls.yawGroup.rotation.y = d.yaw;
      rolls.spinGroup.rotation.x = spinAngle(d.s);
      rolls.blob.position.set(d.nipX, 0.006, d.nipZ);
      rolls.blob.rotation.z = -d.yaw;

      // 5. 纸带
      pushTrail(rolls.trail, d.nipX, d.nipZ, d.s);
      writeRibbon(rolls.buffers, rolls.trail, d.nipX, d.nipZ, fx, fz, d.s);
      rolls.ribbonGeo.attributes.position.needsUpdate = true;
      rolls.ribbonGeo.attributes.normal.needsUpdate = true;
      rolls.ribbonGeo.attributes.uv.needsUpdate = true;
      rolls.ribbonGeo.attributes.aS.needsUpdate = true;
      rolls.setTailS(tailS(rolls.trail, d.s));

      // 6. 弹簧追尾相机。定格时凑近看那张刚印出来的签。
      const close = d.stopS !== null;
      const back = close ? 5.2 : 7.0;
      const up = close ? 3.0 : 4.2;
      const ahead = close ? LAND_OFFSET : CURL_LEN * 2.2;
      const dx = d.nipX - fx * back;
      const dy = R + up;
      const dz = d.nipZ - fz * back;
      const lx = d.nipX - fx * ahead;
      const lz = d.nipZ - fz * ahead;
      if (!d.camReady) {
        d.camX = dx; d.camY = dy; d.camZ = dz;
        d.lookX = lx; d.lookY = 0; d.lookZ = lz;
        d.camReady = true;
      } else {
        d.camX += (dx - d.camX) * k;
        d.camY += (dy - d.camY) * k;
        d.camZ += (dz - d.camZ) * k;
        d.lookX += (lx - d.lookX) * k;
        d.lookZ += (lz - d.lookZ) * k;
      }
      rolls.camera.position.set(d.camX, d.camY, d.camZ);
      rolls.camera.lookAt(d.lookX, d.lookY, d.lookZ);

      rolls.renderer.render(rolls.scene, rolls.camera);
    };
    raf = requestAnimationFrame(frame);

    const onResize = (): void => rolls.resize(host.clientWidth, host.clientHeight);
    const observer = new ResizeObserver(onResize);
    observer.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      rolls.dispose();
      sceneRef.current = null;
      resetTrail(rolls.trail);
    };
    // 场景只建一次。语言变了由下一个 effect 重刻整卷版，不重建场景。
  }, []);

  /* ── 语言换了：整卷重刻 ── */
  useEffect(() => {
    const rolls = sceneRef.current;
    if (!rolls) return;
    for (let slot = 0; slot < N; slot += 1) {
      repaintSlot(rolls.atlasCanvas, slot, previewStick(slot), language, 'paper');
      repaintSlot(rolls.blockCanvas, slot, previewStick(slot), language, 'block');
    }
    // 真的那一支签由下面那个 effect 刻上去；它在 sheet 没变时不会重跑，所以这里补一刀。
    if (sheet) {
      const slot = cardIndexAt((driveRef.current.stopS ?? driveRef.current.s) - LAND_OFFSET);
      repaintSlot(rolls.atlasCanvas, slot, sheet.stick, sheet.language, 'paper');
      repaintSlot(rolls.blockCanvas, slot, sheet.stick, sheet.language, 'block');
    }
    rolls.atlasTex.needsUpdate = true;
    rolls.blockTex.needsUpdate = true;
    // sheet 只是补刀用的，语言才是这个 effect 的触发条件，所以不进依赖数组。
  }, [language]);

  /* ── 签落库：刻上真的那一支，解出停车弧长 ── */
  useEffect(() => {
    const rolls = sceneRef.current;
    const d = driveRef.current;
    if (!rolls) return;
    if (!sheet) {
      d.stopS = null;
      d.landed = false;
      return;
    }
    if (d.stopS !== null) return;

    // 此刻转到滚筒顶上、镜头完全看不见的那一格 —— 玩家看不到任何一张卡片变过内容。
    const slot = slotOppositeNip(d.s);
    repaintSlot(rolls.atlasCanvas, slot, sheet.stick, sheet.language, 'paper');
    repaintSlot(rolls.blockCanvas, slot, sheet.stick, sheet.language, 'block');
    rolls.atlasTex.needsUpdate = true;
    rolls.blockTex.needsUpdate = true;

    d.stopS = solveStopS(d.s, slot);
    d.landed = false;
    if (soundRef.current) paperUnfurl();
  }, [sheet]);

  /* ── 滚动的声音 ── */
  useEffect(() => {
    if (!soundEnabled) return;
    if (state !== 'shaking') return;
    const stop = paperRollRumble(2600);
    return () => stop();
  }, [state, soundEnabled]);

  /* ── 转向输入 ── */
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (state !== 'ready' || disabled) return;
    const box = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - box.left) / box.width) * 2 - 1; // -1 .. 1
    driveRef.current.yawRateTarget = -nx * YAW_RATE_MAX;
  };
  const onPointerLeave = (): void => {
    driveRef.current.yawRateTarget = 0;
  };
  const request = (): void => {
    if (state !== 'ready' || disabled) return;
    onShake();
  };

  if (failed) {
    return (
      <div className="roll-stage">
        <p className="roll-fallback">
          {en
            ? 'This browser cannot run the 3D press. Switch to the retro printer above.'
            : '這台瀏覽器跑不動 3D 滾印機，請在上方改選復古印表機。'}
        </p>
      </div>
    );
  }

  return (
    <div className="roll-stage">
      <div
        ref={hostRef}
        className="roll-canvas-wrapper"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={request}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            request();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={en ? 'Interactive 3D woodblock fortune press' : '3D 木刻滾印籤紙機'}
      />

      <div className="roll-action-area">
        {fault ? (
          <div className="roll-fault-pill" role="alert">
            <span className="fault-badge">{fault.code}</span>
            <span className="fault-text">{fault.text}</span>
          </div>
        ) : state === 'idle' ? (
          <p className="roll-hint">
            {en ? 'Write your thoughts above to ink the block' : '請先在上方虔心寫下所求之事'}
          </p>
        ) : state === 'ready' ? (
          <p className="roll-hint">
            {en
              ? 'Move left and right to steer the press · Click to set it rolling'
              : '左右移動駕馭印滾 · 點擊落印定籤'}
          </p>
        ) : state === 'shaking' ? (
          <p className="roll-hint active">
            {en ? 'The block turns, the paper runs…' : '木刻印滾碾過案几，長卷正在鋪展…'}
          </p>
        ) : (
          <p className="roll-hint highlight">
            {en ? '✦ The impression is set. Reading your fortune… ✦' : '✦ 落印已定，正為您呈遞神諭籤詩… ✦'}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx tsc --noEmit -p tsconfig.app.json
```

Expected: no output. If `tsc` reports an unused import (`noUnusedLocals`), delete it — do not add `void x` suppressions.

- [ ] **Step 3: Commit**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick
git add src/app/components/FortunePaperRoll.tsx
git commit -m "$(cat <<'MSG'
feat(roll): 滚印签纸机组件 —— 转向驾驭、弹簧追尾相机与落印定格

这个组件不抽签。签是按下印键那一刻服务端定死的，它只负责把已经定下来的那张印出来：
sheet 一到就重画**此刻转到滚筒顶上、镜头看不见**的那一格，再解出停车弧长，
让那一格不偏不倚停在镜头正中 —— 玩家看不到任何一张卡片在眼前变过内容。

WebGL 起不来时铺一段静态兜底，并指回上方的复古印表机。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Wire it into the game

**Files:**
- Modify: `src/app/components/FortuneGame.tsx`
- Modify: `src/app/styles.css` (append at the end)

**Interfaces:**
- Consumes: `FortunePaperRoll` from `./FortunePaperRoll`, `paperRollRumble` from `../sound`.
- Produces: nothing downstream.

The vessel labels stay inline ternaries, matching the two buttons already there. They are Traditional Chinese in the existing code while `src/shared/i18n/zh.ts` is Simplified; normalising that is a separate change and is **out of scope for this plan** — do not touch the existing two labels.

- [ ] **Step 1: Widen the vessel type**

In `src/app/components/FortuneGame.tsx`, replace every `'cylinder' | 'printer'` with `Vessel` and add the type + guard above `export default function FortuneGame`:

```tsx
type Vessel = 'cylinder' | 'printer' | 'roll';

const isVessel = (v: string | null): v is Vessel =>
  v === 'cylinder' || v === 'printer' || v === 'roll';
```

Replace the `vessel` state initialiser with:

```tsx
  const [vessel, setVessel] = useState<Vessel>(() => {
    try {
      const v = new URL(window.location.href).searchParams.get('vessel');
      if (isVessel(v)) return v;
      const saved = localStorage.getItem('wenyiqian.vessel');
      if (isVessel(saved)) return saved;
    } catch {
      /* ignore */
    }
    return 'cylinder';
  });

  const selectVessel = useCallback((v: Vessel) => {
    setVessel(v);
    try {
      localStorage.setItem('wenyiqian.vessel', v);
    } catch {
      /* ignore */
    }
  }, []);
```

- [ ] **Step 2: Add the imports**

```tsx
import FortunePaperRoll from './FortunePaperRoll';
```
and extend the existing sound import to include `paperRollRumble`:
```tsx
import {
  bambooRattle,
  chime,
  motor,
  paperRollRumble,
  press as pressSound,
  stampSound,
  typeTick,
} from '../sound';
```

- [ ] **Step 3: Branch the draw-time sound and the eject duration**

In `draw()`, replace the sound block:

```tsx
    if (props.prefs.sound) {
      if (vessel === 'cylinder') {
        stopMotor.current = bambooRattle(PRINT_MS);
      } else if (vessel === 'roll') {
        stopMotor.current = paperRollRumble(PRINT_MS);
      } else {
        pressSound();
        if (!calm) stopMotor.current = motor(PRINT_MS);
      }
    }
```

and replace the eject duration line:

```tsx
      // 滚印机要把签纸整张碾出来再停稳，比签筒多留一点时间。
      const ejectDuration = vessel === 'roll' ? 2200 : vessel === 'cylinder' ? 1200 : EJECT_MS;
```

- [ ] **Step 4: Add the third toggle button**

Inside `.vessel-toggle-bar`, after the printer button:

```tsx
          <button
            type="button"
            role="tab"
            aria-selected={vessel === 'roll'}
            className={`vessel-btn${vessel === 'roll' ? ' active' : ''}`}
            onClick={() => selectVessel('roll')}
            disabled={printing}
          >
            <span aria-hidden="true">📜</span>
            <span>{props.prefs.language === 'en' ? 'Woodblock Press' : '木刻滾印'}</span>
          </button>
```

- [ ] **Step 5: Add the render branch**

Replace the `vessel === 'cylinder' ? (...) : (...)` ternary with an explicit three-way. Keep the existing cylinder and printer blocks byte-for-byte; only the surrounding structure changes:

```tsx
      {vessel === 'roll' ? (
        <div className="roll-slot">
          <FortunePaperRoll
            state={
              phase === 'printing'
                ? 'shaking'
                : phase === 'ejecting'
                  ? 'ejecting'
                  : typed > 0
                    ? 'ready'
                    : 'idle'
            }
            sheet={sheet}
            fault={fault}
            language={sheet ? sheet.language : props.prefs.language}
            soundEnabled={props.prefs.sound}
            onShake={() => void draw()}
            disabled={printing}
          />
        </div>
      ) : vessel === 'cylinder' ? (
        <div className="cylinder-slot">
          {/* …existing FortuneCylinder block, unchanged… */}
        </div>
      ) : (
        <div className={`printer-slot${phase === 'ejecting' ? ' ejecting' : ''}`}>
          {/* …existing Printer block, unchanged… */}
        </div>
      )}
```

- [ ] **Step 6: Styles**

Append to `src/app/styles.css`:

```css
/* 木刻滚印签纸机舞台（Three.js 3D） */
.roll-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 520px;
  width: 100%;
}

.roll-stage {
  position: relative;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.roll-canvas-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  min-height: 360px;
  border-radius: 14px;
  overflow: hidden;
  cursor: grab;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(255, 240, 210, 0.07);
}

.roll-canvas-wrapper:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--on-ground) 60%, transparent);
  outline-offset: 3px;
}

.roll-canvas-wrapper canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.roll-action-area {
  margin-top: 18px;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.roll-hint {
  margin: 0;
  color: var(--on-ground-2);
  font: 400 14px/1.5 var(--serif);
}

.roll-hint.active { color: var(--on-ground); }
.roll-hint.highlight { color: var(--on-ground); font-weight: 600; }

.roll-fault-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-radius: 16px;
  background: color-mix(in srgb, #78191a 22%, transparent);
  border: 1px solid color-mix(in srgb, #78191a 48%, transparent);
  font: 400 13px/1.4 var(--serif);
  color: var(--on-ground);
}

.roll-fallback {
  margin: 0;
  padding: 48px 24px;
  text-align: center;
  color: var(--on-ground-2);
  font: 400 14px/1.6 var(--serif);
}

@media (max-width: 640px) {
  .roll-slot { min-height: 420px; }
  .roll-canvas-wrapper { min-height: 260px; aspect-ratio: 4 / 3; }
}
```

- [ ] **Step 7: Typecheck, test, build**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npx tsc --noEmit -p tsconfig.app.json && npm test && npm run check
```

Expected: `tsc` silent; vitest all green; `npm run check` ends with wrangler's dry-run summary and no error.

- [ ] **Step 8: Commit**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick
git add src/app/components/FortuneGame.tsx src/app/styles.css
git commit -m "$(cat <<'MSG'
feat(roll): 把木刻滚印机接进器具切换栏

vessel 从两个值开成三个，并抽出 isVessel 守卫 —— 旧的 localStorage 值
（cylinder / printer）照样读得回来，没存过的人默认还是宫庙签筒。

滚印机要把签纸整张碾出来再停稳，所以出纸段给 2200ms，比签筒长。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: Verify it in a real browser

**Files:** none changed unless a defect is found.

- [ ] **Step 1: Start the dev server**

Use the preview tooling (not `Bash`) with the existing `.claude/launch.json` entry, then open `http://localhost:5173/?vessel=roll`.

- [ ] **Step 2: Check the console and the network**

Read console messages. Expected: no errors. In particular there must be **no** `THREE.WebGLProgram: shader error`, which is how a bad `onBeforeCompile` patch surfaces.

- [ ] **Step 3: Verify the no-slip lock visually**

Type a question so `state` becomes `'ready'`, then move the pointer left and right across the canvas. Confirm:
- the roller turns and the ribbon curves with it, with no crease or tear at the seam;
- the ink on the barrel and the ink on the paper are the same card — the impression under the nip matches what is carved directly above it;
- the far end of the ribbon fades into the table colour instead of ending in a hard edge;
- there is no visible seam line running along the ribbon or down the barrel's contact line.

- [ ] **Step 4: Verify the draw**

Click the canvas. Confirm the roller sprints, decelerates, and stops with one card centred in frame; that card is the stick the result page then shows. Take a screenshot of the landed card.

- [ ] **Step 5: Check for a per-frame allocation leak**

In the console, run a memory sample over ~30s of idle rolling:

```js
const a = performance.memory?.usedJSHeapSize; await new Promise(r => setTimeout(r, 30000)); [a, performance.memory?.usedJSHeapSize];
```

Expected: the two numbers are within a few hundred KB of each other (GC noise), not growing by megabytes. `performance.memory` is Chromium-only; if it is `undefined`, take two heap snapshots in DevTools instead and compare.

- [ ] **Step 6: Check the other two vessels still work**

Switch to 宮廟籤筒 and 復古印表機. Both must behave exactly as before; the stored preference must survive a reload.

- [ ] **Step 7: Confirm the protected branch was never touched**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick
git log --oneline origin/feat/slip-fx-audio-and-followup -1
git log --oneline feat/3d-paper-roll -8
git status --porcelain
```

Expected: `origin/feat/slip-fx-audio-and-followup` sits on exactly the commit it did at the start; the new branch holds the seven commits above; the tree is clean.

- [ ] **Step 8: Final gate**

```bash
cd /Users/zack/Desktop/manyfold-fortune-stick && npm run check && npm test
```

Expected: both green.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
| --- | --- |
| No-slip lock, R/W/N/CARD_LEN, θ = -s/R | 1 |
| Zero per-frame allocation, MAX_SEG 778 / VERTS | 2 |
| 16-segment peeling curl | 1 (profile) + 2 (applied) |
| `aS` + `uTailS` + `smoothstep(uTailS, uTailS + 3.0, vS)` | 2 (attribute) + 4 (shader) |
| Steering + 32° spring chase camera, k = 1 - e^(-2.6 dt) | 1 (`springK`) + 6 (loop) |
| Ebony barrel, brass caps (0.75/0.35/#c89b3c), blob shadow | 3 + 4 |
| 8-card 宣纸 atlas, 2500 fibres, seals, vertical woodblock type, wave border | 3 |
| Props contract, `ready` steering, click → `onShake()` | 6 |
| Sound | 5 + 7 |
| Branch safety, `tsc --noEmit` clean | 1 (create) + 8 (verify) |

Two gaps are recorded as deliberate deviations above (poem line count, mirrored block) rather than left to the implementer.

**Type consistency check**

`repaintSlot` takes `(canvas, slot, stick, language, mode)` in Tasks 3, 6 and 6's language effect. `createRollScene(host, language)` returns `RollScene | null` in Tasks 4 and 6. `paperRollRumble(ms) => () => void` matches `stopMotor.current`'s type in Task 7, which is `(() => void) | null`. `solveStopS(sNow, slot)` and `slotOppositeNip(s)` are used in Task 6 exactly as Task 1 defines them. `Vessel` is introduced in Task 7 and used only there.

**Known follow-ups (not in this plan)**

- `FortuneCylinder` has no WebGL fallback; `FortunePaperRoll` does. Bringing the cylinder up to parity is its own change.
- The three vessel-toggle labels are inline Traditional-Chinese ternaries while `i18n/zh.ts` is Simplified. Moving all three into the dictionary is its own change, and `tests/i18n.test.ts` will enforce parity when it happens.
