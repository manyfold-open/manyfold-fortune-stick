/**
 * 「问一签」的服务端：抽签、解签、追问。
 *
 * 三条规则决定了这个模块的形状，改动时请一起保住：
 *
 *  1. **签由服务端抽定，抽完就落库。** 浏览器只拿到一个 readingId。刷新页面、解签失败、
 *     重试解签、追问——全都从同一行读回同一支签，任何路径都不会重新抽取。
 *  2. **AI 只解签，不抽签。** 提示词里把签号、等级、签诗当成既定事实交给 agent，
 *     解析回来的内容只填进 interpretation，永远不碰 stick_no。
 *  3. **AI 失败不等于没有结果。** 解析不出来就落回这支签预先写好的通用解释和行动方向
 *     （source: 'fallback'），用户仍然看得到完整的一页，并且可以重试个性化解读。
 */

import type {
  FollowUpEvent,
  FollowUpMessage,
  Interpretation,
  Reading,
  ReadingStatus,
} from '../shared/types';
import { detectLanguage, type Language } from '../shared/lang';
import {
  LEVEL_LABEL,
  STICK_COUNT,
  stickByNo,
  stickText,
  type FortuneStick,
} from '../shared/sticks';
import { HttpError, type AgentCredential, type Env } from './types';
import { A2AError, consumeA2AStream, safeErrorText } from './a2a';
import { credentialFor, listConnectedAgents } from './connect';
import { now } from './db';

export const QUESTION_MIN_CHARS = 5;
export const QUESTION_MAX_CHARS = 120;
const FOLLOW_UP_MAX_CHARS = 200;
const FOLLOW_UP_HISTORY_LIMIT = 50;
const INTERPRET_TIMEOUT_MS = 90_000;
const FOLLOW_UP_TIMEOUT_MS = 90_000;
const TEXT_EVENT_INTERVAL_MS = 150;

/* ───────── 抽签 ───────── */

/**
 * 1–36 均匀随机。用拒绝采样而不是 `% 36`：256 不是 36 的整数倍，取模会让前 4 支签
 * 比其他签多出约 1.6% 的概率。签筒不该有偏心。
 */
export function drawStickNo(random: () => number = cryptoByte): number {
  const limit = 256 - (256 % STICK_COUNT);
  let byte = random();
  while (byte >= limit) byte = random();
  return (byte % STICK_COUNT) + 1;
}

function cryptoByte(): number {
  return crypto.getRandomValues(new Uint8Array(1))[0];
}

/* ───────── 行 ↔ 对象 ───────── */

interface ReadingRow {
  id: string;
  question: string;
  stick_no: number;
  status: string;
  interpretation: string | null;
  error: string | null;
  context_id: string | null;
  active_task_id: string | null;
  created_at: string;
}

const READING_COLUMNS =
  'id, question, stick_no, status, interpretation, error, context_id, active_task_id, created_at';

