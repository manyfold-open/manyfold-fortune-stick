import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MemoryStore,
  createWorkersAiTriageModel,
  isNarraGatewayEnabled,
  routeEvent,
  type InboundEvent,
  type RoomContext,
} from '@manyfold/narra-agent-kit';
import worker, { NarraMatrixSync, NarraRoomCoordinator } from '../src/worker/index';
import { STICKS } from '../src/shared/sticks';
import {
  FORTUNE_STICK_AGENT_ID,
  FORTUNE_STICK_AGENT_SPEC,
  FORTUNE_STICK_DEFAULT_MATRIX_ID,
  buildFortuneExtraEnvelopeFields,
  fetchFortuneUpdates,
  formatLocalStickDraw,
  formatStickReply,
  fortuneFastRespond,
  fortuneThinkingMessage,
  getSolarTermForDate,
  kickFortuneNarraGateway,
  narraGatewayConfig,
  resolveStickLang,
} from '../src/worker/narra/gateway';
import type { Env } from '../src/worker/types';
import { createD1, type FakeD1 } from './support/d1';

const ORIGIN = 'https://stick.test';

const FORBIDDEN_CHARS_IN_ZH_HANT =
  /[状态处隐决顾这周来签云开听范韧烛碍羡松发划卷系获疗愈欲权圣宝剑币术师运轮义战车恋节审们个与为对说时会学国门问间认记讲许论设访评识诉词试诚话该语误诱请读谁调谈谓]/;
const FORBIDDEN_TOKENS_IN_ZH_HANT = [
  '上上签',
  '上签',
  '中签',
  '下签',
  '云开',
  '这周',
  '每周',
  '下周',
  '本周',
  '障碍',
  '蜡烛',
  '联系',
  '收获',
  '疗愈',
  '迂回',
  '听窗外',
  '听他',
  '范围内',
  '准备',
  '回头',
  '标准',
  '决定',
  '计划',
  '规划',
  '环境',
  '机会',
];

function assertPureZhHant(text: string): void {
  for (const token of FORBIDDEN_TOKENS_IN_ZH_HANT) {
    expect(text, `Simplified token ${token} leaked in: ${text}`).not.toContain(token);
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '后' && i > 0 && text[i - 1] === '皇') continue;
    if (ch === '干' && text.slice(i, i + 2) === '干擾') continue;
    if (ch === '周' && text.slice(i, i + 2) === '周圍') continue;
    if (ch === '划' && text.slice(i, i + 2) === '划算') continue;
    if (ch === '系' && text.slice(Math.max(0, i - 1), i + 1) === '體系') continue;
    if (
      ch === '复' &&
      (text.slice(i, i + 2) === '復盤' ||
        text.slice(Math.max(0, i - 1), i + 1) === '恢復' ||
        text.slice(Math.max(0, i - 1), i + 1) === '修復')
    ) {
      continue;
    }
    if (
      ch === '里' &&
      (text.slice(Math.max(0, i - 1), i + 1) === '千里' ||
        text.slice(Math.max(0, i - 1), i + 2) === '三里橋')
    ) {
      continue;
    }
    expect(FORBIDDEN_CHARS_IN_ZH_HANT.test(ch), `Simplified char ${ch} leaked in: ${text}`).toBe(
      false,
    );
  }
}

const FORBIDDEN_IN_ZH_HANS =
  /[籤雲開聽範韌燭礙羨復鬆裡發後佔劃捲聯繫穫療癒慾週們個與為說時會學國門問見觀覺認記講許論設訪評識訴詞試誠話該語誤誘請讀誰調談謂]/;

function assertPureZhHans(text: string): void {
  expect(FORBIDDEN_IN_ZH_HANS.test(text), `Traditional-only char leaked in: ${text}`).toBe(false);
}

class FakeDOStorage {
  readonly data = new Map<string, unknown>();
  alarmAt: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.data.has(key)) return undefined;
    return structuredClone(this.data.get(key)) as T;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
  async list<T>(options: { prefix?: string; limit?: number } = {}): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    const prefix = options.prefix ?? '';
    for (const k of [...this.data.keys()].filter((key) => key.startsWith(prefix)).sort()) {
      if (options.limit && out.size >= options.limit) break;
      out.set(k, structuredClone(this.data.get(k)) as T);
    }
    return out;
  }
  async getAlarm(): Promise<number | null> {
    return this.alarmAt;
  }
  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.alarmAt = typeof scheduledTime === 'number' ? scheduledTime : scheduledTime.getTime();
  }
  async deleteAlarm(): Promise<void> {
    this.alarmAt = null;
  }
}

function makeFakeDOState(storage = new FakeDOStorage()): DurableObjectState {
  return {
    storage,
    id: { toString: () => 'fake-do', equals: () => false },
    waitUntil: () => undefined,
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
  } as unknown as DurableObjectState;
}

function makeInboundEvent(overrides: Partial<InboundEvent> = {}): InboundEvent {
  const nowMs = overrides.timestampMs ?? Date.now();
  return {
    roomId: '!grp_stick:matrix.netmind.chat',
    chatType: 'group',
    eventId: '$ev_stick_1',
    senderId: '@alice:matrix.netmind.chat',
    senderName: 'Alice',
    type: 'm.room.message',
    kind: 'text',
    msgtype: 'm.text',
    text: 'hello',
    timestampMs: nowMs,
    timeIso: new Date(nowMs).toISOString(),
    mentions: [],
    ...overrides,
  };
}

let d1: FakeD1;
let baseEnv: Env;

beforeAll(() => {
  d1 = createD1();
  baseEnv = {
    DB: d1.db,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as unknown as Fetcher,
    ENVIRONMENT: 'test',
    BASE_PATH: '/fortune-stick',
  } as Env;
});

afterAll(() => d1.close());

const execCtx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

