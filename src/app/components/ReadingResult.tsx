/**
 * 打出来的那张签纸，和接在它下面的解签续页。
 *
 * 揭晓时只有签纸本身 —— 签号、等级、四字签名、签诗。解签是另外按一下：让用户先看签、
 * 先自己猜，再决定什么时候揭晓（产品文档第三步）。
 *
 * 解签后支持拟真撕纸动效：
 * 用户可点击「撕下分享」或沿齿孔拉断纸条，整张解签内容伴随物理断裂声与触感震动，
 * 脱离并向前浮现为一张立体的「灵签珍藏卡」，可直接保存分享，或随时贴回。
 */

import { useState } from 'react';
import { stickText } from '../../shared/sticks';
import type { FollowUpMessage, Reading } from '../../shared/types';
import { storedErrorText } from '../api';
import { LEVEL_TONE } from '../constants';
import { copyFor, useT } from '../i18n';
import { withoutDashes } from '../../shared/text';
import { paperSettleSound, tearPaperSound } from '../sound';
import FollowUp from './FollowUp';
import SharePanel from './SharePanel';
import StickFace from './StickFace';
import TearLine, { TearEdge } from './TearLine';

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
  const [tearState, setTearState] = useState<'intact' | 'tearing' | 'torn'>('intact');
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

  const handleTear = () => {
    if (tearState !== 'intact') return;
    setTearState('tearing');
    setShowFollowUp(false);
    setShowShare(true);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([12, 18, 26, 32]);
      } catch {
        /* Ignore on restricted environments */
      }
    }

    tearPaperSound(0.3);

    setTimeout(() => {
      setTearState('torn');
    }, 440);
  };

  const handleReattach = () => {
    paperSettleSound(0.2);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        /* Ignore */
      }
    }
    setTearState('intact');
  };

  const actionsNav = (
    <nav className="result-actions">
      {tearState === 'torn' ? (
        <>
          <button type="button" className="text-action action-reattach" onClick={handleReattach}>
            ↩ {t('actionReattach')}
          </button>
          <button
            type="button"
            className="text-action strong"
            onClick={() => {
              setShowShare((open) => !open);
              if (!showShare) setShowFollowUp(false);
            }}
          >
            {showShare ? t('actionShareClose') : t('actionShare')}
          </button>
        </>
      ) : (
        <button type="button" className="text-action action-tear strong" onClick={handleTear}>
          <span className="tear-icon" aria-hidden="true">
            ✂
          </span>{' '}
          {t('actionTearShare')}
        </button>
      )}

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

      <button type="button" className="text-action" onClick={props.onRestart}>
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

  const stickInfo = stickText(reading.stick, reading.language);

  return (
    <section
      className={`stage result${tearState === 'torn' ? ' stage-torn' : ''}`}
      data-tone={LEVEL_TONE[reading.stick.level].key}
    >
      <div className="result-deck mode-single">
        {/* 上半部：紙卷本體（所求之事 + 籤面） */}
        <div className={`sheet-stack${tearState === 'torn' ? ' slip-stub' : ''}`}>
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

          {/* 解籤後未撕下：呈現齒孔撕線 */}
          {interpretation && tearState !== 'torn' && (
            <TearLine onTear={handleTear} isTearing={tearState === 'tearing'} />
          )}

          {/* 若已撕下，上半紙卷底部露出自然撕斷毛邊 */}
          {interpretation && tearState === 'torn' && (
            <TearEdge position="bottom" className="stub-bottom-edge" />
          )}

          {/* 未撕下時，解籤內容接在同一卷紙下方 */}
          {interpretation && tearState !== 'torn' && (
            <article
              className={`sheet${props.interpreting ? ' sheet-loading' : ''}${tearState === 'tearing' ? ' sheet-tearing' : ''}`}
              data-lang={reading.language}
            >
              {interpretationContent}
            </article>
          )}
        </div>

        {/* 若已撕下，解籤內容向前浮起，成為立體的「靈籤珍藏卡」 */}
        {interpretation && tearState === 'torn' && (
          <div className="torn-card-container">
            <article
              className={`sheet torn-card${props.interpreting ? ' sheet-loading' : ''}`}
              data-lang={reading.language}
            >
              <TearEdge position="top" className="card-top-edge" />
              <div className="torn-card-header">
                <span className="torn-card-badge">
                  {reading.language === 'en'
                    ? `No. ${reading.stick.no} · ${reading.stick.level} · ${stickInfo.title}`
                    : `第 ${reading.stick.no} 籤 · ${reading.stick.level} · ${stickInfo.title}`}
                </span>
              </div>
              {interpretationContent}
            </article>
          </div>
        )}
      </div>
    </section>
  );
}
