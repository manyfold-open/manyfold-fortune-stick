# 问一签 Bilingual (简体中文 / English) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player use 问一签 in Simplified Chinese or English, where the interface language is a switch in the top-right corner and each round's language is decided by the question the player typed and locked when the print key is pressed.

**Architecture:** One rule — *the machine speaks the interface language, the paper speaks the question's language.* The interface language is a `localStorage` preference read through a React context. A round's language is **derived**, never stored: `detectLanguage(question)` is a pure function of a column that already exists and never changes, which sidesteps the fact that this repo has no migration step. Stick content splits into symmetric `zh` / `en` blocks behind a `stickText(stick, language)` accessor.

**Tech Stack:** TypeScript, React 19, Hono on Cloudflare Workers, D1, Vite 8, vitest 4. No new runtime dependencies.

## Global Constraints

- **No new runtime dependencies.** No i18next, no react-intl. `package.json` `dependencies` stays exactly `hono`, `react`, `react-dom`.
- **No schema change.** `SCHEMA` in `src/worker/db.ts` is not edited by any task. There is no migration step and nothing may assume one (AGENTS.md invariant 3).
- **Runtime split** (AGENTS.md invariant 10): `src/worker/` is workerd-only, `src/app/` is browser-only, `src/shared/` must run in both. UI copy is browser-only and therefore lives in `src/app/i18n/`, **not** `src/shared/` — this refines the spec, which said `src/shared/i18n/`. Only `Language`, `detectLanguage`, stick data and `LEVEL_LABEL` are shared, because the worker builds prompts from them.
- **Interface language default is `'zh'`** for every visitor. No `navigator.language` sniffing, no `?lang=` parameter.
- **Locked means locked.** Nothing may re-interpret, re-draw or re-bill because the interface language changed. `drawStickNo` remains the only source of a stick number (AGENTS.md invariant 5).
- **Two ink scales stay separate** (AGENTS.md invariant 8): `--ink*` on paper, `--on-ground*` on the background.
- **Settings stays URL-only** (AGENTS.md invariant 6). No language switch may add a link to it.
- **Every commit leaves `npm run check` and `npm test` green.**
- English stick text contains **no CJK characters**; Chinese stick text contains **no ASCII letters** except inside proper nouns (there are none today).
- Commit messages follow the repo's existing voice: lowercase-free, declarative, explaining the *why*. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Language detection

**Files:**
- Create: `src/shared/lang.ts`
- Test: `tests/lang.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Language = 'zh' | 'en'`; `detectLanguage(question: string): Language`.

- [ ] **Step 1: Write the failing test**

Create `tests/lang.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../src/shared/lang';

describe('detectLanguage', () => {
  it('纯中文问题是中文', () => {
    expect(detectLanguage('我该如何面对最近的工作变化？')).toBe('zh');
  });

  it('纯英文问题是英文', () => {
    expect(detectLanguage('Should I take this job offer?')).toBe('en');
  });

  it('一个汉字就够：中英混排按中文处理', () => {
    expect(detectLanguage('Kevin 会回我消息吗')).toBe('zh');
    expect(detectLanguage('我该不该 accept 这个 offer')).toBe('zh');
  });

  it('扩展区汉字和兼容区汉字同样算中文', () => {
    expect(detectLanguage('㐀的事')).toBe('zh');
    expect(detectLanguage('城市的城')).toBe('zh');
  });

  it('全角标点、假名和 emoji 都不足以判成中文', () => {
    expect(detectLanguage('Will it work??')).toBe('en');
    expect(detectLanguage('Should I go 🤔')).toBe('en');
    expect(detectLanguage('ありがとう')).toBe('en');
  });

  it('空字符串落到英文，不抛错', () => {
    expect(detectLanguage('')).toBe('en');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lang.test.ts`
Expected: FAIL — `Failed to resolve import "../src/shared/lang"`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/lang.ts`:

```ts
/**
 * 一局求签用哪种语言，由问题本身决定 —— 不是界面上的开关。
 *
 * 规则故意写得很钝：问题里只要出现一个汉字就是中文，否则英文。钝有两个好处 ——
 * 用户能预测（我打中文就得到中文），以及 workerd 和浏览器跑的是同一个函数，
 * 两边永远不会得出不同的答案。
 *
 * 这个值从不落库。它是 `readings.question` 的纯函数，而那一列写进去之后就不再改，
 * 所以每次读取都能算回当初印出来的那张纸的语言 —— 这个库没有迁移步骤，
 * 能不加列就不加列。
 *
 * 假名和全角标点不算：一句日文或者一个中文问号，都不代表这个人要读中文解签。
 */

export type Language = 'zh' | 'en';

/** CJK 统一表意文字：基本区、扩展 A 区、兼容表意文字。不含假名与标点。 */
const HAN = /[㐀-䶿一-鿿豈-﫿]/;

export const detectLanguage = (question: string): Language => (HAN.test(question) ? 'zh' : 'en');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lang.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lang.ts tests/lang.test.ts
git commit -m "$(cat <<'EOF'
Decide a round's language from the question, not a switch

A pure function of a column that already exists and never changes, so the
language of an old reading can always be recomputed and no column has to be
added to a database that has no migration step.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Bilingual stick data, behaviour unchanged

**Files:**
- Modify: `src/shared/sticks.ts` (all 36 entries + types + accessors)
- Modify: `src/worker/fortune.ts` (`stickBlock`, `fallbackInterpretation`, `parseInterpretation`)
- Modify: `src/app/components/StickFace.tsx`
- Modify: `src/app/share.ts`
- Modify: `src/app/constants.ts`
- Test: `tests/fortune.test.ts`

**Interfaces:**
- Consumes: `Language` from `src/shared/lang.ts`.
- Produces:
  - `interface StickText { title: string; poem: [string, string]; meaning: string; general: string; action: string }`
  - `interface FortuneStick { no: number; level: StickLevel; zh: StickText; en: StickText }`
  - `stickText(stick: FortuneStick, language: Language): StickText`
  - `LEVEL_LABEL: Record<Language, Record<StickLevel, string>>`
  - `stickByNo(no: number): FortuneStick | undefined` (unchanged signature)
  - `STICK_COUNT` (unchanged)
  - `LEVEL_TONE[level].luckyColor` becomes `Record<Language, string>` in `src/app/constants.ts`

This task makes the data bilingual and leaves behaviour **identical**: every consumer is mechanically rewritten to `stickText(stick, 'zh')`. Later tasks replace that literal with the real language. Proof of no behaviour change: the existing Chinese assertions in `tests/fortune.test.ts` keep passing untouched.

- [ ] **Step 1: Write the failing test**

Append to `tests/fortune.test.ts`:

