import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { isSettingsApiPath } from '../src/worker/auth';
import { readStats } from '../src/worker/stats';
import { taipeiDay } from '../src/worker/tarot-bridge';
import { parseSharedStick, sharedStickQuery } from '../src/shared/share-link';
import { visitSourceFrom } from '../src/shared/stats';
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

  it('does not count a plain visit', () => {
    expect(visitSourceFrom('')).toBeNull();
    expect(visitSourceFrom('?utm_source=newsletter')).toBeNull();
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

  it('refuses a metric it does not know, and ones only the server may count', async () => {
    for (const metric of ['visit:anything', 'hello', 'draw:share-qr', 'tarot:opened']) {
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
    expect(days[1]!).toEqual({ day: days[1]!.day, draws: 0, claims: 0, counts: {} });
  });

  it('keeps the range sensible', async () => {
    expect((await readStats(env, 0)).length).toBe(1);
    expect((await readStats(env, 10_000)).length).toBe(90);
  });
});
