# 问一签 — 简体中文 / English

Design, 2026-09-21. Approved before implementation.

## The rule

> **The machine speaks the interface language. The paper speaks the question's language.**

| Surface | Language comes from |
| --- | --- |
| LCD, buttons, step text, errors, history chrome, settings page | the switch in the top-right corner |
| The slip (name, couplet, meaning, lucky colour), the reading, follow-ups | the question the user typed |

The interface language defaults to 简体中文 for everyone, is switched from the top-right
corner, and is remembered in `localStorage` alongside the existing sound / reduced-motion
preferences. There is no `?lang=` parameter and no browser-language sniffing: the app opens
in Chinese, and one tap changes it.

A round's language is decided by the question and **locked when the print key is pressed**.
Ask in Chinese and the slip, the reading and every follow-up stay Chinese no matter what the
switch is set to afterwards. The switch still works — it just only moves the machine, never
the paper. History therefore shows each record the way it was printed, like a real stack of
slips.

## Why language is not stored

`ensureSchema` (`src/worker/db.ts`) applies the schema with `CREATE TABLE IF NOT EXISTS` on
every request; there is no migration step and nothing may assume one (AGENTS.md, invariant 3).
On an already-deployed database `readings` exists, so adding a column to the `CREATE TABLE`
statement would do nothing and the next insert would fail on "no such column".

No column is needed. The language is a pure function of the question, and the question is
already stored and never modified:

```ts
detectLanguage(row.question)
```

Derived at read time, it cannot drift from the slip that was printed. Schema unchanged,
invariant 3 untouched.

The one thing that *is* recorded is the language the AI actually wrote in, stored inside the
existing `interpretation` JSON blob — free, because a blob has no schema — so the label on an
old reading stays exact even if the detection rule is ever adjusted.

## Components

### 1. Detection — `src/shared/lang.ts` (new, ~20 lines)

```ts
export type Language = 'zh' | 'en';

export const detectLanguage = (question: string): Language =>
  /[㐀-䶿一-鿿豈-﫿]/.test(question) ? 'zh' : 'en';
```

One CJK character anywhere makes the round Chinese. The rule is deliberately blunt: it is
predictable to a user ("I typed Chinese, I got Chinese"), it needs no library, and it runs
identically in workerd and in the browser, so the two sides can never disagree.

`Reading` gains `language: Language`, computed in `toReading()`, so the browser gets it on
every API response without asking.

### 2. Stick content — `src/shared/sticks.ts`

Each stick splits into language-neutral keys plus two text blocks:

```ts
{
  no: 1,
  level: '上上签',
  zh: { title: '云开月明', poem: ['久阴忽散一天青', '明月当空照旧盟'], meaning, general, action },
  en: { title: 'Clouds Part, Moon Clear', poem: [...], meaning, general, action },
}
```

`level` stays a Chinese string because it is a **key**, not display text — `LEVEL_TONE` and
`TONE_BY_LEVEL` index by it and neither changes. Display names and lucky colours are looked
up per language:

| level | English label | 幸运色 | Lucky colour |
| --- | --- | --- | --- |
| 上上签 | GREAT FORTUNE | 靛蓝 | Indigo |
| 上签 | GOOD FORTUNE | 金黄 | Gold |
| 中签 | MIDDLING | 青绿 | Jade |
| 下签 | POOR FORTUNE | 陶褐 | Terracotta |

An accessor `stickText(stick, language)` returns the right block; nothing else reaches into
the stick's text fields.

The 36 English sticks are **written, not translated**. A couplet has to work as English on its
own, and `general` / `action` double as the fallback shown when the AI is unavailable, so every
line must stand alone. This is the largest piece of work in the feature.

### 3. Interface copy — `src/shared/i18n/` (new)

`zh.ts` and `en.ts`: two flat tables of the same shape, a ~30-line `t()`, and a React context
that supplies the current interface language. `en` is constrained with `satisfies typeof zh`,
so omitting a key fails the build. No i18next — two languages and one small game do not need
plurals, date formats, namespaces or lazy loading, and anything in `shared/` has to run in both
runtimes.

### 4. Worker

Small, contained changes:

- `buildInterpretPrompt` / `buildFollowUpPrompt` take a language and emit the matching prompt;
  `TONE_BY_LEVEL` gains English tone guidance; the closing instruction changes from 全部用中文
  to the round's language.
- `fallbackInterpretation` reads `general` / `action` from the matching block.
- `Interpretation` carries `language`.
- Error copy moves to the browser, keyed by the `code` the API already returns. The Chinese
  `message` strings stay as a developer-readable fallback for unknown codes.
  `readings.error` stores a code rather than a sentence.

Nothing about drawing, billing, credentials or the A2A path changes.

### 5. Layout and type

The English slip is horizontal, so `writing-mode: vertical-rl` becomes conditional on
`[data-lang="zh"]` and the English slip gets its own branch in `styles.css`. `share.ts` (372
lines of canvas) gains a matching English path. `index.html` additionally loads `Noto Serif`
(Latin subset — small next to the Noto Serif SC already loaded) so both slips look printed by
the same machine. `document.documentElement.lang` and `<title>` follow the interface language
at runtime; the static HTML stays `zh-CN`, matching the default.

### 6. Tests and documentation

New coverage for `detectLanguage` (pure English, pure Chinese, mixed, emoji-only, a Latin name
inside a Chinese sentence), English prompt assembly, and the English fallback. AGENTS.md gains
an invariant recording the rule above and the fact that language is derived and deliberately
not stored — otherwise the next person adds a column.

## Decisions taken, with reasons

1. **Errors follow the interface language.** The LCD is part of the machine.
2. **The settings page follows the interface language.** It is chrome, not paper.
3. **A follow-up typed in the other language still gets an answer in the round's language.**
   Locked means locked.

## Out of scope

Traditional Chinese, right-to-left languages, translating `README.md` / `README_CN.md`
further, and any change to the connect flow, billing or credential handling.
