# 籤筒 v2 交接（2026-09-22）

分支 `feat/3d-cylinder-rebuild`。`npm run check` exit 0，152 個測試全過。
開發站：`npm run dev -- --port 5250 --strictPort`，網址 `http://[::1]:5250/?vessel=cylinder3d`
（**vite 綁 IPv6，`localhost` 會被拒**；5173 被使用者另外兩個專案佔著，別動它們）。

## 現況：搖不出籤，卡住

使用者實測連續回報卡住。已修掉四個真 bug，但**最新一次仍然卡住，原因未知**。

## 下一步（先做這個，不要再猜）

加了即時診斷疊層：

    http://[::1]:5250/?vessel=cylinder3d&cyldebug=1

畫布下方會即時顯示：
`stage / state / armed / drag / intens / work / chosen / climb / fall / fps`

請使用者搖到卡住，然後回報那一行。它直接指出卡在哪：

| 症狀 | 意義 |
|---|---|
| `armed false` | 這一局沒被判定成可抽籤 —— 問題沒寫進去，或 requested 卡住 |
| `intens` 很低（<0.3） | 手勢沒被接到，或 pointermove 取樣有問題 |
| `work` 不長 | 累積被 armed 擋掉 |
| `climb` 不長 | 物理沒推動它 —— 回去看 bundle.ts |
| `climb` 到了但 `stage` 還是 shaking | 脫出判定沒觸發 |
| `fall` 有值但 `rest=n` 不變 | eject.ts 沒收斂 |
| `fps` 很低 | 使用者機器效能，或分頁被節流 |

## 已修掉的四個 bug（都是使用者實測抓到的，不要改回去）

1. **停手就沉回筒底** —— CHOSEN_LIFT 打不過重力。
2. **改成無條件上浮** —— 矯枉過正，使用者說「也太怪」。正解是摩擦模型：
   搖才鬆動（`CHOSEN_LIFT × intensity`），停手卡在原地（`GRIP`）。兩者要同時成立。
3. **寫問題前的搖動被記帳** —— `work` 無條件累積，寫完問題隨手一碰就掉籤。
   加了 `armed` 參數。另外 `dy/dt` 在 1ms 的微抖動下會頂滿強度，加了 12ms 下限。
4. **真實強度只有 0.64，不是 1** —— 我所有測試都餵恆定 1，於是參數看起來夠用，
   實際要搖 5.5 秒。已改用真實強度曲線掃過 36 支重新定 `CHOSEN_LIFT = 21`。

## 這個專案的測試教訓

`src/shared/cylinder/` 底下的模組不 import three、不碰 DOM，所以能被 vitest 直接測。
**每一個渲染期才看得見的錯，都是靠把數學擠進這些純函式才抓到的。**
不要把可測邏輯放回 `src/app/` —— `tests/` 由 `tsconfig.worker.json` 編譯（無 DOM lib），
放錯地方會讓 `npm run check` 炸 17 個錯（滾印那邊踩過一次）。

## 還沒做

搖籤音效節流可能太密；木紋偏均勻條紋；竹籤是純方盒沒削尖籤頭；沒有香灰包漿；
擲筊確認那一層沒做。`feat/3d-paper-roll`（木刻滾印）是另一條分支，鏡頭沒框好，
使用者說先留著當第三個器具、不要再花時間。
