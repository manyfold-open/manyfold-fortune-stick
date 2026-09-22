import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../src/shared/lang';

describe('detectLanguage', () => {
  it('纯中文问题是中文', () => {
    expect(detectLanguage('我该如何面对最近的工作变化？')).toBe('zh');
  });

  it('纯英文问题是英文', () => {
    expect(detectLanguage('Should I take this job offer?')).toBe('en');
  });

  it('一个汉字就够：中英混排按中文处理', () => {
    expect(detectLanguage('Kevin 会回我消息吗')).toBe('zh');
    expect(detectLanguage('我该不该 accept 这个 offer')).toBe('zh');
  });

  it('扩展区汉字和兼容区汉字同样算中文', () => {
    expect(detectLanguage('㐀的事')).toBe('zh');
    expect(detectLanguage('城市的城')).toBe('zh');
  });

  it('全角标点、假名和 emoji 都不足以判成中文', () => {
    expect(detectLanguage('Will it work??')).toBe('en');
    expect(detectLanguage('Should I go 🤔')).toBe('en');
    expect(detectLanguage('ありがとう')).toBe('en');
  });

  it('空字符串落到英文，不抛错', () => {
    expect(detectLanguage('')).toBe('en');
  });
});
