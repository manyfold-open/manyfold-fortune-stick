/** Signs a one-day claim for a completed Fortune Stick reading. */

import type { Reading } from '../shared/types';
import { HttpError, type Env } from './types';

const encoder = new TextEncoder();
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const taipeiDay = (timestamp: number): string =>
  new Date(timestamp + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);

/** The token expires at midnight Taipei time on the day the stick was drawn. */
const endOfTaipeiDay = (day: string): number =>
  Math.floor((Date.parse(`${day}T00:00:00.000Z`) + 16 * 60 * 60 * 1000) / 1000);

export async function signTarotBonus(env: Env, reading: Reading): Promise<string> {
  const secret = env.TAROT_BRIDGE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new HttpError(503, 'bridge_unavailable', 'The Tarot reward is not configured.');
  }

  const createdAt = Date.parse(reading.createdAt);
  if (!Number.isFinite(createdAt)) {
    throw new HttpError(500, 'reading_timestamp_invalid', 'This reading has no valid creation time.');
  }
  const day = taipeiDay(createdAt);
  const claim = {
    v: 1,
    iss: 'fortune-stick',
    aud: 'tarot',
    id: reading.id,
    day,
    exp: endOfTaipeiDay(day),
  } as const;
  const payload = toBase64Url(encoder.encode(JSON.stringify(claim)));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}
