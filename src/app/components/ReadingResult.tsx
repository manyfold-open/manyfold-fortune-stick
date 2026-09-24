/**
 * 打出来的那张签纸，和它背面的解签。
 *
 * 揭晓时只有签纸本身 —— 签号、等级、四字签名、签诗。解签是另外按一下：让用户先看签、
 * 先自己猜，再决定什么时候揭晓（产品文档第三步）。
 *
 * 版面是神社裡的一張御神籤：問題寫在上方跟紙同寬的繪馬上；籤紙是**一張有正反兩面的卡**，
 * 正面是籤，背面是解籤（設計：docs/superpowers/specs/2026-09-23-reading-flip-design.md）。
 * 以前解籤接在籤紙下面、頁面一直往下長，使用者說「往下滑動很奇怪…讓它翻面過來，畫面就不會無限延伸」。
 *
 * 卡高固定（CSS 的 --card-h），背面內容自己捲；分享與追問是浮在背面上的一張紙，不往下接。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { stickText } from '../../shared/sticks';
import type { FollowUpMessage, Reading } from '../../shared/types';
import { storedErrorText } from '../api';
import { LEVEL_TONE } from '../constants';
import { copyFor, useT } from '../i18n';
import { withoutDashes } from '../../shared/text';
import { EmaChrome } from './Ema';
import { paperSettleSound } from '../sound';
import FollowUp from './FollowUp';
import SharePanel from './SharePanel';
import StickFace from './StickFace';

type Panel = 'share' | 'followup' | null;

/** 求籤頁那塊繪馬在畫面上的位置（getBoundingClientRect），交棒時量的。 */
export interface EmaRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** 繪馬從求籤頁的位置滑到這一頁的位置要多久。跟籤紙升起（result-unroll 0.72s）一起走完。 */
const EMA_GLIDE_MS = 620;

