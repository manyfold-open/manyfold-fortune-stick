/**
 * 連結預覽（LINE、iMessage、WhatsApp、X 貼上網址時那張卡片）。
 *
 * 以前頁面沒有任何 og 標籤，分享出去只是一條光禿禿的網址。這裡在 worker 把 HTML 交出去之前
 * 往 <head> 裡補上標題、說明和一張預覽圖；帶著 `?s=13&l=en` 的分享連結，標題寫那支籤的
 * 籤號、等級和籤名，說明寫兩句籤詩 —— 都是 sticks.ts 裡的字，連結裡沒有問題，這裡也就沒有。
 *
 * og:image 必須是絕對網址：用這次請求實際的 origin 加上掛載點（app.manyfold.ai/fortune-stick）。
 */

import { SITE_META, parseSharedStick, sharedStickMeta, sharedStickQuery } from '../shared/share-link';

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 要補進 <head> 的那幾行。拆成純函數，測試不必跑 HTMLRewriter。 */
export function shareMetaTags(publicUrl: URL, base: string): { title: string; tags: string } {
  const shared = parseSharedStick(publicUrl.search);
  const meta = shared ? sharedStickMeta(shared) : SITE_META;
  const image = `${publicUrl.origin}${base}/og.jpg`;
  // 只寫標準的那一條，網址上別人多加的參數不往外帶
  const pageUrl = `${publicUrl.origin}${base}/${shared ? sharedStickQuery(shared.stick.no, shared.language) : ''}`;
  const tags = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Omikuji'],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', meta.description],
    ['property', 'og:url', pageUrl],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:description', meta.description],
    ['name', 'twitter:image', image],
  ]
    .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`)
    .join('');
  return { title: shared ? meta.title : '', tags };
}

/** 只動 HTML；圖片、JS、API 的回應原樣放行。 */
export function withShareMeta(response: Response, publicUrl: URL, base: string): Response {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) return response;
  const { title, tags } = shareMetaTags(publicUrl, base);
  const rewriter = new HTMLRewriter().on('head', {
    element(head) {
      head.append(tags, { html: true });
    },
  });
  // 分享的那一支：瀏覽器分頁標題也寫那支籤，存成書籤、在分頁列上看得出是哪一支
  if (title) {
    rewriter.on('title', {
      element(el) {
        el.setInnerContent(title);
      },
    });
  }
  return rewriter.transform(response);
}
