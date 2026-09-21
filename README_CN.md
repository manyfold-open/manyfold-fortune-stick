# 问一签 —— 在线求签游戏

[English](README.md) · 中文

一个跑在 Cloudflare Workers 上的轻量求签游戏。写下心里的事，按下签运打印机上的印键，机器
打出一张签纸；先看签本身，再主动点「解签」，得到一份结合你自己问题的解读。

一次完整求签大约 30–60 秒。解读给的是思考角度和一件能执行的小事，不以确定语气预言未来。

解读由你连接的 [Manyfold](https://manyfold.ai) agent 生成，只需在隐藏的设置页里连一次。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/manyfold-open/manyfold-fortune-stick)

```
┌──────────────┐    ┌───────────────┐    ┌────────────────────┐    ┌──────────────────┐
│ 1. 部署      │ →  │ 2. 打开       │ →  │ 3. 连接 agent      │ →  │ 4. 把 URL 发出去 │
│  (按钮或     │    │    <url>/#se… │    │  （在 Manyfold 上  │    │    玩家直接      │
│  fork+Builds)│    │    ttings     │    │    授权批准）      │    │    求签即可      │
└──────────────┘    └───────────────┘    └────────────────────┘    └──────────────────┘
```

## 游戏流程

- **提问，中英文都行** —— 一个问题，5–120 字，必填。不知道问什么的话，页面给了三个可点的
  示例。右上角可以在简体中文和 English 之间切换界面；而**用哪种语言写问题，签纸和解读就
  用哪种语言回来**，按下印键那一刻定死。之后再切语言，换的只是机器，不是已经印出来的纸。
- **打印** —— 按下机器面板上的印键（印／PRINT）。马达转起来，签纸从出纸口吐出来，整页的
  底色也换成这一签的等级色。
- **看签** —— 签号、等级、签名和两句签诗。让你先看、先猜，再自己决定什么时候揭晓。中文签纸
  的签诗直排、从右往左；英文签纸横排 —— 一句英文竖着排是读不通的。
- **解签** —— 四段式解读：一句话签意、回应你的问题、值得留意、可以做的一件小事。
- **分享／继续追问／再求一签** —— 一张可保存转发的图，一段基于同一支签的追问，或者新的一轮。
- **求签记录** —— 每一轮都留在**你自己的浏览器**里，可以删除单条或清空全部。

两条规则不是「打算这么做」，而是实现上保证的：

1. **按下印键的那一刻签就定了。** 抽签在服务端进行，先落库再告诉浏览器。刷新页面、解签
   失败、**重试解签**，读回来的都是同一行 —— 走纸动画只是在放一支已经定死的签。除了用户
   主动「再求一签」，没有任何路径会重抽。
2. **追问不会改变签。** 每一轮都把存下来的问题、签和解读原样带进提示词，即使 agent 侧的
   上下文丢了，也不会串到另一支签上。

AI 只负责解签，不负责抽签。AI 不可用时，页面显示这支签预先写好的通用解释（有明确标注）和
**重试解签** 按钮 —— 签诗在整个过程中始终可见。

## 设置页

设置页**只能通过 URL 进入：`<你的地址>/#settings`**，游戏界面上刻意不放入口 —— 它是给部署
这个游戏的人用的，不是玩家流程的一部分。在那里连一次 Manyfold agent，解签就能用了。

## 部署

### 路径 A —— Deploy to Cloudflare 按钮（推荐）

> [!IMPORTANT]
> **在 Cloudflare 表单中点击 "Deploy" 之前，请先展开一次 "Advanced settings" 区域。**
> 截至 2026 年 8 月，Cloudflare 控制台存在一个 bug：该区域折叠时，其中的隐藏字段
> （构建 API token、非生产分支部署命令）不会被初始化 —— 流程会在创建仓库后静默卡住，
> 且不显示任何错误。展开该区域后字段会自动填充，部署即可正常完成。这是控制台侧的
> 问题，与本模板无关。

点击上方按钮，Cloudflare 会：

1. 在你的 GitHub/GitLab 账户中创建这个仓库的副本；
2. 根据 `wrangler.jsonc` 自动创建 D1 数据库，并把真实的 `database_id` 写入你的副本；
3. 将仓库接入 **Workers Builds** —— 之后每次 push 到 `main` 都会自动构建
   （`npm run build`）并部署（`npx wrangler deploy`）。

不需要配置任何 secret。打开 Worker URL，你就已经到了流程图的第 2 步。

### 路径 B —— fork / 使用模板，自己接入 Workers Builds

1. 在 GitHub 上 fork 本仓库（或点 "Use this template"）。
2. 创建数据库：`npx wrangler d1 create manyfold-app-db`，把返回的 `database_id` 填入
   `wrangler.jsonc`。
3. 在 Cloudflare 控制台：**Workers & Pages → Create → Connect to Git**，选择你的 fork，
   构建命令填 `npm run build`，部署命令填 `npx wrangler deploy`。
4. push 到 `main` —— Workers Builds 会完成部署。

### 路径 C —— 不接 Git，手动部署

Workers Builds 不是必需的。fork 之后按路径 B 建好数据库，然后：

```bash
npm install
npm run deploy      # 先构建，再用你本地登录的 wrangler 部署
```

代价是：合并到 `main` 不再会让任何东西上线，只有跑了这条命令，线上才会动。值得清楚自己
处在哪种模式 —— 一个看起来完工的 `main`，和一个落后它一周的线上站点，从外面看是一模一样的。

### 部署之后（任意路径通用）

URL 公开后强烈建议设置 —— 否则任何拿到 URL 的人都能用你的 agents 解签（消耗你的额度）：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

可选，让凭证加密密钥不落在数据库里（见[安全说明](#安全说明)）：

```bash
npx wrangler secret put CONFIG_ENCRYPTION_KEY
```

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars   # 然后取消注释 MANYFOLD_API_BASE_URL / ENVIRONMENT
npm run dev
```

一条命令启动全部：Vite 以 HMR 方式服务 React 应用，Worker 运行在 workerd 中并**自动模拟
本地 D1 数据库** —— schema 在第一个请求时自动创建，永远不需要迁移步骤。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（前端 + worker + 本地 D1） |
| `npm run check` | 类型检查、构建、`wrangler deploy --dry-run` |
| `npm test` | 单元测试（vitest） |
| `npm run deploy` | 先构建再部署。没接 Workers Builds 时，这是唯一的上线方式 |
| `npm run smoke -- <url>` | 对部署运行冒烟测试 |

## 架构一览

```
浏览器（React SPA，dist/client）
   │  /api/*（run_worker_first）             其余请求 → 静态资源
   ▼
Hono 应用（src/worker/index.ts）
   │ ensureSchema → Origin 校验 → 管理密码门
   ├─ /api/connect*   src/worker/connect.ts   Manyfold 设备码授权握手
   ├─ /api/agents*    src/worker/connect.ts   列表 / 验证 / 断开
   ├─ /api/readings*  src/worker/fortune.ts   抽签、解签、追问（SSE）
   ▼
D1（settings、connect_sessions、agents、readings、reading_messages）
Manyfold A2A（message/stream、tasks/get）   ← 每个 agent 独立的 bearer token，调用时解密
```

| 文件 | 用途 |
| --- | --- |
| `src/worker/index.ts` | 路由、中间件、错误映射 |
| `src/worker/connect.ts` | Manyfold 授权握手与已连接 agent 的存储 |
| `src/worker/a2a.ts` | A2A JSON-RPC + SSE 流消费器、SSRF 防护、密钥脱敏 |
| `src/worker/fortune.ts` | 抽签、解签、追问 —— 游戏的服务端那一半 |
| `src/shared/sticks.ts` | 36 支原创签，中英两套（worker 和浏览器共用） |
| `src/shared/lang.ts` | 一局用哪种语言 —— 由问题推导，不落库 |
| `src/shared/i18n/` | 界面文案，每种语言一张表 |
| `src/worker/crypto.ts` | AES-GCM 加解密、常量时间比较 |
| `src/worker/db.ts` | schema（运行时自动应用）与设置存储 |
| `src/shared/types.ts` | worker 与浏览器共享的 API 类型 |
| `src/app/` | React 应用：游戏、求签记录、只走 URL 的设置页 |

## 如何扩展

这个模板是起点，不是框架。预期的迭代方式：

- **加 API 路由** —— 在 `src/worker/index.ts` 中添加；除 `/api/health` 和 `/api/state`
  外的路由在设置了管理密码后会自动受保护。
- **加数据表** —— 在 `src/worker/db.ts` 的 `SCHEMA` 里追加
  `CREATE TABLE IF NOT EXISTS …`；下一个请求就会创建，本地和线上都一样。
- **加页面** —— 在 `src/app/App.tsx` 里加组件和路由（用 `location.hash`，没有 router 依赖）。
- **改签或加签** —— `src/shared/sticks.ts`。`zh` 和 `en` 两套的每个字段都要填满：`general`
  和 `action` 同时是 AI 不可用时的兜底文案，而且英文里残留汉字会被测试挡下来。
- **加界面文案** —— 同时写进 `src/shared/i18n/zh.ts` 和 `en.ts`。漏一个键编译不过，
  `{占位符}` 对不上会有测试失败。
- **在服务端代码里调用你的 agent** —— `src/worker/connect.ts` 的
  `credentialFor(env, agentId)` 会返回任意已连接 agent 的 `{ rpcUrl, token }`；阻塞式的一轮
  见 `src/worker/fortune.ts` 里的 `askAgent`，流式的见 `handleFollowUp`。

`AGENTS.md` 列出了迭代时必须保持的不变量 —— 对人类和 AI agent 都适用。

## 安全说明

- **设备码握手的设计保证凭证永远不经过浏览器。** 浏览器只拿到一个不透明的 `connectId`；
  设备码（唯一能兑换 agent token 的东西）加密存放在 D1 中，且只能兑换一次。页面上显示的
  确认码是这个流程的防钓鱼校验 —— Manyfold 授权页必须显示同一个码。
- **Agent token 以 AES-GCM 加密存储**，密钥来自 `CONFIG_ENCRYPTION_KEY`；为了让一键部署
  零配置可用，未设置时会在首次使用时生成随机密钥并存入同一个数据库。这个取舍是诚实的：
  生成的密钥能防住部分暴露（日志、单表查询），但防不住整库导出。设置 secret 即可消除
  这个隐患。
- **应用默认是开放的。** 在设置 `ADMIN_PASSWORD` 之前，任何拿到 URL 的人都能连接 agent
  并求签解签。设置后，除 `/api/health` 和 `/api/state` 外的所有路由都需要密码（常量时间比较；
  通过 header 传输，存放在 sessionStorage）。
- Agent 的 RPC URL 会被校验（仅允许 https，生产环境拒绝私有/回环地址）；连通性验证使用
  不计费的 `tasks/get` 探测而非真实对话；所有错误信息在到达日志或浏览器之前都会剥离
  任何形似 token 的内容。

## 许可证

[MIT](LICENSE)
