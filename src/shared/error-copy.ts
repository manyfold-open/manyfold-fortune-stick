/**
 * 错误的码 → 文案键，以及「存下来的那一条错误」怎么变成一句给人看的话。
 *
 * 两处都要用同一张表：一次请求失败时浏览器要说话（src/app/api.ts），签纸上那一行
 * 也要说话（readings.error）。表放 shared 是因为它认的是服务端的 code。
 *
 * 认不出来的那些不是码，是 agent 自己抛回来的句子（出 worker 前已经过 safeErrorText
 * 脱敏），比如 Cloudflare Tunnel 断了时平台回的 `API Error: 530 {...}`。那是写给排查的人
 * 看的，不是写给求签的人看的：原文留在 readings.error / agent_failures / Discord 里，
 * 离开 worker 的只有 `publicError` 给出的码，浏览器看到不认得的一律说同一句人话
 * （errManyfoldUnavailable）。
 */

import type { Copy, Translate } from './i18n';

export const ERROR_KEYS: Record<string, keyof Copy> = {
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
  agent_unavailable: 'errManyfoldUnavailable',
  admin_password_invalid: 'errAdminPasswordInvalid',
  internal: 'errInternal',
};

/**
 * 解析不出解读时存的码。后面可以跟一个冒号和 agent 的原文，供事后排查用 ——
 * 那段原文不往纸上印，纸上只说人话。
 */
export const UNPARSEABLE = 'unparseable';

/** agent 那一侧出了任何事（没连上、超时、平台报错…）时，对浏览器说的那个码。 */
export const AGENT_UNAVAILABLE = 'agent_unavailable';

/**
 * 存下来的那一条错误 → 允许离开 worker 的版本。
 *
 * 认得的码原样放行；解析失败只留码（后面跟的 agent 原文可能回显问题或解读）；
 * 其余都是 agent / 平台说的话，统一换成 AGENT_UNAVAILABLE。库里仍是原文，排查看那边。
 */
export function publicError(error: string | null | undefined): string | null {
  if (!error) return null;
  if (error === UNPARSEABLE || error.startsWith(`${UNPARSEABLE}:`)) return UNPARSEABLE;
  return error in ERROR_KEYS ? error : AGENT_UNAVAILABLE;
}

/** readings.error 里存的那一条 → 签纸上那一行字。 */
export function storedErrorText(
  error: string,
  t: Translate,
  vars?: Record<string, string | number>,
): string {
  if (!error) return t('errUnknown');
  if (error === UNPARSEABLE || error.startsWith(`${UNPARSEABLE}:`)) {
    return t('fallbackUnparseable');
  }
  // 码查表；查不到的是 agent 的原话（旧记录里也有），不印出来。
  return t(ERROR_KEYS[error] ?? 'errManyfoldUnavailable', vars);
}
