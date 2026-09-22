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
import { storedErrorText } from '../api';
import { LEVEL_TONE } from '../constants';
import { copyFor, useT } from '../i18n';
import { withoutDashes } from '../../shared/text';
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
  const displayQuestion = withoutDashes(reading.question);
  const displayInterpretation = interpretation
    ? {
        ...interpretation,
        meaning: withoutDashes(interpretation.meaning),
        answer: withoutDashes(interpretation.answer),
        notice: withoutDashes(interpretation.notice),
        action: withoutDashes(interpretation.action),
      }
    : null;
  const isFallback = interpretation?.source === 'fallback';
  /**
   * 那四个小标题跟**这一局**的语言走，不跟界面：它们标的是 agent 用那种语言写下的
   * 文字，界面换成中文就把一段英文标成「一句话签意」，等于说错话。
   * 按钮和错误提示是另一回事 —— 那是机器在说话，跟界面走。
   */
  const sheet = copyFor(reading.language);

  const actionsNav = (
    <nav className="result-actions">
      <button
        type="button"
        className="text-action"
        onClick={() => {
          setShowShare((open) => !open);
          if (!showShare) setShowFollowUp(false);
        }}
      >
        {showShare ? t('actionShareClose') : t('actionShare')}
      </button>
      <button
        type="button"
        className="text-action"
        onClick={() => {
          setShowFollowUp((open) => !open);
          if (!showFollowUp) setShowShare(false);
        }}
      >
        {showFollowUp ? t('actionFollowUpClose') : t('actionFollowUp')}
      </button>
      <button type="button" className="text-action strong" onClick={props.onRestart}>
        {t('actionRestart')}
      </button>
    </nav>
  );

  const interpretationContent = (
    <>
      {isFallback && (
        <p className="sheet-note">
          {reading.error ? storedErrorText(reading.error, t) : t('fallbackNote')}{' '}
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

      <section className="sheet-block sheet-block-lead">
        <h3>{sheet.blockMeaning}</h3>
        <p className="sheet-lead">{displayInterpretation?.meaning}</p>
      </section>

      <section className="sheet-block sheet-block-answer">
        <h3>{sheet.blockAnswer}</h3>
        <p>{displayInterpretation?.answer}</p>
      </section>

      {(displayInterpretation?.notice || displayInterpretation?.action) && (
        <div className="sheet-pair">
          {displayInterpretation.notice && (
            <section className="sheet-block sheet-block-notice">
              <h3>{sheet.blockNotice}</h3>
            <p>{displayInterpretation.notice}</p>
            </section>
          )}
          {displayInterpretation.action && (
            <section className="sheet-block sheet-block-action">
              <h3>{sheet.blockAction}</h3>
            <p>{displayInterpretation.action}</p>
            </section>
          )}
        </div>
      )}

      {props.interpreting && (
        <div className="interpreting-header">
          <span className="interpreting-spinner" aria-hidden="true" />
          <p className="interpreting-status">
            {t('reinterpreting')}
            <span className="dots" aria-hidden />
          </p>
        </div>
      )}

      {actionsNav}

      {showShare && interpretation && (
        <SharePanel
          stick={reading.stick}
          language={reading.language}
          interpretation={interpretation}
          question={displayQuestion}
          onClose={() => setShowShare(false)}
        />
      )}

      {showFollowUp && (
        <FollowUp
          readingId={reading.id}
          language={reading.language}
          onMessages={props.onFollowUpMessages}
        />
      )}
    </>
  );

  const loadingSkeleton = (
    <article className="sheet sheet-loading" data-lang={reading.language}>
      <div className="interpreting-header">
        <span className="interpreting-spinner" aria-hidden="true" />
        <p className="interpreting-status">
          {t('interpreting')}
          <span className="dots" aria-hidden />
        </p>
      </div>

      <div className="skeleton-block">
        <div className="skeleton-title" />
        <div className="skeleton-line" style={{ width: '85%' }} />
        <div className="skeleton-line" style={{ width: '60%' }} />
      </div>

      <div className="skeleton-block">
        <div className="skeleton-title" />
        <div className="skeleton-line" style={{ width: '94%' }} />
        <div className="skeleton-line" style={{ width: '88%' }} />
        <div className="skeleton-line" style={{ width: '70%' }} />
      </div>

      <div className="sheet-pair skeleton-pair">
        <div className="skeleton-block">
          <div className="skeleton-title" />
          <div className="skeleton-line" style={{ width: '80%' }} />
          <div className="skeleton-line" style={{ width: '62%' }} />
        </div>
        <div className="skeleton-block">
          <div className="skeleton-title" />
          <div className="skeleton-line" style={{ width: '75%' }} />
          <div className="skeleton-line" style={{ width: '54%' }} />
        </div>
      </div>
    </article>
  );

  return (
    <section className="stage result" data-tone={LEVEL_TONE[reading.stick.level].key}>
      <div className="result-deck mode-single">
        <div className="sheet-stack">
          {/* 所求之事：神諭紙卷抬頭 */}
          <div className="scroll-head" data-lang={reading.language}>
            <span className="scroll-head-label">
              {reading.language === 'en' ? 'QUESTION' : '所求之事'}
            </span>
            <p className="scroll-head-text">{displayQuestion}</p>
          </div>

          <StickFace stick={reading.stick} language={reading.language} />

          {!interpretation && !props.interpreting && (
            <div className="sheet-actions">
              <button type="button" className="text-action lead-action" onClick={props.onInterpret}>
                {t('interpret')}
              </button>
              <div className="sheet-sub-actions">
                <button type="button" className="text-action" onClick={props.onRestart}>
                  {t('actionRestart')}
                </button>
              </div>
              {props.error && <p className="fault">{props.error}</p>}
            </div>
          )}

          {!interpretation && props.interpreting && loadingSkeleton}

          {interpretation && (
            <article className={`sheet${props.interpreting ? ' sheet-loading' : ''}`} data-lang={reading.language}>
              {interpretationContent}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