```ts
import { LEVEL_LABEL, stickText } from '../src/shared/sticks';
import { detectLanguage } from '../src/shared/lang';

describe('英文签库', () => {
  it('每支签都有 zh 和 en 两套文字，字段齐全，签诗都是两句', () => {
    for (const entry of STICKS) {
      for (const language of ['zh', 'en'] as const) {
        const text = stickText(entry, language);
        expect(text.title.length).toBeGreaterThan(0);
        expect(text.poem).toHaveLength(2);
        expect(text.poem[0].length).toBeGreaterThan(0);
        expect(text.poem[1].length).toBeGreaterThan(0);
        expect(text.meaning.length).toBeGreaterThan(0);
        // general / action 同时是 AI 不可用时的兜底，必须能独立成话。
        expect(text.action.length).toBeGreaterThan(0);
      }
      expect(stickText(entry, 'zh').general.length).toBeGreaterThan(20);
      expect(stickText(entry, 'en').general.length).toBeGreaterThan(60);
    }
  });

  it('英文那一套里没有汉字 —— 漏翻会被这条抓住', () => {
    const han = /[㐀-䶿一-鿿豈-﫿]/;
    for (const entry of STICKS) {
      const text = stickText(entry, 'en');
      const joined = `${text.title}${text.poem[0]}${text.poem[1]}${text.meaning}${text.general}${text.action}`;
      expect(han.test(joined), `第 ${entry.no} 签的英文里还有汉字`).toBe(false);
    }
  });

  it('英文那一套自己就能被认成英文', () => {
    for (const entry of STICKS) {
      expect(detectLanguage(stickText(entry, 'en').general)).toBe('en');
    }
  });

  it('36 个英文签名互不重复', () => {
    const titles = STICKS.map((entry) => stickText(entry, 'en').title);
    expect(new Set(titles).size).toBe(36);
  });

  it('下签的英文文案同样不恐吓', () => {
    const scary = ['disaster', 'doomed', 'ruin', 'catastrophe', 'death', 'fail utterly'];
    for (const entry of STICKS.filter((one) => one.level === '下签')) {
      const text = stickText(entry, 'en');
      const joined = `${text.meaning} ${text.general} ${text.action}`.toLowerCase();
      for (const word of scary) expect(joined).not.toContain(word);
    }
  });

  it('四个等级都有英文名', () => {
    expect(LEVEL_LABEL.en['上上签']).toBe('GREAT FORTUNE');
    expect(LEVEL_LABEL.en['上签']).toBe('GOOD FORTUNE');
    expect(LEVEL_LABEL.en['中签']).toBe('MIDDLING');
    expect(LEVEL_LABEL.en['下签']).toBe('POOR FORTUNE');
    expect(LEVEL_LABEL.zh['上上签']).toBe('上上签');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fortune.test.ts`
Expected: FAIL — `stickText` and `LEVEL_LABEL` are not exported from `src/shared/sticks`.

- [ ] **Step 3: Restructure the types and accessors in `src/shared/sticks.ts`**

Replace the type block at the top of the file with:

```ts
import type { Language } from './lang';

export type StickLevel = '上上签' | '上签' | '中签' | '下签';

/** 一支签在某一种语言下的全部文字。两种语言的形状完全一样。 */
export interface StickText {
  /** 签名。中文是四个字，英文是一个同样意象的短语。 */
  title: string;
  /** 两句签诗。中文是七言，英文是两行能自己成立的对句 —— 不是逐字直译。 */
  poem: [string, string];
  /** 一句话签意。 */
  meaning: string;
  /** 通用解释：不知道用户问题时也成立的一段话。 */
  general: string;
  /** 行动方向：具体、今天就能做的一件小事。 */
  action: string;
}

export interface FortuneStick {
  /** 签号 1–36，与数组下标 +1 一致。 */
  no: number;
  /**
   * 等级。这是**键**，不是显示文字 —— LEVEL_TONE、TONE_BY_LEVEL 都按它索引，
   * 所以它在两种语言下都保持中文。要显示给人看的名字查 LEVEL_LABEL。
   */
  level: StickLevel;
  zh: StickText;
  en: StickText;
}

/** 等级给人看的名字。中文就是等级本身，英文是纸票上那一行大写字。 */
export const LEVEL_LABEL: Record<Language, Record<StickLevel, string>> = {
  zh: { 上上签: '上上签', 上签: '上签', 中签: '中签', 下签: '下签' },
  en: {
    上上签: 'GREAT FORTUNE',
    上签: 'GOOD FORTUNE',
    中签: 'MIDDLING',
    下签: 'POOR FORTUNE',
  },
};

/** 取一支签在某种语言下的文字。除了这里，没有别处直接读 stick.zh / stick.en。 */
export const stickText = (stick: FortuneStick, language: Language): StickText =>
  language === 'en' ? stick.en : stick.zh;
```

- [ ] **Step 4: Rewrite all 36 entries into `zh` / `en` blocks**

Mechanical for `zh` (the five existing text fields move inside a `zh: { … }` block, unchanged, character for character). The `en` block is **written, not translated**.

Writing rules for the English text — these are what the tests in Step 1 enforce and what a reviewer checks:

- `title` — a 2–4 word English phrase carrying the same image as the four characters. Title Case. Not a gloss: 云开月明 → `Clouds Part, Moon Clear`.
- `poem` — two lines that work as English on their own. Keep the couplet's turn (line 1 sets the scene, line 2 answers it). Roughly 6–10 words per line. No end rhyme forced, no archaic "thee/thine".
- `meaning` — one plain sentence, under 90 characters.
- `general` — 60–90 words, true without knowing the question. **This is also the text shown when the AI is unavailable**, so it must read as a complete thought on its own.
- `action` — one concrete thing doable today, under 90 characters, imperative.
- Tone baseline, same as the Chinese: 上上签 talks about opportunity and momentum, 下签 talks about slowing down, observing and adjusting. Never frightening, never predicting that something will certainly happen.

The first three entries, complete, as the pattern for the remaining 33:

```ts
export const STICKS: readonly FortuneStick[] = [
  {
    no: 1,
    level: '上上签',
    zh: {
      title: '云开月明',
      poem: ['久阴忽散一天青', '明月当空照旧盟'],
      meaning: '等了很久才看不清的事，现在开始有清楚的样子了。',
      general: /* 原文原样搬过来，一个字都不改 */ '',
      action: /* 原文原样搬过来 */ '',
    },
    en: {
      title: 'Clouds Part, Moon Clear',
      poem: [
        'Long overcast, and then the whole sky turns blue',
        'The bright moon returns and keeps the old promise',
      ],
      meaning: 'Something you could not see clearly for a long time is taking shape.',
      general:
        'A long stretch of not knowing is ending. What changed is not your situation so much as your view of it — the parts that were guesswork are turning into things you can actually check. This is a good moment to write down what you now know for certain, because clarity fades faster than you expect. Move while you can still see the shape of things.',
      action: 'Write down the one thing you understand today that you did not understand last month.',
    },
  },
  // …no: 2 and no: 3 follow the same shape…
];
```

> The remaining 33 `en` blocks are written in this step. They are content, not logic: the tests in Step 1 are the gate (every field filled, no CJK, unique titles, `general` over 60 characters, 下签 free of frightening words), and the reviewer reads them for voice.

- [ ] **Step 5: Update `src/app/constants.ts` for per-language lucky colours**

```ts
import type { Language } from '../shared/lang';
import type { StickLevel } from '../shared/sticks';

export const QUESTION_MIN = 5;
export const QUESTION_MAX = 120;
export const PRINT_MS = 1900;
export const EJECT_MS = 620;

/**
 * 四个等级的视觉主题。`key` 是 CSS 里 `[data-tone]` 的取值 —— 颜色只写在 styles.css，
 * 这里只负责把等级映射过去，外加签纸上那一行「幸运色」。
 */
export const LEVEL_TONE: Record<
  StickLevel,
  { key: string; luckyColor: Record<Language, string> }
> = {
  上上签: { key: 'best', luckyColor: { zh: '靛蓝', en: 'Indigo' } },
  上签: { key: 'good', luckyColor: { zh: '金黄', en: 'Gold' } },
  中签: { key: 'fair', luckyColor: { zh: '青绿', en: 'Jade' } },
  下签: { key: 'low', luckyColor: { zh: '陶褐', en: 'Terracotta' } },
};
```

