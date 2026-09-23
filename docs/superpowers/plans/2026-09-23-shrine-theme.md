# 神社日光主題 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把求籤頁做成日光下的神社：櫻花飄落、鳥居柱、櫻花枝；題目寫在掛著的繪馬上，例句是三塊木札；整站只有白天版。

**Architecture:** 花瓣動力學是 `src/shared/sakura.ts` 的純函式（時間 → 位置，解析式，天生跟幀率無關），
`ShrineBackdrop` 只負責畫（canvas 2D + inline SVG + CSS）。繪馬與木札是既有的 `.ask-zone` /
`.suggestions` 換皮，只在 `.shell:has(.cyl3d-stage)` 下生效；繪馬的紅繩、小字、水引三個小零件放在
`Ema.tsx`，題目輸入與「按下之後」兩個狀態共用。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、純 CSS（無新依賴）。

**Spec:** [`specs/2026-09-23-shrine-theme-design.md`](../specs/2026-09-23-shrine-theme-design.md)

## Global Constraints

- `src/shared/` 不碰 DOM、不 import three（`tests/` 由 `tsconfig.worker.json` 編譯，沒有 DOM lib）。
- i18n：新鍵在 `zh.ts` 與 `en.ts` 兩張表都要有，佔位符一致（`tests/i18n.test.ts`）。
- 繪馬與木札只在 3D 籤筒台上生效（`.shell:has(.cyl3d-stage)`）；印表機等其他器具的外觀不變。
- 題目寫到兩行時籤筒不跳（`.ask-slot` 預留兩行高度、`justify-content: flex-end`）。
- 1440×900、1000×640、375×812 都不捲動、沒有橫向捲軸。
- 減少動畫（`.shell.calm` 或 `prefers-reduced-motion`）時花瓣不動、不跑 rAF。
- 跑 `npm run check` 之前先停掉 dev server（它會把 dev server 洗爛）。

---

### Task 1: 花瓣動力學 `sakura.ts`

**Files:**
- Create: `src/shared/sakura.ts`
- Test: `tests/sakura.test.ts`

**Interfaces:**
- Produces:
  - `interface Petal { seed: number; size: number; y0: number; vy: number; amp: number; freq: number; phase: number; drift: number; spin: number; flipRate: number }`
  - `interface PetalState { x: number; y: number; size: number; rot: number; flip: number }`（flip ∈ [-1, 1]，水平縮放）
  - `createPetals(count: number, seed: number): Petal[]`
  - `petalAt(p: Petal, tSec: number, w: number, h: number): PetalState`
  - `petalCount(width: number): number`（寬 ≥ 900 → 18，否則 10）

- [ ] **Step 1: 寫失敗的測試** —— `tests/sakura.test.ts`

```ts
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

  it('大小有差異但不誇張：8～16px', () => {
    for (const p of petals) {
      expect(p.size).toBeGreaterThanOrEqual(8);
      expect(p.size).toBeLessThanOrEqual(16);
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/sakura.test.ts`
Expected: FAIL，`Failed to resolve import "../src/shared/sakura"`

- [ ] **Step 3: 實作** —— `src/shared/sakura.ts`

