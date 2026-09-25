import { describe, expect, it } from 'vitest';
import { zh } from '../src/shared/i18n/zh';
import { en } from '../src/shared/i18n/en';
import { ja } from '../src/shared/i18n/ja';
import { ko } from '../src/shared/i18n/ko';
import { TABLES, copyFor, format, translatorFor } from '../src/shared/i18n';
import { LANGUAGES } from '../src/shared/lang';
import { STICKS } from '../src/shared/sticks';

const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

describe('界面字典', () => {
  it('每张表的键都跟中文那张完全一致 —— 漏一个就编译不过，这里再兜一层', () => {
    for (const table of [en, ja, ko]) {
      expect(Object.keys(table).sort()).toEqual(Object.keys(zh).sort());
    }
  });

  it('没有空字符串', () => {
    for (const language of LANGUAGES) {
      for (const [key, value] of Object.entries<string>(TABLES[language])) {
        expect(value.length, `${language}.${key} 是空的`).toBeGreaterThan(0);
      }
    }
  });

  it('同一个键在每种语言里占位符也要一样，否则插值会漏', () => {
    const slots = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();
    for (const table of [en, ja, ko]) {
      for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
        expect(slots(table[key]), `${String(key)} 的占位符对不上`).toEqual(slots(zh[key]));
      }
    }
  });

  it('英文表里没有漏翻的汉字', () => {
    for (const [key, value] of Object.entries<string>(en)) {
      expect(HAN.test(value), `${key} 的英文里还有汉字`).toBe(false);
    }
  });

  it('韩文表和韩文签文只用谚文，不夹汉字', () => {
    for (const [key, value] of Object.entries<string>(ko)) {
      expect(HAN.test(value), `${key} 的韩文里有汉字`).toBe(false);
    }
    for (const stick of STICKS) {
      const { poem, ...rest } = stick.ko;
      for (const value of [...poem, ...Object.values(rest)]) {
        expect(HAN.test(value), `第 ${stick.no} 签的韩文里有汉字：${value}`).toBe(false);
      }
    }
  });

  it('日文表里真的是日文：成句的每一条都带假名（記録、管理、撤回、削除这种标题本来就只有汉字）', () => {
    const kana = /[\u3041-\u3096\u30a1-\u30fa]/;
    for (const [key, value] of Object.entries<string>(ja)) {
      if (key === 'railRight' || !HAN.test(value) || [...value.replace(/\{\w+\}/g, '')].length <= 12) continue;
      expect(kana.test(value), `${key} 看起来是中文不是日文：${value}`).toBe(true);
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

  it('前端文案不会带出 dash', () => {
    for (const language of LANGUAGES) {
      for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
        expect(translatorFor(language)(key)).not.toMatch(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/);
        expect(copyFor(language)[key]).not.toMatch(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/);
      }
    }
  });

  it('英文文案（界面和签文）连连字符也不用', () => {
    const hyphen = /[A-Za-z]-[A-Za-z]|\s-\s|--/;
    for (const [key, value] of Object.entries<string>(en)) {
      expect(value, `${key} 里有连字符`).not.toMatch(hyphen);
    }
    for (const stick of STICKS) {
      const { poem, ...rest } = stick.en;
      for (const value of [...poem, ...Object.values(rest)]) {
        expect(value, `第 ${stick.no} 签的英文里有连字符`).not.toMatch(hyphen);
        expect(value).not.toMatch(/[\u2010-\u2015\u2212]/);
      }
    }
  });
});
