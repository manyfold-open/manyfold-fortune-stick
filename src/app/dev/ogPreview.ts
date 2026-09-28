/**
 * tools/og-preview.html 的腳本。
 * - `?s=18&l=zh`：畫一張連結預覽圖，原尺寸貼在頁面左上角；畫完在 <body> 上標 data-ready，
 *   scripts/og-previews.mjs 等這個記號再把 canvas 讀出來。
 * - 不帶參數：把 public/og/ 裡已經畫好的圖排成一面牆，一眼檢查 36 × 5 張（`?l=ja` 只看一種語言）。
 */

import '../styles.css';
import { LANGUAGES, isLanguage } from '../../shared/lang';
import { parseSharedStick } from '../../shared/share-link';
import { STICK_COUNT } from '../../shared/sticks';
import { renderLinkPreview } from '../share';

const shared = parseSharedStick(window.location.search);
if (shared) {
  const canvas = await renderLinkPreview(shared.stick, shared.language);
  document.body.appendChild(canvas);
} else {
  const only = new URLSearchParams(window.location.search).get('l');
  const languages = isLanguage(only) ? [only] : LANGUAGES;
  const wall = document.createElement('div');
  wall.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px;padding:12px';
  for (let no = 1; no <= STICK_COUNT; no += 1) {
    for (const language of languages) {
      const image = document.createElement('img');
      image.src = `/og/${no}-${language}.jpg`;
      image.title = `${no}-${language}`;
      image.loading = 'lazy';
      image.style.width = '100%';
      wall.appendChild(image);
    }
  }
  document.body.appendChild(wall);
}
document.body.dataset.ready = 'true';
