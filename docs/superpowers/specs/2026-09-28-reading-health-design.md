# 解讀健康度（Reading health）

## 為什麼

Tarot 導流是九成流量（方向 A：求籤當 Tarot 的留存工具）。面板上 Tarot 來的人抽了 537 支，
發出的 Tarot 獎勵只有 236 份；獎勵是「看到解讀、點回 Tarot」才發，所以中間這段是真的流失。
要知道它是 agent 失敗、等太久，還是看了籤就走，現在的數字回答不了：
readings 只留最後狀態（重試會覆蓋）、updated_at 會被追問推進、GA 受 consent 影響只看得到一部分。

## 做什麼

全部是 `daily_stats` 的每日總數（不改 schema，只在 `src/shared/stats.ts` 的 `METRICS` 加名字），
加上從 `readings` 現有欄位讀出來的回溯數字。放在 `#settings` 的 Daily numbers 下面一塊 Reading health。

### 伺服器每次解籤嘗試記一次（`interpretReading`）

真的去問 agent（或因為沒有 agent 而失敗）才算一次；已經有 AI 解讀直接回傳的不算。

- `interpret:ok`
- `interpret:fallback-{unparseable|empty|timeout|manyfold|no-interpreter|other}`，由 `fallbackReason(error)` 分類
- `interpret:retry` —— 這一列之前是 `failed`
- `interpret:t10|t20|t30|t60|t60plus` —— agent 回應時間分桶（沒選到 agent 的不記）

瀏覽器不能送 `interpret:`。計數寫不進去就吞掉，不影響解籤。

### 瀏覽器記（`ReadingResult`，只記剛抽的那一支，重新整理、從記錄打開的不記）

- `reading:shown-ai` / `reading:shown-fallback` —— 解讀第一次攤在眼前（跟 GA `reading_completed` 同一刻）
- `wait:ready|lt3|lt10|lt30|30plus` —— 從按下「解籤」到解讀出現；按的時候已經解好是 `ready`
- `wait:left` —— 按了「解籤」還沒等到就關頁（`pagehide`，`fetch keepalive`）或離開這一頁（再求一籤、回首頁）。iOS 偶爾送不出去，是下限

`POST /api/stats/:metric` 的前綴白名單加上 `reading:`、`wait:`。

### 回溯（讀 `readings`，不新增寫入）

按台北日分組：`interpreted` 數、`failed` 數（照 `fallbackReason` 分類）、`drawn` 且建立超過 2 分鐘的「卡住」數
（解讀一直沒寫回，多半是 warmUp 還沒完成人就走了、請求被取消）。從 9/24 起就有。
回溯不估延遲：`created_at` 在按列印鍵時寫，warmUp 在出籤動畫之後才開始，差值會把動畫算進去，
而 `updated_at` 又會被重試、追問推進 —— 延遲只看上面的精確分桶。

### 面板

卡片：看到解讀（÷ 同期抽籤數）、AI 成功率（每次嘗試）、agent 回應時間、按下解籤後的等待、最終 fallback 與卡住。
比率只用有新計數的那幾天當分母，免得上線前的抽籤把比率壓低。每日表格一張，欄位同上。
紙上的字，用 `--ink`。新文案五張語言表都補；英文不用破折號、連字號。

## 不變

只存每日總數，不存問題、籤號、是誰。`GET /api/stats` 照舊在 admin 門檻後。Tarot 獎勵、歸因、invariants 不動。

## 測試

- `fallbackReason`、回應時間與等待的分桶函式
- `interpretReading` 成功、失敗、重試各記對的計數
- `POST /api/stats` 收 `reading:`、`wait:`，拒絕 `interpret:`
- `readStats` 回溯：interpreted / failed 分類 / 卡住
- 本地 dev server 抽一支、解籤，`#settings` 數字有動
