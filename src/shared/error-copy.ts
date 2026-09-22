/**
 * 错误的码 → 文案键，以及「存下来的那一条错误」怎么变成一句给人看的话。
 *
 * 两处都要用同一张表：一次请求失败时浏览器要说话（src/app/api.ts），签纸上那一行
 * 也要说话（readings.error）。表放 shared 是因为它认的是服务端的 code。
 *
 * 认不出来的那些不是码，是 agent 自己抛回来的句子（出 worker 前已经过 safeErrorText
 * 脱敏）。它必须原样显示：那是唯一一条说明这次到底怎么了的线索，换成一句通用的
 * 「出了点问题」，排查的人就只能去翻数据库。
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
  admin_password_invalid: 'errAdminPasswordInvalid',
  internal: 'errInternal',
};

/**
 * 解析不出解读时存的码。后面可以跟一个冒号和 agent 的原文，供事后排查用 ——
 * 那段原文不往纸上印，纸上只说人话。
 */
export const UNPARSEABLE = 'unparseable';

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
  const key = ERROR_KEYS[error];
  return key ? t(key, vars) : error;
}
