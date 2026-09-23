# 御神籤籤紙 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 籤紙改成日本御神籤：朱紅雙線框、表頭「御神签」、等級大紅印、直排籤詩；結果頁的問題卡改成繪馬、解籤按鈕改成朱紅漆木札。

**Architecture:** 只換 `StickFace`（large）的標記與 `.slip*` 樣式，資料與語言規則不動。繪馬沿用 `EmaChrome`，
CSS 選擇器泛化成 `.ema-card` 也吃。`hanNumber` 搬到 `src/shared/numerals.ts` 共用。

**Tech Stack:** React 19、TypeScript、Vitest、純 CSS。

**Spec:** [`specs/2026-09-23-omikuji-slip-design.md`](../specs/2026-09-23-omikuji-slip-design.md)

## Global Constraints

- 籤紙的語言是 `language` prop（由問題推導），不是界面開關（AGENTS.md 第 9 條）；繪馬小字在結果頁用 `copyFor(reading.language)`。
- 紙上的字用 `--ink*`（AGENTS.md 第 8 條）。
- 減少動畫時（`.shell.calm` / `prefers-reduced-motion`）落印不播，印直接出現 —— 既有的全域規則已經處理 `animation`。
- 跑 `npm run check` 前先停 dev server。

---

### Task 1: `hanNumber` 搬到 shared

**Files:**
- Create: `src/shared/numerals.ts`
- Modify: `src/app/cylinder/materials.ts`（刪掉 `HAN_DIGITS` 與 `hanNumber`，改 import）
- Test: `tests/numerals.test.ts`

**Interfaces:**
- Produces: `hanNumber(n: number): string`

- [ ] **Step 1: 測試**

```ts
import { describe, expect, it } from 'vitest';
import { hanNumber } from '../src/shared/numerals';

describe('國字籤號', () => {
  it('籤筒上那種寫法：十、十一、廿、廿三、卅、卅六', () => {
    const cases: Array<[number, string]> = [
      [1, '一'], [9, '九'], [10, '十'], [11, '十一'], [17, '十七'],
      [20, '廿'], [23, '廿三'], [30, '卅'], [36, '卅六'],
    ];
    for (const [n, s] of cases) expect(hanNumber(n)).toBe(s);
  });

  it('1..36 每一個都有字、沒有「〇」混進十位以上', () => {
    for (let n = 1; n <= 36; n += 1) {
      const s = hanNumber(n);
      expect(s.length).toBeGreaterThan(0);
      if (n >= 10) expect(s).not.toContain('〇');
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run tests/numerals.test.ts` → FAIL（找不到模組）

- [ ] **Step 3: 實作** —— `src/shared/numerals.ts`

```ts
/**
 * 籤號的國字寫法 —— 籤筒上的「第廿三籤」、籤紙上的「第十七签」共用這一個。
 * 純函式，瀏覽器與 worker 都能用。
 */

const HAN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1..36 写成签筒上那种汉字签号：十八、廿三、卅六。 */
export function hanNumber(n: number): string {
  if (n < 10) return HAN_DIGITS[n];
  if (n === 10) return '十';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const head = tens === 1 ? '十' : tens === 2 ? '廿' : tens === 3 ? '卅' : HAN_DIGITS[tens] + '十';
  return ones === 0 ? head : head + HAN_DIGITS[ones];
}
```

`materials.ts`：刪掉 `const HAN_DIGITS …` 與 `export function hanNumber …` 整段，加
`import { hanNumber } from '../../shared/numerals';`，檔內原本的呼叫不用改。

- [ ] **Step 4: 跑測試確認通過**：`npx vitest run tests/numerals.test.ts && npx tsc -b` → PASS

- [ ] **Step 5: Commit**：`git commit -m "refactor: hanNumber 搬到 shared/numerals，籤筒與籤紙共用"`

---

### Task 2: 御神籤籤紙

**Files:**
- Modify: `src/app/components/StickFace.tsx`（large 版標記）
- Modify: `src/app/styles.css`（`.slip { … }` 起、到 `.slip-mini[data-lang='en']` 之前整段換掉；
  `.sheet-stack … .slip-level` 的落印動畫改套在 `.slip-level-box` 上）

- [ ] **Step 1: 標記** —— `StickFace.tsx` 的 large 版 `return (...)` 換成：

