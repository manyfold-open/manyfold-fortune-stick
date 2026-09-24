import { describe, expect, it } from 'vitest';
import { shareMetaTags } from '../src/worker/meta';

describe('連結預覽的 og 標籤', () => {
  it('分享連結：標題寫那一支籤，圖片是掛載點下的絕對網址', () => {
    const { title, tags } = shareMetaTags(new URL('https://app.manyfold.ai/fortune-stick/?s=13&l=en'), '/fortune-stick');
    expect(title).toMatch(/^No\. 13 · /);
    expect(tags).toContain('property="og:image" content="https://app.manyfold.ai/fortune-stick/og.jpg"');
    expect(tags).toContain('property="og:url" content="https://app.manyfold.ai/fortune-stick/?s=13&amp;l=en"');
  });

  it('首頁：通用標題，不改分頁標題', () => {
    const { title, tags } = shareMetaTags(new URL('https://example.workers.dev/'), '');
    expect(title).toBe('');
    expect(tags).toContain('property="og:title" content="Omikuji · AI Fortune Stick"');
    expect(tags).toContain('content="https://example.workers.dev/og.jpg"');
  });

  it('屬性值裡的引號與角括號都跳脫，籤文和亂改的網址插不進標籤', () => {
    const { tags } = shareMetaTags(new URL('https://x.dev/?s=1&l=en&x="><script>'), '');
    expect(tags).not.toContain('<script>');
    for (const match of tags.matchAll(/content="([^"]*)"/g)) expect(match[1]).not.toMatch(/[<>]/);
  });
});
