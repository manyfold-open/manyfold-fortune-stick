# AI Fortune Stick · 问一签

一个基于 Cloudflare Workers 和 Manyfold 的 AI 求签体验。

一个问题。一支签。一份解读。

## 这是什么

问一签是一个安静、带有仪式感的线上求签游戏。写下一个问题，按下求签打印机上的按键，得到一支已经固定的签。

先阅读签纸上的签号、等级、签名和签诗，再揭晓一份结合你自身处境的解读。

解读不会武断地预言未来，而是提供一个不同的角度、一个值得留意的地方，以及一件可以马上尝试的小事。

## 一次求签如何进行

1. 用中文或英文写下一个问题。
2. 按下打印机按键。
3. Worker 抽取并记录一支签。
4. 阅读签纸。
5. 揭晓解签。
6. 查看四个部分的解读。
7. 分享结果、继续追问，或再求一签。

解签包括：

- **签意** —— 这支签在说什么
- **回应你的问题** —— 针对当前处境的回应
- **值得留意** —— 可以关注的地方
- **可以做的一件小事** —— 一个实际的下一步

## 服务端决定抽到什么

按下打印机按键时，Worker 就会决定并保存这支签，然后浏览器才会显示它。

浏览器不会自己抽签或重抽。刷新页面、解签失败、重试解签，都会返回同一支签。只有主动开始新的一轮，才会重新抽签。

AI 只负责解读，不会决定签号、签诗、等级或签名。

继续追问时，问题始终围绕最初的问题、同一支签和已有解读展开。

## 分享与隐私

分享功能会生成一张带二维码的签纸图片，扫码可以直接回到游戏。图片包含签号、等级、签诗和一句话签意，完整解读与追问内容不会放进图片里。

求签记录只保存在你的浏览器中。

部署者使用的设置页与游戏分开，只能通过 `#settings` 进入。

## 统计

线上站点用 Google Analytics 4 统计。测量 id 是 `wrangler.jsonc` 里的 `GA_MEASUREMENT_ID` 变量，
不写死在 `index.html` 里：Worker 在返回页面时把代码写进 `<head>`（`src/worker/analytics.ts`）。
把这个变量清空就完全不加载任何统计代码 —— fork 出去、还没有自己的 id 时就该这样。

Consent Mode v2 与它一起下发，并且跑在它前面。在欧洲经济区、英国和瑞士，所有存储类别默认 `denied`，
页面底部出现一行字来问；其他地区默认开启。两种情况都可以在 `/privacy` 改。设置页永远不统计。

五个事件描述一局，其中没有任何一个带上问题、签或解读：

| 事件 | 触发时机 |
| --- | --- |
| `stick_drawn` | Worker 已经抽定一支签（`language`：这一局的语言） |
| `reading_completed` | 解签第一次展示出来 —— 在 GA 里标成关键事件的就是这一个 |
| `follow_up_asked` | 送出一次追问 |
| `reading_shared` | 分享图已经送出（`method`：`share` 或 `download`） |
| `tarot_opened` | 访客前往塔罗 |

本地开发时在 `.dev.vars` 里填一个假的 id（`GA_MEASUREMENT_ID=G-TESTLOCAL0`）：代码、同意那一行和事件都照常工作，
而 `npm run dev` 不会混进真实的数字里。

## 本地运行

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

常用检查：

```bash
npm run check
npm test
npm run smoke -- <url>
```

## 技术架构

- React + TypeScript 前端
- Cloudflare Worker 上的 Hono
- Cloudflare D1：保存求签记录、追问和配置
- Manyfold A2A：连接解签 agent
- 36 支原创签文，支持中文和英文
- [MIT License](LICENSE)