```tsx
  // 三個字（上上签）的印要小一號才放得下
  const longLevel = [...level].length >= 3 || en;
  return (
    <article className="slip" data-tone={tone.key} data-lang={language}>
      <header className="slip-head">
        <span className="slip-head-band">{en ? 'OMIKUJI' : '御神签'}</span>
        <span className="slip-no">{en ? `NO. ${stick.no} OF ${STICK_COUNT}` : `第${hanNumber(stick.no)}签`}</span>
      </header>

      {/* 等級是一顆朱紅大印：落印動畫套在整顆印上，四種籤運的光暈在印後面 */}
      <div className="slip-seal-row">
        <div className={`slip-level-box${longLevel ? ' long' : ''}`}>
          <div className="level-stamp-aura" aria-hidden="true" />
          <strong className="slip-level">{level}</strong>
        </div>
      </div>

      <div className="slip-title-row">
        <strong className="slip-title">{text.title}</strong>
      </div>

      <div className="slip-body">
        {language === 'zh' ? (
          <div className="slip-grid-columns">
            <p className="slip-column slip-poem">{text.poem[0]}</p>
            <p className="slip-column slip-poem">{text.poem[1]}</p>
            <p className="slip-column slip-meaning">{text.meaning}</p>
          </div>
        ) : (
          <div className="slip-western-poem">
            <p className="slip-poem">{text.poem[0]}</p>
            <p className="slip-poem">{text.poem[1]}</p>
            <p className="slip-meaning">{text.meaning}</p>
          </div>
        )}
      </div>

      <footer className="slip-foot">
        <span className="slip-lucky-badge">
          <span className="lucky-pip" aria-hidden="true" />
          <span className="slip-lucky">
            {en ? `Lucky tone · ${tone.luckyColor.en}` : `吉色 · ${tone.luckyColor.zh}`}
          </span>
        </span>
        <span className="slip-sakura" aria-hidden="true" />
      </footer>
    </article>
  );
```

import 加 `import { hanNumber } from '../../shared/numerals';`。檔頭註解第 2 段改成：
「版式照日本神社的御神籤：朱紅雙線框、表頭「御神签」、等級是一顆朱紅大印、籤名、直排籤詩、吉色。
框與印一律朱紅，四種籤運只留在印後的光暈與吉色色點上（`data-tone`）。」

- [ ] **Step 2: 樣式** —— 取代 `.slip { … }` 起到 `.slip-mini[data-lang='en']` 之前（中間的落印 keyframes 保留，
  只把 `.sheet-stack … .slip-level {` 的動畫選擇器改成 `.slip-level-box`）：

