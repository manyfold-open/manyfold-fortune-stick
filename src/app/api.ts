/**
 * Fetch wrapper for the app's own API.
 *
 * The admin password (when the deployment has one) lives in sessionStorage and is
 * attached only to the bootstrap/settings requests that can use it. Public game
 * requests never need or receive it. A 401 with admin_password_invalid notifies
 * the App so it can raise the password gate — components never handle auth.
 */

import type { ApiErrorBody } from '../shared/types';
import type { Translate } from '../shared/i18n';
import { withoutDashes } from '../shared/text';
import { ERROR_KEYS, storedErrorText as storedText } from '../shared/error-copy';
import { browserStorage, safeGet, safeRemove, safeSet } from '../shared/safe-storage';
import { appUrl } from './base';
import { FOLLOW_UP_MAX, QUESTION_MAX, QUESTION_MIN } from './constants';

const PASSWORD_KEY = 'adminPassword';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** 带进错误文案的数字，两种语言共用同一组占位符。 */
const ERROR_VARS = { min: QUESTION_MIN, max: QUESTION_MAX, followUpMax: FOLLOW_UP_MAX };

/**
 * readings.error 里存下来的那一条 → 签纸上那一行字。
 * （码查表，agent 自己那句原样显示 —— 见 src/shared/error-copy.ts）
 */
export const storedErrorText = (error: string, t: Translate): string =>
  withoutDashes(storedText(error, t, ERROR_VARS));

/** 把任何一个抛出来的东西变成一句给人看的话。 */
export function errorMessage(cause: unknown, t: Translate): string {
  if (cause instanceof ApiError) {
    const key = ERROR_KEYS[cause.code];
    if (key) return withoutDashes(t(key, ERROR_VARS));
    return withoutDashes(cause.message || t('errUnknown'));
  }
  return withoutDashes(cause instanceof Error ? cause.message : String(cause));
}

export const getStoredPassword = (): string => safeGet(browserStorage('sessionStorage'), PASSWORD_KEY) ?? '';
export const setStoredPassword = (value: string): void => {
  const storage = browserStorage('sessionStorage');
  if (value) safeSet(storage, PASSWORD_KEY, value);
  else safeRemove(storage, PASSWORD_KEY);
};

let unauthorizedHandler: (() => void) | null = null;
/** App registers once; fired whenever any call bounces off the password gate. */
export const onUnauthorized = (handler: (() => void) | null): void => {
  unauthorizedHandler = handler;
};

const isAdminAwarePath = (path: string): boolean =>
  path === '/api/state' ||
  // The daily numbers on #settings (GET /api/stats?days=…), not the public
  // POST /api/stats/:metric the game reports to.
  path.split('?')[0] === '/api/stats' ||
  path === '/api/connect' ||
  path.startsWith('/api/connect/') ||
  path === '/api/agents' ||
  path.startsWith('/api/agents/');

export function authHeaders(path = ''): Record<string, string> {
  if (!isAdminAwarePath(path)) return {};
  const password = getStoredPassword();
  return password ? { 'x-admin-password': password } : {};
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(appUrl(path), {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...authHeaders(path),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* not JSON */
    }
    const code = body?.error?.code ?? 'request_failed';
    const message = body?.error?.message ?? `Request failed with HTTP ${response.status}.`;
    if (response.status === 401 && code === 'admin_password_invalid') unauthorizedHandler?.();
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export const TAROT_CLAIM_TIMEOUT_MS = 5000;

/**
 * Request a one-use Tarot claim for this completed reading; no question is sent.
 * `token` is null when the reading is too old to earn today's reward.
 */
export const createTarotClaim = (
  readingId: string,
  returnUrl: string | null,
): Promise<{ token: string | null; tarotUrl: string }> =>
  api(`/api/readings/${encodeURIComponent(readingId)}/tarot-claim`, {
    method: 'POST',
    body: JSON.stringify(returnUrl ? { returnUrl } : {}),
    // The reward must never hold the Tarot link hostage: past this, the
    // caller opens Tarot without it.
    signal: AbortSignal.timeout(TAROT_CLAIM_TIMEOUT_MS),
  });
