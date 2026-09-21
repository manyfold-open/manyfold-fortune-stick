/**
 * 打出来的那张签纸，和接在它下面的解签续页。
 *
 * 揭晓时只有签纸本身 —— 签号、等级、四字签名、签诗。解签是另外按一下：让用户先看签、
 * 先自己猜，再决定什么时候揭晓（产品文档第三步）。
 *
 * 签纸在任何状态下都可见：解签中、解签失败、重试中，它都不会被遮住，也不会被替换。
 *
 * 页面上没有一个带框的按钮，动作都是纸上的一行字。
 */

import { useState } from 'react';
import type { FollowUpMessage, Reading } from '../../shared/types';
import { LEVEL_TONE } from '../constants';
import { useT } from '../i18n';
import FollowUp from './FollowUp';
import SharePanel from './SharePanel';
import StickFace from './StickFace';

export default function ReadingResult(props: {
  reading: Reading;
  interpreting: boolean;
  error: string;
  onInterpret: () => void;
  onFollowUpMessages: (messages: FollowUpMessage[]) => void;
  onRestart: () => void;
}) {
  const t = useT();
  const [showShare, setShowShare] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const { reading } = props;
  const { interpretation } = reading;
  const isFallback = interpretation?.source === 'fallback';

  return (
    <section className="stage result" data-tone={LEVEL_TONE[reading.stick.level].key}>
      <p className="asked">{reading.question}</p>

      <div className="sheet-stack">
        <StickFace stick={reading.stick} language={reading.language} />

        {!interpretation && (
          <div className="sheet-actions">
            {props.interpreting ? (
              <p className="working" role="status">
                {t('interpreting')}
                <span className="dots" aria-hidden />
              </p>
            ) : (
              <button type="button" className="text-action lead-action" onClick={props.onInterpret}>
                {t('interpret')}
              </button>
            )}
            {props.error && !props.interpreting && <p className="fault">{props.error}</p>}
          </div>
        )}

        {interpretation && (
          <article className="sheet">
            {isFallback && (
              <p className="sheet-note">
                {/* error 存的是码，文案在这边 —— 不认识的码原样显示，
                    这样新加的错误不会被悄悄吞掉。 */}
                {reading.error === 'unparseable'
                  ? t('fallbackUnparseable')
                  : (reading.error ?? t('fallbackNote'))}{' '}
                <button
                  type="button"
                  className="text-action"
                  onClick={props.onInterpret}
                  disabled={props.interpreting}
                >
                  {props.interpreting ? t('retrying') : t('retryInterpret')}
                </button>
              </p>
            )}

            <section className="sheet-block">
              <h3>{t('blockMeaning')}</h3>
              <p className="sheet-lead">{interpretation.meaning}</p>
            </section>
            <section className="sheet-block">
              <h3>{t('blockAnswer')}</h3>
              <p>{interpretation.answer}</p>
            </section>
            {interpretation.notice && (
              <section className="sheet-block">
                <h3>{t('blockNotice')}</h3>
                <p>{interpretation.notice}</p>
              </section>
            )}
            <section className="sheet-block">
              <h3>{t('blockAction')}</h3>
              <p>{interpretation.action}</p>
            </section>

            {props.interpreting && (
              <p className="working" role="status">
                {t('reinterpreting')}
                <span className="dots" aria-hidden />
              </p>
            )}
          </article>
        )}
      </div>

      {interpretation && (
        <>
          <nav className="result-actions">
            <button type="button" className="text-action" onClick={() => setShowShare((open) => !open)}>
              {showShare ? t('actionShareClose') : t('actionShare')}
            </button>
            <button
              type="button"
              className="text-action"
              onClick={() => setShowFollowUp((open) => !open)}
            >
              {showFollowUp ? t('actionFollowUpClose') : t('actionFollowUp')}
            </button>
            <button type="button" className="text-action strong" onClick={props.onRestart}>
              {t('actionRestart')}
            </button>
          </nav>

          {showShare && (
            <SharePanel
              stick={reading.stick}
              interpretation={interpretation}
              question={reading.question}
              onClose={() => setShowShare(false)}
            />
          )}

          {showFollowUp && (
            <FollowUp readingId={reading.id} onMessages={props.onFollowUpMessages} />
          )}
        </>
      )}
    </section>
  );
}
