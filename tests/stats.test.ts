import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { isSettingsApiPath } from '../src/worker/auth';
import { readStats } from '../src/worker/stats';
import { taipeiDay } from '../src/worker/tarot-bridge';
import { parseSharedStick, sharedStickQuery } from '../src/shared/share-link';
import {
  EXTREME_STICK_NOS,
  fallbackReason,
  isExtreme,
  promisesTarotReward,
  replyBucket,
  visitSourceFrom,
  waitBucket,
} from '../src/shared/stats';
import { STICKS } from '../src/shared/sticks';
import { PAPER } from '../src/shared/paper';
import type { Env } from '../src/worker/types';
import { createD1, type FakeD1 } from './support/d1';

const ORIGIN = 'https://stick.test';
const PASSWORD = 'let-me-see-the-numbers';

let d1: FakeD1;
let env: Env;

beforeAll(async () => {
  d1 = createD1();
  env = {
    DB: d1.db,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    ENVIRONMENT: 'test',
    ADMIN_PASSWORD: PASSWORD,
  } as Env;
  await call('/api/health');
});

afterAll(() => d1.close());

async function call(path: string, options: { body?: unknown; admin?: boolean } = {}) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.admin) headers['x-admin-password'] = PASSWORD;
  const response = await app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    env,
    { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext,
  );
  return { status: response.status, json: async <T>() => (await response.json()) as T };
}

const today = () => taipeiDay(Date.now());
const count = (metric: string): number =>
  Number(d1.query('SELECT count FROM daily_stats WHERE day = ? AND metric = ?', today(), metric)[0]?.count ?? 0);

describe('where a visit came from', () => {
  it('tells a QR scan, a text link and an older share apart', () => {
    expect(visitSourceFrom(sharedStickQuery(12, 'zh', 'qr'))).toBe('share-qr');
    expect(visitSourceFrom(sharedStickQuery(12, 'zh', 'link'))).toBe('share-link');
    expect(visitSourceFrom(sharedStickQuery(12, 'zh'))).toBe('share-unknown');
  });

  it("names Tarot's own links by where they sit", () => {
    expect(visitSourceFrom('?utm_source=tarot&utm_medium=referral&utm_content=outro')).toBe('tarot-outro');
    expect(visitSourceFrom('?utm_source=tarot&utm_content=locked')).toBe('tarot-locked');
    expect(visitSourceFrom('?utm_source=tarot')).toBe('tarot-other');
    expect(visitSourceFrom('?utm_source=tarot-share&utm_medium=share')).toBe('tarot-share');
  });

  it('counts every other visit as organic, by the kind of site that sent it', () => {
    const self = 'https://app.manyfold.ai';
    expect(visitSourceFrom('', '', self)).toBe('organic-direct');
    expect(visitSourceFrom('', 'https://www.google.com/', self)).toBe('organic-search');
    expect(visitSourceFrom('', 'https://www.bing.com/search?q=x', self)).toBe('organic-search');
    expect(visitSourceFrom('', 'https://l.instagram.com/', self)).toBe('organic-social');
    expect(visitSourceFrom('', 'https://www.threads.net/@someone', self)).toBe('organic-social');
    expect(visitSourceFrom('', 'https://t.co/abc', self)).toBe('organic-social');
    expect(visitSourceFrom('', 'https://someblog.example/post', self)).toBe('organic-other');
    // A reload, or a hop inside this same site, is still a direct visit.
    expect(visitSourceFrom('', 'https://app.manyfold.ai/fortune-stick/', self)).toBe('organic-direct');
    expect(visitSourceFrom('', 'not a url', self)).toBe('organic-direct');
  });

  it("keeps Tarot's visitors as Tarot even without its tags, and tagged links as campaigns", () => {
    const self = 'https://app.manyfold.ai';
    expect(visitSourceFrom('', 'https://app.manyfold.ai/tarot/', self)).toBe('tarot-other');
    expect(visitSourceFrom('', 'https://tarot.manyfold.ai/', self)).toBe('tarot-other');
    expect(visitSourceFrom('?utm_source=newsletter', '', self)).toBe('campaign');
    expect(visitSourceFrom('?utm_source=facebook_ads', 'https://www.facebook.com/', self)).toBe('campaign');
  });

  it("treats Tarot's own links as promising a Tarot reading, and nothing else", () => {
    expect(promisesTarotReward('tarot-outro')).toBe(true);
    expect(promisesTarotReward('tarot-locked')).toBe(true);
    expect(promisesTarotReward('tarot-other')).toBe(true);
    // Tarot's share page makes no promise.
    expect(promisesTarotReward('tarot-share')).toBe(false);
    expect(promisesTarotReward('organic-direct')).toBe(false);
    expect(promisesTarotReward('share-qr')).toBe(false);
    expect(promisesTarotReward('campaign')).toBe(false);
  });

  it('still reads the same stick off a link that carries via', () => {
    expect(parseSharedStick(sharedStickQuery(12, 'zh', 'qr'))?.stick.no).toBe(12);
  });
});