function toReading(row: ReadingRow): Reading {
  const stick = stickByNo(row.stick_no);
  if (!stick) throw new HttpError(500, 'unknown_stick', '这条求签记录指向了一支不存在的签。');
  // 语言由问题推导，不落库：question 写进去之后就不再改，所以这里算出来的
  // 永远是当初印出来的那张纸的语言。这个库没有迁移步骤，能不加列就不加列。
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

async function readRow(env: Env, id: string): Promise<ReadingRow> {
  const row = await env.DB.prepare(`SELECT ${READING_COLUMNS} FROM readings WHERE id = ?`)
    .bind(id)
    .first<ReadingRow>();
  if (!row) throw new HttpError(404, 'reading_not_found', '找不到这次求签，可能已经被清除了。');
  return row;
}

/* ───────── 求签 ───────── */

/** 校验问题。长度按「字符」数，中文一个字算一个。 */
export function normalizeQuestion(raw: unknown): string {
  const question = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  const length = [...question].length;
  if (length === 0) throw new HttpError(400, 'question_required', '先写下你想问的事，再开始摇签。');
  if (length < QUESTION_MIN_CHARS) {
    throw new HttpError(400, 'question_too_short', `问题太短了，至少写 ${QUESTION_MIN_CHARS} 个字。`);
  }
  if (length > QUESTION_MAX_CHARS) {
    throw new HttpError(400, 'question_too_long', `问题太长了，请控制在 ${QUESTION_MAX_CHARS} 个字以内。`);
  }
  return question;
}

/** 摇签完成时调用：抽一支签并立刻落库，此后这一行的 stick_no 不再改动。 */
export async function createReading(env: Env, rawQuestion: unknown): Promise<Reading> {
  const question = normalizeQuestion(rawQuestion);
  const id = crypto.randomUUID();
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO readings (id, question, stick_no, status, created_at, updated_at)
     VALUES (?, ?, ?, 'drawn', ?, ?)`,
  )
    .bind(id, question, drawStickNo(), timestamp, timestamp)
    .run();
  return toReading(await readRow(env, id));
}

export async function getReading(env: Env, id: string): Promise<Reading> {
  return toReading(await readRow(env, id));
}

export async function deleteReading(env: Env, id: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reading_messages WHERE reading_id = ?').bind(id),
    env.DB.prepare('DELETE FROM readings WHERE id = ?').bind(id),
  ]);
}

/* ───────── 解读的兜底与解析 ───────── */

/** 兜底那一行「这还没结合你的问题」。存进 D1，所以跟着这一局的语言，不跟界面。 */
const FALLBACK_NOTICE: Record<Language, string> = {
  zh: '这一份是这支签的通用解释，还没有结合你的问题。',
  en: 'This is the stick\u2019s general reading. It has not been matched to your question yet.',
};

/** AI 不可用时显示的内容：这支签预先写好的通用解释，永远可用。 */
export function fallbackInterpretation(stick: FortuneStick, language: Language): Interpretation {
  const text = stickText(stick, language);
  return {
    meaning: text.meaning,
    answer: text.general,
    notice: FALLBACK_NOTICE[language],
    action: text.action,
    source: 'fallback',
    language,
  };
}

const FIELD_LIMITS: Record<keyof Omit<Interpretation, 'source' | 'language'>, number> = {
  meaning: 120,
  answer: 600,
  notice: 200,
  action: 120,
};

/**
 * 把 agent 返回的文本解析成四段解读。
 *
 * agent 不一定听话：可能包 ```json 代码块、可能前后带客套话。所以先剥代码块，
 * 再取第一个 `{` 到最后一个 `}`。任何一步失败都返回 null，由调用方落回通用解释。
 */
export function parseInterpretation(
  raw: string,
  stick: FortuneStick,
  language: Language,
): Interpretation | null {
  const preset = stickText(stick, language);
  // Manyfold agents are plain-text A2A agents. The prompt asks for JSON, but the
  // agent may still return a perfectly useful prose answer (or JSON with a
  // slightly different envelope). Prefer the structured form, then degrade
  // gracefully to the text the agent actually returned instead of throwing away
  // a valid reading and showing the generic fallback.
  const unfenced = raw.replace(/```(?:json|text|plain)?/gi, '').replace(/```/g, '').trim();

  const findObject = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const object = value as Record<string, unknown>;
    if (
      Object.keys(object).some((key) => ['answer', 'response', 'content', 'text'].includes(key))
    ) {
      return object;
    }
    for (const key of ['data', 'result', 'output']) {
      const nested = findObject(object[key]);
      if (nested) return nested;
    }
    return null;
  };

  const parseJsonCandidate = (candidate: string): unknown => {
    try {
      return JSON.parse(candidate);
    } catch {
      // Some models emit typographic JSON quotes. This is deliberately a small
      // compatibility pass; arbitrary repair would risk changing the answer.
      try {
        return JSON.parse(candidate.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
      } catch {
        return null;
      }
    }
  };

  // A streaming provider can expose more than one artifact snapshot in the
  // final text. Parse balanced objects independently and use the one that has
  // an answer, rather than requiring the entire accumulated stream to be one
  // JSON document.
  const parsedCandidates: unknown[] = [];
  for (let start = 0; start < unfenced.length; start += 1) {
    if (unfenced[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < unfenced.length; end += 1) {
      const character = unfenced[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          const parsed = parseJsonCandidate(unfenced.slice(start, end + 1));
          if (parsed !== null) parsedCandidates.push(parsed);
          break;
        }
      }
    }
  }

  const value = parsedCandidates.map(findObject).find(Boolean) ?? null;

  const pick = (source: Record<string, unknown> | null, keys: string[], limit: number): string => {
    if (!source) return '';
    const text = keys
      .map((key) => source[key])
      .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
    const trimmed = text?.trim() ?? '';
    return trimmed.slice(0, limit);
  };

  const answer = pick(value, ['answer', 'response', 'content', 'text'], FIELD_LIMITS.answer);
  if (answer) {
    return {
      meaning: pick(value, ['meaning', 'summary'], FIELD_LIMITS.meaning) || preset.meaning,
      answer,
      notice: pick(value, ['notice', 'caveat', 'insight'], FIELD_LIMITS.notice),
      action:
        pick(value, ['action', 'suggestion', 'nextStep'], FIELD_LIMITS.action) || preset.action,
      source: 'ai',
      language,
    };
  }

  // A parsed JSON object that explicitly lacks a usable answer is not prose;
  // keep the old safety behaviour and let the caller show the preset reading.
  if (value) return null;

  // A response containing a JSON-looking brace pair but invalid JSON is also
  // more likely a malformed structured response than an intentional prose one.
  if (unfenced.includes('{') || unfenced.includes('}')) return null;

  // Last resort: a normal prose answer is still an AI reading. Keep the fixed
  // meaning/action and place the agent's response in the main answer field.
  const prose = unfenced.trim();
  if (!prose) return null;
  const text = prose.slice(0, FIELD_LIMITS.answer);
  if (!text) return null;
  return {
    meaning: preset.meaning,
    answer: text,
    notice: '',
    action: preset.action,
    source: 'ai',
    language,
  };
}

/* ───────── 提示词 ───────── */

function stickBlock(stick: FortuneStick, language: Language): string {
  const text = stickText(stick, language);
  const level = LEVEL_LABEL[language][stick.level];
  if (language === 'en') {
    return [
      `No. ${stick.no} · ${level} · ${text.title}`,
      `Couplet: ${text.poem[0]} / ${text.poem[1]}`,
      `What this stick fixedly means: ${text.meaning}`,
      `This stick's general reading: ${text.general}`,
    ].join('\n');
  }
  return [
    `第 ${stick.no} 签 · ${level} · ${text.title}`,
    `签诗：${text.poem[0]}，${text.poem[1]}`,
    `这支签的固定含义：${text.meaning}`,
    `这支签的通用解释：${text.general}`,
  ].join('\n');
}

const TONE_BY_LEVEL: Record<Language, Record<FortuneStick['level'], string>> = {
  zh: {
    上上签: '这是上上签，可以谈机会、谈顺势而为，同时提醒他别因为顺利而松掉原来的习惯。',
    上签: '这是上签，基调偏正面，谈可以往前推一步的地方，但不要许诺结果。',
    中签: '这是中签，基调中性，谈节奏、条件和需要先弄清楚的事。',
    下签: '这是下签，谈放慢脚步、观察和调整。绝对不要使用吓人的说法，不要预言坏结果。',
  },
  en: {
    上上签:
      'This is the best level. You may talk about opportunity and about moving with the current, while reminding them not to drop the habits that got them here just because things got easier.',
    上签:
      'This is a good level. Keep the tone positive and talk about where they can push one step further, but promise no outcome.',
    中签:
      'This is a middling level. Keep the tone neutral and talk about pacing, conditions, and what needs establishing first.',
    下签:
      'This is the lowest level. Talk about slowing down, observing and adjusting. Stay warm and never frightening: no alarming language, and no predicting a bad outcome.',
  },
};

export function buildInterpretPrompt(
  question: string,
  stick: FortuneStick,
  language: Language,
): string {
  if (language === 'en') {
    return `You are the stick-reader for Fortune Printer. Someone has just drawn a stick. Write them a reading that answers the question they actually asked.

[Their question]
${question}

[The stick they drew] (fixed by the machine, not changeable, and do not quote the couplet back at them)
${stickBlock(stick, 'en')}

[How to write it]
1. Warm, specific and conversational, like a friend who understands their situation. No mystical register, no fortune-teller voice.
2. Do not predict that anything will certainly happen. Never write "you will definitely", "inevitably" or "it is fated". What you give is a way of seeing the question and advice they can act on.
3. ${TONE_BY_LEVEL.en[stick.level]}
4. If the question touches health, money or legal decisions, help them see which conditions matter rather than ruling on it, and suggest a professional where that is the honest answer.
5. Reply in English throughout. No markdown headings and no bullet characters.

[Output format]
Output one JSON object and nothing else. Do not wrap it in a code block:
{"meaning":"one sentence on what this stick means for their question, plain words, under 30 words","answer":"written against their actual question, 60 to 110 words","notice":"one angle they may be overlooking, under 30 words","action":"one concrete thing they can do today, under 20 words"}`;
  }

  return `你是「问一签」的解签人。用户刚刚求得一支签，请结合他的问题写一份解读。

【用户的问题】
${question}

【抽中的签】（由系统抽定，不可更改，也不要在回答里重复签诗原文）
${stickBlock(stick, 'zh')}

【写作要求】
1. 语气温和、具体、口语化，像一个了解他处境的朋友，不要文言腔。
2. 不预言必然发生的事。不要出现「你一定会」「必然」「注定」这类说法；给的是看问题的角度和能执行的建议。
3. ${TONE_BY_LEVEL.zh[stick.level]}
4. 如果问题涉及健康、财务、法律等重要决定，帮他梳理该考虑哪些条件，不下武断结论，必要时建议咨询专业人士。
5. 全部用中文，不要使用 markdown 标题或列表符号。

【输出格式】
只输出一个 JSON 对象，不要输出任何其它文字，也不要用代码块包起来：
{"meaning":"一句话签意，用浅显的话说这支签对他这个问题意味着什么，40 字以内","answer":"结合他的问题展开，80 到 150 字","notice":"指出一个他可能忽略的角度，40 字以内","action":"一件具体的、今天就能做的小事，30 字以内"}`;
}

export function buildFollowUpPrompt(
  reading: Reading,
  interpretation: Interpretation,
  question: string,
  language: Language,
): string {
  if (language === 'en') {
    return `You are answering a follow-up about the same stick, inside Fortune Printer.

[Background, always refer to this]
Their original question: ${reading.question}
The stick they drew: ${stickBlock(reading.stick, 'en')}
The reading you already gave:
- Meaning: ${interpretation.meaning}
- On their question: ${interpretation.answer}
- Worth noticing: ${interpretation.notice}
- Suggested: ${interpretation.action}

[Rules]
This turn is a follow-up. It does not draw a new stick, and it does not change this stick's level or the reading above. Keep talking about the same stick.
Keep the answer under 120 words. Say it directly, do not restate the above, no JSON, no markdown. Reply in English.

[Their follow-up]
${question}`;
  }

  return `你正在「问一签」里回答用户对同一支签的追问。

【背景，请始终参考】
他最初的问题：${reading.question}
他抽到的签：${stickBlock(reading.stick, 'zh')}
你已经给出的解读：
· 签意：${interpretation.meaning}
· 回应：${interpretation.answer}
· 留意：${interpretation.notice}
· 建议：${interpretation.action}

【规则】
这一轮是追问，不重新抽签，也不改变这支签的等级和上面的解读。就着同一支签往下说。
回答控制在 150 字以内，直接讲，不要复述上面的内容，不要用 JSON，不要用 markdown。

【他的追问】
${question}`;
}

/* ───────── 选一个 agent 来解签 ───────── */

const notExpired = (expiresAt: string | null): boolean =>
  !expiresAt || Date.parse(expiresAt) > Date.now();

/**
 * 游戏界面上没有 agent 选择器（那是 settings 的事），所以这里替用户挑：
 * 优先已验证且未过期的，其次任何未过期的。
 */
export async function pickInterpreter(env: Env): Promise<AgentCredential> {
  const agents = await listConnectedAgents(env);
  const usable = agents.filter((agent) => notExpired(agent.expiresAt));
  const chosen = usable.find((agent) => agent.verified) ?? usable[0];
  if (!chosen) {
    throw new HttpError(
      503,
      'no_interpreter',
      '解签的 agent 还没连上。先到设置页连接一个 Manyfold agent。',
    );
  }
  return credentialFor(env, chosen.agentId);
}

export async function interpreterReady(env: Env): Promise<boolean> {
  const agents = await listConnectedAgents(env);
  return agents.some((agent) => notExpired(agent.expiresAt));
}

/* ───────── 解签 ───────── */

/** 一次不流式的 A2A 往返，只要最终文本。 */
async function askAgent(
  cred: AgentCredential,
  messageId: string,
  text: string,
  ids: { contextId: string | null; taskId: string | null },
  timeoutMs: number,
): Promise<{ text: string; contextId: string | null; taskId: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const snapshot = await consumeA2AStream({
      cred,
      params: {
        message: {
          kind: 'message',
          role: 'user',
          messageId,
          ...(ids.contextId ? { contextId: ids.contextId } : {}),
          ...(ids.taskId ? { taskId: ids.taskId } : {}),
          parts: [{ kind: 'text', text }],
        },
        configuration: { acceptedOutputModes: ['text/plain'] },
      },
      signal: controller.signal,
    });
    const reply = snapshot.text.trim();
    // agent 自己失败了（没配模型、额度用完、内部报错）和「回了内容但格式不对」是两回事。
    // 不在这里分开，两种情况都会落到「解签内容没有按预期返回」，排查的人会被带去改提示词，
    // 而真正的原因在 agent 那一侧。
    if (!reply) {
      throw new A2AError(
        snapshot.state && snapshot.state !== 'completed'
          ? `${cred.label} 在 ${snapshot.state} 状态下结束，没有返回任何内容。`
          : `${cred.label} 没有返回任何内容。`,
        true,
      );
    }
    return { text: reply, contextId: snapshot.contextId, taskId: snapshot.taskId };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解签。成功写入个性化解读；失败写入这支签的通用解释并记下原因，
 * 让「重试解签」还能再试一次 —— 无论走哪条路，签都不变。
 */
export async function interpretReading(env: Env, id: string): Promise<Reading> {
  const row = await readRow(env, id);
  const reading = toReading(row);
  // 已经有个性化解读就直接返回：重复点「解签」不该再计一次费。
  if (reading.status === 'interpreted' && reading.interpretation?.source === 'ai') return reading;

  let interpretation: Interpretation;
  let status: ReadingStatus;
  let error: string | null = null;
  let contextId = row.context_id;
  let taskId = row.active_task_id;

  try {
    const cred = await pickInterpreter(env);
    const answer = await askAgent(
      cred,
      // 由存储行推导，不用随机值：重试同一次求签不会被当成新的一轮计费。
      `qianyi-${reading.id}-interpret`,
      buildInterpretPrompt(reading.question, reading.stick, reading.language),
      { contextId, taskId: null },
      INTERPRET_TIMEOUT_MS,
    );
    contextId = answer.contextId ?? contextId;
    taskId = null;
    const parsed = parseInterpretation(answer.text, reading.stick, reading.language);
    if (parsed) {
      interpretation = parsed;
      status = 'interpreted';
    } else {
      interpretation = fallbackInterpretation(reading.stick, reading.language);
      status = 'failed';
      // 存码不存句子：文案在浏览器那边，跟着界面语言走（src/shared/i18n）。
      error = 'unparseable';
    }
  } catch (cause) {
    interpretation = fallbackInterpretation(reading.stick, reading.language);
    status = 'failed';
    // HttpError 有稳定的 code，存码；agent 那边抛回来的是真正动态的文字，
    // 脱敏后原样存 —— 浏览器认不出来就直接显示它。
    error =
      cause instanceof HttpError
        ? cause.code
        : cause instanceof Error
          ? safeErrorText(cause.message)
          : safeErrorText(cause);
  }

  await env.DB.prepare(
    `UPDATE readings SET interpretation = ?, status = ?, error = ?, context_id = ?,
            active_task_id = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(JSON.stringify(interpretation), status, error, contextId, taskId, now(), id)
    .run();

  return toReading(await readRow(env, id));
}

/* ───────── 追问 ───────── */

export async function listFollowUps(env: Env, id: string): Promise<FollowUpMessage[]> {
  await readRow(env, id);
  // 取最新的 N 条，再按时间正序给出去。不能直接 `ORDER BY id LIMIT N` —— 那取的是最早的
  // N 条，追问一旦超过上限，新回答就再也不会出现在页面上。
  const { results } = await env.DB.prepare(
    `SELECT id, role, content, status, error, created_at AS createdAt FROM reading_messages
     WHERE reading_id = ? ORDER BY id DESC LIMIT ?`,
  )
    .bind(id, FOLLOW_UP_HISTORY_LIMIT)
    .all<FollowUpMessage>();
  return (results ?? []).reverse();
}

async function insertFollowUp(
  env: Env,
  readingId: string,
  fields: { role: 'user' | 'agent'; content: string; status?: string; error?: string | null },
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO reading_messages (reading_id, role, content, status, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(readingId, fields.role, fields.content, fields.status ?? 'complete', fields.error ?? null, now())
    .run();
  return Number(result.meta.last_row_id);
}

/**
 * 一轮追问，SSE 流回浏览器。与解签共用一个 contextId，让 agent 记得上下文；
 * 但每一轮仍然把问题、签和解读原样带上，即使上下文丢了也不会串签。
 */
export async function handleFollowUp(options: {
  env: Env;
  readingId: string;
  message: string;
  waitUntil: (promise: Promise<unknown>) => void;
}): Promise<Response> {
  const { env, readingId } = options;
  const message = options.message.trim();
  if (!message) throw new HttpError(400, 'message_required', '写点什么再发送。');
  if ([...message].length > FOLLOW_UP_MAX_CHARS) {
    throw new HttpError(400, 'message_too_long', `追问请控制在 ${FOLLOW_UP_MAX_CHARS} 个字以内。`);
  }

  const row = await readRow(env, readingId);
  const reading = toReading(row);
  if (!reading.interpretation) {
    throw new HttpError(409, 'not_interpreted', '先解签，再继续追问。');
  }

  // 会失败的事都放在开始流式之前，这样错误还能以正常的 JSON 状态码返回。
  const cred = await pickInterpreter(env);
  const userMessageId = await insertFollowUp(env, readingId, { role: 'user', content: message });
  const prompt = buildFollowUpPrompt(reading, reading.interpretation, message, reading.language);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let clientGone = false;

  const send = async (event: FollowUpEvent) => {
    if (clientGone) return;
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // 用户关掉了页面；继续消费上游，回答照样落库。
      clientGone = true;
    }
  };

  const pump = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FOLLOW_UP_TIMEOUT_MS);
    let lastTextSent = 0;
    let partial = '';
    try {
      await send({ type: 'status', state: 'submitted' });
      const snapshot = await consumeA2AStream({
        cred,
        params: {
          message: {
            kind: 'message',
            role: 'user',
            messageId: `qianyi-${readingId}-${userMessageId}`,
            ...(row.context_id ? { contextId: row.context_id } : {}),
            ...(row.active_task_id ? { taskId: row.active_task_id } : {}),
            parts: [{ kind: 'text', text: prompt }],
          },
          configuration: { acceptedOutputModes: ['text/plain'] },
        },
        signal: controller.signal,
        onSnapshot: async (current) => {
          partial = current.text;
          const timestamp = Date.now();
          if (current.text && (timestamp - lastTextSent >= TEXT_EVENT_INTERVAL_MS || current.terminal)) {
            lastTextSent = timestamp;
            await send({ type: 'text', text: current.text });
          }
        },
      });

      const text = snapshot.text.trim();
      if (!text) {
        throw new A2AError(
          snapshot.state && snapshot.state !== 'completed'
            ? `${cred.label} 在 ${snapshot.state} 状态下结束，没有返回任何内容。`
            : `${cred.label} 没有返回任何内容。`,
          true,
        );
      }
      await insertFollowUp(env, readingId, { role: 'agent', content: text });
      await env.DB.prepare(
        'UPDATE readings SET context_id = ?, active_task_id = ?, updated_at = ? WHERE id = ?',
      )
        .bind(snapshot.contextId ?? row.context_id, null, now(), readingId)
        .run();
      await send({ type: 'done', text });
    } catch (cause) {
      const detail = cause instanceof Error ? safeErrorText(cause.message) : safeErrorText(cause);
      await insertFollowUp(env, readingId, {
        role: 'agent',
        content: partial,
        status: 'error',
        error: detail,
      });
      await send({ type: 'error', message: detail });
    } finally {
      clearTimeout(timer);
      try {
        await writer.close();
      } catch {
        /* 已关闭或客户端已离开 */
      }
    }
  };

  options.waitUntil(pump());

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
}
