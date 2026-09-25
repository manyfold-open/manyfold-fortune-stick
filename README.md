# AI Fortune Stick

An AI fortune-stick reading built on Cloudflare Workers and Manyfold.

One question. One stick. One reading.

LIVE: https://app.manyfold.ai/fortune-stick/

## What it is

AI Fortune Stick is a quiet, guided fortune-stick experience. Write down a question, press the key on the fortune printer, and receive one fixed fortune stick.

Read the slip first — the number, level, title, and poem — then reveal an interpretation connected to your situation.

The reading does not claim to predict the future. It offers another perspective, something worth noticing, and one small action you can take.

## How a reading works

1. Ask a question in Chinese or English.
2. Press the printer key.
3. The Worker draws and commits one fortune stick.
4. Read the printed slip.
5. Reveal the interpretation.
6. Receive four parts of the reading.
7. Share the result, ask a follow-up, or draw another stick.

The reading includes:

- **What the stick says** — the meaning of the stick
- **On your question** — a response to your situation
- **Worth noticing** — something to pay attention to
- **One small thing you can do** — a practical next step

## Server-authoritative by design

The Worker decides the stick when the printer key is pressed and saves it before the browser displays it.

The browser never draws or re-rolls a stick. Refreshing the page, a failed interpretation, and retrying an interpretation all return the same stick. Only a deliberate new round draws again.

The AI only interprets the stick. It never decides the stick number, poem, level, or title.

Follow-up questions stay grounded in the original question, the same stick, and its reading.

## Sharing and privacy

Sharing creates an image of the slip with a QR code that brings someone back to the game. It includes the stick number, level, poem, and one-line meaning. The full interpretation and follow-up conversation stay out of the image.

Your reading history is kept locally in your browser.

The operator settings page is separate from the game and is available only at `#settings`.

## Analytics

The live site measures itself with Google Analytics 4. The id is the `GA_MEASUREMENT_ID` var in
`wrangler.jsonc`, not something baked into `index.html`: the Worker writes the tag into each page's
`<head>` on the way out (`src/worker/analytics.ts`). Clear the var and no analytics is served at all,
which is what a fork should do until it has its own id.

Consent Mode v2 ships with the tag and runs before it. In the EEA, the UK and Switzerland every
storage type starts `denied` and a single line at the foot of the page asks; elsewhere it starts on.
Either way the visitor can change it on `/privacy`. The settings page is never measured.

Five events describe a round, and none of them carries the question, the stick or the reading:

| Event | When |
| --- | --- |
| `stick_drawn` | the Worker has drawn a stick (`language`: the round's language) |
| `reading_completed` | the interpretation is first shown; mark this one as a key event |
| `follow_up_asked` | a further question is sent |
| `reading_shared` | the share image went out (`method`: `share` or `download`) |
| `tarot_opened` | the visitor went on to Tarot |

For local work, put `GA_MEASUREMENT_ID=G-TESTLOCAL0` in `.dev.vars`: the tag, the consent line
and the events all work, and `npm run dev` stays out of the real numbers.

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Useful checks:

```bash
npm run check
npm test
npm run smoke -- <url>
```

## Architecture

- React + TypeScript frontend
- Hono on a Cloudflare Worker
- Cloudflare D1 for readings, follow-ups, and configuration
- Manyfold A2A for connected interpreters
- 36 original fortune sticks, written in Chinese and English
- [MIT License](LICENSE)