describe('counting', () => {
  it('counts a visit or a share the page reports', async () => {
    const before = count('visit:share-qr');
    expect((await call('/api/stats/visit:share-qr', { body: {} })).status).toBe(200);
    expect((await call('/api/stats/share:sent', { body: {} })).status).toBe(200);
    expect(count('visit:share-qr')).toBe(before + 1);
    expect(count('share:sent')).toBeGreaterThan(0);
  });

  it('counts a visit as new or returning when the page says which', async () => {
    const fresh = count('visitor:new');
    const back = count('visitor:returning');
    await call('/api/stats/visit:organic-direct', { body: { returning: false } });
    await call('/api/stats/visit:organic-search', { body: { returning: true } });
    await call('/api/stats/visit:organic-social', { body: { returning: 'maybe' } });
    expect(count('visitor:new')).toBe(fresh + 1);
    expect(count('visitor:returning')).toBe(back + 1);
    expect(count('visit:organic-social')).toBeGreaterThan(0);
  });

  it('refuses a metric it does not know, and ones only the server may count', async () => {
    for (const metric of ['visit:anything', 'hello', 'draw:share-qr', 'tarot:opened', 'visitor:new']) {
      expect((await call(`/api/stats/${metric}`, { body: {} })).status).toBe(400);
    }
    expect(d1.query("SELECT COUNT(*) AS n FROM daily_stats WHERE metric = 'hello'")).toEqual([{ n: 0 }]);
  });

  it('credits a draw to the source the visit came from', async () => {
    const before = count('draw:tarot-outro');
    const drawn = await call('/api/readings', { body: { question: 'Should I take the new job offer?', via: 'tarot-outro' } });
    expect(drawn.status).toBe(201);
    expect(count('draw:tarot-outro')).toBe(before + 1);
  });

  it('ignores a draw source it does not know', async () => {
    const drawn = await call('/api/readings', { body: { question: 'Should I move to a new city?', via: 'made-up' } });
    expect(drawn.status).toBe(201);
    expect(d1.query("SELECT COUNT(*) AS n FROM daily_stats WHERE metric LIKE '%made-up%'")).toEqual([{ n: 0 }]);
  });
});

describe('reading the numbers', () => {
  it('is for the admin only', async () => {
    expect(isSettingsApiPath('/api/stats')).toBe(true);
    expect(isSettingsApiPath('/api/stats/visit:share-qr')).toBe(false);
    expect((await call('/api/stats')).status).toBe(401);
    expect((await call('/api/stats', { admin: true })).status).toBe(200);
  });

  it("gives each day's counts, draws from the readings themselves, newest first", async () => {
    const { days } = await (await call('/api/stats?days=3', { admin: true })).json<{
      days: Array<{ day: string; draws: number; claims: number; counts: Record<string, number> }>;
    }>();
    expect(days.map((d) => d.day)).toEqual([
      today(),
      taipeiDay(Date.now() - 86_400_000),
      taipeiDay(Date.now() - 2 * 86_400_000),
    ]);
    expect(days[0]!.draws).toBeGreaterThanOrEqual(2);
    expect(days[0]!.counts['visit:share-qr']).toBeGreaterThanOrEqual(1);
    expect(days[1]!).toEqual({
      day: days[1]!.day,
      draws: 0,
      extremeDraws: 0,
      claims: 0,
      outcomes: { ai: 0, fallback: {}, stuck: 0 },
      counts: {},
    });
  });

  it('keeps the range sensible', async () => {
    expect((await readStats(env, 0)).length).toBe(1);
    expect((await readStats(env, 10_000)).length).toBe(90);
  });
});

