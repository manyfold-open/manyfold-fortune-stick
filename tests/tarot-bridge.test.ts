import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAROT_URL,
  earnsTarotBonus,
  signTarotBonus,
  tarotReturnUrl,
} from '../src/worker/tarot-bridge';
import { tarotHandoffUrl } from '../src/shared/tarot-handoff';
import type { Env } from '../src/worker/types';
import type { Reading } from '../src/shared/types';

const SECRET = 'bridge-contract-secret-0123456789abcdef';
const env = { TAROT_BRIDGE_SECRET: SECRET } as Env;
const READING_ID = '6f1c2b8e-3d4a-4e5f-9a0b-1c2d3e4f5a6b';
const reading = (createdAt: string): Reading => ({ id: READING_ID, createdAt }) as Reading;
const decode = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8')) as Record<string, unknown>;

// 2026-09-24 12:00 Taipei.
const NOON = Date.parse('2026-09-24T04:00:00Z');

/**
 * The same literal token is verified by the Tarot repo
 * (tests/tarot-bridge.test.ts). If this changes, change it there too — the two
 * Workers are only compatible while both tests pass on the same string.
 */
const CONTRACT_TOKEN =
  'eyJ2IjoxLCJpc3MiOiJmb3J0dW5lLXN0aWNrIiwiYXVkIjoidGFyb3QiLCJpZCI6InpZMFp1V1oyNVo4d1hkTk5vMjMzZzJvUnZCbXhyQU04VzFfM2VKTHQ2VGMiLCJkYXkiOiIyMDI2LTA5LTI0IiwiZXhwIjoxNzkwMjY1NjAwfQ.sD3YaTJncLffPl1rX-s3cymv5ynVwkm3Uhmk1BG7sc0';

describe('the Tarot claim', () => {
  it('matches the token the Tarot repo verifies', async () => {
    const token = await signTarotBonus(env, reading('2026-09-24T03:00:00Z'), NOON);
    expect(token).toBe(CONTRACT_TOKEN);
  });

  it('never carries the reading id, only a stable code derived from it', async () => {
    const a = await signTarotBonus(env, reading('2026-09-24T03:00:00Z'), NOON);
    const b = await signTarotBonus(env, reading('2026-09-24T03:00:00Z'), NOON + 60_000);
    expect(a).not.toContain(READING_ID);
    expect(Buffer.from(a!.split('.')[0]!, 'base64url').toString()).not.toContain(READING_ID);
    const claim = decode(a!);
    expect(claim).toMatchObject({ v: 1, iss: 'fortune-stick', aud: 'tarot', day: '2026-09-24' });
    expect(claim.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // One reading, one reward: the code does not change between clicks.
    expect(decode(b!).id).toBe(claim.id);
  });

  it('expires at the next Taipei midnight', async () => {
    const claim = decode((await signTarotBonus(env, reading('2026-09-24T03:00:00Z'), NOON))!);
    expect(claim.exp).toBe(Date.parse('2026-09-24T16:00:00Z') / 1000);
  });

  it('a stick drawn at 23:59 and finished after midnight earns the new day, not an expired claim', async () => {
    const drawn = '2026-09-24T15:59:00Z'; // 23:59 Taipei
    const after = Date.parse('2026-09-24T16:05:00Z'); // 00:05 Taipei, next day
    const claim = decode((await signTarotBonus(env, reading(drawn), after))!);
    expect(claim.day).toBe('2026-09-25');
    expect(claim.exp as number).toBeGreaterThan(after / 1000);
  });

  it('an old reading from history opens Tarot without a claim', async () => {
    expect(earnsTarotBonus(reading('2026-09-22T04:00:00Z'), NOON)).toBe(false);
    expect(await signTarotBonus(env, reading('2026-09-22T04:00:00Z'), NOON)).toBeNull();
  });

  it('refuses to sign without a real secret', async () => {
    await expect(
      signTarotBonus({ TAROT_BRIDGE_SECRET: 'short' } as Env, reading('2026-09-24T03:00:00Z'), NOON),
    ).rejects.toMatchObject({ status: 503, code: 'bridge_unavailable' });
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
    const url = new URL(tarotHandoffUrl('https://app.manyfold.ai/tarot/', 'zh', 'abc.def'));
    expect(url.pathname).toBe('/tarot/');
    expect(url.searchParams.get('utm_source')).toBe('fortune-stick');
    expect(url.search).not.toContain('abc.def');
    expect(new URLSearchParams(url.hash.slice(1)).get('bonus')).toBe('abc.def');
    expect(new URLSearchParams(url.hash.slice(1)).get('lang')).toBe('zh');
    const plain = new URL(tarotHandoffUrl('https://app.manyfold.ai/tarot/', 'en', null));
    expect(plain.hash).toBe('#lang=en');
  });
});
