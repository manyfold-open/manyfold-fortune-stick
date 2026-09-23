/**
 * 问题的输入。没有输入框 —— 字直接写在页面上。
 *
 * 但「没有框」不等于「看不出能写」：这里用两样东西说明这是落笔的地方 ——
 *  1. 四个角上的裁切线（.ask-zone），印刷品上圈定版心的老办法，不是一个框；
 *     3D 籤筒台上换成一块挂着的繪馬（Ema.tsx），题目写在牌上；
 *  2. 没写字又没聚焦时，占位文字后面跟着一根会闪的光标。
 * 一聚焦，这两样都让位给真正的光标，版面立刻干净。
 *
 * 三句可以点的例句不在这里，在机器**下方**（FortuneGame 里的 .suggestions）——
 * 夹在提问和机器中间会把两者推开，它们本来该是挨着的一组。因为例句要往输入框里
 * 填字、填完还要把光标交回来，textarea 的 ref 就归调用方持有（inputRef），
 * 这个组件只管画。
 *
 * 这里不提交任何东西：写完之后按打印机上的键才开始（校验也在那一步，错在屏上说）。
 */

import { useEffect, useState, type RefObject } from 'react';
import { withoutDashes } from '../../shared/text';
import { QUESTION_MAX } from '../constants';
import { useT } from '../i18n';
import { typeTick } from '../sound';
import { EmaChrome } from './Ema';

export default function QuestionForm(props: {
  value: string;
  onChange: (value: string) => void;
  /** 写完直接回车，等同于按下机器上的键。 */
  onSubmit: () => void;
  /** 输入框本体，由调用方持有 —— 机器下方的例句点完要把光标送回这里。 */
  inputRef: RefObject<HTMLTextAreaElement | null>;
  sound?: boolean;
}) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  /*
   * 写了几笔。每一笔轮流换 sway-a / sway-b 两个 class：animation-name 一换，
   * 那一下晃动就从头再来一次 —— 连续打字也是每个字晃一下，不用计时器。
   */
  const [strokes, setStrokes] = useState(0);
  const field = props.inputRef;
  const length = [...props.value.trim()].length;
  const empty = props.value.length === 0;

  const sway = strokes === 0 ? '' : strokes % 2 === 1 ? ' sway-a' : ' sway-b';

  const dismiss = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    field.current?.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  // 監聽可視視口還原（iOS Safari 鍵盤收起），重置任何殘留的 window.scrollY
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (!focused && Math.abs(window.scrollY) > 0) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [focused]);

  return (
    <>
      {focused && (
        <div
          className="ask-backdrop"
          aria-hidden="true"
          onMouseDown={(e) => {
            e.preventDefault();
            dismiss(e);
          }}
          onTouchStart={dismiss}
        />
      )}
      <div
        className="ask"
        onClick={(e) => {
          if (!focused && e.target !== field.current) {
            field.current?.focus();
          }
        }}
      >
        <div className={`ask-zone${focused ? ' focused' : ''}${!empty ? ' has-content' : ''}${sway}`}>
          <EmaChrome>
            {/* 用 data-value 撑开高度：输入区自己长高，不需要 JS，也不会出现滚动条。 */}
            <div className="ask-grow" data-value={props.value}>
              <textarea
                className="ask-input"
                ref={field}
                value={props.value}
                onChange={(event) => {
                  props.onChange(withoutDashes(event.target.value));
                  setStrokes((n) => n + 1);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  // 下次聚焦不要先补晃一下上次留下的那笔
                  setStrokes(0);
                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    dismiss();
                    props.onSubmit();
                  } else if (props.sound && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== 'Shift') {
                    typeTick();
                  }
                }}
                rows={1}
                maxLength={QUESTION_MAX + 40}
                aria-label={t('askLabel')}
                enterKeyHint="done"
              />
              {empty && !focused && (
                <p className="ask-ghost" aria-hidden>
                  {t('askGhost')}
                  <span className="ask-caret" />
                </p>
              )}
            </div>

            {focused && (
              <button
                type="button"
                className="ask-done-pill"
                onMouseDown={(e) => e.preventDefault()}
                onTouchEnd={dismiss}
                onClick={dismiss}
                aria-label={t('askDone')}
              >
                <span className="ask-done-check" aria-hidden="true">✓</span>
                <span>{t('askDone')}</span>
              </button>
            )}
          </EmaChrome>
        </div>

        {length > QUESTION_MAX - 20 && (
          <p className={`ask-counter${length > QUESTION_MAX ? ' over' : ''}`}>
            {length} / {QUESTION_MAX}
          </p>
        )}
      </div>
    </>
  );
}
