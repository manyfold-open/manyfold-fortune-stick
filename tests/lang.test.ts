import { describe, expect, it } from 'vitest';
import { detectLanguage, languageFromLocales } from '../src/shared/lang';

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

  it('全角标点和 emoji 都不足以判成中文', () => {
    expect(detectLanguage('Will it work？？')).toBe('en');
    expect(detectLanguage('Will it work??')).toBe('en');
    expect(detectLanguage('Should I go 🤔')).toBe('en');
  });

  it('有一个假名就是日文 —— 要先于汉字判断，否则带汉字的日文会被判成中文', () => {
    expect(detectLanguage('ありがとう')).toBe('ja');
    expect(detectLanguage('明日の面接はうまくいきますか')).toBe('ja');
    expect(detectLanguage('カフェを開くべき？')).toBe('ja');
    expect(detectLanguage('ｶﾌｪ 開店')).toBe('ja');
  });

  it('只有汉字没有假名的日文落到中文：这是规则写得钝的代价，写在这里免得有人以为是 bug', () => {
    expect(detectLanguage('転職可否')).toBe('zh');
  });

  it('长音符和中点不算假名', () => {
    expect(detectLanguage('ーー・・ Will it work')).toBe('en');
  });

  it('有一个谚文就是韩文', () => {
    expect(detectLanguage('요즘 직장의 변화에 어떻게 대처해야 할까요?')).toBe('ko');
    expect(detectLanguage('Kevin 한테 연락 올까')).toBe('ko');
    expect(detectLanguage('ㅋㅋ should I')).toBe('ko');
  });

  it('有一个天城文字母就是印地语', () => {
    expect(detectLanguage('क्या मुझे नौकरी बदलनी चाहिए?')).toBe('hi');
    expect(detectLanguage('मेरा career कैसा रहेगा')).toBe('hi');
    expect(detectLanguage('Should I go । ok')).toBe('hi');
  });

  it('罗马字写的印地语（Hinglish）认不出来，落到英文', () => {
    expect(detectLanguage('kya mujhe naukri badalni chahiye')).toBe('en');
  });

  it('夹着汉字的韩文仍是韩文', () => {
    expect(detectLanguage('今年 운세는 어때요')).toBe('ko');
  });

  it('空字符串落到英文，不抛错', () => {
    expect(detectLanguage('')).toBe('en');
  });
});

describe('languageFromLocales', () => {
  it('按浏览器的偏好顺序，第一个我们有的语言胜出', () => {
    expect(languageFromLocales(['hi-IN', 'en-IN'])).toBe('hi');
    expect(languageFromLocales(['en-IN', 'hi-IN'])).toBe('en');
    expect(languageFromLocales(['fa-IR', 'en-US'])).toBe('en');
    expect(languageFromLocales(['ja-JP'])).toBe('ja');
    expect(languageFromLocales(['ko_KR'])).toBe('ko');
  });

  it('繁体中文地区也给中文', () => {
    expect(languageFromLocales(['zh-TW'])).toBe('zh');
    expect(languageFromLocales(['zh-Hant-HK'])).toBe('zh');
  });

  it('一个都不认得就是 null，调用方落回英文', () => {
    expect(languageFromLocales(['id-ID', 'fa'])).toBeNull();
    expect(languageFromLocales([])).toBeNull();
    expect(languageFromLocales([''])).toBeNull();
  });
});
