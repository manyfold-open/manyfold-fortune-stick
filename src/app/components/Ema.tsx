/**
 * 繪馬的零件：上方的紅繩、牌頂的小字、底下的紅色水引。
 *
 * 只是裝飾，外觀全在 styles.css：只有 3D 籤筒台上（.shell:has(.cyl3d-stage)）才顯示，
 * 其他器具下這三樣是 display: none，題目照舊直接寫在頁面上。
 */

import type { ReactNode } from 'react';
import { useT } from '../i18n';

export function EmaChrome({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <>
      <span className="ema-cord" aria-hidden />
      <p className="ema-caption" aria-hidden>{t('emaCaption')}</p>
      {children}
      <svg className="ema-mizuhiki" viewBox="0 0 160 18" aria-hidden>
        <path d="M4 9 H62" stroke="#bb2a1c" strokeWidth="1.2" />
        <path d="M98 9 H156" stroke="#bb2a1c" strokeWidth="1.2" />
        <path d="M80 9 C 70 0, 62 2, 64 9 C 62 16, 70 18, 80 9 C 90 0, 98 2, 96 9 C 98 16, 90 18, 80 9 Z" fill="none" stroke="#bb2a1c" strokeWidth="1.4" />
        <path d="M80 9 L 72 17 M80 9 L 88 17" stroke="#bb2a1c" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </>
  );
}
