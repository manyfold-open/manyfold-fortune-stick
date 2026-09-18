# Working on this repository

「问一签」, an online fortune-stick game, built on the Manyfold Cloudflare Workers starter.
Rules for anyone — human or AI agent — iterating on it. These are the load-bearing walls.

## How deployment works

- **Deploys are manual.** This repository is *not* connected to Workers Builds, so merging to
  `main` changes the repo and leaves production exactly where it was. Someone has to run
  `npm run deploy`. Assume a green `main` is not live until you have checked.
- CI (`.github/workflows/ci.yml`) only checks; it never deploys and holds no credentials.
- The build step is load-bearing: `wrangler deploy` ships whatever is sitting in `dist/`
  (via the Cloudflare Vite plugin's deploy-config redirect), and it does not build for you —
  deploying a stale `dist/` silently ships the previous version. `npm run deploy` therefore
  runs `build` first. Keep it that way, and never remove the `build` script.
- After every deploy, verify it: `GET /api/health` must return HTTP 200 JSON, or
  run `npm run smoke -- <url>`.
- If you connect Workers Builds later (README, Path B), come back and rewrite this section.
  It is the only place that records which way round it is, and a wrong answer here is how
  production quietly falls behind `main`.

## Invariants

1. **Keep `wrangler.jsonc` deployable.** `main`, `assets`, and the `DB` binding are read by
   the app. Never edit `database_id` — the Deploy button wrote the real one and changing it
   orphans the user's data.
2. **Keep `GET /api/health` returning 200 JSON.** It is the deploy-verification contract for
   smoke tests and for Workers Builds sanity checks.
3. **Evolve the database only through `SCHEMA` in `src/worker/db.ts`**, with
   `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Keep semicolons out of
   statement bodies (the splitter treats every `;` as a boundary). There is no migration
   step, and nothing may assume one.
4. **Preserve the game's two rules** (they are what make it feel trustworthy):
   - the drawn stick is decided server-side and written to `readings` the moment the print
     key is pressed, and is never re-rolled — a reload, a failed interpretation and a *retry*
     all read the same row back. The paper-feed animation only plays back a stick that is
     already fixed. Only a deliberate 再求一签 starts a new one;
   - 追问 is always grounded in the stored question, stick and reading
     (`buildFollowUpPrompt`), so it cannot drift onto a different stick even if the
     agent-side context is lost.
5. **The AI interprets, it never draws.** `drawStickNo` is the only source of a stick number,
   and nothing parsed out of an agent response may touch `stick_no`, the poem or the level.
   When interpretation fails, fall back to the stick's own `general` / `action` text and keep
   the poem visible — never leave the user with an empty page.
6. **Settings stays URL-only** (`#settings`). It is for whoever deployed the game; do not add
   a link to it from the game UI.
7. **Keep the interface frameless.** The game screen shows the printer and one line of step
   text on its LCD — nothing else. The question is typed straight onto the page (no input
   box, no rule under it), every action is a line of type (`.text-action`), and the only
   physical control is the printer's own key (`.print-key`). New UI goes on the machine or on
   the paper, not into a new box.
8. **Two ink scales, and they are not interchangeable.** `--ink*` is for text on paper (the
   slip, the continuation sheet, record cards); `--on-ground*` is for text printed straight
   onto the background. They invert in dark mode — mixing them is what makes text vanish.
9. **Never commit secrets.** New secrets get a commented entry in `.dev.vars.example` and an
   instruction to run `npx wrangler secret put NAME`. `.dev.vars` is git-ignored; keep it so.
10. **Respect the runtime split.** `src/worker/` runs in workerd only (no Node-built-ins),
   `src/app/` runs in the browser only, `src/shared/` must run in both.
11. **Preserve the credential-security invariants:**
   - the Manyfold device code and agent bearer tokens never appear in an API response, a log
     line, or the browser — they are AES-GCM sealed in D1 (`seal`/`unseal` in
     `src/worker/crypto.ts`);
   - connectivity checks use the non-billing `tasks/get` probe
     (`probeAgentAuth`), never `message/send` — a real turn bills the user;
   - agent-supplied URLs go through `validateA2AUrl` before use (SSRF guard);
   - error strings pass through `safeErrorText` before leaving the worker;
   - A2A `messageId`s are derived from stored rows, not random, so retries cannot
     double-bill (`src/worker/fortune.ts`).
12. **Keep new routes behind the admin gate.** Any route added under `/api/` is protected by
   the `ADMIN_PASSWORD` middleware automatically — do not add exceptions beyond `/api/health`
   and `/api/state` without a reason as good as theirs.

## Checks

Before pushing:

```bash
npm run check   # typecheck + build + wrangler deploy --dry-run
npm test        # vitest unit tests
```

After a deploy:

```bash
npm run smoke -- https://your-app.workers.dev
```

## What is safe to change

Everything else. The stick texts in `src/shared/sticks.ts` (keep every field filled — `general`
and `action` double as the AI-unavailable fallback), the styles, the page structure, extra
tables, extra routes, extra pages. Keep the connect flow (`src/worker/connect.ts`,
`src/worker/a2a.ts`, `src/worker/crypto.ts`) as long as interpretations come from a Manyfold
agent.
