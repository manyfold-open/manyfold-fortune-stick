import { describe, expect, it } from 'vitest';
import { LANGUAGES, writesVertically } from '../src/shared/lang';
import { LEVEL_LABEL, STICKS, STICK_COUNT } from '../src/shared/sticks';
import { STICKS_JA } from '../src/shared/sticks-ja';
import { STICKS_KO } from '../src/shared/sticks-ko';
import { PAPER } from '../src/shared/paper';

/**
 * 签纸是按中文排的：直排那一列在手机上只有 118px 高（styles.css 的 .slip-grid-columns），
 * 放得下七个字。多一个字，浏览器就自己把那一句折成两列 —— 版面不会坏，但一句诗被从中间
 * 劈开。所以字数上限写在这里，而不是靠眼睛看。
 */
const chars = (text: string) => [...text].length;

describe('每一种语言的签文都填满了', () => {
  it('日文、韩文各 36 支，跟签号一一对上', () => {
    expect(STICKS_JA).toHaveLength(STICK_COUNT);
    expect(STICKS_KO).toHaveLength(STICK_COUNT);
  });

  it('每支签的每种语言都没有空字段 —— general 和 action 同时是 AI 失败时的兜底', () => {
    for (const stick of STICKS) {
      for (const language of LANGUAGES) {
        const text = stick[language];
        for (const [field, value] of Object.entries(text)) {
          if (Array.isArray(value)) {
            expect(value).toHaveLength(2);
            for (const line of value) expect(line.trim().length, `第 ${stick.no} 签 ${language}.${field}`).toBeGreaterThan(0);
          } else {
            expect(String(value).trim().length, `第 ${stick.no} 签 ${language}.${field}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('每种语言都有四个等级的名字', () => {
    for (const language of LANGUAGES) {
      for (const stick of STICKS) expect(LEVEL_LABEL[language][stick.level]).toBeTruthy();
    }
  });
});

describe('签纸放得下', () => {
  it('直排的语言（中文、日文）每句签诗最多七个字，不会自己折成两列', () => {
    for (const language of LANGUAGES.filter(writesVertically)) {
      for (const stick of STICKS) {
        for (const line of stick[language].poem) {
          expect(chars(line), `第 ${stick.no} 签 ${language}：${line}`).toBeLessThanOrEqual(7);
        }
      }
    }
  });

  it('日文签名最多六个字，韩文签名最多十二个字（一行放得下）', () => {
    for (const stick of STICKS) {
      expect(chars(stick.ja.title), stick.ja.title).toBeLessThanOrEqual(6);
      expect(chars(stick.ko.title), stick.ko.title).toBeLessThanOrEqual(12);
    }
  });

  it('签意是一句话：日文 20 字以内（直排跟中文一样最多三列，不会剩一个字自己占一列），韩文 45 字以内', () => {
    for (const stick of STICKS) {
      expect(chars(stick.ja.meaning), stick.ja.meaning).toBeLessThanOrEqual(20);
      expect(chars(stick.ko.meaning), stick.ko.meaning).toBeLessThanOrEqual(45);
    }
  });

  it('开运小物是个短词，分享图上那颗胶囊放得下', () => {
    for (const stick of STICKS) {
      expect(chars(stick.ja.luckyItem), stick.ja.luckyItem).toBeLessThanOrEqual(10);
      expect(chars(stick.ko.luckyItem), stick.ko.luckyItem).toBeLessThanOrEqual(10);
    }
  });

  it('日文、韩文签文里没有 dash', () => {
    for (const stick of STICKS) {
      for (const language of ['ja', 'ko'] as const) {
        const { poem, ...rest } = stick[language];
        for (const value of [...poem, ...Object.values(rest)]) {
          expect(value, `第 ${stick.no} 签 ${language}`).not.toMatch(/[‐-―−﹘﹣－]|--/);
        }
      }
    }
  });
});

describe('纸上的固定字眼', () => {
  it('中文和英文跟以前印的一字不差', () => {
    expect(PAPER.zh.number(18, 36)).toBe('第十八签');
    expect(PAPER.zh.number(23, 36)).toBe('第廿三签');
    expect(PAPER.en.number(18, 36)).toBe('NO. 18 OF 36');
    expect(PAPER.zh.luckyTone('靛蓝')).toBe('吉色 · 靛蓝');
    expect(PAPER.en.luckyTone('Indigo')).toBe('Lucky tone · Indigo');
  });

  it('日文签号用普通的汉数字，不用签筒上的廿、卅', () => {
    expect(PAPER.ja.number(1, 36)).toBe('第一番');
    expect(PAPER.ja.number(10, 36)).toBe('第十番');
    expect(PAPER.ja.number(18, 36)).toBe('第十八番');
    expect(PAPER.ja.number(23, 36)).toBe('第二十三番');
    expect(PAPER.ja.number(30, 36)).toBe('第三十番');
    expect(PAPER.ja.number(36, 36)).toBe('第三十六番');
  });
});
