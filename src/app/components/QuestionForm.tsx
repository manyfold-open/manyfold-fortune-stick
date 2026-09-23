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

import { useState, type RefObject } from 'react';
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
  const field = props.inputRef;
  const length = [...props.value.trim()].length;
  const empty = props.value.length === 0;

  return (
    // 没有框，就把整块区域都做成可以落笔的地方：点哪里都开始写。
    <div className="ask" onClick={() => field.current?.focus()}>
      <div className="ask-zone">
        <EmaChrome>
          {/* 用 data-value 撑开高度：输入区自己长高，不需要 JS，也不会出现滚动条。 */}
          <div className="ask-grow" data-value={props.value}>
            <textarea
              className="ask-input"
              ref={field}
              value={props.value}
              onChange={(event) => props.onChange(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
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
