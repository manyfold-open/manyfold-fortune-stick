import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import {
  CLAIM_ID,
  DEFAULT_TAROT_URL,
  claimTarotBonus,
  earnsTarotBonus,
  findTarotClaim,
  tarotReturnUrl,
} from '../src/worker/tarot-bridge';
import { tarotHandoffUrl } from '../src/shared/tarot-handoff';
import type { Env } from '../src/worker/types';
import type { Reading } from '../src/shared/types';
import { createD1, type FakeD1 } from './support/d1';

let d1: FakeD1;
let env: Env;

beforeAll(async () => {
  d1 = createD1();
  env = {
    DB: d1.db,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    ENVIRONMENT: 'test',
  } as Env;
  // Any API request creates the schema.
  await app.fetch(new Request('https://stick.test/api/health'), env, {} as ExecutionContext);
});

afterAll(() => d1.close());

const reading = (id: string, createdAt: string): Reading => ({ id, createdAt }) as Reading;
// 2026-09-24 12:00 Taipei.
const NOON = Date.parse('2026-09-24T04:00:00Z');
const MORNING = '2026-09-24T01:00:00Z';

describe('the Tarot claim', () => {
  it('is a random code, never the reading id', async () => {
    const id = crypto.randomUUID();
    const code = await claimTarotBonus(env, reading(id, MORNING), NOON);
    expect(code).toMatch(CLAIM_ID);
    expect(code).not.toContain(id);
    expect(await findTarotClaim(env, code!)).toEqual({ day: '2026-09-24' });
  });

  it('gives one reading one code, however often it is asked for', async () => {
    const r = reading(crypto.randomUUID(), MORNING);
    const first = await claimTarotBonus(env, r, NOON);
    const again = await claimTarotBonus(env, r, NOON + 60_000);
    expect(again).toBe(first);
    expect(d1.query('SELECT COUNT(*) AS n FROM tarot_claims WHERE reading_id = ?', r.id)).toEqual([{ n: 1 }]);
  });

  it('a stick drawn at 23:59 and finished after midnight earns the new day', async () => {
    const r = reading(crypto.randomUUID(), '2026-09-24T15:59:00Z'); // 23:59 Taipei
    const before = await claimTarotBonus(env, r, Date.parse('2026-09-24T15:59:30Z'));
    const after = await claimTarotBonus(env, r, Date.parse('2026-09-24T16:05:00Z')); // 00:05
    expect(after).toBe(before);
    expect(await findTarotClaim(env, after!)).toEqual({ day: '2026-09-25' });
  });

  it('an old reading from history opens Tarot without a claim', async () => {
    const r = reading(crypto.randomUUID(), '2026-09-22T04:00:00Z');
    expect(earnsTarotBonus(r, NOON)).toBe(false);
    expect(await claimTarotBonus(env, r, NOON)).toBeNull();
  });

  it('knows nothing of a code it did not issue', async () => {
    expect(await findTarotClaim(env, 'A'.repeat(43))).toBeNull();
    expect(await findTarotClaim(env, 'not a code')).toBeNull();
  });
});

describe('what Tarot asks over its service binding', () => {
  const ask = (id: string) =>
    app.fetch(new Request(`https://stick.internal/api/tarot-claims/${id}`), env, {} as ExecutionContext);

  it('answers with the day a code is good for, and nothing else', async () => {
    const code = await claimTarotBonus(env, reading(crypto.randomUUID(), MORNING), NOON);
    const response = await ask(code!);
    expect(response.status).toBe(200);
    // The Tarot repo's tests stub exactly this shape; keep them in step.
    expect(await response.json()).toEqual({ claim: { day: '2026-09-24' } });
  });

  it('is a 404 for any code it did not issue', async () => {
    expect((await ask('A'.repeat(43))).status).toBe(404);
    expect((await ask('nope')).status).toBe(404);
  });
});

describe('where the Tarot link goes', () => {
  const configured = {
    TAROT_HANDOFF_URL: 'https://app.manyfold.ai/tarot/',
    TAROT_RETURN_URLS: 'https://tarot.manyfold.ai/, https://preview.example/',
  } as Env;

  it('goes back to a known Tarot host the visitor came from', () => {
    expect(tarotReturnUrl(configured, 'https://tarot.manyfold.ai/')).toBe('https://tarot.manyfold.ai/');
    expect(tarotReturnUrl(configured, 'https://preview.example/')).toBe('https://preview.example/');
  });

  it('never redirects anywhere else', () => {
    for (const requested of ['https://evil.example/', 'javascript:alert(1)', 42, null, undefined]) {
      expect(tarotReturnUrl(configured, requested)).toBe('https://app.manyfold.ai/tarot/');
    }
    expect(tarotReturnUrl({} as Env, 'https://tarot.manyfold.ai/')).toBe(DEFAULT_TAROT_URL);
  });

  it('carries attribution and language, the claim only in the fragment, never a question', () => {
    const url = new URL(tarotHandoffUrl('https://app.manyfold.ai/tarot/', 'zh', 'abc_def'));
    expect(url.pathname).toBe('/tarot/');
    expect(url.searchParams.get('utm_source')).toBe('fortune-stick');
    expect(url.search).not.toContain('abc_def');
    expect(new URLSearchParams(url.hash.slice(1)).get('bonus')).toBe('abc_def');
    expect(new URLSearchParams(url.hash.slice(1)).get('lang')).toBe('zh');
    const plain = new URL(tarotHandoffUrl('https://app.manyfold.ai/tarot/', 'en', null));
    expect(plain.hash).toBe('#lang=en');
  });
});