export default function ReadingResult(props: {
  reading: Reading;
  interpreting: boolean;
  error: string;
  onInterpret: () => void;
  onFollowUpMessages: (messages: FollowUpMessage[]) => void;
  onRestart: () => void;
  /** 使用者的「声音」開關：翻面的紙聲也要聽它的 */
  sound: boolean;
  /**
   * 剛從籤筒抽完過來：那塊繪馬在求籤頁的位置。有它，繪馬就不淡入，從那裡滑到這裡 ——
   * 兩頁的繪馬高低不一樣（手機上解籤頁把它往上收，給籤卡讓位），直接換頁它會跳一下。
   * 刷新、從記錄打開的沒有它，整疊照舊一起攤開。
   */
  emaFrom?: EmaRect | null;
}) {
  const t = useT();
  const { reading } = props;
  const { interpretation } = reading;
  // 重新整理時已經解過的籤直接停在背面：使用者離開時看的就是解籤
  const [flipped, setFlipped] = useState(Boolean(interpretation));
  const [settled, setSettled] = useState(Boolean(interpretation));
  const [panel, setPanel] = useState<Panel>(null);
  const emaRef = useRef<HTMLDivElement | null>(null);
  /** 只看第一次掛上來時有沒有 —— 之後解籤、翻面重渲染都不能再滑一次。 */
  const [fromDraw] = useState(() => Boolean(props.emaFrom));
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
  /** 背面有東西可看：解好了，或正在解（先放骨架） */
  const hasBack = Boolean(interpretation) || props.interpreting;
  const showBack = flipped && hasBack;
  const isSettled = showBack && settled;

  // 一按「解签」就翻到背面，骨架在背面等著
  useEffect(() => {
    if (props.interpreting) {
      setSettled(false);
      setFlipped(true);
    }
  }, [props.interpreting]);

  useEffect(() => {
    if (flipped) {
      const timer = window.setTimeout(() => setSettled(true), 750);
      return () => window.clearTimeout(timer);
    } else {
      setSettled(false);
    }
  }, [flipped]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  // 在上屏之前量好、先放回求籤頁的位置，第一格畫出來的繪馬就在原地
  useLayoutEffect(() => {
    const from = props.emaFrom;
    const el = emaRef.current;
    if (!from || !el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const to = el.getBoundingClientRect();
    // 對齊中心：兩塊牌子高低差十來 px，對齊上緣的話下緣會跳；不縮放，字才不會被拉扁
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], {
      duration: EMA_GLIDE_MS,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
    // 只在剛掛上來時滑一次。滑的是獨立的 translate 屬性，不佔 transform —— 滑的途中滑鼠移上去，
    // hover 的 rotate 照樣疊得上去，不會跳
  }, []);

  const flip = (toBack: boolean) => {
    if (props.sound) paperSettleSound(0.2);
    setPanel(null);
    if (!toBack) {
      setSettled(false);
      requestAnimationFrame(() => {
        setFlipped(false);
      });
    } else {
      setSettled(false);
      setFlipped(true);
    }
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.propertyName === 'transform') {
      if (flipped) {
        setSettled(true);
      }
    }
  };

  const handleScrollWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight > el.clientHeight) {
      const before = el.scrollTop;
      el.scrollTop += e.deltaY;
      if (el.scrollTop !== before) {
        e.stopPropagation();
      }
    }
  };

  const togglePanel = (next: Exclude<Panel, null>) => setPanel((open) => (open === next ? null : next));

  const interpretationBlocks = (
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
    </>
  );

  const loadingSkeleton = (
    <>
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
    </>
  );

  const stickInfo = stickText(reading.stick, reading.language);

  return (
    <section className="stage result" data-tone={LEVEL_TONE[reading.stick.level].key}>
      <div className="result-deck mode-single">
        <div className={`sheet-stack${fromDraw ? ' from-draw' : ''}`}>
          {/* 所求之事：寫在繪馬上。小字跟這一局的語言走（紙上說問題的語言），不跟界面 */}
          <div className="ema-card" data-lang={reading.language} ref={emaRef}>
            <EmaChrome caption={sheet.emaCaption}>
              <p className="asked">{displayQuestion}</p>
            </EmaChrome>
          </div>

          <div className={`omikuji-card${showBack ? ' flipped' : ''}${isSettled ? ' settled' : ''}`}>
            <div className="omikuji-inner" onTransitionEnd={handleTransitionEnd}>
              <div className="omikuji face face-front" aria-hidden={showBack}>
                <StickFace stick={reading.stick} language={reading.language} />
                {hasBack && (
                  <button type="button" className="flip-tag" onClick={() => flip(true)}>
                    {t('flipToReading')} ⟳
                  </button>
                )}
              </div>

              {hasBack && (
                <div className="omikuji face face-back" aria-hidden={!showBack}>
                  <article
                    className={`sheet${!interpretation ? ' sheet-loading' : ''}`}
                    data-lang={reading.language}
                    aria-label={`${stickInfo.title} · ${sheet.sheetBand}`}
                  >
                    <p className="sheet-band">
                      <span aria-hidden>{sheet.sheetBand}</span>
                      <button type="button" className="flip-tag" onClick={() => flip(false)}>
                        ⟲ {t('flipToSlip')}
                      </button>
                    </p>

                    <div className="sheet-scroll" onWheel={handleScrollWheel}>
                      {interpretation ? interpretationBlocks : loadingSkeleton}
                    </div>

                    {interpretation && !panel && (
                      <nav className="result-actions" data-lang={reading.language}>
                        <button type="button" className="text-action strong" onClick={() => togglePanel('share')}>
                          {t('actionShare')}
                        </button>
                        <button type="button" className="text-action" onClick={() => togglePanel('followup')}>
                          {t('actionFollowUp')}
                        </button>
                        <button type="button" className="text-action" onClick={props.onRestart}>
                          {t('actionRestart')}
                        </button>
                      </nav>
                    )}
                  </article>

                  {/* 分享、追問浮在背面上：一張蓋住解籤的紙，自己捲，不讓頁面往下長 */}
                  {panel && interpretation && (
                    <div className="sheet-panel" role="dialog" aria-modal="false" onWheel={handleScrollWheel}>
                      {panel === 'share' ? (
                        <SharePanel
                          stick={reading.stick}
                          language={reading.language}
                          interpretation={interpretation}
                          question={displayQuestion}
                          onClose={() => setPanel(null)}
                        />
                      ) : (
                        <>
                          <div className="share-head">
                            <strong>{t('actionFollowUp')}</strong>
                            <button type="button" className="text-action tiny" onClick={() => setPanel(null)}>
                              {t('shareClose')}
                            </button>
                          </div>
                          <FollowUp
                            readingId={reading.id}
                            language={reading.language}
                            onMessages={props.onFollowUpMessages}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {!showBack && (
            <div className="sheet-actions" data-lang={reading.language}>
              {interpretation ? (
                <button type="button" className="text-action lead-action" onClick={() => flip(true)}>
                  {t('flipToReading')} ⟳
                </button>
              ) : (
                <button
                  type="button"
                  className="text-action lead-action"
                  onClick={props.onInterpret}
                  disabled={props.interpreting}
                >
                  {props.interpreting ? t('interpreting') : t('interpret')}
                </button>
              )}
              <div className="sheet-sub-actions">
                <button type="button" className="text-action" onClick={props.onRestart}>
                  {t('actionRestart')}
                </button>
              </div>
              {props.error && <p className="fault">{props.error}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