describe('wrangler.jsonc & fail-closed safety invariants', () => {
  it('keeps database_id, routes, BASE_PATH intact and enables bound Narra gateway', () => {
    const raw = new TextDecoder().decode(
      readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url))),
    );
    const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
    const parsed = JSON.parse(stripped) as {
      ai?: { binding: string };
      routes: Array<{ pattern: string }>;
      d1_databases: Array<{ binding: string; database_id: string }>;
      triggers: { crons: string[] };
      durable_objects: { bindings: Array<{ name: string; class_name: string }> };
      migrations: Array<{ tag: string; new_sqlite_classes: string[] }>;
      vars: Record<string, string>;
    };

    expect(parsed.ai).toEqual({ binding: 'AI' });
    expect(parsed.d1_databases[0].database_id).toBe('911ece11-605c-4090-8610-f80c77841efd');
    expect(parsed.routes.map((r) => r.pattern)).toEqual(['app.manyfold.ai/fortune-stick*']);
    expect(parsed.vars.BASE_PATH).toBe('/fortune-stick');
    expect(parsed.vars.NARRA_GATEWAY_ENABLED).toBe('on');
    expect(parsed.vars.NARRA_SYNC).toBe('on');
    expect(parsed.vars.NARRA_AGENT_ID).toBe('agt_agqvtekvjbzldl5u2jczbc5equ');
    expect(parsed.vars.NARRA_MATRIX_ID).toBe('@agent-bc3282c7:matrix.netmind.chat');
    expect(parsed.triggers.crons).toEqual(['*/5 * * * *']);
    expect(parsed.durable_objects.bindings).toEqual([
      { name: 'NARRA_SYNC_DO', class_name: 'NarraMatrixSync' },
      { name: 'NARRA_ROOM_DO', class_name: 'NarraRoomCoordinator' },
    ]);
    expect(parsed.migrations[0].new_sqlite_classes).toEqual([
      'NarraMatrixSync',
      'NarraRoomCoordinator',
    ]);
  });

  it('kickFortuneNarraGateway and scheduled() make 0 external or D1 calls when disabled', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const dbExecSpy = vi.fn();
    const doFetchSpy = vi.fn();
    const disabledEnv = {
      ...baseEnv,
      DB: { exec: dbExecSpy, prepare: vi.fn() } as unknown as D1Database,
      NARRA_GATEWAY_ENABLED: 'off',
      NARRA_SYNC: 'off',
      NARRA_AGENT_TOKEN: 'secret_token_should_not_run',
      NARRA_SYNC_DO: {
        idFromName: (n: string) => n as unknown as DurableObjectId,
        get: () => ({ fetch: doFetchSpy }),
      } as unknown as DurableObjectNamespace,
    } as Env;

    expect(isNarraGatewayEnabled(disabledEnv)).toBe(false);
    const res = await kickFortuneNarraGateway(disabledEnv);
    expect(res).toEqual({
      enabled: false,
      syncKicked: false,
      syncRunning: false,
      broadcast: null,
    });

    await worker.scheduled(
      { cron: '*/5 * * * *', scheduledTime: Date.now(), noRetry: () => undefined } as ScheduledController,
      disabledEnv,
      execCtx,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbExecSpy).not.toHaveBeenCalled();
    expect(doFetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('admin-gated GET /api/gateway/status', () => {
  it('returns 401 when unauthenticated or when ADMIN_PASSWORD is unset', async () => {
    const resNoConfig = await worker.fetch(new Request(`${ORIGIN}/api/gateway/status`), baseEnv, execCtx);
    expect(resNoConfig.status).toBe(401);

    const envWithPw = { ...baseEnv, ADMIN_PASSWORD: 'stick-admin-password' } as Env;
    const resMissing = await worker.fetch(
      new Request(`${ORIGIN}/api/gateway/status`),
      envWithPw,
      execCtx,
    );
    expect(resMissing.status).toBe(401);

    const resWrong = await worker.fetch(
      new Request(`${ORIGIN}/fortune-stick/api/gateway/status`, {
        headers: { 'x-admin-password': 'wrong-password' },
      }),
      envWithPw,
      execCtx,
    );
    expect(resWrong.status).toBe(401);
  });

  it('returns redacted gateway status when authenticated and never leaks tokens', async () => {
    const NARRA_SECRET = 'narra_tok_super_secret_stick_999';
    const MATRIX_SECRET = 'syt_matrix_secret_stick_888';
    const A2A_SECRET = 'a2a_secret_stick_777';
    const envWithSecrets = {
      ...baseEnv,
      ADMIN_PASSWORD: 'stick-admin-secret',
      NARRA_GATEWAY_ENABLED: 'off',
      NARRA_SYNC: 'off',
      NARRA_AGENT_TOKEN: NARRA_SECRET,
      MATRIX_ACCESS_TOKEN: MATRIX_SECRET,
      MANYFOLD_A2A_TOKEN: A2A_SECRET,
    } as Env;

    const res = await worker.fetch(
      new Request(`${ORIGIN}/fortune-stick/api/gateway/status`, {
        headers: { 'x-admin-password': 'stick-admin-secret' },
      }),
      envWithSecrets,
      execCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      enabled: boolean;
      syncEnabled: boolean;
      agentId: string;
      matrixId: string;
      config: Record<string, unknown>;
    };
    expect(body.enabled).toBe(false);
    expect(body.syncEnabled).toBe(false);
    expect(body.agentId).toBe(FORTUNE_STICK_AGENT_ID);
    expect(body.matrixId).toBe(FORTUNE_STICK_DEFAULT_MATRIX_ID);
    expect(body.config.hasNarraAgentToken).toBe(true);
    expect(body.config.hasMatrixAccessToken).toBe(true);

    const rawJson = JSON.stringify(body);
    expect(rawJson).not.toContain(NARRA_SECRET);
    expect(rawJson).not.toContain(MATRIX_SECRET);
    expect(rawJson).not.toContain(A2A_SECRET);
  });
});

describe('AgentSpec routing, 3-min active session & antiKeywords', () => {
  const baseContext: RoomContext = {
    roomId: '!grp_stick:matrix.netmind.chat',
    chatType: 'group',
    members: [
      { matrixId: '@alice:matrix.netmind.chat', displayName: 'Alice', isAgent: false },
      { matrixId: FORTUNE_STICK_DEFAULT_MATRIX_ID, displayName: 'AI Fortune Stick', isAgent: true },
      { matrixId: '@agent-74f30ae5:matrix.netmind.chat', displayName: 'lcf-guide', isAgent: true },
    ],
    recentHistory: [],
  };

  it('triggers on fortune stick keywords and rejects off-topic antiKeywords', async () => {
    for (const text of [
      'Can I draw a fortune stick?',
      '想問一籤看看今年運勢',
      '帮我求签问一下工作的事',
      '今天想抽签看看运势',
      '來求籤吧',
    ]) {
      const dec = await routeEvent(makeInboundEvent({ text }), baseContext, FORTUNE_STICK_AGENT_SPEC);
      expect(dec.shouldReply, text).toBe(true);
    }

    for (const offTopic of [
      '搖一下飲料',
      'draw a quick chart',
      'Any good ramen restaurant in Soho?',
      'Boots discount voucher code please',
      'OpenAI latest AI news today',
      'Pop-up exhibition in East London',
      '想抽三張塔羅牌占卜',
      '@fortune-stick @lcf-guide 倫敦中國城有什麼好吃的拉麵餐廳？',
    ]) {
      const dec = await routeEvent(
        makeInboundEvent({ text: offTopic }),
        baseContext,
        FORTUNE_STICK_AGENT_SPEC,
      );
      expect(dec.shouldReply, offTopic).toBe(false);
    }
  });

  it('supports seamless 3-minute active session follow-ups on 搖, 摇, and draw', async () => {
    const nowMs = Date.now();
    const activeCtx: RoomContext = {
      ...baseContext,
      activeSession: {
        active: true,
        lastAgentReplyAtMs: nowMs - 60_000,
        expiresAtMs: nowMs + 120_000,
      },
    };
    expect(FORTUNE_STICK_AGENT_SPEC.sessionWindowMs).toBe(180_000);

    for (const trigger of ['搖', '摇', 'draw', '再抽一支', '那這支籤呢？']) {
      const dec = await routeEvent(
        makeInboundEvent({ text: trigger, timestampMs: nowMs }),
        activeCtx,
        FORTUNE_STICK_AGENT_SPEC,
        { nowMs },
      );
      expect(dec.shouldReply, trigger).toBe(true);
      expect(dec.reason, trigger).toBe('active_session');
    }

    for (const chatter of [
      '今天天氣真不錯，晚上想早點休息',
      '好喔謝謝，我先去忙一下',
      'Any good ramen restaurant in Soho?',
    ]) {
      const dec = await routeEvent(
        makeInboundEvent({ text: chatter, timestampMs: nowMs }),
        activeCtx,
        FORTUNE_STICK_AGENT_SPEC,
        { nowMs },
      );
      expect(dec.shouldReply, chatter).toBe(false);
    }
  });

  it('LGRP-14: disambiguates multi-@ prompts containing fortune-stick phrases like 求一籤', async () => {
    const multiAgentContext: RoomContext = {
      roomId: '!grp_lgrp14:matrix.netmind.chat',
      chatType: 'group',
      members: [
        { matrixId: '@alice:matrix.netmind.chat', displayName: 'Alice', isAgent: false },
        { matrixId: '@agent-b9908957:matrix.netmind.chat', displayName: 'Spotted London', isAgent: true },
        { matrixId: FORTUNE_STICK_DEFAULT_MATRIX_ID, displayName: 'AI Fortune Stick', isAgent: true },
      ],
      recentHistory: [],
    };

    const lgrp14 = await routeEvent(
      makeInboundEvent({
        text: '@Spotted London @AI Fortune Stick 幫我求一籤',
        mentions: ['@agent-b9908957:matrix.netmind.chat', FORTUNE_STICK_DEFAULT_MATRIX_ID],
      }),
      multiAgentContext,
      FORTUNE_STICK_AGENT_SPEC,
    );
    expect(lgrp14.shouldReply).toBe(true);
    expect(lgrp14.reason).toBe('multi_mention_domain_match');
    expect(lgrp14.detectedLang).toBe('zh-Hant');

    for (const text of [
      '@Spotted London @AI Fortune Stick 幫我求一籤',
      '@Spotted London @AI Fortune Stick 摇一签',
      '@Spotted London @AI Fortune Stick 抽一支籤',
      '@Spotted London @AI Fortune Stick 再抽一支',
      '@Spotted London @AI Fortune Stick 來一籤',
      '@Spotted London @AI Fortune Stick 看第18籤',
      '@Spotted London @AI Fortune Stick stick #8',
    ]) {
      const dec = await routeEvent(
        makeInboundEvent({ text }),
        multiAgentContext,
        FORTUNE_STICK_AGENT_SPEC,
      );
      expect(dec.shouldReply, text).toBe(true);
      expect(dec.reason, text).toBe('multi_mention_domain_match');
    }
  });

  it('matches natural 求一支籤/求一支签 group requests via domainKeywords and draws a stick in matching script', async () => {
    const emptyMem = { userMemories: [], roomMemories: [], promptSafeLines: [] };
    const cases = [
      {
        text: '最近工作有點卡關，幫我求一支籤吧',
        expectedLang: 'zh-Hant' as const,
        expectedStickRe: /^第 \d+ 籤/,
        checkScript: assertPureZhHant,
      },
      {
        text: '最近工作有点卡关，帮我求一支签吧',
        expectedLang: 'zh-Hans' as const,
        expectedStickRe: /^第 \d+ 签/,
        checkScript: assertPureZhHans,
      },
    ];

    for (const c of cases) {
      const matchedDomainKeyword = (FORTUNE_STICK_AGENT_SPEC.domainKeywords ?? []).some((kw) =>
        kw instanceof RegExp ? kw.test(c.text) : c.text.includes(kw),
      );
      expect(matchedDomainKeyword, c.text).toBe(true);

      const ev = makeInboundEvent({ text: c.text });
      const dec = await routeEvent(ev, baseContext, FORTUNE_STICK_AGENT_SPEC);
      expect(dec.shouldReply, c.text).toBe(true);
      expect(dec.detectedLang, c.text).toBe(c.expectedLang);

      const reply = await fortuneFastRespond(baseEnv, ev, dec, emptyMem);
      expect(reply, c.text).not.toBeNull();
      expect(reply, c.text).toMatch(c.expectedStickRe);
      c.checkScript(reply!);
    }
  });
});

describe('fastRespond crisis safety, CSPRNG draw & pure zh-Hant/zh-Hans/en', () => {
  it('refuses to draw and emits crisis helplines in pure matching script', async () => {
    for (const [text, expectedLang, checkFn] of [
      ['我撐不住了，想自殺結束生命', 'zh-Hant', assertPureZhHant],
      ['我已经撑不下去了，真的想自杀', 'zh-Hans', assertPureZhHans],
      ['I am in crisis and want to kill myself', 'en', () => undefined],
    ] as const) {
      const ev = makeInboundEvent({ chatType: 'dm', text });
      const dec = await routeEvent(
        ev,
        { roomId: ev.roomId, chatType: 'dm', members: [], recentHistory: [] },
        FORTUNE_STICK_AGENT_SPEC,
      );
      const reply = await fortuneFastRespond(baseEnv, ev, dec, {
        userMemories: [],
        roomMemories: [],
        promptSafeLines: [],
      });
      expect(reply).not.toBeNull();
      expect(dec.detectedLang).toBe(expectedLang);
      expect(reply).toContain('999');
      expect(reply).toContain('116 123');
      expect(reply).toContain('911');
      expect(reply).toContain('988');
      expect(reply).toContain('110');
      expect(reply).toContain('120');
      expect(reply).toContain('12356');
      expect(reply).not.toContain('籤詩');
      expect(reply).not.toContain('签诗');
      expect(reply).not.toContain('Couplet:');
      checkFn(reply!);
    }
  });

  it('exhaustively formats all 36 sticks with zero zh-Hant/zh-Hans script leaks and zero dashes', () => {
    const dashPattern = /[\u2010-\u2015\u2212]|[ \t]+-+[ \t]+|--/;
    for (const stick of STICKS) {
      const hant = formatStickReply(stick, 'zh-Hant');
      assertPureZhHant(hant);
      expect(hant).not.toMatch(dashPattern);

      const hans = formatStickReply(stick, 'zh-Hans');
      assertPureZhHans(hans);
      expect(hans).not.toMatch(dashPattern);

      const en = formatStickReply(stick, 'en');
      expect(en).not.toMatch(/[\u4e00-\u9fff]/);
      expect(en).not.toMatch(dashPattern);
    }

    const drawnHant = formatLocalStickDraw('zh-Hant', { randomByte: () => 5 });
    assertPureZhHant(drawnHant);
    expect(drawnHant).toContain('第 6 籤');

    const drawnHans = formatLocalStickDraw('zh-Hans', { randomByte: () => 0 });
    assertPureZhHans(drawnHans);
    expect(drawnHans).toContain('第 1 签');
  });

  it('replies immediately to DM greetings in pure matching script with zero dashes', async () => {
    const dashPattern = /[\u2010-\u2015\u2212]|[ \t]+-+[ \t]+|--/;
    const emptyMem = { userMemories: [], roomMemories: [], promptSafeLines: [] };
    for (const [text, expectedLang, checkFn, expectedSub] of [
      ['你好', 'zh-Hant', assertPureZhHant, '求籤'],
      ['嗨', 'zh-Hant', assertPureZhHant, '問一籤'],
      ['hello', 'en', (s: string) => expect(s).not.toMatch(/[\u4e00-\u9fff]/), 'AI Fortune Stick'],
    ] as const) {
      const ev = makeInboundEvent({ chatType: 'dm', text });
      const dec = await routeEvent(
        ev,
        { roomId: ev.roomId, chatType: 'dm', members: [], recentHistory: [] },
        FORTUNE_STICK_AGENT_SPEC,
      );
      const reply = await fortuneFastRespond(baseEnv, ev, dec, emptyMem);
      expect(dec.reason).toBe('dm');
      expect(dec.detectedLang).toBe(expectedLang);
      expect(reply).not.toBeNull();
      expect(reply).not.toMatch(dashPattern);
      expect(reply).toContain(expectedSub);
      checkFn(reply!);
    }
  });

  it('strips Chinese/sibling @mentions before script detection and handles DM greeting', async () => {
    const dashPattern = /[\u2010-\u2015\u2212]|[ \t]+-+[ \t]+|--/;
    const emptyMem = { userMemories: [], roomMemories: [], promptSafeLines: [] };
    const storedHantMem = {
      userMemories: [
        {
          id: 'mem_hant_stick',
          scope: 'user' as const,
          agentId: FORTUNE_STICK_AGENT_ID,
          userId: '@alice:matrix.netmind.chat',
          originChatType: 'group' as const,
          kind: 'language' as const,
          key: 'lang',
          value: 'zh-Hant',
          createdAt: '2026-11-19T00:00:00.000Z',
          updatedAt: '2026-11-19T00:00:00.000Z',
        },
      ],
      roomMemories: [],
      promptSafeLines: [],
    };
    const groupCtx: RoomContext = {
      roomId: '!grp_stick:matrix.netmind.chat',
      chatType: 'group',
      userLanguageHint: 'zh-Hant',
      members: [
        { matrixId: '@alice:matrix.netmind.chat', displayName: 'Alice', isAgent: false },
        { matrixId: FORTUNE_STICK_DEFAULT_MATRIX_ID, displayName: 'AI Fortune Stick', isAgent: true },
      ],
      recentHistory: [],
    };

    // 1. @問一籤 帮我求一签 with userHint: 'zh-Hant' / stored 'zh-Hant' -> pure zh-Hans (第 ... 签)
    const hansMentionEv = makeInboundEvent({ text: '@問一籤 帮我求一签' });
    const hansMentionDec = await routeEvent(hansMentionEv, groupCtx, FORTUNE_STICK_AGENT_SPEC);
    expect(hansMentionDec.shouldReply).toBe(true);
    expect(hansMentionDec.detectedLang).toBe('zh-Hans');
    const hansMentionReply = await fortuneFastRespond(
      baseEnv,
      hansMentionEv,
      { ...hansMentionDec, detectedLang: 'zh-Hant' },
      storedHantMem,
    );
    expect(hansMentionReply).not.toBeNull();
    expect(hansMentionReply).toMatch(/^第 \d+ 签/);
    expect(hansMentionReply).not.toMatch(dashPattern);
    assertPureZhHans(hansMentionReply!);

    // 2. @問一籤 draw a fortune stick with userHint: 'zh-Hant' / stored 'zh-Hant' -> pure English
    const enMentionEv = makeInboundEvent({ text: '@問一籤 draw a fortune stick' });
    const enMentionDec = await routeEvent(enMentionEv, groupCtx, FORTUNE_STICK_AGENT_SPEC);
    expect(enMentionDec.shouldReply).toBe(true);
    expect(enMentionDec.detectedLang).toBe('en');
    const enMentionReply = await fortuneFastRespond(
      baseEnv,
      enMentionEv,
      { ...enMentionDec, detectedLang: 'zh-Hant' },
      storedHantMem,
    );
    expect(enMentionReply).not.toBeNull();
    expect(enMentionReply).toMatch(/^Stick \d+ of \d+/);
    expect(enMentionReply).not.toMatch(/[\u4e00-\u9fff]/);
    expect(enMentionReply).not.toMatch(dashPattern);

    // 3. DM bare 你好 (chatType: 'dm', decision.reason: 'dm') -> instant zh-Hant DM greeting
    const dmHiEv = makeInboundEvent({ chatType: 'dm', text: '你好' });
    const dmHiDec = await routeEvent(
      dmHiEv,
      { roomId: dmHiEv.roomId, chatType: 'dm', members: [], recentHistory: [] },
      FORTUNE_STICK_AGENT_SPEC,
    );
    expect(dmHiDec.reason).toBe('dm');
    const dmHiReply = await fortuneFastRespond(baseEnv, dmHiEv, dmHiDec, emptyMem);
    expect(dmHiReply).not.toBeNull();
    expect(dmHiReply).toContain('我是問一籤');
    expect(dmHiReply).not.toMatch(dashPattern);
    assertPureZhHant(dmHiReply!);
  });

  it('executes local CSPRNG draw inside NarraRoomCoordinator DO and falls back to A2A for follow-ups', async () => {
    let nowMs = 1_760_500_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    const posted: string[] = [];
    let a2aCalled = 0;

    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/api/agent-runtime/chat/send')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { text: string };
          posted.push(body.text);
          return Response.json({ status: 'ok', data: { event_id: `$sent_${posted.length}` } });
        }
        if (url === 'https://a2a.stick.test/rpc') {
          a2aCalled++;
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: '1',
              result: {
                kind: 'message',
                role: 'agent',
                parts: [{ kind: 'text', text: '把你想问的那件事心里默念一遍，准备好就回复「摇」。' }],
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response('not found', { status: 404 });
      });

      vi.stubGlobal('fetch', fetchMock);
      const gwEnv = {
        ...baseEnv,
        NARRA_GATEWAY_ENABLED: 'on',
        NARRA_SYNC: 'off',
        NARRA_AGENT_TOKEN: 'narra_stick_test_tok',
        MANYFOLD_A2A_URL: 'https://a2a.stick.test/rpc',
        MANYFOLD_A2A_TOKEN: 'a2a_stick_test_tok',
      } as Env;

      const roomState = makeFakeDOState();
      const roomDo = new NarraRoomCoordinator(roomState, gwEnv);
      const syncDo = new NarraMatrixSync(makeFakeDOState(), gwEnv);
      expect(roomDo).toBeInstanceOf(NarraRoomCoordinator);
      expect(syncDo).toBeInstanceOf(NarraMatrixSync);

      const roomId = '!stick_grp:matrix.netmind.chat';
      // 1. Nuanced question -> A2A fallback
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            chatType: 'group',
            events: [
              {
                event_id: '$s1',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: {
                  msgtype: 'm.text',
                  body: '@AI Fortune Stick 我最近在考虑要不要换城市发展',
                  'm.mentions': { user_ids: [FORTUNE_STICK_DEFAULT_MATRIX_ID] },
                },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();
      expect(a2aCalled).toBe(1);
      expect(posted).toHaveLength(1);
      expect(posted[0]).toContain('准备好就回复');

      // 2. Seamless 3-min follow-up "摇" without re-@ -> local CSPRNG draw in zh-Hans!
      nowMs += 30_000;
      vi.setSystemTime(nowMs);
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            events: [
              {
                event_id: '$s2',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: { msgtype: 'm.text', body: '摇' },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();
      expect(a2aCalled).toBe(1); // handled locally, no extra A2A call!
      expect(posted).toHaveLength(2);
      expect(posted[1]).toMatch(/第 \d+ 签/);
      assertPureZhHans(posted[1]);

      // 3. Valid active-session follow-up without @ works cleanly (local redraw + nuanced question)
      nowMs += 20_000;
      vi.setSystemTime(nowMs);
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            events: [
              {
                event_id: '$s3',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: { msgtype: 'm.text', body: '再抽一支' },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();
      expect(a2aCalled).toBe(1);
      expect(posted).toHaveLength(3);
      expect(posted[2]).toMatch(/第 \d+ 签/);
      assertPureZhHans(posted[2]);

      nowMs += 20_000;
      vi.setSystemTime(nowMs);
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            events: [
              {
                event_id: '$s4',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: { msgtype: 'm.text', body: '這支籤的工作面怎麼解？' },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();
      expect(a2aCalled).toBe(2);
      expect(posted).toHaveLength(4);

      // 4. Unmentioned casual chatter in active session stays silent (no A2A, no Matrix send)
      nowMs += 20_000;
      vi.setSystemTime(nowMs);
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            events: [
              {
                event_id: '$s5',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: { msgtype: 'm.text', body: '好喔謝謝，我先去忙一下' },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();
      expect(a2aCalled).toBe(2);
      expect(posted).toHaveLength(4);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('silences unmentioned group off-topic and casual active_session chatter while keeping follow-ups intact', async () => {
    const emptyMem = { userMemories: [], roomMemories: [], promptSafeLines: [] };
    const makeDecision = (reason: string, detectedLang: 'zh-Hant' | 'zh-Hans' | 'en' = 'zh-Hant') => ({
      shouldReply: true,
      tier: 0 as const,
      reason,
      confidence: 0.9,
      detectedLang,
      shouldQuote: false,
    });

    // Any unmentioned group turn with antiKeywords and no domainKeywords -> [NO_REPLY]
    for (const reason of ['active_session', 'domain_match', 'multi_mention_domain_match']) {
      for (const offTopic of [
        '搖一下飲料吧，哪家奶茶好喝',
        '倫敦中國城有什麼好吃的拉麵餐廳？',
        'Latest OpenAI AI news today',
        '幫我抽三張塔羅牌占卜',
      ]) {
        const reply = await fortuneFastRespond(
          baseEnv,
          makeInboundEvent({ chatType: 'group', text: offTopic }),
          makeDecision(reason),
          emptyMem,
        );
        expect(reply, `${reason}: ${offTopic}`).toBe('[NO_REPLY]');
      }
    }

    // Active-session casual greeting/closing/weather/thanks without stick/reading cue -> [NO_REPLY]
    for (const [text, lang] of [
      ['今天天氣真不錯，晚上想早點休息', 'zh-Hant'],
      ['好喔謝謝，我先去忙一下', 'zh-Hant'],
      ['你好', 'zh-Hant'],
      ['嗨', 'zh-Hant'],
      ['早安', 'zh-Hant'],
      ['晚安', 'zh-Hant'],
      ['謝謝', 'zh-Hant'],
      ['好的，謝謝！', 'zh-Hant'],
      ['感謝', 'zh-Hant'],
      ['拜拜', 'zh-Hant'],
      ['hello', 'en'],
      ['thanks', 'en'],
      ['ok thanks', 'en'],
      ['goodnight, going to bed', 'en'],
    ] as const) {
      const reply = await fortuneFastRespond(
        baseEnv,
        makeInboundEvent({ chatType: 'group', text }),
        makeDecision('active_session', lang),
        emptyMem,
      );
      expect(reply, `active_session casual: ${text}`).toBe('[NO_REPLY]');
    }

    const jackpotQuestion = makeInboundEvent({
      chatType: 'group',
      text: '我今天會中 100 萬嗎？',
      mentions: [FORTUNE_STICK_DEFAULT_MATRIX_ID],
    });
    const jackpotDecision = await routeEvent(jackpotQuestion, { roomId: jackpotQuestion.roomId, chatType: 'group', members: [], recentHistory: [] }, FORTUNE_STICK_AGENT_SPEC);
    expect(jackpotDecision.reason).toBe('explicit_mention');
    const jackpotReply = await fortuneFastRespond(baseEnv, jackpotQuestion, jackpotDecision, emptyMem);
    expect(jackpotReply).toContain('開獎結果是隨機的');
    expect(jackpotReply).toMatch(/第 \d+ 籤/);

    // Valid active-session follow-ups without @ MUST keep working
    const drawReply = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ chatType: 'group', text: '抽' }),
      makeDecision('active_session', 'zh-Hant'),
      emptyMem,
    );
    expect(drawReply).toMatch(/^第 \d+ 籤/);

    const redrawReply = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ chatType: 'group', text: '再抽一支' }),
      makeDecision('active_session', 'zh-Hant'),
      emptyMem,
    );
    expect(redrawReply).toMatch(/^第 \d+ 籤/);

    const lookupReply = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ chatType: 'group', text: '看第8籤' }),
      makeDecision('active_session', 'zh-Hant'),
      emptyMem,
    );
    expect(lookupReply).toContain('第 8 籤');

    for (const [followUp, lang] of [
      ['這支籤的工作面怎麼解？', 'zh-Hant'],
      ['謝謝，那這支籤的意思呢？', 'zh-Hant'],
      ['那第二句籤詩是什麼意思？', 'zh-Hant'],
      ['Thanks! What does this stick mean for my career?', 'en'],
    ] as const) {
      const reply = await fortuneFastRespond(
        baseEnv,
        makeInboundEvent({ chatType: 'group', text: followUp }),
        makeDecision('active_session', lang),
        emptyMem,
      );
      expect(reply, `valid follow-up: ${followUp}`).toBeNull();
    }

    // Explicit @ mention greeting in group still replies
    const explicitGreeting = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ chatType: 'group', text: '@AI Fortune Stick 你好' }),
      makeDecision('explicit_mention', 'zh-Hant'),
      emptyMem,
    );
    expect(explicitGreeting).toContain('我是問一籤');
  });

  it('fetchFortuneUpdates returns [] by default and emits solar-term items only when opted in on a solar term day', async () => {
    const enabledEnv = {
      ...baseEnv,
      NARRA_GATEWAY_ENABLED: 'on',
      NARRA_AGENT_TOKEN: 'narra_stick_bcast_tok',
    } as Env;

    const mem = new MemoryStore(d1.db, FORTUNE_STICK_AGENT_ID);
    await mem.ensureSchema();

    const solarTermDate = new Date('2026-11-22T04:00:00.000Z'); // 小雪 in UTC+8
    expect(getSolarTermForDate(solarTermDate)?.slug).toBe('xiaoxue');
    expect(await fetchFortuneUpdates(enabledEnv, new Date().toISOString(), solarTermDate)).toEqual([]);

    await mem.rememberRoom({
      roomId: '!stick_solar_room:matrix.netmind.chat',
      key: 'opt_in_solar_term',
      value: 'true',
      kind: 'preference',
    });

    const updates = await fetchFortuneUpdates(enabledEnv, new Date().toISOString(), solarTermDate);
    expect(updates).toHaveLength(1);
    expect(updates[0].roomId).toBe('!stick_solar_room:matrix.netmind.chat');
    expect(updates[0].updateKey).toBe('solar_term:2026-11-22:xiaoxue');
    assertPureZhHant(updates[0].text);

    // Non-solar-term day returns [] for opt_in_solar_term
    const ordinaryDay = new Date('2026-11-19T04:00:00.000Z');
    expect(getSolarTermForDate(ordinaryDay)).toBeNull();
    expect(await fetchFortuneUpdates(enabledEnv, new Date().toISOString(), ordinaryDay)).toEqual([]);
  });

  it('T11/T8: supports cross-script language switching and instant stick lookup for 幫我看第8籤', async () => {
    expect(resolveStickLang('請用簡體', 'zh-Hant')).toBe('zh-Hans');
    expect(resolveStickLang('请用繁体', 'zh-Hans')).toBe('zh-Hant');
    expect(resolveStickLang('用英文', 'zh-Hant')).toBe('en');
    expect(resolveStickLang('speak English', 'zh-Hant')).toBe('en');

    const mem = new MemoryStore(d1.db, FORTUNE_STICK_AGENT_ID);
    await mem.ensureSchema();
    const senderId = '@stick_lang_switch:matrix.netmind.chat';
    const roomId = '!grp_stick_lang:matrix.netmind.chat';
    const emptyMem = { userMemories: [], roomMemories: [], promptSafeLines: [] };
    const makeSwitchDecision = (detectedLang: 'zh-Hant' | 'zh-Hans' | 'en') => ({
      shouldReply: true,
      tier: 0 as const,
      reason: 'explicit_mention',
      confidence: 1,
      detectedLang,
      shouldQuote: false,
    });

    const toHansReply = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ roomId, senderId, chatType: 'group', text: '@AI Fortune Stick 請用簡體' }),
      makeSwitchDecision('zh-Hant'),
      emptyMem,
    );
    expect(toHansReply).toContain('简体中文');
    assertPureZhHans(toHansReply!);
    expect(await mem.getPreferredLang(senderId, 'group')).toBe('zh-Hans');

    const toHantReply = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ roomId, senderId, chatType: 'group', text: '@AI Fortune Stick 请用繁体' }),
      makeSwitchDecision('zh-Hans'),
      emptyMem,
    );
    expect(toHantReply).toContain('繁體中文');
    assertPureZhHant(toHantReply!);
    expect(await mem.getPreferredLang(senderId, 'group')).toBe('zh-Hant');

    const toEnReply = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ roomId, senderId, chatType: 'group', text: '@AI Fortune Stick 用英文' }),
      makeSwitchDecision('zh-Hant'),
      emptyMem,
    );
    expect(toEnReply).toContain('English');
    expect(toEnReply).not.toMatch(/[\u4e00-\u9fff]/);
    expect(await mem.getPreferredLang(senderId, 'group')).toBe('en');

    // T8: Stick 8 lookup phrases ("幫我看第8籤", "帮我看第8签", "please check stick #8")
    const groupCtx: RoomContext = {
      roomId: '!grp_stick_lookup:matrix.netmind.chat',
      chatType: 'group',
      members: [
        { matrixId: '@alice:matrix.netmind.chat', displayName: 'Alice', isAgent: false },
        { matrixId: FORTUNE_STICK_DEFAULT_MATRIX_ID, displayName: 'AI Fortune Stick', isAgent: true },
      ],
      recentHistory: [],
    };
    for (const text of ['幫我看第8籤', '@AI Fortune Stick 幫我看第8籤']) {
      const ev = makeInboundEvent({ text });
      const dec = await routeEvent(ev, groupCtx, FORTUNE_STICK_AGENT_SPEC);
      expect(dec.shouldReply, text).toBe(true);
      const reply = await fortuneFastRespond(baseEnv, ev, dec, emptyMem);
      expect(reply, text).toContain('第 8 籤');
      expect(reply, text).toContain('玉在石中');
      expect(reply, text).toContain('頑石未剖誰人識');
      expect(reply, text).toContain('一朝開處見玲瓏');
      assertPureZhHant(reply!);
    }

    const hansLookupEv = makeInboundEvent({ chatType: 'dm', text: '帮我看第8签' });
    const hansLookupDec = await routeEvent(
      hansLookupEv,
      { roomId: hansLookupEv.roomId, chatType: 'dm', members: [], recentHistory: [] },
      FORTUNE_STICK_AGENT_SPEC,
    );
    const hansLookupReply = await fortuneFastRespond(baseEnv, hansLookupEv, hansLookupDec, emptyMem);
    expect(hansLookupReply).toContain('第 8 签');
    expect(hansLookupReply).toContain('玉在石中');
    expect(hansLookupReply).toContain('顽石未剖谁人识');
    assertPureZhHans(hansLookupReply!);

    const enLookupEv = makeInboundEvent({ chatType: 'dm', text: 'please check stick #8' });
    const enLookupDec = await routeEvent(
      enLookupEv,
      { roomId: enLookupEv.roomId, chatType: 'dm', members: [], recentHistory: [] },
      FORTUNE_STICK_AGENT_SPEC,
    );
    const enLookupReply = await fortuneFastRespond(baseEnv, enLookupEv, enLookupDec, emptyMem);
    expect(enLookupReply).toContain('Stick 8 of 36');
    expect(enLookupReply).toContain('Jade in the Stone');
    expect(enLookupReply).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('uses env.AI Workers AI triage with refined domainDescription for ambiguous group turns and stays silent on anecdotes', async () => {
    const aiPrompts: string[] = [];
    const aiMock = {
      run: vi.fn(async (_model: string, input: { messages: Array<{ role: string; content: string }> }) => {
        aiPrompts.push(input.messages.map((m) => m.content).join('\n'));
        const userMsg = input.messages.find((m) => m.role === 'user')?.content ?? '';
        if (userMsg.includes('換跑道')) {
          return { response: JSON.stringify({ score: 0.85, reason: 'stick_decision_crossroads' }) };
        }
        return { response: JSON.stringify({ score: 0.1, reason: 'peer_or_noise' }) };
      }),
    };

    const peerCtx: RoomContext = {
      roomId: '!grp_stick_ai_triage:matrix.netmind.chat',
      chatType: 'group',
      members: [
        { matrixId: '@alice:matrix.netmind.chat', displayName: 'Alice', isAgent: false },
        { matrixId: FORTUNE_STICK_DEFAULT_MATRIX_ID, displayName: 'AI Fortune Stick', isAgent: true },
        { matrixId: '@agent-852feddf:matrix.netmind.chat', displayName: 'AI Tarot', isAgent: true },
      ],
      recentHistory: [],
    };
    const triageModel = createWorkersAiTriageModel(aiMock);

    const decisionYes = await routeEvent(
      makeInboundEvent({ text: '最近一直想換跑道，不知道該不該先邁出這一步？' }),
      peerCtx,
      FORTUNE_STICK_AGENT_SPEC,
      { triageModel },
    );
    expect(decisionYes.shouldReply).toBe(true);
    expect(decisionYes.triageSource).toBe('model');
    expect(aiMock.run).toHaveBeenCalledTimes(1);
    expect(aiPrompts[0]).toContain(FORTUNE_STICK_AGENT_SPEC.domainDescription);
    expect(aiPrompts[0]).toContain('AI Tarot');

    // Past-tense anecdote is filtered deterministically without invoking Workers AI
    const anecdoteDec = await routeEvent(
      makeInboundEvent({ text: '我朋友昨天去廟裡抽到上上籤，超神奇' }),
      peerCtx,
      FORTUNE_STICK_AGENT_SPEC,
      { triageModel },
    );
    expect(anecdoteDec.shouldReply).toBe(false);
    expect(aiMock.run).toHaveBeenCalledTimes(1);

    // End-to-end inside NarraRoomCoordinator with env.AI binding
    let nowMs = 1_760_600_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    const posted: string[] = [];
    let a2aCalled = 0;

    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
          if (url.endsWith('/api/agent-runtime/chat/send')) {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text: string };
            posted.push(body.text);
            return Response.json({ status: 'ok', data: { event_id: `$sent_stick_ai_${posted.length}` } });
          }
          if (url === 'https://a2a.stick.test/rpc') {
            a2aCalled++;
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                result: {
                  kind: 'message',
                  role: 'agent',
                  parts: [{ kind: 'text', text: '想先問一支籤看看此刻的轉折點嗎？回覆「搖」就可以開始。' }],
                },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response('not found', { status: 404 });
        }),
      );

      const gwEnv = {
        ...baseEnv,
        AI: aiMock as unknown as Ai,
        NARRA_GATEWAY_ENABLED: 'on',
        NARRA_SYNC: 'off',
        NARRA_AGENT_TOKEN: 'narra_stick_ai_tok',
        MANYFOLD_A2A_URL: 'https://a2a.stick.test/rpc',
        MANYFOLD_A2A_TOKEN: 'a2a_stick_ai_tok',
      } as Env;

      const roomDo = new NarraRoomCoordinator(makeFakeDOState(), gwEnv);
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId: '!grp_stick_do_ai:matrix.netmind.chat',
            chatType: 'group',
            members: [
              { matrixId: '@alice:matrix.netmind.chat', displayName: 'Alice', isAgent: false },
              { matrixId: FORTUNE_STICK_DEFAULT_MATRIX_ID, displayName: 'AI Fortune Stick', isAgent: true },
            ],
            events: [
              {
                event_id: '$stick_ai_1',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: {
                  msgtype: 'm.text',
                  body: '最近一直想換跑道，不知道該不該先邁出這一步？',
                },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();

      expect(aiMock.run).toHaveBeenCalledTimes(2);
      expect(a2aCalled).toBe(1);
      expect(posted).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('responds locally to bare @AI Fortune Stick in a group without hitting A2A', async () => {
    const dashPattern = /[\u2010-\u2015\u2212]|[ \t]+-+[ \t]+|--/;
    const emptyMem = { userMemories: [], roomMemories: [], promptSafeLines: [] };
    const groupCtx: RoomContext = {
      roomId: '!grp_stick_bare:matrix.netmind.chat',
      chatType: 'group',
      members: [
        { matrixId: '@alice:matrix.netmind.chat', displayName: 'Alice', isAgent: false },
        { matrixId: FORTUNE_STICK_DEFAULT_MATRIX_ID, displayName: 'AI Fortune Stick', isAgent: true },
      ],
      recentHistory: [],
    };

    for (const [mentionText, langHint, expectedSub, checkFn] of [
      ['@AI Fortune Stick', 'en', 'Hi! I am AI Fortune Stick', (s: string) => expect(s).not.toMatch(/[\u4e00-\u9fff]/)],
      ['@AI Fortune Stick', 'zh-Hant', '我是問一籤', assertPureZhHant],
      ['@問一籤', 'zh-Hans', '我是问一签', assertPureZhHans],
    ] as const) {
      const ev = makeInboundEvent({
        roomId: groupCtx.roomId,
        chatType: 'group',
        text: mentionText,
        mentions: [FORTUNE_STICK_DEFAULT_MATRIX_ID],
      });
      const dec = await routeEvent(ev, { ...groupCtx, userLanguageHint: langHint }, FORTUNE_STICK_AGENT_SPEC);
      expect(dec.shouldReply, `${mentionText} (${langHint})`).toBe(true);
      expect(dec.reason, `${mentionText} (${langHint})`).toBe('explicit_mention');

      const reply = await fortuneFastRespond(baseEnv, ev, dec, emptyMem);
      expect(reply).not.toBeNull();
      expect(reply).not.toBe('[NO_REPLY]');
      expect(reply).toContain(expectedSub);
      expect(reply).not.toMatch(dashPattern);
      checkFn(reply!);
    }

    // Also verify end-to-end inside NarraRoomCoordinator DO (0 A2A calls)
    let nowMs = 1_760_700_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    const posted: string[] = [];
    let a2aCalled = 0;

    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
          if (url.endsWith('/api/agent-runtime/chat/send')) {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text: string };
            posted.push(body.text);
            return Response.json({ status: 'ok', data: { event_id: `$sent_bare_${posted.length}` } });
          }
          if (url === 'https://a2a.stick.test/rpc') {
            a2aCalled++;
            return new Response('{}', { status: 500 });
          }
          return new Response('not found', { status: 404 });
        }),
      );

      const gwEnv = {
        ...baseEnv,
        NARRA_GATEWAY_ENABLED: 'on',
        NARRA_SYNC: 'off',
        NARRA_AGENT_TOKEN: 'narra_stick_bare_tok',
        MANYFOLD_A2A_URL: 'https://a2a.stick.test/rpc',
        MANYFOLD_A2A_TOKEN: 'a2a_stick_bare_tok',
      } as Env;

      const roomDo = new NarraRoomCoordinator(makeFakeDOState(), gwEnv);
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId: '!grp_stick_bare_do:matrix.netmind.chat',
            chatType: 'group',
            members: groupCtx.members,
            events: [
              {
                event_id: '$bare_mention_1',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: {
                  msgtype: 'm.text',
                  body: '@AI Fortune Stick',
                  'm.mentions': { user_ids: [FORTUNE_STICK_DEFAULT_MATRIX_ID] },
                },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();

      expect(a2aCalled).toBe(0);
      expect(posted).toHaveLength(1);
      expect(posted[0]).toContain('AI Fortune Stick');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('handles 1v1 DM natural draw phrases, expanded stick lookups, gratitude, and capability intros locally while keeping unmentioned group active_session silent', async () => {
    const dashPattern = /[\u2010-\u2015\u2212]|[ \t]+-+[ \t]+|--/;
    const emptyMem = { userMemories: [], roomMemories: [], promptSafeLines: [] };
    const dmCtx = (roomId: string): RoomContext => ({
      roomId,
      chatType: 'dm',
      members: [],
      recentHistory: [],
    });

    // 1. DM natural draw phrases draw a stick locally (NOT null)
    for (const [text, expectedLang, expectedRegex, checkFn] of [
      ['最近工作在考慮要不要換專案，幫我求一支籤', 'zh-Hant', /^第 \d+ 籤/, assertPureZhHant],
      ['求支籤', 'zh-Hant', /^第 \d+ 籤/, assertPureZhHant],
      ['搖一支籤', 'zh-Hant', /^第 \d+ 籤/, assertPureZhHant],
      ['求個籤', 'zh-Hant', /^第 \d+ 籤/, assertPureZhHant],
      ['最近工作在考虑要不要换项目，帮我求一支签', 'zh-Hans', /^第 \d+ 签/, assertPureZhHans],
      ['draw a stick', 'en', /^Stick \d+ of \d+/, (s: string) => expect(s).not.toMatch(/[\u4e00-\u9fff]/)],
    ] as const) {
      const ev = makeInboundEvent({ chatType: 'dm', roomId: '!dm_stick_draw:matrix.netmind.chat', text });
      const dec = await routeEvent(ev, dmCtx(ev.roomId), FORTUNE_STICK_AGENT_SPEC);
      expect(dec.shouldReply, text).toBe(true);
      expect(dec.reason, text).toBe('dm');
      expect(dec.detectedLang, text).toBe(expectedLang);

      const reply = await fortuneFastRespond(baseEnv, ev, dec, emptyMem);
      expect(reply, text).not.toBeNull();
      expect(reply, text).toMatch(expectedRegex);
      expect(reply, text).not.toMatch(dashPattern);
      checkFn(reply!);
    }

    // 2. Expanded STICK_LOOKUP_RE phrases return Stick #8 locally (NOT null)
    for (const [text, expectedLang, expectedHeader, checkFn] of [
      ['看一下第8籤', 'zh-Hant', '第 8 籤', assertPureZhHant],
      ['幫我看一下第8籤', 'zh-Hant', '第 8 籤', assertPureZhHant],
      ['查一下第8籤', 'zh-Hant', '第 8 籤', assertPureZhHant],
      ['查看第8籤', 'zh-Hant', '第 8 籤', assertPureZhHant],
      ['看一下第8签', 'zh-Hans', '第 8 签', assertPureZhHans],
      ['show me stick 8', 'en', 'Stick 8 of 36', (s: string) => expect(s).not.toMatch(/[\u4e00-\u9fff]/)],
    ] as const) {
      const ev = makeInboundEvent({ chatType: 'dm', roomId: '!dm_stick_lookup:matrix.netmind.chat', text });
      const dec = await routeEvent(ev, dmCtx(ev.roomId), FORTUNE_STICK_AGENT_SPEC);
      expect(dec.shouldReply, text).toBe(true);
      expect(dec.detectedLang, text).toBe(expectedLang);

      const reply = await fortuneFastRespond(baseEnv, ev, dec, emptyMem);
      expect(reply, text).not.toBeNull();
      expect(reply, text).toContain(expectedHeader);
      expect(reply, text).not.toMatch(dashPattern);
      checkFn(reply!);
    }

    // 3. DM gratitude returns warm localized reply locally
    for (const [text, expectedLang, expectedSub, checkFn] of [
      ['謝謝你', 'zh-Hant', '不客氣 🎋', assertPureZhHant],
      ['謝謝', 'zh-Hant', '不客氣 🎋', assertPureZhHant],
      ['谢谢你', 'zh-Hans', '不客气 🎋', assertPureZhHans],
      ['that was helpful, thanks', 'en', "You're very welcome 🎋", (s: string) => expect(s).not.toMatch(/[\u4e00-\u9fff]/)],
    ] as const) {
      const ev = makeInboundEvent({ chatType: 'dm', roomId: '!dm_stick_thanks:matrix.netmind.chat', text });
      const dec = await routeEvent(ev, dmCtx(ev.roomId), FORTUNE_STICK_AGENT_SPEC);
      expect(dec.shouldReply, text).toBe(true);
      expect(dec.detectedLang, text).toBe(expectedLang);

      const reply = await fortuneFastRespond(baseEnv, ev, dec, emptyMem);
      expect(reply, text).not.toBeNull();
      expect(reply, text).toContain(expectedSub);
      expect(reply, text).not.toMatch(dashPattern);
      checkFn(reply!);
    }

    // Gratitude combined with draw request or ending in a question MUST NOT return thanks
    const thanksPlusDrawEv = makeInboundEvent({
      chatType: 'dm',
      roomId: '!dm_stick_thanks_draw:matrix.netmind.chat',
      text: '謝謝，幫我求一支籤',
    });
    const thanksPlusDrawDec = await routeEvent(thanksPlusDrawEv, dmCtx(thanksPlusDrawEv.roomId), FORTUNE_STICK_AGENT_SPEC);
    const thanksPlusDrawReply = await fortuneFastRespond(baseEnv, thanksPlusDrawEv, thanksPlusDrawDec, emptyMem);
    expect(thanksPlusDrawReply).toMatch(/^第 \d+ 籤/);
    expect(thanksPlusDrawReply).not.toContain('不客氣');

    const thanksPlusQuestionEv = makeInboundEvent({
      chatType: 'dm',
      roomId: '!dm_stick_thanks_q:matrix.netmind.chat',
      text: 'Thanks! What does this stick mean for my career?',
    });
    const thanksPlusQuestionDec = await routeEvent(
      thanksPlusQuestionEv,
      dmCtx(thanksPlusQuestionEv.roomId),
      FORTUNE_STICK_AGENT_SPEC,
    );
    const thanksPlusQuestionReply = await fortuneFastRespond(
      baseEnv,
      thanksPlusQuestionEv,
      thanksPlusQuestionDec,
      emptyMem,
    );
    expect(thanksPlusQuestionReply).toBeNull();

    // 4. DM capability questions return intro locally
    for (const [text, expectedLang, expectedSub, checkFn] of [
      ['你能幫我做什麼？', 'zh-Hant', '我是問一籤', assertPureZhHant],
      ['你能帮我做什么？', 'zh-Hans', '我是问一签', assertPureZhHans],
      ['what can you do?', 'en', 'Hi! I am AI Fortune Stick', (s: string) => expect(s).not.toMatch(/[\u4e00-\u9fff]/)],
    ] as const) {
      const ev = makeInboundEvent({ chatType: 'dm', roomId: '!dm_stick_cap:matrix.netmind.chat', text });
      const dec = await routeEvent(ev, dmCtx(ev.roomId), FORTUNE_STICK_AGENT_SPEC);
      expect(dec.shouldReply, text).toBe(true);
      expect(dec.detectedLang, text).toBe(expectedLang);

      const reply = await fortuneFastRespond(baseEnv, ev, dec, emptyMem);
      expect(reply, text).not.toBeNull();
      expect(reply, text).toContain(expectedSub);
      expect(reply, text).not.toMatch(dashPattern);
      checkFn(reply!);
    }

    const skippedStick = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ chatType: 'group', text: '抽籤先不用，我想換個角度，幫我抽一張塔羅看看換工作的方向。' }),
      {
        shouldReply: true,
        tier: 0,
        reason: 'active_session',
        confidence: 0.9,
        detectedLang: 'zh-Hant',
        shouldQuote: false,
      },
      emptyMem,
    );
    expect(skippedStick).toBe('[NO_REPLY]');

    expect(await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ chatType: 'group', text: '剛才那支籤先放著，換塔羅看同一場面試，抽一張就好。' }),
      { shouldReply: true, tier: 0, reason: 'active_session', confidence: 0.9, detectedLang: 'zh-Hant', shouldQuote: false },
      emptyMem,
    )).toBe('[NO_REPLY]');

    // 5. Unmentioned group active_session "謝謝" STILL returns '[NO_REPLY]'
    const unmentionedGroupThanks = await fortuneFastRespond(
      baseEnv,
      makeInboundEvent({ chatType: 'group', text: '謝謝' }),
      {
        shouldReply: true,
        tier: 0,
        reason: 'active_session',
        confidence: 0.9,
        detectedLang: 'zh-Hant',
        shouldQuote: false,
      },
      emptyMem,
    );
    expect(unmentionedGroupThanks).toBe('[NO_REPLY]');
  });
});

