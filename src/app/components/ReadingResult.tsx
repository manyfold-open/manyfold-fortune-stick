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
                正在解签<span className="dots" aria-hidden />
              </p>
            ) : (
              <button type="button" className="text-action lead-action" onClick={props.onInterpret}>
                解 签
              </button>
            )}
            {props.error && !props.interpreting && <p className="fault">{props.error}</p>}
          </div>
        )}

        {interpretation && (
          <article className="sheet">
            {isFallback && (
              <p className="sheet-note">
                {reading.error ?? '这次没能结合你的问题解读。'}
                <button
                  type="button"
                  className="text-action"
                  onClick={props.onInterpret}
                  disabled={props.interpreting}
                >
                  {props.interpreting ? '重试中…' : '重试解签'}
                </button>
              </p>
            )}

            <section className="sheet-block">
              <h3>一句话签意</h3>
              <p className="sheet-lead">{interpretation.meaning}</p>
            </section>
            <section className="sheet-block">
              <h3>回应你的问题</h3>
              <p>{interpretation.answer}</p>
            </section>
            {interpretation.notice && (
              <section className="sheet-block">
                <h3>值得留意</h3>
                <p>{interpretation.notice}</p>
              </section>
            )}
            <section className="sheet-block">
              <h3>可以做的一件小事</h3>
              <p>{interpretation.action}</p>
            </section>

            {props.interpreting && (
              <p className="working" role="status">
                正在重新解签<span className="dots" aria-hidden />
              </p>
            )}
          </article>
        )}
      </div>

      {interpretation && (
        <>
          <nav className="result-actions">
            <button type="button" className="text-action" onClick={() => setShowShare((open) => !open)}>
              {showShare ? '收起分享' : '分享结果'}
            </button>
            <button
              type="button"
              className="text-action"
              onClick={() => setShowFollowUp((open) => !open)}
            >
              {showFollowUp ? '收起追问' : '继续追问'}
            </button>
            <button type="button" className="text-action strong" onClick={props.onRestart}>
              再求一签
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
