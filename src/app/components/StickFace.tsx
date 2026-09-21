/**
 * 一张签纸。揭晓、结果页和求签记录都用同一个组件，所以一支签在任何地方长得都一样。
 *
 * 版式照着老派的运势纸票：上面是牌记与朱砂神印，中间一格金石大字等级，一格古籍四字签名，
 * 下面一格正统「朱丝栏」直排签诗与签意。等级决定色彩（`data-tone`）与落印特效。
 *
 * 这张纸是照着「走纸时要整张露得出来」裁的：机身底下只有 260px 上下，原来的
 * 签有 530px，永远只能吐出一半。保持整体高度紧凑的同时，赋予手工棉纸与雕版文武框质感。
 *
 * small 版给求签记录用：同样的信息，压成一行，不排直排文字。
 *
 * 语言是这张纸自己的，由问题推导、印出来就定死（src/shared/lang.ts），**不是**
 * 右上角那个界面开关。
 */

import type { Language } from '../../shared/lang';
import { LEVEL_LABEL, STICK_COUNT, stickText, type FortuneStick } from '../../shared/sticks';
import { LEVEL_TONE } from '../constants';

export default function StickFace(props: {
  stick: FortuneStick;
  /** 这一局的语言 —— 由问题推导，不是界面开关。 */
  language: Language;
  size?: 'large' | 'small';
}) {
  const { stick, language } = props;
  const tone = LEVEL_TONE[stick.level];
  const text = stickText(stick, language);
  const level = LEVEL_LABEL[language][stick.level];
  const en = language === 'en';

  if (props.size === 'small') {
    return (
      <div className="slip-mini" data-tone={tone.key} data-lang={language}>
        <span className="slip-mini-no">{en ? `NO. ${stick.no}` : `第 ${stick.no} 签`}</span>
        <span className="slip-mini-level">{level}</span>
        <span className="slip-mini-title">{text.title}</span>
      </div>
    );
  }

  return (
    <article className="slip" data-tone={tone.key} data-lang={language}>
      {/* 签纸古典回纹角饰 */}
      <div className="slip-corner tc-left" aria-hidden="true" />
      <div className="slip-corner tc-right" aria-hidden="true" />
      <div className="slip-corner bc-left" aria-hidden="true" />
      <div className="slip-corner bc-right" aria-hidden="true" />

      {/* 等级印章核心格：金石印泥质感 + 专属四阶光晕 */}
      <div className="slip-cell slip-cell-level">
        <span className="slip-rail">{en ? `NO. ${stick.no}` : `第 ${stick.no} 签`}</span>
        <div className="slip-level-box">
          <strong className="slip-level">{level}</strong>
          <div className="level-stamp-aura" aria-hidden="true" />
        </div>
        <span className="slip-rail">{en ? `OF ${STICK_COUNT}` : '之 签 运'}</span>
      </div>

      {/* 签名：中文用传统角括弧，英文用精致星芒 */}
      <div className="slip-cell slip-cell-title">
        <div className="slip-title-row">
          <span className="slip-title-flourish" aria-hidden="true">{en ? '✦' : '「'}</span>
          <strong className="slip-title">{text.title}</strong>
          <span className="slip-title-flourish" aria-hidden="true">{en ? '✦' : '」'}</span>
        </div>
      </div>

      {/* 签诗区：中文正统「朱丝栏」直排，英文西式古典活字印刷排版 */}
      <div className="slip-cell slip-cell-body">
        <div className="slip-vertical">
          {language === 'zh' ? (
            <div className="slip-grid-columns">
              <div className="slip-column slip-col-poem">
                <p className="slip-poem">{text.poem[0]}</p>
              </div>
              <div className="slip-column slip-col-poem">
                <p className="slip-poem">{text.poem[1]}</p>
              </div>
              <div className="slip-column slip-col-meaning">
                <p className="slip-meaning">{text.meaning}</p>
              </div>
            </div>
          ) : (
            <div className="slip-western-poem">
              <div className="slip-poem-lines">
                <p className="slip-poem">{text.poem[0]}</p>
                <p className="slip-poem">{text.poem[1]}</p>
              </div>
              <p className="slip-meaning">{text.meaning}</p>
            </div>
          )}

          <div className="slip-lucky-badge">
            <span className="lucky-pip" aria-hidden="true" />
            <p className="slip-lucky">
              {en ? `Lucky tone · ${tone.luckyColor.en}` : `吉色 · ${tone.luckyColor.zh}`}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
