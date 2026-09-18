# 问一签 — an online fortune-stick game

English · [中文](README_CN.md)

A small, ritual-feeling web game on Cloudflare Workers. You write down what is on your mind,
press the key on the fortune printer, and it prints your stick on a slip of paper. You read
the slip first, and only then tap **解签** for an interpretation written against *your*
question.

One round takes 30–60 seconds. The reading offers angles and one small, doable next step —
it never claims to predict what will happen.

Interpretations come from an [Manyfold](https://manyfold.ai) agent you connect once from the
hidden settings page.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/manyfold-open/manyfold-fortune-stick)

```
┌──────────────┐    ┌───────────────┐    ┌────────────────────┐    ┌──────────────────┐
│ 1. Deploy    │ →  │ 2. Open       │ →  │ 3. Connect an      │ →  │ 4. Share the URL │
│  (button or  │    │    <url>/#set… │    │    agent (approve  │    │    — players just│
│  fork+Builds)│    │    tings      │    │    on Manyfold)    │    │    draw sticks   │
└──────────────┘    └───────────────┘    └────────────────────┘    └──────────────────┘
```

## The game

- **Ask** — one question, 5–120 characters, required. Three example questions for anyone who
  does not know what to ask.
- **Print** — press 印 on the machine. The motor runs, the slip feeds out of the slot, and the
  whole page takes on the colour of the level you drew.
- **Read the slip** — number, level (上上签 / 上签 / 中签 / 下签), the four-character name and a
  two-line poem set vertically. Nothing else yet. You get to look at it and guess before you
  reveal the rest.
- **解签** — the four-part reading: what the stick means in one line, a response to your actual
  question, something worth noticing, and one small thing you can do today.
- **Share / ask again / draw again** — a save-ready image, a follow-up conversation grounded in
  the same stick, or a fresh round.
- **History** — every round is kept in *your* browser; delete one or clear them all.

Two rules the implementation guarantees, not just intends:

1. **The stick is fixed the moment the key is pressed.** It is drawn server-side and written
   to D1 before the browser hears about it. Reloading the page, a failed interpretation and
   *retrying* an interpretation all read back the same row — the paper-feed animation is only
   playing back a stick that is already decided. Nothing re-rolls except a deliberate 再求一签.
2. **Follow-ups never change the stick.** They are grounded in the stored question, stick and
   reading on every turn, so even a lost agent-side context cannot drift onto another stick.

The AI interprets; it never draws. When it is unavailable, the stick's own pre-written general
text is shown (clearly labelled) with a **重试解签** button — the poem stays visible throughout.

## Settings

The settings page is **URL-only: `<your-url>/#settings`**. There is deliberately no link to it
from the game — it is for whoever deployed this, not for players. Connect a Manyfold agent
there once and 解签 starts working.

## Deploying

### Path A — Deploy to Cloudflare button (recommended)

> [!IMPORTANT]
> **Before clicking "Deploy" in the Cloudflare form, expand the "Advanced settings" section once.**
> As of August 2026 a Cloudflare dashboard bug leaves hidden form fields (build API token,
> non-production deploy command) uninitialized while that section is collapsed — the flow then
> stalls silently after creating the repository, with no error shown. Expanding the section
> auto-fills them and the deploy completes normally. This is a dashboard-side issue, not
> specific to this template.

Click the button above. Cloudflare will:

1. create a copy of this repository in your GitHub/GitLab account,
2. provision the D1 database declared in `wrangler.jsonc` and write the real `database_id`
   into your copy,
3. wire the repo to **Workers Builds** — every push to `main` builds (`npm run build`) and
   deploys (`npx wrangler deploy`) automatically.

No secrets are required. Open the Worker URL and you are at step 2 of the diagram.

### Path B — fork / use as template, connect Workers Builds yourself

1. Fork this repo (or "Use this template") on GitHub.
2. Create the database: `npx wrangler d1 create manyfold-app-db`, then paste the returned
   `database_id` into `wrangler.jsonc`.
3. In the Cloudflare dashboard: **Workers & Pages → Create → Connect to Git**, pick your fork,
   set build command `npm run build` and deploy command `npx wrangler deploy`.
4. Push to `main` — Workers Builds deploys it.

### After deploying (both paths)