describe('Phase 1-4 UX & A2A context pre-fetch (thinkingMessage, enableA2AFailureReply, buildExtraEnvelopeFields)', () => {
  const dashPattern = /[\u2010-\u2015\u2212]|[ \t]+-+[ \t]+|--/;
  const emptyMem = { userMemories: [], roomMemories: [], promptSafeLines: [] };
  const makeDecision = (detectedLang: 'zh-Hant' | 'zh-Hans' | 'en' = 'zh-Hant') => ({
    shouldReply: true,
    tier: 0 as const,
    reason: 'explicit_mention',
    confidence: 1,
    detectedLang,
    shouldQuote: false,
  });

  it('wires enableA2AFailureReply, thinkingMessage, and buildExtraEnvelopeFields in narraGatewayConfig', () => {
    expect(narraGatewayConfig.enableA2AFailureReply).toBe(true);
    expect(typeof narraGatewayConfig.thinkingMessage).toBe('function');
    expect(typeof narraGatewayConfig.buildExtraEnvelopeFields).toBe('function');

    const ev = makeInboundEvent({ text: '這支籤的工作面怎麼解？' });
    const hantMsg = narraGatewayConfig.thinkingMessage!('zh-Hant', ev, makeDecision('zh-Hant'));
    const hansMsg = narraGatewayConfig.thinkingMessage!('zh-Hans', ev, makeDecision('zh-Hans'));
    const enMsg = narraGatewayConfig.thinkingMessage!('en', ev, makeDecision('en'));

    expect(hantMsg).toBe('🎋 正在結合你的籤詩與處境解讀中，稍等一下…');
    expect(hansMsg).toBe('🎋 正在结合你的签诗与处境解读中，稍等一下…');
    expect(enMsg).toBe('🎋 Reflecting on your fortune stick and question, one moment…');
    expect(fortuneThinkingMessage('zh-Hant')).toBe(hantMsg);
    expect(fortuneThinkingMessage('zh-Hans')).toBe(hansMsg);
    expect(fortuneThinkingMessage('en')).toBe(enMsg);
    assertPureZhHant(hantMsg);
    assertPureZhHans(hansMsg);
    expect(enMsg).not.toMatch(/[\u4e00-\u9fff]/);
    for (const msg of [hantMsg, hansMsg, enMsg]) {
      expect(msg).not.toMatch(dashPattern);
    }
  });

  it('extracts stick number from replyToTarget or recentHistory, looks up stickByNo, and formats <= 1000 chars in pure zh-Hant/zh-Hans/en', async () => {
    const evHant = makeInboundEvent({ text: '這支籤對我換工作代表什麼？' });
    const evHans = makeInboundEvent({ text: '这支签对我换工作代表什么？' });
    const evEn = makeInboundEvent({ text: 'What does this stick mean for my career?' });

    // 1. Prefers self replyToTarget over recentHistory (zh-Hant: 第 8 籤)
    const fromReply = await buildFortuneExtraEnvelopeFields(
      baseEnv,
      evHant,
      makeDecision('zh-Hant'),
      emptyMem,
      {
        roomId: evHant.roomId,
        chatType: 'group',
        members: [],
        replyToTarget: {
          eventId: '$reply_s8',
          senderId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
          isSelf: true,
          isAgent: true,
          text: '第 8 籤 · 上籤 · 玉在石中',
        },
        recentHistory: [
          {
            eventId: '$h_s1',
            senderId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
            isSelf: true,
            isAgent: true,
            text: '第 1 籤 · 上上籤 · 雲開月明',
            timestampMs: 1_000,
          },
        ],
      },
    );
    expect(fromReply).not.toBeNull();
    expect(fromReply!.last_drawn_fortune_stick).toContain('第 8 籤');
    expect(fromReply!.last_drawn_fortune_stick).toContain('玉在石中');
    expect(fromReply!.last_drawn_fortune_stick).toContain('頑石未剖誰人識');
    expect(fromReply!.last_drawn_fortune_stick.length).toBeLessThanOrEqual(1000);
    expect(fromReply!.last_drawn_fortune_stick).not.toMatch(dashPattern);
    assertPureZhHant(fromReply!.last_drawn_fortune_stick);

    // 2. Falls back to latest self turn in recentHistory (zh-Hans: 第 1 签) and ignores human messages
    const fromHistoryHans = await buildFortuneExtraEnvelopeFields(
      baseEnv,
      evHans,
      makeDecision('zh-Hans'),
      emptyMem,
      {
        roomId: evHans.roomId,
        chatType: 'group',
        members: [],
        replyToTarget: {
          eventId: '$human_msg',
          senderId: '@alice:matrix.netmind.chat',
          isSelf: false,
          isAgent: false,
          text: '我上次抽到第 8 签',
        },
        recentHistory: [
          {
            eventId: '$h1',
            senderId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
            isSelf: true,
            isAgent: true,
            text: '第 3 签 · 中签',
            timestampMs: 1_000,
          },
          {
            eventId: '$h2',
            senderId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
            isAgent: true,
            text: '第 1 签 · 上上签 · 云开月明',
            timestampMs: 2_000,
          },
          {
            eventId: '$h3',
            senderId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
            isSelf: true,
            isAgent: true,
            text: '心里有想问的事随时告诉我。',
            timestampMs: 3_000,
          },
        ],
      },
    );
    expect(fromHistoryHans).not.toBeNull();
    expect(fromHistoryHans!.last_drawn_fortune_stick).toContain('第 1 签');
    expect(fromHistoryHans!.last_drawn_fortune_stick).toContain('云开月明');
    expect(fromHistoryHans!.last_drawn_fortune_stick).toContain('久阴忽散一天青');
    expect(fromHistoryHans!.last_drawn_fortune_stick.length).toBeLessThanOrEqual(1000);
    expect(fromHistoryHans!.last_drawn_fortune_stick).not.toMatch(dashPattern);
    assertPureZhHans(fromHistoryHans!.last_drawn_fortune_stick);

    // 3. Matches English "Stick N of 36" format and formats full English stick context
    const fromEn = await buildFortuneExtraEnvelopeFields(
      baseEnv,
      evEn,
      makeDecision('en'),
      emptyMem,
      {
        roomId: evEn.roomId,
        chatType: 'dm',
        members: [],
        recentHistory: [
          {
            eventId: '$en1',
            senderId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
            isSelf: true,
            isAgent: true,
            text: 'Stick 1 of 36 · GREAT FORTUNE · The Clouds Part',
            timestampMs: 1_000,
          },
        ],
      },
    );
    expect(fromEn).not.toBeNull();
    expect(fromEn!.last_drawn_fortune_stick).toContain('Stick 1 of 36');
    expect(fromEn!.last_drawn_fortune_stick).toContain('GREAT FORTUNE');
    expect(fromEn!.last_drawn_fortune_stick).toContain('The Clouds Part');
    expect(fromEn!.last_drawn_fortune_stick).toContain('After long grey days the whole sky clears');
    expect(fromEn!.last_drawn_fortune_stick).not.toMatch(/[\u4e00-\u9fff]/);
    expect(fromEn!.last_drawn_fortune_stick).not.toMatch(dashPattern);
    expect(fromEn!.last_drawn_fortune_stick.length).toBeLessThanOrEqual(1000);

    // 4. Exhaustively validates all 36 sticks stay <= 1000 chars and pure script
    for (const stick of STICKS) {
      for (const [lang, ev, checkFn] of [
        ['zh-Hant', evHant, assertPureZhHant],
        ['zh-Hans', evHans, assertPureZhHans],
        ['en', evEn, (s: string) => expect(s).not.toMatch(/[\u4e00-\u9fff]/)],
      ] as const) {
        const res = await buildFortuneExtraEnvelopeFields(baseEnv, ev, makeDecision(lang), emptyMem, {
          roomId: ev.roomId,
          chatType: 'dm',
          members: [],
          recentHistory: [
            {
              eventId: `$s_${stick.no}`,
              senderId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
              isSelf: true,
              isAgent: true,
              text: `第 ${stick.no} 籤`,
              timestampMs: 1_000,
            },
          ],
        });
        expect(res).not.toBeNull();
        expect(res!.last_drawn_fortune_stick.length).toBeLessThanOrEqual(1000);
        expect(res!.last_drawn_fortune_stick).not.toMatch(dashPattern);
        checkFn(res!.last_drawn_fortune_stick);
      }
    }

    // 5. Returns null when no valid stick number is present in self turns (or out of range)
    const none = await buildFortuneExtraEnvelopeFields(
      baseEnv,
      evHant,
      makeDecision('zh-Hant'),
      emptyMem,
      {
        roomId: evHant.roomId,
        chatType: 'group',
        members: [],
        recentHistory: [
          {
            eventId: '$u1',
            senderId: '@alice:matrix.netmind.chat',
            isSelf: false,
            isAgent: false,
            text: '第 8 籤是什麼？',
            timestampMs: 1_000,
          },
          {
            eventId: '$s_bad',
            senderId: FORTUNE_STICK_DEFAULT_MATRIX_ID,
            isSelf: true,
            isAgent: true,
            text: '第 99 籤不存在',
            timestampMs: 2_000,
          },
        ],
      },
    );
    expect(none).toBeNull();
  });

  it('injects last_drawn_fortune_stick into the A2A envelope on follow-up inside NarraRoomCoordinator DO', async () => {
    let nowMs = 1_760_800_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    const posted: string[] = [];
    const a2aEnvelopes: string[] = [];

    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
          if (url.endsWith('/api/agent-runtime/chat/send')) {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text: string };
            posted.push(body.text);
            return Response.json({ status: 'ok', data: { event_id: `$stick_ctx_${posted.length}` } });
          }
          if (url === 'https://a2a.stick.test/rpc') {
            const rpc = JSON.parse(String(init?.body ?? '{}')) as {
              params?: { message?: { parts?: Array<{ text?: string }> } };
            };
            const text = rpc.params?.message?.parts?.map((p) => p.text ?? '').join('\n') ?? '';
            a2aEnvelopes.push(text);
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                result: {
                  kind: 'message',
                  role: 'agent',
                  parts: [{ kind: 'text', text: '結合剛剛這支籤，先穩住當下節奏再決定。' }],
                },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response('not found', { status: 404 });
        }),
      );

      const gwEnv = {
        ...baseEnv,
        NARRA_GATEWAY_ENABLED: 'on',
        NARRA_SYNC: 'off',
        NARRA_AGENT_TOKEN: 'narra_stick_ctx_tok',
        MANYFOLD_A2A_URL: 'https://a2a.stick.test/rpc',
        MANYFOLD_A2A_TOKEN: 'a2a_stick_ctx_tok',
      } as Env;

      const roomDo = new NarraRoomCoordinator(makeFakeDOState(), gwEnv);
      const roomId = '!dm_stick_ctx:matrix.netmind.chat';

      // Step 1: Local stick lookup (#8) so we know the exact stick
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            chatType: 'dm',
            events: [
              {
                event_id: '$lookup_8',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: { msgtype: 'm.text', body: '幫我看第8籤' },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();
      expect(posted).toHaveLength(1);
      expect(posted[0]).toContain('第 8 籤');
      expect(a2aEnvelopes).toHaveLength(0);

      // Step 2: Follow-up without repeating stick number -> A2A receives full Stick 8 context
      nowMs += 15_000;
      vi.setSystemTime(nowMs);
      await roomDo.fetch(
        new Request('https://narra-room/events', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            chatType: 'dm',
            events: [
              {
                event_id: '$followup_stick',
                sender: '@alice:matrix.netmind.chat',
                type: 'm.room.message',
                origin_server_ts: nowMs,
                content: { msgtype: 'm.text', body: '這支籤對我換工作代表什麼？' },
              },
            ],
          }),
        }),
      );
      vi.setSystemTime(nowMs + 2_000);
      await roomDo.alarm();

      expect(a2aEnvelopes).toHaveLength(1);
      expect(a2aEnvelopes[0]).toContain('last_drawn_fortune_stick:');
      expect(a2aEnvelopes[0]).toContain('第 8 籤');
      expect(a2aEnvelopes[0]).toContain('玉在石中');
      expect(posted).toHaveLength(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

it('speaks only on its own topic in mixed group chatter', async () => {
  const cases = [
    '晚上能吃啥',
    '我先去開個會',
    '今晚倫敦有什麼市集',
    '今天 AI 圈有啥新消息',
    '能抽張塔羅看看工作嗎',
    '幫我求一支籤',
    '有英國簽證資料可以查嗎',
    '晚餐 £80 我付的，四個人怎麼分',
    'Boots 有折扣碼嗎',
    '昨天吃火鍋超爽',
  ];
  const nowMs = Date.now();
  const replies: string[] = [];
  for (const text of cases) {
    const event = makeInboundEvent({ text, timestampMs: nowMs, chatType: 'group', mentions: [] });
    const context = { roomId: event.roomId, chatType: 'group' as const, members: [], recentHistory: [] };
    if ((await routeEvent(event, context, FORTUNE_STICK_AGENT_SPEC, { nowMs })).shouldReply) replies.push(text);
  }
  expect(replies).toEqual(["幫我求一支籤"]);

  const text = '幫我求一支籤';
  const directedEvent = makeInboundEvent({ text: `@Ken ${text}`, timestampMs: nowMs, chatType: 'group', mentions: ['@ken:example.com'] });
  const directedContext = { roomId: directedEvent.roomId, chatType: 'group' as const, members: [], recentHistory: [] };
  expect((await routeEvent(directedEvent, directedContext, FORTUNE_STICK_AGENT_SPEC, { nowMs })).shouldReply).toBe(false);
});


it('routes stick requests even when the user declines Tarot in the same message', async () => {
  const nowMs = Date.now();
  for (const text of [
    '最近一直在想換工作。先不用塔羅，幫我抽一支籤看看方向就好。',
    '這次先不看塔羅了，想請你抽一支籤，當作思考換工作的提示。',
  ]) {
    const event = makeInboundEvent({ text, timestampMs: nowMs, chatType: 'group', mentions: [] });
    const context = { roomId: event.roomId, chatType: 'group' as const, members: [], recentHistory: [] };
    expect((await routeEvent(event, context, FORTUNE_STICK_AGENT_SPEC, { nowMs })).shouldReply).toBe(true);
  }
});
