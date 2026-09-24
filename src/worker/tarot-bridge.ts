/**
 * Tarot reward claims for completed Fortune Stick readings.
 *
 * A claim is a random code stored here. Tarot never has to trust the browser:
 * its Worker looks the code up in this Worker over a service binding
 * (`GET /api/tarot-claims/:id`) before it grants anything. There is no shared
 * secret to configure or leak, and the code says nothing about the reading —
 * `GET /api/readings/:id` is unauthenticated, so a reading id must never leave.
 */

import type { Reading } from '../shared/types';
import { TAROT_URL } from '../shared/tarot-handoff';
import { now } from './db';
import type { Env } from './types';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
/** A stick drawn just before Taipei midnight still earns today's reward if it is finished shortly after. */
export const LATE_DRAW_GRACE_MS = 60 * 60 * 1000;
export const DEFAULT_TAROT_URL = TAROT_URL;
/** 32 random bytes as base64url: 43 characters, far past guessable. */
export const CLAIM_ID = /^[A-Za-z0-9_-]{43}$/;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const taipeiDay = (timestamp: number): string =>
  new Date(timestamp + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);

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

/**
 * The claim code for this reading, good for today; null when the reading is too
 * old to earn today's reward. A reading keeps one code: asking again returns the
 * same one (re-dated to today inside the grace window), so it can only ever be
 * redeemed once on the Tarot side.
 */
export async function claimTarotBonus(
  env: Env,
  reading: Reading,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!earnsTarotBonus(reading, nowMs)) return null;
  const day = taipeiDay(nowMs);
  const id = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const row = await env.DB.prepare(
    `INSERT INTO tarot_claims (id, reading_id, day, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (reading_id) DO UPDATE SET day = excluded.day
     RETURNING id`,
  )
    .bind(id, reading.id, day, now())
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** What Tarot is told about a code: the day it is good for, or nothing at all. */
export async function findTarotClaim(env: Env, id: string): Promise<{ day: string } | null> {
  if (!CLAIM_ID.test(id)) return null;
  return env.DB.prepare('SELECT day FROM tarot_claims WHERE id = ?').bind(id).first<{ day: string }>();
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
