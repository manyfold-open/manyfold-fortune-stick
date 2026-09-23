# 解籤續頁與分享圖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解籤續頁換成御神籤第二頁的樣子；分享圖重畫成神社場景裡的一張御神籤。

**Architecture:** 續頁只動 `ReadingResult.tsx` 一行標記（頂上的帶子）＋ i18n 一個鍵＋ CSS。分享圖拆成
`shareScene.ts`（背景、繪馬、印、櫻花：純 canvas 繪製函式）與 `share.ts`（版面與分享），花瓣位置沿用
`src/shared/sakura.ts`。

**Tech Stack:** React 19、TypeScript、Canvas 2D、純 CSS。

**Spec:** [`specs/2026-09-23-reading-sheet-and-share-design.md`](../specs/2026-09-23-reading-sheet-and-share-design.md)

## Global Constraints

- 續頁的帶子與小標題跟這一局的語言（`copyFor(reading.language)`）；按鈕與錯誤訊息跟界面（AGENTS.md 第 9 條）。
- 分享圖預設不放問題、不放完整解讀與追問；勾選才放問題（產品規則，`share.ts` 檔頭）。
- 分享圖的顏色寫死在 `share.ts` / `shareScene.ts`，不讀 CSS 變數（誰分享出去都是同一張）。
- 不真的點「解签」（會呼叫 agent、計費）；驗證用掛假資料。
- 跑 `npm run check` 前先停 dev server。

---

### Task 1: 解籤續頁

**Files:**
- Modify: `src/shared/i18n/zh.ts`（`sheetBand: '解 签'`）、`src/shared/i18n/en.ts`（`sheetBand: 'READING'`）
- Modify: `src/app/components/ReadingResult.tsx`（`.sheet` 開頭加 `<p className="sheet-band" aria-hidden>{sheet.sheetBand}</p>`，
  兩個 `.sheet`（載入中與有解讀）都加）
- Modify: `src/app/styles.css`（附加一段「解籤續頁：御神籤的第二頁」覆寫：`.sheet`、`.sheet::before`、`.sheet-band`、
  `.sheet-block h3`（櫻花小印 `::before`）、`.sheet-block-lead`、`.sheet-pair`（豎線）、`.sheet-note`、
  `.result-actions .text-action`（木札）與 `.strong`（朱紅漆木札）、`.share-head`、`.check input`、
  `.share-panel .text-action.strong`、`.bubble::before`、`.followup-ticket-summary`、`.ticket-idx`、
  `.quick-asks .text-action`、`.interpreting-spinner`、`.interpreting-status`、`.sheet-loading::after`）

- [ ] **Step 1:** i18n 兩張表加 `sheetBand`；`npx vitest run tests/i18n.test.ts` 通過
- [ ] **Step 2:** `ReadingResult.tsx` 兩處 `.sheet` 開頭加帶子
- [ ] **Step 3:** CSS 覆寫（選擇器掛在 `.result` 底下，印表機走紙等其他地方不受影響）
- [ ] **Step 4:** `npx tsc -b && npm test` 通過
- [ ] **Step 5:** 瀏覽器：用 `import('/src/app/components/ReadingResult.tsx')` 掛一份假的 `Reading`（有解讀、
  `source: 'fallback'` 與正常各一份）看版面；375 寬沒有橫向捲軸
- [ ] **Step 6:** Commit `feat(sheet): 解籤續頁換成御神籤的第二頁`

### Task 2: 分享圖

**Files:**
- Create: `src/app/shareScene.ts` —— 匯出：
  - `paintShrine(g, w, h): void`（暖漸層＋日光、鳥居柱與笠木、兩角櫻花枝、`createPetals(18, 7)` 在 `t = 7.3` 的花瓣）
  - `drawEma(g, cx, top, width, lines: string[], font: string, caption: string): number`（回傳繪馬底緣 y）
  - `drawSeal(g, cx, cy, r, label: string, font: string, aura: string): void`
  - `drawSakuraMark(g, cx, cy, r, color): void`
- Modify: `src/app/share.ts` —— `renderShareImage` 改用上面四個函式畫御神籤；拿掉 `paintGround`、`drawEmblem`、
  `drawCorners` 與四色底 `TONE.ground`（`TONE.tone` 留著給光暈與吉色）。

- [ ] **Step 1:** 寫 `shareScene.ts`
- [ ] **Step 2:** 改 `renderShareImage` 版面：（有問題）繪馬 → 籤紙（表頭帶、籤號、大紅印、籤名、直排／橫排、吉色、櫻花）→ 頁腳
- [ ] **Step 3:** `npx tsc -b && npm test` 通過
- [ ] **Step 4:** 瀏覽器：`import('/src/app/share.ts')` 呼叫 `renderShareImage` 產生中文（有問題／沒問題）與英文三張，
  轉成 `<img>` 掛在頁面上逐張看
- [ ] **Step 5:** Commit `feat(share): 分享圖重畫成神社裡的一張御神籤`

### Task 3: 交接

- [ ] HANDOFF 加一段；`npm test && npm run check`（先停 dev server）；Commit `docs: 交接`
