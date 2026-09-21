/**
 * Fetch wrapper for the app's own API.
 *
 * The admin password (when the deployment has one) lives in sessionStorage and is
 * attached to every request as x-admin-password. A 401 with admin_password_invalid
 * notifies the App so it can raise the password gate — components never handle
 * authentication themselves.
 */

import type { ApiErrorBody } from '../shared/types';
import type { Copy, Translate } from '../shared/i18n';
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

/**
 * 服务端回的 code → 这边的文案键。
 *
 * 错误算「机器说的话」，所以跟界面语言走，和屏上别的字一致 —— 服务端那些中文
 * message 只留作开发者可读的兜底。认不出来的 code 原样用服务端那句，
 * 这样新加一条路由的错误不会被悄悄吞掉。
 */
const ERROR_KEYS: Record<string, keyof Copy> = {
  question_required: 'errQuestionRequired',
  question_too_short: 'errQuestionTooShort',
  question_too_long: 'errQuestionTooLong',
  no_interpreter: 'errNoInterpreter',
  reading_not_found: 'errReadingNotFound',
  not_interpreted: 'errNotInterpreted',
  message_required: 'errMessageRequired',
  message_too_long: 'errMessageTooLong',
  manyfold_unavailable: 'errManyfoldUnavailable',
  manyfold_rejected: 'errManyfoldRejected',
  admin_password_invalid: 'errAdminPasswordInvalid',
  internal: 'errInternal',
};

/** 带进错误文案的数字，两种语言共用同一组占位符。 */
const ERROR_VARS = { min: QUESTION_MIN, max: QUESTION_MAX, followUpMax: FOLLOW_UP_MAX };

/** 把任何一个抛出来的东西变成一句给人看的话。 */
export function errorMessage(cause: unknown, t: Translate): string {
  if (cause instanceof ApiError) {
    const key = ERROR_KEYS[cause.code];
    if (key) return t(key, ERROR_VARS);
    return cause.message || t('errUnknown');
  }
  return cause instanceof Error ? cause.message : String(cause);
}

export const getStoredPassword = (): string => sessionStorage.getItem(PASSWORD_KEY) ?? '';
export const setStoredPassword = (value: string): void => {
  if (value) sessionStorage.setItem(PASSWORD_KEY, value);
  else sessionStorage.removeItem(PASSWORD_KEY);
};

let unauthorizedHandler: (() => void) | null = null;
/** App registers once; fired whenever any call bounces off the password gate. */
export const onUnauthorized = (handler: (() => void) | null): void => {
  unauthorizedHandler = handler;
};

export function authHeaders(): Record<string, string> {
  const password = getStoredPassword();
  return password ? { 'x-admin-password': password } : {};
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...authHeaders(),
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