- [ ] **Step 6: Point every consumer at `stickText(stick, 'zh')`**

No behaviour change — the literal `'zh'` is replaced with a real language in Tasks 4, 5 and 8.

In `src/worker/fortune.ts`:

```ts
import { STICK_COUNT, stickByNo, stickText, type FortuneStick } from '../shared/sticks';

function stickBlock(stick: FortuneStick): string {
  const text = stickText(stick, 'zh');
  return [
    `第 ${stick.no} 签 · ${stick.level} · ${text.title}`,
    `签诗：${text.poem[0]}，${text.poem[1]}`,
    `这支签的固定含义：${text.meaning}`,
    `这支签的通用解释：${text.general}`,
  ].join('\n');
}

export function fallbackInterpretation(stick: FortuneStick): Interpretation {
  const text = stickText(stick, 'zh');
  return {
    meaning: text.meaning,
    answer: text.general,
    notice: '这一份是这支签的通用解释，还没有结合你的问题。',
    action: text.action,
    source: 'fallback',
  };
}
```

In `parseInterpretation`, replace the two `stick.meaning` / `stick.action` reads with a `const text = stickText(stick, 'zh');` at the top of the function and `text.meaning` / `text.action` at the use sites.

In `src/app/components/StickFace.tsx`, `src/app/share.ts`: add `const text = stickText(stick, 'zh');` and read `text.title`, `text.poem`, `text.meaning` through it. In `share.ts` also change `LEVEL_TONE[stick.level].luckyColor` to `LEVEL_TONE[stick.level].luckyColor.zh`.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. The pre-existing Chinese assertions pass unchanged — that is the proof this task changed no behaviour.

Run: `npm run check`
Expected: typecheck, build and `wrangler deploy --dry-run` all succeed.

- [ ] **Step 8: Commit**

```bash
git add src/shared/sticks.ts src/shared/lang.ts src/app/constants.ts src/worker/fortune.ts src/app/components/StickFace.tsx src/app/share.ts tests/fortune.test.ts
git commit -m "$(cat <<'EOF'
Give all 36 sticks an English face

The English couplets are written rather than translated: general and action
double as the text shown when the AI is unavailable, so each one has to stand
on its own. Every reader goes through stickText(), which still asks for 'zh'
everywhere — behaviour is unchanged and the existing assertions prove it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Interface language — dictionary, context, and the switch

**Files:**
- Create: `src/app/i18n/zh.ts`
- Create: `src/app/i18n/en.ts`
- Create: `src/app/i18n/index.tsx`
- Modify: `src/app/storage.ts` (`Prefs` gains `language`)
- Modify: `src/app/App.tsx` (provider, switch, its own strings)
- Test: `tests/i18n.test.ts`

**Interfaces:**
- Consumes: `Language` from `src/shared/lang.ts`.
- Produces:
  - `type Copy` — the shape of the dictionary, inferred from `zh`.
  - `LanguageProvider({ language, children })` — React context provider.
  - `useT(): (key: keyof Copy, vars?: Record<string, string | number>) => string`
  - `useUiLanguage(): Language`
  - `Prefs { sound: boolean; reducedMotion: boolean; language: Language }`, `language` defaulting to `'zh'`.

- [ ] **Step 1: Write the failing test**

Create `tests/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { zh } from '../src/app/i18n/zh';
import { en } from '../src/app/i18n/en';
import { format } from '../src/app/i18n/index';

