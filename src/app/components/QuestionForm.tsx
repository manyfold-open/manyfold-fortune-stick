/**
 * 问题的输入。没有输入框 —— 字直接写在页面上。
 *
 * 但「没有框」不等于「看不出能写」：这里用两样东西说明这是落笔的地方 ——
 *  1. 四个角上的裁切线（.ask-zone），印刷品上圈定版心的老办法，不是一个框；
 *  2. 没写字又没聚焦时，占位文字后面跟着一根会闪的光标。
 * 一聚焦，这两样都让位给真正的光标，版面立刻干净。
 *
 * 这里不提交任何东西：写完之后按打印机上的键才开始（校验也在那一步，错在屏上说）。
 */

import { useRef, useState } from 'react';
import { QUESTION_MAX } from '../constants';
import { useT } from '../i18n';

export default function QuestionForm(props: {
  value: string;
  onChange: (value: string) => void;
  /** 写完直接回车，等同于按下机器上的键。 */
  onSubmit: () => void;
}) {
  const t = useT();
  // 例子跟着界面语言：它们是机器给的提示，不是已经印出来的纸。
  // 点了哪一句就等于用那种语言提问，这一局的语言也就跟着定了。
  const examples = [t('example1'), t('example2'), t('example3')];
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const length = [...props.value.trim()].length;
  const empty = props.value.length === 0;

  return (
    // 没有框，就把整块区域都做成可以落笔的地方：点哪里都开始写。
    <div className="ask" onClick={() => field.current?.focus()}>
      <div className="ask-zone">
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
      </div>

      {length > QUESTION_MAX - 20 && (
        <p className={`ask-counter${length > QUESTION_MAX ? ' over' : ''}`}>
          {length} / {QUESTION_MAX}
        </p>
      )}

      {empty && (
        <ul className="examples">
          {examples.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  props.onChange(example);
                  field.current?.focus();
                }}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
