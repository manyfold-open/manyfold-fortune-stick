import { describe, expect, it } from 'vitest';
import { parseSharedStick, sharedStickMeta, sharedStickQuery } from '../src/shared/share-link';
import { STICK_COUNT } from '../src/shared/sticks';

describe('分享連結 ?s=&l=', () => {
  it('寫出去的連結讀得回同一支籤、同一種語言', () => {
    for (const language of ['en', 'zh', 'ja', 'ko'] as const) {
      for (let no = 1; no <= STICK_COUNT; no += 1) {
        const shared = parseSharedStick(sharedStickQuery(no, language));
        expect(shared?.stick.no).toBe(no);
        expect(shared?.language).toBe(language);
      }
    }
  });

  it('亂改網址不會弄壞首頁：越界、小數、負數、非數字、沒有 s 都當沒有', () => {
    for (const search of ['', '?l=en', '?s=0', `?s=${STICK_COUNT + 1}`, '?s=1.5', '?s=-3', '?s=abc', '?s=1e1', '?s=99999']) {
      expect(parseSharedStick(search)).toBeNull();
    }
  });

  it('語言只認 zh、ja、ko，其他一律英文', () => {
    expect(parseSharedStick('?s=3&l=zh')?.language).toBe('zh');
    expect(parseSharedStick('?s=3&l=ja')?.language).toBe('ja');
    expect(parseSharedStick('?s=3&l=ko')?.language).toBe('ko');
    expect(parseSharedStick('?s=3&l=fr')?.language).toBe('en');
    expect(parseSharedStick('?s=3')?.language).toBe('en');
  });

  it('連結預覽寫得出籤號、等級與籤詩，而且不帶任何問題', () => {
    const en = sharedStickMeta(parseSharedStick('?s=13&l=en')!);
    expect(en.title).toMatch(/^No\. 13 · /);
    expect(en.description.length).toBeGreaterThan(20);
    const zh = sharedStickMeta(parseSharedStick('?s=13&l=zh')!);
    expect(zh.title).toMatch(/^第十三签 · /);
    expect(zh.description).toMatch(/。来求一支你自己的签。$/);
    expect(sharedStickMeta(parseSharedStick('?s=13&l=ja')!).title).toMatch(/^第13番 · /);
    expect(sharedStickMeta(parseSharedStick('?s=13&l=ko')!).title).toMatch(/^13번 · /);
  });
});
