/**
 * Signs a one-day claim for a completed Fortune Stick reading.
 *
 * The claim never carries the reading id itself: `GET /api/readings/:id` is
 * unauthenticated, so the id is a key to the question. The claim id is an HMAC
 * of the reading id instead — stable, so one reading still maps to one reward,
 * but useless for looking anything up.
 */

import type { Reading } from '../shared/types';
import { TAROT_URL } from '../shared/tarot-handoff';
import { HttpError, type Env } from './types';

const encoder = new TextEncoder();
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
/** A stick drawn just before Taipei midnight still earns today's reward if it is finished shortly after. */
export const LATE_DRAW_GRACE_MS = 60 * 60 * 1000;
export const DEFAULT_TAROT_URL = TAROT_URL;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const taipeiDay = (timestamp: number): string =>
  new Date(timestamp + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);

/** Midnight Taipei time at the end of `day`, in epoch seconds. */
const endOfTaipeiDay = (day: string): number =>
  Math.floor((Date.parse(`${day}T00:00:00.000Z`) + 16 * 60 * 60 * 1000) / 1000);

const bridgeSecret = (env: Env): string => {
  const secret = env.TAROT_BRIDGE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new HttpError(503, 'bridge_unavailable', 'The Tarot reward is not configured.');
  }
  return secret;
};

const hmac = async (secret: string, message: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
};

/**
 * Whether this reading still earns today's reward: drawn today (Taipei), or
 * drawn within the grace window before midnight. Older readings from history
 * can still open Tarot, just without a claim that would only be refused.
 */
export const earnsTarotBonus = (reading: Reading, nowMs: number = Date.now()): boolean => {
  const createdAt = Date.parse(reading.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  return taipeiDay(createdAt) === taipeiDay(nowMs) || nowMs - createdAt <= LATE_DRAW_GRACE_MS;
};

/** Returns null when the reading is too old to earn today's reward. */
export async function signTarotBonus(
  env: Env,
  reading: Reading,
  nowMs: number = Date.now(),
): Promise<string | null> {
  const secret = bridgeSecret(env);
  if (!earnsTarotBonus(reading, nowMs)) return null;

  const day = taipeiDay(nowMs);
  const claim = {
    v: 1,
    iss: 'fortune-stick',
    aud: 'tarot',
    id: toBase64Url(await hmac(secret, `tarot-claim-id:${reading.id}`)),
    day,
    exp: endOfTaipeiDay(day),
  } as const;
  const payload = toBase64Url(encoder.encode(JSON.stringify(claim)));
  return `${payload}.${toBase64Url(await hmac(secret, payload))}`;
}

/**
 * Where the Tarot link goes. A visitor who came from a Tarot deployment we
 * know (the legacy tarot.manyfold.ai host, say) goes back to that one, so their
 * session and unfinished reading are still there. Anything else — including a
 * URL someone typed into the query string — falls back to the default, so this
 * can never become an open redirect.
 */
export function tarotReturnUrl(env: Env, requested: unknown): string {
  const fallback = env.TAROT_HANDOFF_URL?.trim() || DEFAULT_TAROT_URL;
  if (typeof requested !== 'string') return fallback;
  const allowed = [fallback, ...(env.TAROT_RETURN_URLS ?? '').split(',')]
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(requested) ? requested : fallback;
}