```css
.slip {
  --seal: #c0321f;
  --seal-deep: #9e2517;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(340px, 100%);
  margin: 0 auto;
  padding: 10px 12px 12px;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
  border: 2px solid var(--seal);
  box-shadow: 0 3px 8px rgba(38, 26, 18, 0.08), 0 16px 36px rgba(38, 26, 18, 0.16);
  overflow: hidden;
}

/* 雙線框的內線 */
.slip::before {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid color-mix(in srgb, var(--seal) 70%, transparent);
  pointer-events: none;
}

/* 和紙纖維 */
.slip::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.045;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paperFiber'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.08 0.04' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paperFiber)'/%3E%3C/svg%3E");
}

.slip > * { position: relative; z-index: 1; }

.slip-head {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}

.slip-head-band {
  width: 100%;
  padding: 5px 0 4px;
  background: linear-gradient(180deg, var(--seal), var(--seal-deep));
  color: #fbf3e6;
  text-align: center;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.6em;
  text-indent: 0.6em;
}

.slip-no {
  font-size: 12px;
  letter-spacing: 0.24em;
  text-indent: 0.24em;
  color: var(--ink-2);
}

.slip-seal-row {
  padding: 12px 0 8px;
}

.slip-level-box {
  position: relative;
  width: 92px;
  height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 手蓋的印不是正圓 */
  border-radius: 49% 51% 50% 48%;
  background: radial-gradient(circle at 42% 38%, #d4432c, var(--seal) 55%, var(--seal-deep));
  box-shadow: inset 0 0 0 4px var(--seal), inset 0 0 0 5.5px rgba(251, 243, 230, 0.85), 0 2px 5px rgba(120, 30, 20, 0.25);
}

.slip-level {
  position: relative;
  z-index: 2;
  color: #fbf3e6;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.08em;
  text-indent: 0.08em;
  text-align: center;
}

.slip-level-box.long .slip-level { font-size: 21px; letter-spacing: 0.02em; text-indent: 0.02em; }

.level-stamp-aura {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 140px;
  height: 140px;
  margin: -70px 0 0 -70px;
  border-radius: 50%;
  pointer-events: none;
  z-index: -1;
}

.slip-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 0 10px;
}

.slip-title-row::before,
.slip-title-row::after {
  content: '';
  width: 18px;
  height: 1px;
  background: var(--seal);
}

.slip-title {
  font-size: 19px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: var(--ink);
}

.slip-body {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 10px 6px 12px;
  border-top: 1px solid color-mix(in srgb, var(--seal) 35%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--seal) 35%, transparent);
}

.slip-body p { margin: 0; }

.slip-grid-columns {
  display: flex;
  writing-mode: vertical-rl;
  height: 150px;
}

.slip-column {
  padding: 0 8px;
  border-left: 1px dashed color-mix(in srgb, var(--seal) 40%, transparent);
}

.slip-column:last-child { border-left: none; }

.slip-poem {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.18em;
  color: var(--ink);
}

.slip-meaning {
  font-size: 12.5px;
  line-height: 1.55;
  letter-spacing: 0.12em;
  color: var(--ink-2);
}

.slip-western-poem {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
}

.slip-foot {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 10px;
}

.slip-lucky-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--tone-bg);
  border: 0.5px solid color-mix(in srgb, var(--tone) 30%, transparent);
}

.lucky-pip {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tone);
}

.slip-lucky {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--tone);
}

/* 右下角一朵朱紅櫻花小印 */
.slip-sakura {
  position: absolute;
  right: 6px;
  bottom: 2px;
  width: 16px;
  height: 16px;
  opacity: 0.85;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-10 -10 20 20'%3E%3Cg fill='%23c0321f'%3E%3Cellipse cy='-5' rx='3.4' ry='4.8'/%3E%3Cellipse cy='-5' rx='3.4' ry='4.8' transform='rotate(72)'/%3E%3Cellipse cy='-5' rx='3.4' ry='4.8' transform='rotate(144)'/%3E%3Cellipse cy='-5' rx='3.4' ry='4.8' transform='rotate(216)'/%3E%3Cellipse cy='-5' rx='3.4' ry='4.8' transform='rotate(288)'/%3E%3C/g%3E%3Ccircle r='1.6' fill='%23fbf3e6'/%3E%3C/svg%3E") center / contain no-repeat;
}

/* 英文籤紙 */
.slip[data-lang='en'] { font-family: var(--serif-en); }
.slip[data-lang='en'] .slip-head-band { font-family: var(--serif-en); letter-spacing: 0.5em; text-indent: 0.5em; font-size: 12.5px; }
.slip[data-lang='en'] .slip-no { font-family: var(--serif-en); letter-spacing: 0.16em; font-size: 11px; }
.slip[data-lang='en'] .slip-level { font-family: var(--serif-en); font-size: 12.5px; letter-spacing: 0.12em; text-indent: 0.12em; line-height: 1.25; padding: 0 12px; }
.slip[data-lang='en'] .slip-title { font-family: var(--serif-en); letter-spacing: 0.05em; text-indent: 0; font-size: 18px; }
.slip[data-lang='en'] .slip-poem { font-family: var(--serif-en); font-size: 15px; font-style: italic; letter-spacing: 0.015em; line-height: 1.5; text-wrap: balance; }
.slip[data-lang='en'] .slip-meaning { font-family: var(--serif-en); font-size: 13.5px; letter-spacing: 0.01em; text-wrap: balance; margin-top: 6px; }
.slip[data-lang='en'] .slip-lucky { font-size: 11px; }
```

落印動畫：把 `.sheet-stack .slip-level {`、`.sheet-stack [data-tone='best'] .slip-level {`、`… 'good' …`、`… 'fair' …`、
`… 'low' …` 五處的 `.slip-level` 改成 `.slip-level-box`（keyframes 本身不動）。

- [ ] **Step 3: 型別檢查與測試**：`npx tsc -b && npm test` → 全部通過

- [ ] **Step 4: 瀏覽器確認**：抽一支中文籤、一支英文籤，看表頭、印、籤名、直排／橫排、吉色、櫻花印；印放得下三個字。

- [ ] **Step 5: Commit**：`git commit -m "feat(slip): 籤紙改成日本御神籤"`

