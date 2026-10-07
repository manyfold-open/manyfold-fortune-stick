import { describe, expect, it } from 'vitest';
import { AGENT_UNAVAILABLE, publicError, storedErrorText } from '../src/shared/error-copy';
import { alertReason, unreachableCause } from '../src/worker/alerts';
import { fallbackReason } from '../src/shared/stats';
import { translatorFor } from '../src/shared/i18n';
import { zh } from '../src/shared/i18n/zh';

const t = translatorFor('zh');
const TUNNEL =
  'fortune-stick-2 在 failed 状态下结束：API Error: 530 {"type":"https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1033/","title":"Error 1033: Cloudflare Tunnel error"}';

describe('storedErrorText（readings.error → 纸上那一行）', () => {
  it('认得的码走文案表', () => {
    expect(storedErrorText('no_interpreter', t)).toBe(zh.errNoInterpreter);
  });

  it('agent 自己那句话不印出来：求签的人只看到同一句人话，原文留给 #settings / Discord', () => {
    const said = 'fortune-stick stream ended without events (0 bytes).';
    expect(storedErrorText(said, t)).toBe(zh.errManyfoldUnavailable);
    expect(storedErrorText(TUNNEL, t)).toBe(zh.errManyfoldUnavailable);
    expect(storedErrorText(AGENT_UNAVAILABLE, t)).toBe(zh.errManyfoldUnavailable);
  });

  it('解析不出来时只说人话，不把 agent 的原文印到纸上', () => {
    expect(storedErrorText('unparseable', t)).toBe(zh.fallbackUnparseable);
    expect(storedErrorText('unparseable: 好的，我来帮你看看这支签', t)).toBe(zh.fallbackUnparseable);
  });

  it('空字符串也要有一句话', () => {
    expect(storedErrorText('', t)).toBe(zh.errUnknown);
  });
});

describe('publicError（离开 worker 的那一版）', () => {
  it('认得的码放行，没有错误就是 null', () => {
    expect(publicError('no_interpreter')).toBe('no_interpreter');
    expect(publicError(null)).toBeNull();
    expect(publicError('')).toBeNull();
  });

  it('agent / 平台的原话（tunnel 断了的 530）一律换成 agent_unavailable', () => {
    expect(publicError(TUNNEL)).toBe(AGENT_UNAVAILABLE);
  });

  it('解析失败只留码，不带 agent 原文', () => {
    expect(publicError('unparseable: 好的，我来帮你看看这支签')).toBe('unparseable');
  });
});

describe('排查的人还是看得到原因', () => {
  it('Cloudflare 1033 在告警里被点名，原文仍在后面', () => {
    expect(unreachableCause(TUNNEL)).toContain('Tunnel');
    const reason = alertReason(new Error(TUNNEL));
    expect(reason).toContain('1033');
    expect(reason).toContain('API Error: 530');
  });

  it('1033 / 5xx 在统计里算「Manyfold 没回应」，不是「其他」', () => {
    expect(fallbackReason(TUNNEL)).toBe('manyfold');
    expect(fallbackReason('x failed: HTTP 502 · bad gateway')).toBe('manyfold');
  });
});
