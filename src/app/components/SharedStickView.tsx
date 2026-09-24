/**
 * 朋友分享來的那一支籤（網址上的 `?s=13&l=en`，見 shared/share-link.ts）。
 *
 * 只有籤紙正面：籤號、等級、籤名、籤詩都是 sticks.ts 裡的字，照籤號就畫得出來，
 * 不查任何資料 —— 連結裡本來就沒有問題和解籤，這一頁也就看不到。
 * 版面沿用結果頁：繪馬掛在鳥居下，下面一張御神籤，底下一行「求一支自己的籤」。
 */

import type { SharedStick } from '../../shared/share-link';
import { LEVEL_TONE } from '../constants';
import { copyFor, useT } from '../i18n';
import { EmaChrome } from './Ema';
import StickFace from './StickFace';

export default function SharedStickView(props: { shared: SharedStick; onDrawOwn: () => void }) {
  const t = useT();
  const { stick, language } = props.shared;
  // 繪馬上的字跟這張紙的語言走（紙說它自己的語言），按鈕跟界面走（機器說界面的語言）
  const paper = copyFor(language);

  return (
    <section className="stage result shared-stick" data-tone={LEVEL_TONE[stick.level].key}>
      <div className="result-deck mode-single">
        <div className="sheet-stack">
          <div className="ema-card" data-lang={language}>
            <EmaChrome caption={paper.emaCaption}>
              <p className="asked">{paper.sharedEma}</p>
            </EmaChrome>
          </div>

          <div className="omikuji-card">
            <div className="omikuji-inner">
              <div className="omikuji face face-front">
                <StickFace stick={stick} language={language} />
              </div>
            </div>
          </div>

          <div className="sheet-actions" data-lang={language}>
            <button type="button" className="text-action lead-action" onClick={props.onDrawOwn}>
              {t('sharedDrawOwn')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
