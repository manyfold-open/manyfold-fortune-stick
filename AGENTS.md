# Working on this repository

「问一签」, an online fortune-stick game, built on the Manyfold Cloudflare Workers starter.
Rules for anyone — human or AI agent — iterating on it. These are the load-bearing walls.

## How deployment works

- **Merging to `main` deploys to production.** This repository is connected to Workers Builds
  (the *Cloudflare Workers and Pages* GitHub App is installed on `manyfold-open`). Every push to
  `main` — including a merged PR — builds and deploys the Worker; the build shows up as the
  `Workers Builds: manyfold-fortune-stick` check on that commit. Treat a merge as a release:
  never merge a PR you have not checked in a browser, and never push straight to `main`.
- Other branches get a **preview** build, not a production deploy — the same check on a PR links
  to it. A green preview check means it built, not that it works.
- CI (`.github/workflows/ci.yml`) only checks; it never deploys and holds no credentials.
- The build step is load-bearing: `wrangler deploy` ships whatever is sitting in `dist/`
  (via the Cloudflare Vite plugin's deploy-config redirect), and it does not build for you —
  deploying a stale `dist/` silently ships the previous version. Workers Builds starts from a
  clean checkout, and its build command in the Cloudflare dashboard must keep running
  `npm run build` before deploying. `npm run deploy` (for a manual deploy from a laptop) runs
  `build` first too. Keep it that way, and never remove the `build` script.
- After every deploy, verify it: `GET /api/health` must return HTTP 200 JSON, or
  run `npm run smoke -- <url>`. A green Workers Builds check means the deploy went out, not that
  the site is healthy.
- If Workers Builds is ever disconnected, come back and rewrite this section. It is the only
  place that records which way round it is, and a wrong answer here is how production quietly
  falls behind `main` — or how an unreviewed merge goes live.

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
7. **Keep the interface frameless — no generic input boxes.** The game screen shows the
   vessel and one line of step text. On the 3D cylinder stage the question is written on a
   hanging wooden ema (`Ema.tsx`) and the examples are wooden tags — objects in the shrine
   scene, not form fields. Every action is a line of type (`.text-action`) or such an object;
   the only other physical control is the machine's own key (`.print-key`). New UI goes on the
   machine, on the paper, or into the shrine scene as an object — not into a new box.
8. **Two ink scales, and they are not interchangeable.** `--ink*` is for text on paper (the
   slip, the continuation sheet, record cards); `--on-ground*` is for text printed straight
   onto the background. The site is daylight-only for now (no dark mode); keep the two scales separate anyway,
   or a future night theme will make text vanish.
9. **The machine speaks the interface language, the paper speaks the question's language.**
   The language menu in the top-right corner sets the interface language (简体中文, English,
   日本語, 한국어; default British English, kept in `localStorage`; a visitor who already chose
   another language keeps it). It moves the LCD, the actions, errors, history chrome and settings — and
   nothing else. A round's language comes from the question and is fixed when the print key
   is pressed: the slip, the interpretation, the four headings over it and every follow-up
   stay in it no matter what the switch does afterwards. Switching language must never
   re-interpret, re-draw or re-bill. `StickFace` takes a required `language` prop so no call
   site can quietly keep printing Chinese.
10. **A round's language is derived, never stored.** `detectLanguage(question)` in
   `src/shared/lang.ts` is a pure function of a column that already exists and never
   changes, which is what lets this work without a migration step (see invariant 3). Do not
   add a `language` column — recompute it. The language the AI actually wrote in is recorded
   inside the `interpretation` JSON blob, which needs no schema.
11. **Error copy lives in the browser, keyed by the API's `code`.** The worker's own message
   strings are a developer-readable fallback; `readings.error` stores a code. An unknown
   code falls through to the server's sentence, so a new route's error is never swallowed —
   that fall-through is the whole point, and it is what tells you an agent-side failure apart
   from every other one. The map and both fall-throughs live in `src/shared/error-copy.ts`.
   A failed parse stores `unparseable` followed by the start of what the agent actually said
   (redacted, truncated); the paper shows only the copy, the raw text is for whoever debugs it.
12. **Never commit secrets.** New secrets get a commented entry in `.dev.vars.example` and an
   instruction to run `npx wrangler secret put NAME`. `.dev.vars` is git-ignored; keep it so.
13. **Respect the runtime split.** `src/worker/` runs in workerd only (no Node-built-ins),
   `src/app/` runs in the browser only, `src/shared/` must run in both.
14. **Preserve the credential-security invariants:**
   - the Manyfold device code and agent bearer tokens never appear in an API response, a log
     line, or the browser — they are AES-GCM sealed in D1 (`seal`/`unseal` in
     `src/worker/crypto.ts`);
   - connectivity checks use the non-billing `tasks/get` probe
     (`probeAgentAuth`), never `message/send` — a real turn bills the user;
   - agent-supplied URLs go through `validateA2AUrl` before use (SSRF guard);
   - error strings pass through `safeErrorText` before leaving the worker;
   - A2A `messageId`s are derived from stored rows, not random, so a double-submit cannot
     double-bill — but they must move when the row does. `interpretMessageId` derives one
     from the row's `updated_at`: two clicks inside the same attempt read the same cursor
     and stay one message, while a deliberate 重试解签 (the row has been written since) is a
     new one. A messageId fixed per reading makes every retry byte-identical to the first,
     and the agent answers it with an empty stream — that button then never works.
   - a fresh draw is interpreted in the background right away (`warmUp` in `FortuneGame.tsx`),
     so every drawn stick bills one turn whether or not 解签 is pressed. Pressing it while that
     request is in flight must reuse it, never send a second one for the same attempt.
15. **Keep new routes behind the admin gate.** Any route added under `/api/` is protected by
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

Everything else. The stick texts in `src/shared/sticks.ts`, `sticks-ja.ts` and `sticks-ko.ts`
(keep every field filled in **all four** languages — `general` and `action` double as the
AI-unavailable fallback; Japanese poem lines stay within 7 characters so the vertical column
never wraps, which `tests/sticks-layout.test.ts` enforces), the interface
copy in `src/shared/i18n/` (all four tables, or the build fails; the English is British English
and uses no dashes or hyphens, which `tests/i18n.test.ts` enforces), the styles, the page structure,
extra tables, extra routes, extra pages. Keep the connect flow (`src/worker/connect.ts`,
`src/worker/a2a.ts`, `src/worker/crypto.ts`) as long as interpretations come from a Manyfold
agent.