```ts
/**
 * 飄落的櫻花瓣 —— 純數學，不碰 DOM。
 *
 * 每片花瓣的位置是**時間的解析函式**，不是一格一格累加出來的：
 * 同一刻永遠畫在同一個地方，跟幀率無關，也不會因為分頁被丟到背景、回來時一格跳很大而亂掉。
 * 掉出下緣就從上緣回來 —— 第幾輪用 floor 算，每一輪換一個水平位置（用花瓣自己的種子雜湊）。
 */

import { pseudoRandom } from './cylinder/geometry';

export interface Petal {
  seed: number;
  /** 花瓣長邊（px）。 */
  size: number;
  /** t = 0 時在第一輪裡的高度（0..1，乘上一輪的長度）。 */
  y0: number;
  /** 往下的速度（px/s）。 */
  vy: number;
  /** 左右擺的幅度（px）與頻率（rad/s）、相位。 */
  amp: number;
  freq: number;
  phase: number;
  /** 風：每秒往右飄多少（px/s），一輪之內累積。 */
  drift: number;
  /** 自轉（rad/s）與翻面的頻率（rad/s）。 */
  spin: number;
  flipRate: number;
}

export interface PetalState {
  x: number;
  y: number;
  size: number;
  rot: number;
  /** 水平縮放 −1..1：翻面時花瓣先變窄、再翻到背面。 */
  flip: number;
}

export function createPetals(count: number, seed: number): Petal[] {
  const rand = pseudoRandom(seed * 7919 + 17);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => ({
    seed: seed * 1000 + i + 1,
    size: 8 + rand() * 8,
    y0: rand(),
    vy: 20 + rand() * 40,
    amp: 12 + rand() * 30,
    freq: 0.5 + rand() * 0.9,
    phase: rand() * Math.PI * 2,
    drift: 4 + rand() * 14,
    spin: (rand() - 0.5) * 1.6,
    flipRate: 0.8 + rand() * 1.6,
  }));
}

/** 第 cycle 輪的水平起點 0..1 —— 花瓣自己的種子加輪數雜湊，確定性。 */
const laneOf = (seed: number, cycle: number): number => pseudoRandom(seed * 131 + cycle * 977 + 3)();

const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

export function petalAt(p: Petal, tSec: number, w: number, h: number): PetalState {
  const t = Math.max(0, finite(tSec, 0));
  const W = Math.max(1, finite(w, 1));
  const H = Math.max(1, finite(h, 1));
  // 一輪：從上緣外一片花瓣高，落到下緣外一片花瓣高
  const span = H + p.size * 2;
  const travel = p.y0 * span + p.vy * t;
  const cycle = Math.floor(travel / span);
  const within = travel - cycle * span;
  const y = within - p.size;
  // 這一輪落了多久：風只在一輪之內累積，回到上緣就歸零
  const tIn = within / p.vy;
  const base = laneOf(p.seed, cycle) * W;
  // 擺動加風之後可能超出畫面：折回 [−size, W + size]
  let x = base + p.amp * Math.sin(p.freq * t + p.phase) + p.drift * tIn;
  const lo = -p.size;
  const hi = W + p.size;
  const range = hi - lo;
  x = lo + ((((x - lo) % range) + range) % range);
  return {
    x,
    y,
    size: p.size,
    rot: p.spin * t + p.phase,
    flip: Math.cos(p.flipRate * t + p.phase * 1.7),
  };
}

export const petalCount = (width: number): number => (width >= 900 ? 18 : 10);
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/sakura.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: Commit**

```bash
git add src/shared/sakura.ts tests/sakura.test.ts
git commit -m "feat(theme): 櫻花瓣動力學 —— 時間的解析函式，跟幀率無關"
```

---

### Task 2: 神社背景 `ShrineBackdrop` ＋ 一律白天

**Files:**
- Create: `src/app/components/ShrineBackdrop.tsx`
- Modify: `src/app/App.tsx`（game 路由掛上 `<ShrineBackdrop calm={prefs.reducedMotion} />`）
- Modify: `src/app/styles.css`（刪掉兩段 `@media (prefers-color-scheme: dark)`；`color-scheme: light`；新增 `.shrine-*` 樣式）

**Interfaces:**
- Consumes: `createPetals`, `petalAt`, `petalCount`（Task 1）
- Produces: `export default function ShrineBackdrop(props: { calm: boolean })`

- [ ] **Step 1: 元件** —— `src/app/components/ShrineBackdrop.tsx`

```tsx
/**
 * 神社的日光：兩側朱紅鳥居柱、角落櫻花枝、飄落的櫻花瓣。
 *
 * 純裝飾：fixed、pointer-events: none、aria-hidden，在所有內容後面。
 * 花瓣的位置由 shared/sakura.ts 用時間算（跟幀率無關）；這裡只負責畫。
 * 減少動畫時只畫一格靜止的花瓣、不跑 rAF；分頁看不見時停掉 rAF。
 */

import { useEffect, useRef } from 'react';
import { createPetals, petalAt, petalCount, type Petal } from '../../shared/sakura';

const PINK_HI = '#fbd9e0';
const PINK_LO = '#eda5b6';

/** 一片櫻花瓣：尖端有個小缺口，原點在中心，長邊沿 y。 */
function drawPetal(g: CanvasRenderingContext2D, s: number): void {
  const w = s * 0.62;
  const h = s;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.bezierCurveTo(w * 0.9, h * 0.25, w * 0.75, -h * 0.45, w * 0.18, -h / 2);
  g.lineTo(0, -h * 0.36);
  g.lineTo(-w * 0.18, -h / 2);
  g.bezierCurveTo(-w * 0.75, -h * 0.45, -w * 0.9, h * 0.25, 0, h / 2);
  g.closePath();
  const grad = g.createLinearGradient(0, h / 2, 0, -h / 2);
  grad.addColorStop(0, PINK_LO);
  grad.addColorStop(1, PINK_HI);
  g.fillStyle = grad;
  g.fill();
}

