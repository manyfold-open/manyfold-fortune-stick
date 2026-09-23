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
  /**
   * 每加一，繪馬就晃一下 —— 有人還沒寫問題就去攪籤筒時，用它把視線拉回來。
   * 用計數而不是布林：連攪兩次也要晃兩次。
   */
  nudge?: number;
}) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  /*
   * 写了几笔。每一笔轮流换 sway-a / sway-b 两个 class：animation-name 一换，
   * 那一下晃动就从头再来一次 —— 连续打字也是每个字晃一下，不用计时器。
   */
  const [strokes, setStrokes] = useState(0);
  const [nudging, setNudging] = useState(false);
  useEffect(() => {
    if (!props.nudge) return;
    setNudging(false);
    // 先拿掉、隔一下再加回去，連攪兩次動畫才會從頭播
    const on = window.setTimeout(() => setNudging(true), 30);
    const off = window.setTimeout(() => setNudging(false), 900);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [props.nudge]);
  const field = props.inputRef;
  const length = [...props.value.trim()].length;
  const empty = props.value.length === 0;

  const sway = strokes === 0 ? '' : strokes % 2 === 1 ? ' sway-a' : ' sway-b';

  return (
    // 没有框，就把整块区域都做成可以落笔的地方：点哪里都开始写。
    <div className="ask" onClick={() => field.current?.focus()}>
      <div className={`ask-zone${focused ? ' focused' : ''}${!empty ? ' has-content' : ''}${sway}${nudging ? ' nudge' : ''}`}>
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
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  props.onSubmit();
                } else if (props.sound && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== 'Shift') {
                  typeTick();
                }
              }}
              rows={1}
              maxLength={QUESTION_MAX + 40}
              aria-label={t('askLabel')}
            />
            {empty && !focused && (
              <p className="ask-ghost" aria-hidden>
                {/* 一支筆：沒有框，就讓這行字自己說「這裡是寫字的地方」 */}
                <svg className="ask-pen" viewBox="0 0 20 20">
                  <path d="M13.6 2.8 17.2 6.4 7.4 16.2 3 17 3.8 12.6Z" />
                  <path d="M11.6 4.8 15.2 8.4" />
                </svg>
                {t('askGhost')}
                <span className="ask-caret" />
              </p>
            )}
          </div>
        </EmaChrome>
      </div>

      {length > QUESTION_MAX - 20 && (
        <p className={`ask-counter${length > QUESTION_MAX ? ' over' : ''}`}>
          {length} / {QUESTION_MAX}
        </p>
      )}
    </div>
  );
}