describe('reading health', () => {
  it('sorts a stored error into why the reading fell back', () => {
    expect(fallbackReason('unparseable')).toBe('unparseable');
    expect(fallbackReason('unparseable: {"meaning": "half')).toBe('unparseable');
    expect(fallbackReason('no_interpreter')).toBe('no-interpreter');
    expect(fallbackReason('manyfold_unavailable')).toBe('manyfold');
    expect(fallbackReason('manyfold_rejected')).toBe('manyfold');
    expect(fallbackReason('Request timed out. The operation was aborted')).toBe('timeout');
    expect(fallbackReason('fortune-stick 没有返回任何内容。')).toBe('empty');
    expect(fallbackReason('fortune-stick 在 working 状态下结束，没有返回任何内容。')).toBe('empty');
    expect(fallbackReason('something else broke')).toBe('other');
    expect(fallbackReason(null)).toBe('other');
  });

  it('buckets how long the agent took and how long someone waited', () => {
    expect([9_999, 10_000, 19_999, 29_999, 59_999, 60_000].map(replyBucket)).toEqual([
      't10',
      't20',
      't20',
      't30',
      't60',
      't60plus',
    ]);
    expect([null, 0, 2_999, 3_000, 9_999, 29_999, 30_000].map(waitBucket)).toEqual([
      'ready',
      'lt3',
      'lt3',
      'lt10',
      'lt10',
      'lt30',
      '30plus',
    ]);
  });

  it('lets the page report what it saw and how long it waited, but never an interpretation', async () => {
    for (const metric of ['reading:shown-ai', 'reading:shown-fallback', 'reading:again-seen', 'reading:again-unseen', 'reading:ask-tag', 'reading:ask-typed', 'wait:ready', 'wait:30plus', 'wait:left']) {
      expect((await call(`/api/stats/${metric}`, { body: {} })).status).toBe(200);
      expect(count(metric)).toBeGreaterThan(0);
    }
    for (const metric of ['interpret:ok', 'interpret:retry', 'interpret:t10', 'reading:anything', 'wait:forever']) {
      expect((await call(`/api/stats/${metric}`, { body: {} })).status).toBe(400);
    }
  });

  it('counts each try at interpreting, and a second try on a failed stick as a retry', async () => {
    const drawn = await call('/api/readings', { body: { question: 'Will the garden grow this spring?' } });
    const { reading } = await drawn.json<{ reading: { id: string } }>();
    const fellBack = count('interpret:fallback-no-interpreter');
    const retries = count('interpret:retry');
    const replies = ['t10', 't20', 't30', 't60', 't60plus'].reduce((n, b) => n + count(`interpret:${b}`), 0);

    // No agent is connected here, so each try falls back without asking one.
    expect((await call(`/api/readings/${reading.id}/interpret`, { body: {} })).status).toBe(200);
    expect(count('interpret:fallback-no-interpreter')).toBe(fellBack + 1);
    expect(count('interpret:retry')).toBe(retries);

    await call(`/api/readings/${reading.id}/interpret`, { body: {} });
    expect(count('interpret:fallback-no-interpreter')).toBe(fellBack + 2);
    expect(count('interpret:retry')).toBe(retries + 1);
    // Nobody was asked, so there is no reply time to count.
    expect(['t10', 't20', 't30', 't60', 't60plus'].reduce((n, b) => n + count(`interpret:${b}`), 0)).toBe(replies);
  });

  it('reads back where each stick ended, and calls one stuck only once it has had time', async () => {
    // A day of its own, far from the rows the other tests wrote.
    const insert = (id: string, status: string, error: string | null, createdAt: string) =>
      d1.query(
        `INSERT INTO readings (id, question, stick_no, status, error, created_at, updated_at)
         VALUES (?, 'q', 1, ?, ?, ?, ?)`,
        id,
        status,
        error,
        createdAt,
        createdAt,
      );
    insert('h-ai-1', 'interpreted', null, '2030-01-01T02:00:00.000Z');
    insert('h-ai-2', 'interpreted', null, '2030-01-01T02:10:00.000Z');
    insert('h-bad', 'failed', 'unparseable: not json', '2030-01-01T02:20:00.000Z');
    insert('h-slow', 'failed', 'Request timed out.', '2030-01-01T02:30:00.000Z');
    insert('h-gone', 'drawn', null, '2030-01-01T02:40:00.000Z');
    insert('h-new', 'drawn', null, '2030-01-01T03:59:30.000Z');

    const [day] = await readStats(env, 1, Date.parse('2030-01-01T04:00:00.000Z'));
    expect(day!.day).toBe('2030-01-01');
    expect(day!.draws).toBe(6);
    // Every row above is stick 1, a 上上签.
    expect(day!.extremeDraws).toBe(6);
    expect(day!.outcomes).toEqual({ ai: 2, fallback: { unparseable: 1, timeout: 1 }, stuck: 1 });
  });
});

describe('the share experiment', () => {
  it('asks the top and bottom sticks to be shared, about a third of them', () => {
    expect(isExtreme('上上签')).toBe(true);
    expect(isExtreme('下签')).toBe(true);
    expect(isExtreme('上签')).toBe(false);
    expect(isExtreme('中签')).toBe(false);
    expect(EXTREME_STICK_NOS).toEqual(STICKS.filter((s) => isExtreme(s.level)).map((s) => s.no));
    expect(EXTREME_STICK_NOS.length).toBe(11);
  });

  it('lets the page report opening Share and sharing a top or bottom stick', async () => {
    for (const metric of ['share:opened', 'share:extreme-opened', 'share:extreme-done']) {
      expect((await call(`/api/stats/${metric}`, { body: {} })).status).toBe(200);
      expect(count(metric)).toBeGreaterThan(0);
    }
  });

  it("says what the sharer drew in every language, with no dashes and the Korean in Hangul", () => {
    const dash = /[\u2010-\u2015\u2212]|[A-Za-z]-[A-Za-z]|\s-\s/;
    for (const [language, paper] of Object.entries(PAPER)) {
      for (const level of ['上上签', '上签', '中签', '下签'] as const) {
        for (const line of [paper.challenge(level), paper.friendDrew(level)]) {
          expect(line, `${language} ${level}`).not.toMatch(dash);
          if (language === 'ko' || language === 'hi' || language === 'en') {
            expect(line, `${language} ${level}`).not.toMatch(/[\u4e00-\u9fff]/);
          }
        }
      }
    }
    expect(PAPER.en.challenge('上上签')).toBe('I drew a Great Fortune. What will you draw?');
    expect(PAPER.zh.friendDrew('下签')).toBe('朋友抽到下签，换你试试手气');
  });
});
