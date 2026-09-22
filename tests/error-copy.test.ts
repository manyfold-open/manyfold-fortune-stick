import { describe, expect, it } from 'vitest';
import { storedErrorText } from '../src/shared/error-copy';
import { translatorFor } from '../src/shared/i18n';
import { zh } from '../src/shared/i18n/zh';

const t = translatorFor('zh');

describe('storedErrorText（readings.error → 纸上那一行）', () => {
  it('认得的码走文案表', () => {
    expect(storedErrorText('no_interpreter', t)).toBe(zh.errNoInterpreter);
  });

  it('agent 自己那句话原样显示 —— 换成「出了点问题」就等于把唯一的线索丢了', () => {
    const said = 'fortune-stick stream ended without events (0 bytes).';
    expect(storedErrorText(said, t)).toBe(said);
  });

  it('解析不出来时只说人话，不把 agent 的原文印到纸上', () => {
    expect(storedErrorText('unparseable', t)).toBe(zh.fallbackUnparseable);
    expect(storedErrorText('unparseable: 好的，我来帮你看看这支签', t)).toBe(zh.fallbackUnparseable);
  });

  it('空字符串也要有一句话', () => {
    expect(storedErrorText('', t)).toBe(zh.errUnknown);
  });
});