function SakuraBranch({ side }: { side: 'left' | 'right' }) {
  // 右邊那枝是左邊鏡像過去的
  const flowers: Array<[number, number, number]> = [
    [70, 58, 15], [118, 40, 12], [150, 88, 14], [205, 60, 11], [42, 104, 12], [236, 104, 9],
  ];
  return (
    <svg
      className={`shrine-branch ${side}`}
      viewBox="0 0 280 180"
      aria-hidden
      style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M-10 20 C 60 34, 120 30, 170 62 S 250 96, 282 118" stroke="#6b4a36" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M96 38 C 110 58, 130 70, 150 88" stroke="#6b4a36" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M40 30 C 44 60, 42 84, 42 104" stroke="#6b4a36" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {flowers.map(([cx, cy, r], i) => (
        <g key={i} transform={`translate(${cx} ${cy}) rotate(${i * 23})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy={-r * 0.55} rx={r * 0.42} ry={r * 0.58} fill={i % 2 ? '#f7c6d1' : '#fbd9e0'} transform={`rotate(${a})`} />
          ))}
          <circle r={r * 0.2} fill="#d9576f" />
        </g>
      ))}
    </svg>
  );
}

export default function ShrineBackdrop({ calm }: { calm: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const reduce = calm || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let petals: Petal[] = [];
    let w = 0;
    let h = 0;
    const fit = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      petals = createPetals(petalCount(w), 7);
    };
    const paint = (t: number): void => {
      g.clearRect(0, 0, w, h);
      for (const p of petals) {
        const s = petalAt(p, t, w, h);
        g.save();
        g.translate(s.x, s.y);
        g.rotate(s.rot);
        g.scale(Math.max(0.12, Math.abs(s.flip)), 1);
        g.globalAlpha = 0.85;
        drawPetal(g, s.size);
        g.restore();
      }
    };
    fit();
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number): void => {
      paint((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    const start = (): void => {
      cancelAnimationFrame(raf);
      if (reduce) paint(0);
      else if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    const onResize = (): void => {
      fit();
      start();
    };
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', start);
    };
  }, [calm]);

  return (
    <div className="shrine" aria-hidden>
      <div className="shrine-light" />
      <div className="shrine-pillar left" />
      <div className="shrine-pillar right" />
      <SakuraBranch side="left" />
      <SakuraBranch side="right" />
      <canvas ref={canvasRef} className="shrine-petals" />
    </div>
  );
}
```

- [ ] **Step 2: 掛到 App** —— `src/app/App.tsx`

在 import 區加 `import ShrineBackdrop from './components/ShrineBackdrop';`，在 `<header className="topbar">` 前一行加：

```tsx
      {route === 'game' && <ShrineBackdrop calm={prefs.reducedMotion} />}
```

- [ ] **Step 3: 一律白天** —— `src/app/styles.css`

刪掉第 81 行起的 `@media (prefers-color-scheme: dark) { :root { … } .stage::before … .sheet-stack { … } }` 整段，與第 1700 行起 skeleton 那一小段 dark 覆寫。第 59 行 `color-scheme: light dark;` 改成 `color-scheme: light;`。第 19–20 行註解改成：

```css
  /* --ink* 只用在纸上（签纸、续页、记录卡、繪馬、木札）。直接落在底色上的字用 --on-ground*。
     目前只有白天版；兩套仍然分開用，將來要加夜晚版時才不會混。 */
```

- [ ] **Step 4: 背景樣式** —— 附加到 `src/app/styles.css` 末尾

```css
/* ── 神社日光（ShrineBackdrop）── 在 .stage::before（z -2）之上、內容之下 */
.shrine {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
}

.shrine-light {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(60% 55% at 12% 0%, rgba(255, 246, 222, 0.85), rgba(255, 246, 222, 0) 70%),
    radial-gradient(50% 40% at 92% 8%, rgba(255, 236, 205, 0.5), rgba(255, 236, 205, 0) 70%);
}

/* 景深外的鳥居柱：朱紅、模糊、淡，只在寬螢幕 */
.shrine-pillar {
  position: absolute;
  top: -4vh;
  bottom: -4vh;
  width: 54px;
  background: linear-gradient(90deg, #9e2418, #c8412c 45%, #a82a1c);
  filter: blur(3px);
  opacity: 0.38;
}

.shrine-pillar::before {
  /* 上方一截笠木的影子，往畫面內伸 */
  content: '';
  position: absolute;
  top: 9vh;
  width: 220px;
  height: 26px;
  background: linear-gradient(180deg, #2c211c, #3a2a22);
  border-radius: 3px;
}

.shrine-pillar.left { left: 2.2vw; }
.shrine-pillar.left::before { left: -30px; }
.shrine-pillar.right { right: 2.2vw; }
.shrine-pillar.right::before { right: -30px; }

.shrine-branch {
  position: absolute;
  top: -18px;
  width: clamp(150px, 20vw, 280px);
  height: auto;
  opacity: 0.92;
}

.shrine-branch.left { left: -24px; }
.shrine-branch.right { right: -24px; }

.shrine-petals {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* 解籤頁：花瓣淡一半，不干擾讀籤 */
.shell:not(:has(.cyl3d-stage)) .shrine-petals { opacity: 0.45; }

@media (max-width: 899px) {
  .shrine-pillar { display: none; }
}
```

- [ ] **Step 5: 型別檢查與測試**

Run: `npx tsc -b && npm test`
Expected: 無錯誤；全部測試通過

- [ ] **Step 6: 瀏覽器確認**（墊虛擬時鐘，見 HANDOFF 的驗證技巧）

1440×900：看得到兩側淡淡的朱紅柱、左上右上櫻花枝、花瓣在動（推 60 格前後截圖比較）；
375×812：柱子藏起來、枝變小。開「动画已减少」：花瓣不動。

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ShrineBackdrop.tsx src/app/App.tsx src/app/styles.css
git commit -m "feat(theme): 神社日光背景 —— 鳥居柱、櫻花枝、飄落的花瓣；一律白天"
```

---

### Task 3: 繪馬

**Files:**
- Create: `src/app/components/Ema.tsx`
- Modify: `src/app/components/QuestionForm.tsx`（`.ask-zone` 裡加上繪馬零件）
- Modify: `src/app/components/FortuneGame.tsx`（按下之後的 `.asked`，3D 籤筒時也放在繪馬上）
- Modify: `src/shared/i18n/zh.ts`、`src/shared/i18n/en.ts`（`emaCaption`）
- Modify: `src/app/styles.css`（取代 `.shell:has(.cyl3d-stage) .ask-*` 那一段）

**Interfaces:**
- Produces: `export function EmaChrome(props: { children: ReactNode }): JSX.Element` —— 輸出 `<span class="ema-cord">`、
  `<p class="ema-caption">`、children、`<svg class="ema-mizuhiki">`

- [ ] **Step 1: i18n**

`zh.ts` 在 `askGhost` 後加：`emaCaption: '絵馬 · 心願',`
`en.ts` 在 `askGhost` 後加：`emaCaption: 'EMA · MAKE A WISH',`

- [ ] **Step 2: 零件** —— `src/app/components/Ema.tsx`

```tsx
/**
 * 繪馬的零件：上方的紅繩、牌頂的小字、底下的紅色水引。
 *
 * 只是裝飾，外觀全在 styles.css：只有 3D 籤筒台上（.shell:has(.cyl3d-stage)）才顯示，
 * 其他器具下這三樣是 display: none，題目照舊直接寫在頁面上。
 */

import type { ReactNode } from 'react';
import { useT } from '../i18n';

export function EmaChrome({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <>
      <span className="ema-cord" aria-hidden />
      <p className="ema-caption" aria-hidden>{t('emaCaption')}</p>
      {children}
      <svg className="ema-mizuhiki" viewBox="0 0 160 18" aria-hidden>
        <path d="M4 9 H62" stroke="#bb2a1c" strokeWidth="1.2" />
        <path d="M98 9 H156" stroke="#bb2a1c" strokeWidth="1.2" />
        <path d="M80 9 C 70 0, 62 2, 64 9 C 62 16, 70 18, 80 9 C 90 0, 98 2, 96 9 C 98 16, 90 18, 80 9 Z" fill="none" stroke="#bb2a1c" strokeWidth="1.4" />
        <path d="M80 9 L 72 17 M80 9 L 88 17" stroke="#bb2a1c" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </>
  );
}
```

- [ ] **Step 3: 題目輸入放上繪馬** —— `QuestionForm.tsx`

import 加 `import { EmaChrome } from './Ema';`。把 `.ask-zone` 裡的內容包進 `EmaChrome`：

```tsx
      <div className="ask-zone">
        <EmaChrome>
          {/* 用 data-value 撑开高度：输入区自己长高，不需要 JS，也不会出现滚动条。 */}
          <div className="ask-grow" data-value={props.value}>
            …（原本的 textarea 與 ghost 不變）
          </div>
        </EmaChrome>
      </div>
```

檔頭註解的第 1 點改成：「四个角上的裁切线（.ask-zone）；3D 籤筒台上换成一块挂着的繪馬（Ema.tsx），题目写在牌上」。

- [ ] **Step 4: 按下之後也在繪馬上** —— `FortuneGame.tsx`

import 加 `import { EmaChrome } from './Ema';`。把

```tsx
          <p className="asked">{question}</p>
```

換成

```tsx
          vessel === 'cylinder3d' ? (
            <div className="ask-zone">
              <EmaChrome>
                <p className="asked">{question}</p>
              </EmaChrome>
            </div>
          ) : (
            <p className="asked">{question}</p>
          )
```

- [ ] **Step 5: 樣式** —— `src/app/styles.css`

把 `/*\n * 題目框與例句：同一個寬度（--ask-w）` 開頭那段、一直到 `.suggest-dot` 之前（`--ask-w`、`.ask-slot`、`.ask-zone`、hover、`.ask-grow`、`.suggest-slot`）換成：

```css
/*
 * 題目寫在一塊掛著的繪馬上（Ema.tsx）。使用者：「更有日式感覺…對話框可以小一點」。
 * 形狀用 px 定角的 clip-path，寫到兩行、牌子變高時角不會被拉歪；clip-path 會吃掉
 * box-shadow，所以陰影用 filter: drop-shadow，而且裁切只做在兩層偽元素上 ——
 * 紅繩在牌子外面，不能跟著被裁掉。
 */
.ema-cord,
.ema-caption,
.ema-mizuhiki {
  display: none;
}

.shell:has(.cyl3d-stage) {
  --wood-edge: #8f6a43;
  --wood: #ecd9b8;
  --wood-hi: #f5e8cf;
  --wood-ink: #3b2a1e;
  --ema-cut: 22px;
}

.shell:has(.cyl3d-stage) .ask-slot,
.shell:has(.cyl3d-stage) .ask-slot.printed {
  /* 兩行字的繪馬高 ≈ 136：一行時紅繩落在這段預留空間裡，寫到兩行籤筒也不跳 */
  min-height: 140px;
  padding: 0;
}

.shell:has(.cyl3d-stage) .ask-zone {
  position: relative;
  isolation: isolate;
  width: min(420px, 100%);
  max-width: none;
  margin: 26px auto 0;
  padding: 18px 26px 10px;
  background: none;
  filter: drop-shadow(0 6px 10px rgba(92, 62, 32, 0.22));
  transition: transform 0.3s ease;
}

.shell:has(.cyl3d-stage) .ask-zone::before,
.shell:has(.cyl3d-stage) .ask-zone::after {
  content: '';
  position: absolute;
  z-index: -1;
  /* 直接寫在偽元素上：--ema-cut 在內層改成 20px 才會生效（寫成另一個自訂屬性會在父層就被算死） */
  clip-path: polygon(0 var(--ema-cut), var(--ema-cut) 0, calc(100% - var(--ema-cut)) 0, 100% var(--ema-cut), 100% 100%, 0 100%);
}

/* 外層：深木邊 */
.shell:has(.cyl3d-stage) .ask-zone::before {
  inset: 0;
  background: var(--wood-edge);
}

/* 內層：淺木面加細木紋 */
.shell:has(.cyl3d-stage) .ask-zone::after {
  inset: 3px;
  --ema-cut: 20px;
  background:
    repeating-linear-gradient(92deg, rgba(120, 84, 46, 0.05) 0 2px, transparent 2px 9px),
    linear-gradient(180deg, var(--wood-hi), var(--wood));
}

.shell:has(.cyl3d-stage) .ask-zone:hover,
.shell:has(.cyl3d-stage) .ask-zone:focus-within {
  transform: rotate(-0.6deg);
}

/* 紅繩：從牌頂正中往上分成倒 V，中間一個小結 */
.shell:has(.cyl3d-stage) .ema-cord {
  display: block;
  position: absolute;
  left: 50%;
  bottom: 100%;
  width: 70px;
  height: 26px;
  transform: translateX(-50%);
  background:
    linear-gradient(to top right, transparent calc(50% - 1px), #b8321f calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) left / 50% 100% no-repeat,
    linear-gradient(to top left, transparent calc(50% - 1px), #b8321f calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) right / 50% 100% no-repeat;
}

.shell:has(.cyl3d-stage) .ema-cord::after {
  content: '';
  position: absolute;
  left: 50%;
  top: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transform: translateX(-50%);
  background: #b8321f;
}

.shell:has(.cyl3d-stage) .ema-caption {
  display: block;
  margin: 0 0 2px;
  text-align: center;
  font: 600 10.5px/1.4 "Yuanti SC", "Yuanti TC", "Hiragino Maru Gothic ProN", "PingFang SC", sans-serif;
  letter-spacing: 0.3em;
  color: var(--accent);
}

.shell:has(.cyl3d-stage) .ema-mizuhiki {
  display: block;
  width: 150px;
  height: 17px;
  margin: 4px auto 0;
}

.shell:has(.cyl3d-stage) .ask-grow > .ask-input,
.shell:has(.cyl3d-stage) .ask-grow > .ask-ghost,
.shell:has(.cyl3d-stage) .ask-grow::after {
  font-size: clamp(18px, 3.4vw, 21px);
  line-height: 1.6;
  color: var(--wood-ink);
}

.shell:has(.cyl3d-stage) .ask-ghost {
  color: color-mix(in srgb, var(--wood-ink) 55%, transparent);
}

.shell:has(.cyl3d-stage) .asked {
  color: var(--wood-ink);
  font-size: clamp(16px, 3.2vw, 19px);
}

.shell:has(.cyl3d-stage) .suggest-slot {
  padding-top: 16px;
}
```

- [ ] **Step 6: 型別檢查與測試**

Run: `npx tsc -b && npm test`
Expected: 無錯誤；`tests/i18n.test.ts` 在內全部通過

- [ ] **Step 7: 瀏覽器確認**

1440×900：繪馬寬 ≤ 420、五角形、紅繩在上、小字與水引在；寫兩行時籤筒畫布的 top 不變
（`document.querySelector('.cyl3d-canvas-wrapper').getBoundingClientRect().top` 寫字前後相同）。
按下抽籤後題目仍在繪馬上。英文介面小字是「EMA · MAKE A WISH」。

- [ ] **Step 8: Commit**

```bash
git add src/app/components/Ema.tsx src/app/components/QuestionForm.tsx src/app/components/FortuneGame.tsx src/shared/i18n/zh.ts src/shared/i18n/en.ts src/app/styles.css
git commit -m "feat(theme): 題目寫在掛著的繪馬上"
```

---

### Task 4: 例句是木札

**Files:**
- Modify: `src/app/components/FortuneGame.tsx`（拿掉間隔點 `suggest-dot`）
- Modify: `src/app/styles.css`（取代例句橫排那段）

- [ ] **Step 1: 拿掉間隔點** —— `FortuneGame.tsx`

刪掉這兩行，並把 `.map((example, i) =>` 改回 `.map((example) =>`：

```tsx
            {/* 橫排時句子之間的間隔點；直排時藏起來（styles.css） */}
            {i > 0 && <span className="suggest-dot" aria-hidden>·</span>}
```

- [ ] **Step 2: 樣式** —— `src/app/styles.css`

把 `.shell:has(.cyl3d-stage) .suggestions .text-action {` 起、到 `@media (min-width: 860px) { … }` 結束的整段（含 `.suggest-dot`）換成：

```css
/* 例句是三塊小木札：淺木、細木邊、左邊一朵紅櫻花印 */
.shell:has(.cyl3d-stage) .suggestions {
  gap: 10px;
}

.shell:has(.cyl3d-stage) .suggestions .text-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 13px 5px 10px;
  border-radius: 4px;
  background: linear-gradient(180deg, var(--wood-hi), var(--wood));
  box-shadow: inset 0 0 0 1px var(--wood-edge), 0 2px 4px rgba(92, 62, 32, 0.18);
  font-family: var(--serif);
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0.03em;
  color: var(--wood-ink);
  opacity: 0.92;
  text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.shell:has(.cyl3d-stage) .suggestions .text-action::before {
  content: '';
  flex: none;
  width: 11px;
  height: 11px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-10 -10 20 20'%3E%3Cg fill='%23c8412c'%3E%3Cellipse cy='-5' rx='3.4' ry='4.8'/%3E%3Cellipse cy='-5' rx='3.4' ry='4.8' transform='rotate(72)'/%3E%3Cellipse cy='-5' rx='3.4' ry='4.8' transform='rotate(144)'/%3E%3Cellipse cy='-5' rx='3.4' ry='4.8' transform='rotate(216)'/%3E%3Cellipse cy='-5' rx='3.4' ry='4.8' transform='rotate(288)'/%3E%3C/g%3E%3Ccircle r='1.6' fill='%23fbe3a0'/%3E%3C/svg%3E") center / contain no-repeat;
}

.shell:has(.cyl3d-stage) .suggestions .text-action:hover:not(:disabled),
.shell:has(.cyl3d-stage) .suggestions .text-action:focus-visible {
  opacity: 1;
  text-decoration: none;
  transform: translateY(-2px) rotate(-1deg);
  box-shadow: inset 0 0 0 1px var(--wood-edge), 0 5px 8px rgba(92, 62, 32, 0.22);
}

/* 直排（英文介面、窄螢幕）：每塊一樣寬 */
.shell:has(.cyl3d-stage) .suggestions li {
  display: flex;
  justify-content: center;
}

.shell:has(.cyl3d-stage) .suggestions .text-action {
  width: min(340px, 100%);
  justify-content: center;
}

@media (min-width: 860px) {
  .shell:has(.cyl3d-stage) .suggestions[data-lang='zh'] {
    flex-direction: row;
    justify-content: center;
    gap: 12px;
  }

  .shell:has(.cyl3d-stage) .suggestions[data-lang='zh'] .text-action {
    width: auto;
  }
}
```

- [ ] **Step 3: 型別檢查與測試**

Run: `npx tsc -b && npm test`
Expected: 無錯誤；全部通過

- [ ] **Step 4: 瀏覽器確認**

1440×900 中文：三塊木札一排、置中；英文、820 寬、375 寬：直排、同寬；
三種大小 `scrollHeight == innerHeight`、`scrollWidth == innerWidth`。寫字後木札淡出、位置保留。

- [ ] **Step 5: Commit**

```bash
git add src/app/components/FortuneGame.tsx src/app/styles.css
git commit -m "feat(theme): 例句是三塊小木札"
```

---

### Task 5: 規則與交接

**Files:**
- Modify: `AGENTS.md`（第 7、8 條）
- Modify: `docs/superpowers/HANDOFF-cylinder.md`（下一步那節）
- Modify: `docs/superpowers/specs/2026-09-23-shrine-theme-design.md`（解籤頁花瓣：只淡一半，不減量）

- [ ] **Step 1: AGENTS.md 第 7 條** 換成：

```markdown
7. **Keep the interface frameless — no generic input boxes.** The game screen shows the
   vessel and one line of step text. On the 3D cylinder stage the question is written on a
   hanging wooden ema (`Ema.tsx`) and the examples are wooden tags — objects in the shrine
   scene, not form fields. Every action is a line of type (`.text-action`) or such an object;
   the only other physical control is the machine's own key (`.print-key`). New UI goes on the
   machine, on the paper, or into the shrine scene as an object — not into a new box.
```

- [ ] **Step 2: AGENTS.md 第 8 條** 把 "They invert in dark mode — mixing them is what makes text vanish." 換成
"The site is daylight-only for now (no dark mode); keep the two scales separate anyway, or a
future night theme will make text vanish."

- [ ] **Step 3: HANDOFF 下一步** 加一段：神社主題已做（背景、繪馬、木札、一律白天），連到 spec 與本計畫。

- [ ] **Step 4: spec** 第 2 節最後一點改成「解籤頁（籤紙出來之後）花瓣淡到一半，不干擾閱讀。」

- [ ] **Step 5: 全部檢查**（先停 dev server）

Run: `npm test && npm run check`
Expected: 全部通過；`--dry-run: exiting now.`

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/superpowers/HANDOFF-cylinder.md docs/superpowers/specs/2026-09-23-shrine-theme-design.md
git commit -m "docs(theme): AGENTS.md 第 7、8 條跟著繪馬與白天版改寫"
```
