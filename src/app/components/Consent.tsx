/**
 * 統計的同意：頁底一行字，兩個一樣大的字做答案。
 *
 * 只給真的需要先問的人看 —— 歐洲經濟區、英國、瑞士（國別由 worker 從請求判斷，放在
 * /api/state 的 consentRequired）；其他地方的人問了也沒有意義。這一頁沒有 Google 標籤
 * （fork、沒設 GA_MEASUREMENT_ID）就什麼都不畫。
 *
 * 保不保護隱私不靠這一行：它畫出來之前，頁首的標籤已經在這些地區把自己關掉了
 * （src/worker/analytics.ts）。這裡只是讓人改那個預設。「同意」「不同意」一樣大、一樣重 ——
 * 把「不同意」做得比較淡，就是拿樣式表寫的暗黑模式。
 *
 * 界面沒有框（AGENTS.md 第 7 條），所以它也不是一個框：直接印在底色上的一行字。
 */

import { useState } from 'react';
import { measuring, setConsent, storedConsent, type Consent as Choice } from '../analytics';
import { appUrl } from '../base';
import { useT } from '../i18n';

export default function Consent(props: {
  /** /api/state 說這個人要不要先問；null 是還沒回來，先不畫。 */
  required: boolean | null;
}) {
  const t = useT();
  const [answered, setAnswered] = useState(() => storedConsent() !== null);

  if (answered || props.required !== true || !measuring()) return null;

  const answer = (choice: Choice) => {
    setConsent(choice);
    setAnswered(true);
  };

  return (
    <aside className="consent-line" aria-label={t('consentLabel')}>
      <p className="consent-text">
        {t('consentLine')}{' '}
        <a className="text-action tiny" href={appUrl('/privacy')}>
          {t('consentMore')}
        </a>
      </p>
      <span className="consent-answer">
        <button type="button" className="text-action" onClick={() => answer('denied')}>
          {t('consentDecline')}
        </button>
        <button type="button" className="text-action" onClick={() => answer('granted')}>
          {t('consentAccept')}
        </button>
      </span>
    </aside>
  );
}