---

### Task 3: 結果頁的繪馬與漆木札

**Files:**
- Modify: `src/app/components/Ema.tsx`（`caption?: string`）
- Modify: `src/app/components/ReadingResult.tsx`（問題卡換成繪馬）
- Modify: `src/app/styles.css`（繪馬選擇器泛化、木頭色票移到 `:root`、`.sheet-stack` 版面、`.lead-action` 漆木札）

- [ ] **Step 1: `EmaChrome` 可以指定小字**

```tsx
export function EmaChrome({ children, caption }: { children: ReactNode; caption?: string }) {
  const t = useT();
  return (
    <>
      <span className="ema-cord" aria-hidden />
      <p className="ema-caption" aria-hidden>{caption ?? t('emaCaption')}</p>
      …（其餘不變）
```

- [ ] **Step 2: 結果頁的問題卡** —— `ReadingResult.tsx`，import `EmaChrome`，把 `.scroll-head` 那個 div 換成：

```tsx
          {/* 所求之事：寫在繪馬上。小字跟這一局的語言走（紙上說問題的語言），不跟界面 */}
          <div className="ema-card" data-lang={reading.language}>
            <EmaChrome caption={sheet.emaCaption}>
              <p className="asked">{reading.question}</p>
            </EmaChrome>
          </div>
```

（`sheet` 是檔內已有的 `copyFor(reading.language)`；若它宣告在 JSX 之後的位置不影響，它在 return 之前。）

- [ ] **Step 3: 樣式**

1. 把 `.shell:has(.cyl3d-stage) { --wood-edge … --ema-cut: 22px; }` 那一段的五個變數搬進 `:root`，原段刪掉。
2. 繪馬規則的選擇器：`.shell:has(.cyl3d-stage) .ask-zone` → `:is(.shell:has(.cyl3d-stage) .ask-zone, .ema-card)`；
   `.shell:has(.cyl3d-stage) .ema-cord` / `.ema-caption` / `.ema-mizuhiki` / `.asked` →
   `:is(.shell:has(.cyl3d-stage), .ema-card) .ema-cord` 等。
3. 附加：

```css
/* 結果頁：繪馬、籤紙、漆木札、解籤續頁各自是場景裡的物件，不再是一整卷紙 */
.sheet-stack {
  max-width: 400px;
  background: none;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ema-card {
  width: min(360px, 100%);
  margin: 26px auto 0;
}

.sheet-stack .slip {
  box-shadow: 0 3px 8px rgba(38, 26, 18, 0.08), 0 16px 36px rgba(38, 26, 18, 0.16);
}

.sheet-stack .sheet {
  box-shadow: 0 3px 8px rgba(38, 26, 18, 0.08), 0 16px 36px rgba(38, 26, 18, 0.16);
}

/* 解籤：朱紅漆木札 */
.sheet-actions { padding: 4px 0 6px; }

.sheet-actions .lead-action {
  padding: 9px 30px 9px 34px;
  border-radius: 4px;
  background: linear-gradient(180deg, #cc412b, #a52a1b);
  color: #fbf3e6;
  text-decoration: none;
  font-size: 19px;
  box-shadow: inset 0 0 0 1px rgba(255, 236, 214, 0.25), 0 3px 7px rgba(120, 30, 20, 0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.sheet-actions .lead-action:hover,
.sheet-actions .lead-action:focus-visible {
  text-decoration: none;
  transform: translateY(-1px);
  box-shadow: inset 0 0 0 1px rgba(255, 236, 214, 0.3), 0 5px 10px rgba(120, 30, 20, 0.34);
}
```

- [ ] **Step 4: 型別檢查與測試**：`npx tsc -b && npm test` → 全部通過

- [ ] **Step 5: 瀏覽器確認**：結果頁上方是繪馬、小字跟籤的語言；解籤是朱紅木札；點解籤後續頁有自己的紙與陰影；
  375 寬沒有橫向捲軸。

- [ ] **Step 6: Commit**：`git commit -m "feat(slip): 結果頁的問題寫在繪馬上、解籤是朱紅漆木札"`

---

### Task 4: 交接

- [ ] HANDOFF「下一步」加一段：籤紙改成御神籤（連到 spec 與本計畫）；解籤續頁內部版式還沒改。
- [ ] `npm test && npm run check`（先停 dev server）→ 通過
- [ ] Commit：`git commit -m "docs(slip): 交接"`
