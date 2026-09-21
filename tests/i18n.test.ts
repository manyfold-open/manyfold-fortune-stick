import { describe, expect, it } from 'vitest';
import { zh } from '../src/shared/i18n/zh';
import { en } from '../src/shared/i18n/en';
import { format, translatorFor } from '../src/shared/i18n';

describe('界面字典', () => {
  it('两张表的键完全一致 —— 漏一个就编译不过，这里再兜一层', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('没有空字符串', () => {
    for (const [key, value] of Object.entries<string>({ ...zh, ...en })) {
      expect(value.length, `${key} 是空的`).toBeGreaterThan(0);
    }
  });

  it('同一个键在两种语言里占位符也要一样，否则插值会漏', () => {
    const slots = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
      expect(slots(en[key]), `${String(key)} 的占位符对不上`).toEqual(slots(zh[key]));
    }
  });

  it('英文表里没有漏翻的汉字', () => {
    const han = /[㐀-䶿一-鿿豈-﫿]/;
    for (const [key, value] of Object.entries<string>(en)) {
      // langSwitch 那两条是故意的：英文界面上要用中文写「切换到中文」。
      if (key === 'langSwitch' || key === 'langSwitchLabel') continue;
      expect(han.test(value), `${key} 的英文里还有汉字`).toBe(false);
    }
  });

  it('format 填占位符，没给值的原样留着', () => {
    expect(format('至少 {min} 个字', { min: 5 })).toBe('至少 5 个字');
    expect(format('{a} 和 {b}', { a: '一' })).toBe('一 和 {b}');
  });

  it('translatorFor 按语言取表并插值', () => {
    expect(translatorFor('zh')('faultTooShort', { min: 5 })).toContain('至少 5 字');
    expect(translatorFor('en')('faultTooShort', { min: 5 })).toContain('at least 5');
  });
});
