import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MemoryStore,
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
  fetchFortuneUpdates,
  formatLocalStickDraw,
  formatStickReply,
  fortuneFastRespond,
  getSolarTermForDate,
  kickFortuneNarraGateway,
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
      routes: Array<{ pattern: string }>;
      d1_databases: Array<{ binding: string; database_id: string }>;
      triggers: { crons: string[] };
      durable_objects: { bindings: Array<{ name: string; class_name: string }> };
      migrations: Array<{ tag: string; new_sqlite_classes: string[] }>;
      vars: Record<string, string>;
    };

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
});