Recommended once your URL is public — without a password anyone who finds the URL can draw
sticks against (and bill) your agents:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Optional, keeps the credential-encryption key out of the database (see
[Security notes](#security-notes)):

```bash
npx wrangler secret put CONFIG_ENCRYPTION_KEY
```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # then uncomment MANYFOLD_API_BASE_URL / ENVIRONMENT
npm run dev
```

One command runs everything: Vite serves the React app with HMR while the Worker runs in
workerd with a **local D1 database emulated automatically** — the schema is applied on the
first request, so there is no migration step, ever.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (app + worker + local D1) |
| `npm run check` | Typecheck, build, `wrangler deploy --dry-run` |
| `npm test` | Unit tests (vitest) |
| `npm run deploy` | Manual deploy (Workers Builds normally does this) |
| `npm run smoke -- <url>` | Smoke-test a deployment |

## How it is put together

```
Browser (React SPA, dist/client)
   │  /api/* (run_worker_first)             everything else → static assets
   ▼
Hono app (src/worker/index.ts)
   │ ensureSchema → origin check → admin gate
   ├─ /api/connect*   src/worker/connect.ts   Manyfold device-code handshake
   ├─ /api/agents*    src/worker/connect.ts   list / verify / disconnect
   ├─ /api/readings*  src/worker/fortune.ts   draw, interpret, follow-up (SSE)
   ▼
D1 (settings, connect_sessions, agents, readings, reading_messages)
Manyfold A2A (message/stream, tasks/get)   ← per-agent bearer token, decrypted per call
```

| File | Purpose |
| --- | --- |
| `src/worker/index.ts` | Routes, middleware, error mapping |
| `src/worker/connect.ts` | The Manyfold handshake and connected-agent store |
| `src/worker/a2a.ts` | A2A JSON-RPC + SSE stream consumer, SSRF guard, secret redaction |
| `src/worker/fortune.ts` | Drawing, interpreting, follow-ups — the game's server half |
| `src/shared/sticks.ts` | The 36 original sticks (shared by worker and browser) |
| `src/worker/crypto.ts` | AES-GCM seal/unseal, constant-time compare |
| `src/worker/db.ts` | Schema (runtime-applied) and settings store |
| `src/shared/types.ts` | API types shared by worker and browser |
| `src/app/` | React app: the game, history, the URL-only settings page |

## Extending it

This template is a starting point, not a framework. The intended loop:

- **New API route** — add it in `src/worker/index.ts`; anything except `/api/health` and
  `/api/state` is automatically behind the admin password when one is set.
- **New table** — append a `CREATE TABLE IF NOT EXISTS …` to `SCHEMA` in `src/worker/db.ts`;
  it is created on the next request, locally and in production.
- **New page** — add a component and a route in `src/app/App.tsx` (`location.hash`, no router).
- **New sticks or new wording** — `src/shared/sticks.ts`. Keep every field filled: `general`
  and `action` double as the fallback shown when the AI is unavailable.
- **Call your agent from server code** — `credentialFor(env, agentId)` in
  `src/worker/connect.ts` gives you `{ rpcUrl, token }` for any connected agent; see
  `askAgent` in `src/worker/fortune.ts` for a blocking turn and `handleFollowUp` for a
  streaming one.

`AGENTS.md` lists the invariants to preserve while iterating — useful for both humans and
AI agents working on this codebase.

## Security notes

- **The device-code handshake is designed so credentials never touch the browser.** The
  browser sees an opaque `connectId`; the device code (the only thing that can redeem agent
  tokens) is encrypted in D1 and redeemed exactly once. The confirmation code shown in the
  page is the flow's anti-phishing check — the Manyfold consent page must show the same code.
- **Agent tokens are AES-GCM encrypted at rest** with a key derived from
  `CONFIG_ENCRYPTION_KEY`, or — so that one-click deploys work with zero setup — from a
  random key generated on first use and stored in the same database. The trade-off is
  honest: a generated key protects against partial exposure (logs, a table-scoped query) but
  not against a full database dump. Set the secret to remove that caveat.
- **The app is open by default.** Anyone with the URL can connect agents and draw sticks
  until you set `ADMIN_PASSWORD` — which locks the game as well as the settings page. All routes except `/api/health` and `/api/state` then require the
  password (compared in constant time; sent as a header, kept in sessionStorage).
- Agent RPC URLs are validated (https-only, private/loopback addresses rejected in
  production), verification uses a non-billing `tasks/get` probe rather than a real turn, and
  every error string is stripped of anything token-shaped before it can reach a log or the
  browser.

## License

[MIT](LICENSE)