describe('界面字典', () => {
  it('两张表的键完全一致 —— 漏一个就编译不过，这里再兜一层', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('没有空字符串', () => {
    for (const [key, value] of Object.entries({ ...zh, ...en })) {
      expect(value.length, `${key} 是空的`).toBeGreaterThan(0);
    }
  });

  it('同一个键在两种语言里占位符也要一样，否则插值会漏', () => {
    const slots = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
      expect(slots(en[key]), `${key} 的占位符对不上`).toEqual(slots(zh[key]));
    }
  });

  it('英文表里没有漏翻的汉字', () => {
    const han = /[㐀-䶿一-鿿豈-﫿]/;
    for (const [key, value] of Object.entries(en)) {
      expect(han.test(value), `${key} 的英文里还有汉字`).toBe(false);
    }
  });

  it('format 填占位符，没给值的原样留着', () => {
    expect(format('至少 {min} 个字', { min: 5 })).toBe('至少 5 个字');
    expect(format('{a} 和 {b}', { a: '一' })).toBe('一 和 {b}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL — cannot resolve `../src/app/i18n/zh`.

- [ ] **Step 3: Write the dictionaries and the context**

Create `src/app/i18n/zh.ts`. This is the reference table — its shape defines `Copy`. Keys are grouped by surface with a comment per group. The full key set this plan requires (every one of these is used by a later task):

```ts
/**
 * 界面文案（简体中文）。这张表是基准：`Copy` 的形状由它推出来，
 * en.ts 用 `satisfies Copy` 约束，漏掉任何一个键都编译不过。
 *
 * 这里只放「机器说的话」—— 按钮、屏上的提示、记录页和设置页的外壳。
 * 签纸上的字和 AI 写的解读不在这里，它们跟着问题的语言走（src/shared/sticks.ts）。
 *
 * 占位符写成 {name}，两种语言必须用同一组占位符（tests/i18n.test.ts 会查）。
 */
export const zh = {
  // 外壳
  brandSub: 'FORTUNE PRINTER',
  navHistory: '求签记录',
  navBackToGame: '回到求签',
  railLeft: 'MODEL WY-36 · MADE IN CHINA',
  railRight: '三 十 六 签 · 一 问 一 答',
  footerSound: '声音{state}',
  footerSoundOn: '开',
  footerSoundOff: '关',
  footerMotion: '动画{state}',
  footerMotionReduced: '已减少',
  footerMotionNormal: '正常',
  footerNote: '签为参考，路要自己走',
  langSwitch: 'EN',
  langSwitchLabel: 'Switch to English',
  loading: '正在预热打印机…',
  loadFailed: '连不上服务：{detail}',
  retry: '重试',
  restoring: '正在取回你的签…',
  documentTitle: '问一签',
  documentDescription:
    '写下心里的事，按下打印机上的按钮，印一张属于你的签。问一签是一个轻量的在线求签游戏。',

  // 提问
  askLabel: '你想问的事',
  askGhost: '写下你心里的那件事',
  example1: '我该如何面对最近的工作变化？',
  example2: '这段关系还值得我继续投入吗？',
  example3: '现在是开始做那件想了很久的事的时候吗？',

  // 打印机的屏
  lcdReady: 'READY',
  lcdPrint: 'PRINT',
  lcdWarn: 'WARN',
  lcdError: 'ERROR',
  lcdPrinting: '正在打印…',
  lcdWriteSomething: '写下你心里的事',
  lcdNoInterpreter: '解签服务未连接',
  lcdPressKey: '按下印键，开始打印',
  printKeyCap: '印',
  printKeyIdle: '按下按钮，打印这一签',
  printKeyBusy: '正在打印',

  // 结果页
  interpret: '解 签',
  interpreting: '正在解签',
  reinterpreting: '正在重新解签',
  retryInterpret: '重试解签',
  retrying: '重试中…',
  blockMeaning: '一句话签意',
  blockAnswer: '回应你的问题',
  blockNotice: '值得留意',
  blockAction: '可以做的一件小事',
  actionShare: '分享结果',
  actionShareClose: '收起分享',
  actionFollowUp: '继续追问',
  actionFollowUpClose: '收起追问',
  actionRestart: '再求一签',

  // 追问
  followUpEmpty: '就着这支签往下问，签和解读都不会变。',
  followUpQuick1: '我现在最该注意什么？',
  followUpQuick2: '可以从哪一步开始？',
  followUpQuick3: '如果先不动会怎样？',
  followUpPlaceholder: '再问一句',
  followUpAnswering: '正在回答…',
  followUpLabel: '继续追问',
  followUpSend: '发送',

  // 分享
  shareTitle: '分享结果',
  shareClose: '收起',
  shareNote: '图片里只有签号、等级、签诗和一句话签意，不包含你的解读和追问。',
  shareIncludeQuestion: '在图片中显示我的问题',
  shareGo: '生成并分享',
  shareBusy: '生成中…',
  shareShared: '已经交给系统分享。',
  shareDownloaded: '图片已保存到下载。',
  shareFailed: '图片这次没生成出来，可以先复制下面这段文字。',

  // 记录
  historyTitle: '求签记录',
  historyEmpty: '这台设备上还没有记录。求过的签会留在这里。',
  historyGoDraw: '去求一签',
  historyClear: '清空全部',
  historyClearConfirm: '确认清空',
  historyCancel: '取消',
  historyLocalNote: '记录只保存在这台设备的浏览器里。',
  historyExpand: '展开',
  historyCollapse: '收起',
  historyNoReading: '这一次没有解签。',
  historyFollowUps: '追问',
  historyDelete: '删除这条记录',

  // 密码门
  gateTitle: '需要管理密码',
  gateBody: '这个部署设置了 ADMIN_PASSWORD，输入后才能继续。',
  gateLabel: '管理密码',
  gateWrong: '密码不对。',
  gateSubmit: '解锁',
  gateChecking: '检查中…',
} as const;

export type Copy = Record<keyof typeof zh, string>;
```

Create `src/app/i18n/en.ts` with the same keys, `satisfies Copy`. The settings-page keys are added in Task 8; the error keys in Task 9.

```ts
import type { Copy } from './zh';

export const en = {
  brandSub: 'FORTUNE PRINTER',
  navHistory: 'Your slips',
  navBackToGame: 'Back to the machine',
  railLeft: 'MODEL WY-36 · MADE IN CHINA',
  railRight: 'T H I R T Y - S I X  S T I C K S',
  footerSound: 'Sound {state}',
  footerSoundOn: 'on',
  footerSoundOff: 'off',
  footerMotion: 'Motion {state}',
  footerMotionReduced: 'reduced',
  footerMotionNormal: 'normal',
  footerNote: 'A stick is a reference. The walking is yours.',
  langSwitch: '中文',
  langSwitchLabel: '切换到简体中文',
  loading: 'Warming up the printer…',
  loadFailed: 'Cannot reach the service: {detail}',
  retry: 'Try again',
  restoring: 'Fetching your slip…',
  documentTitle: 'Fortune Printer',
  documentDescription:
    'Write down what is on your mind, press the key on the printer, and it prints a fortune stick for you.',
  // …the remaining keys, same order as zh.ts…
} satisfies Copy;
```

Create `src/app/i18n/index.tsx`:

```tsx
/**
 * 界面语言：机器说的话。
 *
 * 和签纸上的语言是两回事 —— 签纸跟着问题走（src/shared/lang.ts），这里跟着
 * 右上角那个开关走。一个人可以用英文界面读一张中文的签，那是对的：
 * 纸是那一刻印出来的，机器是现在正在用的。
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { Language } from '../../shared/lang';
import { zh, type Copy } from './zh';
import { en } from './en';

const TABLES: Record<Language, Copy> = { zh, en };

/** 把 {name} 换成值。没给值的占位符原样留着，方便一眼看出是哪个键漏了。 */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

const LanguageContext = createContext<Language>('zh');

export function LanguageProvider(props: { language: Language; children: ReactNode }) {
  return (
    <LanguageContext.Provider value={props.language}>{props.children}</LanguageContext.Provider>
  );
}

export const useUiLanguage = (): Language => useContext(LanguageContext);

export function useT() {
  const language = useUiLanguage();
  return (key: keyof Copy, vars?: Record<string, string | number>) =>
    format(TABLES[language][key], vars);
}
```

- [ ] **Step 4: Add `language` to `Prefs`**

In `src/app/storage.ts`, extend the interface and the reader:

```ts
export interface Prefs {
  /** 摇签音效 */
  sound: boolean;
  /** 减少动画。默认跟随系统的 prefers-reduced-motion。 */
  reducedMotion: boolean;
  /**
   * 界面语言。所有人进来都是简体中文 —— 不猜浏览器语言：这个游戏的默认读者
   * 是中文读者，猜错一次的代价比多按一下开关大。
   */
  language: Language;
}

export function getPrefs(): Prefs {
  const stored = read<Partial<Prefs>>(PREFS_KEY, {});
  return {
    sound: stored.sound ?? true,
    reducedMotion: stored.reducedMotion ?? systemReducedMotion(),
    language: stored.language === 'en' ? 'en' : 'zh',
  };
}
```

Add `import type { Language } from '../shared/lang';` at the top.

- [ ] **Step 5: Wrap the app and add the switch in `src/app/App.tsx`**

Wrap the returned `<main>` in `<LanguageProvider language={prefs.language}>`, replace every hardcoded string in `App.tsx` with `t('key')`, and add the switch to the top bar next to the existing history link:

```tsx
<button
  type="button"
  className="text-action lang-switch"
  aria-label={t('langSwitchLabel')}
  onClick={() => updatePrefs({ language: prefs.language === 'zh' ? 'en' : 'zh' })}
>
  {t('langSwitch')}
</button>
```

Because `useT` reads the context, `App` itself cannot call it above the provider — split the shell body into an inner component that sits inside `LanguageProvider`, or read the table directly in `App` and use `useT` only in children. Use the inner-component split; it keeps one code path.

Add to `src/app/styles.css`, next to the other `.text-action` rules:

```css
/* 语言开关：和「求签记录」一样是一行字，不是一个按钮。 */
.lang-switch {
  font: 11px/1 var(--mono);
  letter-spacing: 0.18em;
}
```

- [ ] **Step 6: Run the tests and the build**

Run: `npx vitest run tests/i18n.test.ts`
Expected: PASS, 5 tests.

Run: `npm run check`
Expected: success.

- [ ] **Step 7: Verify in the browser**

Start the preview (`preview_start` with `{name: "starter-dev"}`), then confirm: the page opens in Chinese; clicking the top-right switch turns the shell English and the label becomes `中文`; reloading keeps English.

- [ ] **Step 8: Commit**

```bash
git add src/app/i18n src/app/storage.ts src/app/App.tsx src/app/styles.css tests/i18n.test.ts
git commit -m "$(cat <<'EOF'
Add the interface language and the switch that changes it

Two flat tables and a thirty-line t(), rather than a library: two languages and
one small game need no plurals, namespaces or lazy loading, and the table shape
is enforced by the compiler. The switch moves the machine only; nothing it does
can reach a slip that has already been printed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The worker interprets in the round's language

**Files:**
- Modify: `src/worker/fortune.ts`
- Modify: `src/shared/types.ts` (`Reading.language`, `Interpretation.language`)
- Test: `tests/fortune.test.ts`

**Interfaces:**
- Consumes: `detectLanguage`, `Language`, `stickText`, `LEVEL_LABEL`.
- Produces:
  - `Reading` gains `language: Language` (derived in `toReading`).
  - `Interpretation` gains `language: Language` (recorded in the stored JSON).
  - `buildInterpretPrompt(question: string, stick: FortuneStick, language: Language): string`
  - `buildFollowUpPrompt(reading, interpretation, question, language): string`
  - `fallbackInterpretation(stick: FortuneStick, language: Language): Interpretation`

- [ ] **Step 1: Write the failing test**

Append to `tests/fortune.test.ts`:

```ts
describe('按问题的语言解签', () => {
  it('英文问题得到英文提示词，而且不含中文指令', () => {
    const prompt = buildInterpretPrompt('Should I take this job offer?', stick, 'en');
    expect(prompt).toContain('Should I take this job offer?');
    expect(prompt).toContain(stickText(stick, 'en').poem[0]);
    expect(prompt).toContain('Reply in English');
    expect(prompt).not.toContain('全部用中文');
  });

  it('英文提示词照样把签当成既定事实，也照样禁止预言', () => {
    const prompt = buildInterpretPrompt('Should I move?', stick, 'en');
    expect(prompt).toContain('fixed by the machine');
    expect(prompt).toContain('Do not predict');
  });

  it('中文问题的提示词一个字没变', () => {
    const prompt = buildInterpretPrompt('我该不该换工作？', stick, 'zh');
    expect(prompt).toContain('由系统抽定，不可更改');
    expect(prompt).toContain('全部用中文');
  });

  it('英文下签同样要求不恐吓', () => {
    const low = STICKS.find((one) => one.level === '下签')!;
    expect(buildInterpretPrompt('Anything?', low, 'en')).toContain('never frightening');
  });

  it('兜底文案跟着语言走，并记下自己是哪种语言写的', () => {
    const fallback = fallbackInterpretation(stick, 'en');
    expect(fallback.answer).toBe(stickText(stick, 'en').general);
    expect(fallback.action).toBe(stickText(stick, 'en').action);
    expect(fallback.source).toBe('fallback');
    expect(fallback.language).toBe('en');
    expect(detectLanguage(fallback.answer)).toBe('en');
  });

  it('追问提示词用同一种语言，并且仍然禁止改签', () => {
    const interpretation: Interpretation = {
      meaning: 'Things are clearing up.',
      answer: 'Given your question, list the conditions first.',
      notice: 'You may be ignoring the cost of waiting.',
      action: 'Write down three criteria today.',
      source: 'ai',
      language: 'en',
    };
    const reading: Reading = {
      id: 'r1',
      question: 'Should I take this job offer?',
      stick,
      status: 'interpreted',
      interpretation,
      error: null,
      language: 'en',
      createdAt: new Date().toISOString(),
    };
    const prompt = buildFollowUpPrompt(reading, interpretation, 'Where do I start?', 'en');
    expect(prompt).toContain('Should I take this job offer?');
    expect(prompt).toContain('does not draw a new stick');
    expect(prompt).toContain('Where do I start?');
    expect(prompt).not.toContain('不重新抽签');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fortune.test.ts`
Expected: FAIL — `buildInterpretPrompt` takes two arguments; `Interpretation` has no `language`.

- [ ] **Step 3: Extend the shared types**

In `src/shared/types.ts`, add `import type { Language } from './lang';` and:

```ts
export interface Interpretation {
  meaning: string;
  answer: string;
  notice: string;
  action: string;
  source: 'ai' | 'fallback';
  /**
   * 这份解读当初是用哪种语言写的。界面语言可以换，这一段不会重写，
   * 所以把它记在 JSON 里（blob 没有 schema，这一列是免费的），
   * 即使将来 detectLanguage 的规则调整了，旧记录上的标注也还是准的。
   */
  language: Language;
}

export interface Reading {
  id: string;
  question: string;
  stick: FortuneStick;
  status: ReadingStatus;
  interpretation: Interpretation | null;
  error: string | null;
  /** 这一局的语言，由 question 推导 —— 不落库，见 src/shared/lang.ts。 */
  language: Language;
  createdAt: string;
}
```

- [ ] **Step 4: Make the worker language-aware**

In `src/worker/fortune.ts`:

```ts
import { detectLanguage, type Language } from '../shared/lang';
import { LEVEL_LABEL, STICK_COUNT, stickByNo, stickText, type FortuneStick } from '../shared/sticks';
```

`toReading` derives it — one line, no column:

```ts
function toReading(row: ReadingRow): Reading {
  const stick = stickByNo(row.stick_no);
  if (!stick) throw new HttpError(500, 'unknown_stick', '这条求签记录指向了一支不存在的签。');
  // 语言是问题的纯函数，不落库：question 写进去之后就不再改，所以这里算出来的
  // 永远是当初印出来的那张纸的语言。
  const language = detectLanguage(row.question);
  let interpretation: Interpretation | null = null;
  if (row.interpretation) {
    try {
      interpretation = JSON.parse(row.interpretation) as Interpretation;
    } catch {
      interpretation = null;
    }
  }
  return {
    id: row.id,
    question: row.question,
    stick,
    status: (row.status as ReadingStatus) ?? 'drawn',
    interpretation,
    error: row.error,
    language,
    createdAt: row.created_at,
  };
}
```

`stickBlock(stick, language)` uses `stickText(stick, language)` and `LEVEL_LABEL[language][stick.level]`, with the labels around it in the matching language. `fallbackInterpretation(stick, language)` reads the matching block, sets `language`, and uses the matching "this is the stick's general reading" note. `parseInterpretation(raw, stick, language)` falls back to the matching block and stamps `language`.

`TONE_BY_LEVEL` becomes `Record<Language, Record<StickLevel, string>>`. The English tone guidance must contain the exact phrases the tests assert — `never frightening` for 下签 — and the English prompt must contain `fixed by the machine`, `Do not predict` and `Reply in English`. The English follow-up prompt must contain `does not draw a new stick`.

`interpretReading` and `handleFollowUp` pass `reading.language` down. No other change: the `messageId` derivation, the retry path and the billing guards stay exactly as they are.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS. The original Chinese prompt assertions still pass because `'zh'` produces byte-identical output.

Run: `npm run check`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/worker/fortune.ts src/shared/types.ts tests/fortune.test.ts
git commit -m "$(cat <<'EOF'
Interpret in the language the question was asked in

The round's language is derived in toReading rather than stored, so it cannot
drift from the slip that was printed, and the interpretation records the
language it was actually written in. Nothing about drawing, retries or the
messageId derivation changes — a language is not a reason to bill twice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The slip prints in the round's language

**Files:**
- Modify: `src/app/components/StickFace.tsx`
- Modify: `src/app/components/ReadingResult.tsx` (pass the language down)
- Modify: `src/app/components/FortuneGame.tsx` (pass the language down)
- Modify: `src/app/components/HistoryView.tsx` (derive per record)
- Modify: `src/app/styles.css`

**Interfaces:**
- Consumes: `stickText`, `LEVEL_LABEL`, `LEVEL_TONE`, `Language`.
- Produces: `StickFace({ stick, language, size? })` — `language` is required, so every call site has to decide, and none can silently keep printing Chinese.

- [ ] **Step 1: Make `StickFace` take a language**

```tsx
export default function StickFace(props: {
  stick: FortuneStick;
  /** 这一局的语言 —— 由问题推导，不是界面开关。必填：每个调用方都得想清楚。 */
  language: Language;
  size?: 'large' | 'small';
}) {
  const { stick, language } = props;
  const tone = LEVEL_TONE[stick.level];
  const text = stickText(stick, language);
  const level = LEVEL_LABEL[language][stick.level];
  // …
}
```

The large slip's markup gains `data-lang={language}` on `<article className="slip">`, and the fixed Chinese furniture becomes language-aware:

| Slot | zh | en |
| --- | --- | --- |
| `.slip-rail` left | `第 {no} 签` | `NO. {no}` |
| `.slip-rail` right | `之 签 运` | `FORTUNE` |
| `.slip-lucky` | `幸运色：{color}` | `Lucky colour: {color}` |
| `.slip-foot` | `问一签 · 签为参考，路要自己走` | `FORTUNE PRINTER · A REFERENCE, NOT A ROUTE` |
| `.slip-mini-no` | `第 {no} 签` | `NO. {no}` |

`.slip-brand` stays `问一签` in both — it is the machine's maker's mark, not copy.

- [ ] **Step 2: Add the horizontal English body to `src/app/styles.css`**

The vertical rule becomes conditional and an English branch sits beside it:

```css
/* 直排只在中文的签纸上。英文横排 —— 一行一句，和中文那两列读起来是同一个节奏。 */
.slip[data-lang='zh'] .slip-vertical {
  writing-mode: vertical-rl;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 15px;
  height: 208px;
}

.slip[data-lang='en'] .slip-vertical {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 13px;
  min-height: 208px;
  text-align: center;
  max-width: 34ch;
}

.slip[data-lang='en'] .slip-poem {
  font-size: 15px;
  letter-spacing: 0.01em;
  line-height: 1.5;
}

.slip[data-lang='en'] .slip-meaning { font-size: 13px; letter-spacing: 0; line-height: 1.55; }
.slip[data-lang='en'] .slip-lucky { font-size: 11.5px; letter-spacing: 0.08em; }

/* 英文签名是一个短语，不是四个字：撑开的字距会把它拆散。 */
.slip[data-lang='en'] .slip-title {
  font-size: clamp(15px, 4.2vw, 19px);
  letter-spacing: 0.06em;
  text-indent: 0;
}

/* 英文等级是一个词，不是一个字 —— 缩小并收紧，免得撑破那一格。 */
.slip[data-lang='en'] .slip-level {
  font-size: clamp(19px, 5.4vw, 27px);
  letter-spacing: 0.1em;
  text-indent: 0.1em;
}
```

Keep the existing `.slip-vertical p { margin: 0; }` and the shared `.slip-poem` / `.slip-meaning` / `.slip-lucky` base rules; the `[data-lang='en']` rules only override what has to change.

- [ ] **Step 3: Pass the language from every call site**

`FortuneGame` renders `<StickFace stick={sheet.stick} language={sheet.language} />` for the feeding sheet. `ReadingResult` renders `<StickFace stick={reading.stick} language={reading.language} />`. `HistoryView` has only a `LocalRecord`, which stores `question` — derive it there: `<StickFace stick={stick} language={detectLanguage(record.question)} size="small" />`.

- [ ] **Step 4: Verify in the browser**

Run the preview. Ask an English question ("Should I take this job offer?"), press the key, and confirm: the slip is entirely English, horizontal, nothing clipped, the level fits its cell. Then switch the top-right language to 中文 and confirm **the slip does not change** — only the buttons and the LCD do. Take a screenshot of both.

Then ask a Chinese question and confirm the slip is vertical and identical to before this branch.

- [ ] **Step 5: Run the build**

Run: `npm run check && npm test`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/StickFace.tsx src/app/components/ReadingResult.tsx src/app/components/FortuneGame.tsx src/app/components/HistoryView.tsx src/app/styles.css
git commit -m "$(cat <<'EOF'
Print the slip in the language the question was asked in

StickFace now requires a language, so no call site can keep printing Chinese by
accident. Vertical setting is scoped to the Chinese slip and the English one
reads horizontally, which is the only honest way to set an English couplet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Game surface reads from the dictionary

**Files:**
- Modify: `src/app/components/QuestionForm.tsx`
- Modify: `src/app/components/Printer.tsx`
- Modify: `src/app/components/FortuneGame.tsx`
- Modify: `src/app/components/ReadingResult.tsx`

**Interfaces:**
- Consumes: `useT` from `src/app/i18n`.
- Produces: no new exports. `Printer`'s props are unchanged — it still receives `code` and `message` as strings, because the LCD's copy is the caller's business.

- [ ] **Step 1: Replace the hardcoded strings**

`QuestionForm`: `EXAMPLES` becomes `[t('example1'), t('example2'), t('example3')]` computed inside the component; `aria-label={t('askLabel')}`; the ghost line becomes `t('askGhost')`.

`Printer`: `aria-label` on the key becomes `state === 'printing' ? t('printKeyBusy') : t('printKeyIdle')`, and the cap becomes `t('printKeyCap')`. Note the cap is the single character 印 in Chinese; in English use `PRINT` and add:

```css
/* 英文键帽是一个词，不是一个字。 */
.print-key[data-lang='en'] .print-key-cap {
  font: 700 13px/1 var(--mono);
  letter-spacing: 0.12em;
}
```

Set `data-lang` on the button from `useUiLanguage()`.

`FortuneGame`: the `lcd` object's codes and messages come from `t('lcdReady')`, `t('lcdPrinting')`, `t('lcdWriteSomething')`, `t('lcdNoInterpreter')`, `t('lcdPressKey')`; the three validation faults use `t('lcdError')` plus the error keys added in Task 9 — until then use the existing literals and leave a `// Task 9` marker. The `restoring` line becomes `t('restoring')`.

`ReadingResult`: all nine action and heading strings come from the dictionary.

- [ ] **Step 2: Verify in the browser**

Run the preview. With the interface in English, confirm the ghost text, the three examples, the LCD and every action on the result page are English, and that the printer key reads `PRINT` without overflowing its cap.

- [ ] **Step 3: Run the build**

Run: `npm run check && npm test`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/QuestionForm.tsx src/app/components/Printer.tsx src/app/components/FortuneGame.tsx src/app/components/ReadingResult.tsx src/app/styles.css
git commit -m "$(cat <<'EOF'
Move the machine's own words into the dictionary

The LCD, the key cap, the prompts and the actions on the result page follow the
switch in the corner. The printed slip beneath them does not.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: History, follow-up, share and the password gate

**Files:**
- Modify: `src/app/components/HistoryView.tsx`
- Modify: `src/app/components/FollowUp.tsx`
- Modify: `src/app/components/SharePanel.tsx`
- Modify: `src/app/components/PasswordGate.tsx`

**Interfaces:**
- Consumes: `useT`, `detectLanguage`.
- Produces: nothing new.

- [ ] **Step 1: Replace the strings, and get the two languages right per surface**

`HistoryView`: the page chrome (title, empty state, clear/confirm/cancel, expand/collapse, delete, the local-only note, the 追问 heading) follows the **interface** language. The four interpretation headings inside an expanded record (`值得留意：`, `可以做的一件小事：`) follow **that record's** language — `detectLanguage(record.question)` — because they label text the AI wrote in that language. Look them up with `TABLES` directly rather than `useT`; export a `copyFor(language)` helper from `src/app/i18n/index.tsx`:

```tsx
export const copyFor = (language: Language): Copy => TABLES[language];
```

`FollowUp`: the empty-state line, the three quick asks, the placeholder, the send button and the aria-label follow the interface language. The quick asks are the one judgement call here — they are text the user is about to *send to the agent*, and the agent answers in the round's language. Use the **round's** language for the three quick asks so a player on an English interface with a Chinese slip sends Chinese. `FollowUp` therefore gains a `language: Language` prop, passed from `ReadingResult` as `reading.language`.

`SharePanel`: all chrome follows the interface language. It gains a `language: Language` prop (the round's) which it forwards to `renderShareImage` in Task 8.

`PasswordGate`: everything follows the interface language.

- [ ] **Step 2: Verify in the browser**

Run the preview. Draw one Chinese round and one English round. Open the history page with the interface in English and confirm: the page chrome is English, the Chinese record still shows its Chinese reading under Chinese headings, and the English record shows English throughout.

- [ ] **Step 3: Run the build**

Run: `npm run check && npm test`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/components src/app/i18n
git commit -m "$(cat <<'EOF'
Translate the pages around the machine

History chrome follows the switch, but the headings over a stored reading follow
that reading's own language — they label text the agent wrote, and relabelling
it in another language would misdescribe it. The quick follow-up asks go in the
round's language, because they are about to be sent to the agent.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The share image in English

**Files:**
- Modify: `src/app/share.ts`
- Modify: `src/app/components/SharePanel.tsx` (pass `language` through)

**Interfaces:**
- Consumes: `stickText`, `LEVEL_LABEL`, `Language`.
- Produces: `ShareInput` gains `language: Language`; `shareText(stick, meaning, language)`; `shareImage(blob, stick, language)`.

- [ ] **Step 1: Branch the canvas layout**

`renderShareImage` reads `const text = stickText(stick, input.language)`. Three regions differ:

1. **The level cell.** `spaced(context, LEVEL_LABEL[language][stick.level], …)` at `700 92px` overflows for `GREAT FORTUNE`. For English use `700 52px` and a gap of `8`, and set the rail text to `NO. {n}` / `FORTUNE`.
2. **The title cell.** English at `500 50px` with a `26px` gap will not fit a phrase. Use `500 40px` and gap `4`, and fall back to `wrap()` at `500 34px` across two lines when `measureText` exceeds `cellWidth - 80`.
3. **The body cell.** This is the real fork: `drawVertical` is for Chinese. Write a sibling `drawHorizontal(context, blocks, { centerX, top, width, height })` that lays the same four blocks out as centred horizontal lines using the existing `wrap()`, with the same block order (poem line 1, poem line 2, meaning, lucky colour) and the same colours. Select on `input.language`.

`waitForFonts` additionally loads the Latin serif added in Task 9 (`document.fonts.load('700 96px "Noto Serif", serif')`). Define `const SERIF_EN = '"Noto Serif", "Iowan Old Style", Georgia, serif';` and use it for English.

The footer line and the filename follow the language: `问一签-第{n}签.png` / `fortune-stick-{n}.png`, and `shareText` gains an English form.

- [ ] **Step 2: Verify in the browser**

Run the preview, draw an English round, open the share panel and generate the image. Download it and open it. Confirm nothing overflows its cell, the couplet reads as two centred lines, and the colours match the on-screen slip. Do the same for a Chinese round and confirm the image is byte-comparable in layout to before this branch.

- [ ] **Step 3: Run the build**

Run: `npm run check && npm test`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/share.ts src/app/components/SharePanel.tsx
git commit -m "$(cat <<'EOF'
Draw the share image in the slip's language

drawVertical is a Chinese typesetting routine, so English gets a sibling rather
than a flag: the same four blocks, laid out as centred lines. The level and
title cells shrink for English, where a word occupies the space a character did.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Error copy moves to the browser

**Files:**
- Modify: `src/app/api.ts` (surface the error `code`)
- Modify: `src/app/i18n/zh.ts`, `src/app/i18n/en.ts` (error keys)
- Modify: `src/app/components/FortuneGame.tsx`, `src/app/components/FollowUp.tsx`
- Modify: `src/worker/fortune.ts` (`readings.error` stores a code)
- Test: `tests/fortune.test.ts`

**Interfaces:**
- Consumes: `ApiError` (already carries `status`; confirm it also carries `code` — if not, add it).
- Produces: dictionary keys `errQuestionRequired`, `errQuestionTooShort`, `errQuestionTooLong`, `errNoInterpreter`, `errReadingNotFound`, `errNotInterpreted`, `errMessageRequired`, `errMessageTooLong`, `errManyfoldUnavailable`, `errManyfoldRejected`, `errAdminPasswordInvalid`, `errInternal`, `errUnknown`, plus `fallbackNote` and `fallbackUnparseable`.

- [ ] **Step 1: Write the failing test**

```ts
describe('解签失败时存的是码，不是句子', () => {
  it('解析不出来时 error 存 unparseable，兜底文案用对语言', () => {
    // interpretReading 的单元测试需要 D1，这里只锁住纯函数部分：
    // fallbackInterpretation 的 notice 在两种语言下都不是中文硬编码。
    expect(fallbackInterpretation(stick, 'en').notice).not.toMatch(/[一-鿿]/);
    expect(fallbackInterpretation(stick, 'zh').notice).toMatch(/[一-鿿]/);
  });
});
```

- [ ] **Step 2: Run it, see it fail**

Run: `npx vitest run tests/fortune.test.ts`
Expected: FAIL — the English `notice` is currently the Chinese sentence.

- [ ] **Step 3: Implement**

`fallbackInterpretation(stick, language)` writes its `notice` from a small per-language constant in `fortune.ts` (the worker keeps its own two strings for this one line — it is generated content stored in D1, not chrome).

`readings.error` stores the stable string `'unparseable'` when `parseInterpretation` returns null; agent-side failures keep storing `safeErrorText(...)`, which is genuinely dynamic upstream text.

In the browser, add a `errorMessage(cause, t)` helper in `src/app/api.ts`:

```ts
/** 服务端只回码，文案在这边 —— 这样错误跟着界面语言走，和屏上别的字一致。 */
export function errorMessage(cause: unknown, copy: Copy): string {
  if (cause instanceof ApiError && cause.code) {
    const key = ERROR_KEYS[cause.code];
    if (key) return copy[key];
    return cause.message || copy.errUnknown;
  }
  return cause instanceof Error ? cause.message : String(cause);
}
```

where `ERROR_KEYS` maps the API's `code` values to dictionary keys and an unknown code falls through to the server's own `message`, so a new route's error is never swallowed.

`FortuneGame` and `FollowUp` render errors through it. `ReadingResult`'s fallback note renders `reading.error === 'unparseable' ? t('fallbackUnparseable') : reading.error`.

- [ ] **Step 4: Run the tests and verify**

Run: `npm run check && npm test`
Expected: success.

In the browser with the interface in English: submit a 2-character question and confirm the LCD says the English "write a few more characters" line, not Chinese.

- [ ] **Step 5: Commit**

```bash
git add src/app/api.ts src/app/i18n src/app/components src/worker/fortune.ts tests/fortune.test.ts
git commit -m "$(cat <<'EOF'
Let the browser own the error copy

The API already returned a code beside every message; the browser now renders
from it, so an error on the LCD is in the same language as the rest of the LCD.
An unrecognised code still falls through to the server's own sentence, so a new
route's error is never swallowed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The settings page

**Files:**
- Modify: `src/app/components/SettingsView.tsx`
- Modify: `src/app/components/ConnectPanel.tsx`
- Modify: `src/app/i18n/zh.ts`, `src/app/i18n/en.ts`

**Interfaces:**
- Consumes: `useT`.
- Produces: the settings keys, added to both tables.

- [ ] **Step 1: Replace the strings**

Everything on both components follows the interface language. Note `ConnectPanel.tsx:29` currently mixes languages in one sentence — `'The popup was blocked — use "重新打开授权页面" below.'` — which becomes two clean dictionary entries.

Keep `ADMIN_PASSWORD`, `CONFIG_ENCRYPTION_KEY`, `#settings` and `Manyfold` as literals inside the copy; they are identifiers, not words.

- [ ] **Step 2: Verify in the browser**

Open `#settings` with the interface in English and confirm every line is English, including the connect panel's confirmation-code warning.

- [ ] **Step 3: Run the build**

Run: `npm run check && npm test`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/SettingsView.tsx src/app/components/ConnectPanel.tsx src/app/i18n
git commit -m "$(cat <<'EOF'
Translate the settings page

Including the one line that was already half-translated: the popup-blocked
warning told an English reader to click a button named in Chinese.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Document language, title, and the Latin serif

**Files:**
- Modify: `index.html`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`

**Interfaces:**
- Consumes: `useUiLanguage`, `useT`.
- Produces: nothing exported.

- [ ] **Step 1: Load the Latin serif**

In `index.html`, extend the existing Google Fonts request to cover both families in one stylesheet (one request, same non-blocking `media="print"` trick already in place):

```html
<link
  href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;700;900&family=Noto+Serif:wght@400;500;700&display=swap"
  rel="stylesheet"
  media="print"
  onload="this.media='all'"
/>
```

Update the `<noscript>` copy of the link identically.

Add the Latin-first stack to `:root` in `styles.css`:

```css
  --serif-en: 'Noto Serif', 'Iowan Old Style', Georgia, 'Times New Roman', serif;
```

and use it on the English slip:

```css
.slip[data-lang='en'] { font-family: var(--serif-en); }
```

- [ ] **Step 2: Follow the interface language on the document element**

In the inner shell component of `App.tsx`:

```tsx
// <html lang> 和标题跟着界面语言走：读屏软件按它选发音，浏览器标签页按它显示。
useEffect(() => {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = t('documentTitle');
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', t('documentDescription'));
}, [language, t]);
```

`index.html` keeps `lang="zh-CN"` and the Chinese `<title>`, matching the default.

- [ ] **Step 3: Verify in the browser**

Switch to English and confirm via the accessibility tree that `<html lang>` is `en` and the tab title changed. Switch back and confirm both revert.

- [ ] **Step 4: Run the build**

Run: `npm run check && npm test`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add index.html src/app/App.tsx src/app/styles.css
git commit -m "$(cat <<'EOF'
Tell the browser which language it is showing

<html lang> drives how a screen reader pronounces the page, so it has to follow
the switch rather than stay pinned to zh-CN. The Latin serif rides along on the
existing font request, which is already loaded off the critical path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Write the rule down, and check the whole thing

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `README_CN.md`

- [ ] **Step 1: Add the invariant to `AGENTS.md`**

Insert after the current invariant 8 (the two ink scales), renumbering the rest:

```markdown
9. **The machine speaks the interface language, the paper speaks the question's language.**
   The switch in the top-right corner sets the interface language (default 简体中文, kept in
   `localStorage`); it moves the LCD, the actions, history chrome and settings, and nothing
   else. A round's language comes from the question and is fixed when the print key is
   pressed: the slip, the interpretation and every follow-up stay in it no matter what the
   switch does afterwards. Switching a language must never re-interpret, re-draw or re-bill.
10. **A round's language is derived, never stored.** `detectLanguage(question)` in
   `src/shared/lang.ts` is a pure function of a column that already exists and never
   changes, which is what lets this work without a migration step (see invariant 3). Do not
   add a `language` column — recompute it. The language the AI actually wrote in is recorded
   inside the `interpretation` JSON blob, which needs no schema.
```

- [ ] **Step 2: Note it in both READMEs**

Add one line to "The game" in `README.md` and its counterpart in `README_CN.md`:

> **Ask in either language** — the interface switches from the top-right corner; whichever
> language you write your question in is the language your slip and its reading come back in.

- [ ] **Step 3: Full verification**

```bash
npm run check && npm test
```

Expected: typecheck, build, dry-run deploy and all tests pass.

Then in the browser, walk the whole loop twice — once in Chinese, once in English: ask → print → 解签 → follow up → share → history → delete. Confirm at each step that the slip never changes language and the chrome always matches the switch.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md README_CN.md
git commit -m "$(cat <<'EOF'
Record the language rule for whoever iterates next

Two invariants, because both are easy to break by accident: the split between
what the switch moves and what it must not, and the fact that a round's
language is recomputed rather than stored. Without the second one written down,
the next person adds a column to a database that cannot take one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage.** Detection → Task 1. Stick content and level labels → Task 2. Dictionary and switch → Task 3. Prompts, fallback, `Interpretation.language` → Task 4. Horizontal English slip and `writing-mode` scoping → Task 5. Chrome → Tasks 6, 7, 10. Errors-by-code → Task 9. Share canvas → Task 8. Font, `<html lang>`, title → Task 11. Tests are inside each task; AGENTS.md → Task 12. Every spec section has a task.

**Deviation from the spec, deliberate:** UI copy lives in `src/app/i18n/`, not `src/shared/i18n/`. The worker never renders UI copy once errors move to the browser, and `src/shared/` is reserved for what genuinely runs in both runtimes (AGENTS.md invariant 10).

**Corrected during implementation:** the copy tables ended up in `src/shared/i18n/` after all, with only the React layer in `src/app/i18n.tsx`. `tests/` compiles under the worker project, which excludes `src/app`, and the checks most worth having on those tables — key parity, placeholder parity, no untranslated Han in the English — are only reachable from there. Plain string tables run in both runtimes, so this respects invariant 10 rather than bending it.

**Type consistency.** `stickText(stick, language)` is used with the same signature in Tasks 2, 4, 5 and 8. `LEVEL_LABEL[language][level]` is consistent in Tasks 2, 5 and 8. `StickFace` takes `{ stick, language, size? }` from Task 5 onward, and Task 5 updates all three call sites. `Interpretation.language` is introduced in Task 4 and relied on in Tasks 7 and 9. `Reading.language` is introduced in Task 4 and consumed in Task 5. `Prefs.language` is introduced in Task 3 and read in Tasks 3, 6 and 11.

**Ordering.** Every task leaves the build green: Task 2 is a pure refactor pinned by the existing assertions, and no task depends on a later one.
