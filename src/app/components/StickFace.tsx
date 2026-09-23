/**
 * 一张签纸。揭晓、结果页和求签记录都用同一个组件，所以一支签在任何地方长得都一样。
 *
 * 版式照日本神社的御神籤：朱紅雙線框、表頭「御神签」、等級是一顆朱紅大印、籤名、直排籤詩、吉色。
 * 框與印一律朱紅，四種籤運只留在印後的光暈與吉色色點上（`data-tone`），落印特效也跟著籤運。
 *
 * 印表機走紙時吐出的也是這一張（機身底下只露得出上半截，表頭與大紅印剛好在上半截）。
 *
 * small 版给求签记录用：同样的信息压成一张橫放的小籤 —— 朱紅籤頭寫籤號，旁邊是等級徽章與籤名。
 *
 * 语言是这张纸自己的，由问题推导、印出来就定死（src/shared/lang.ts），**不是**
 * 右上角那个界面开关。
 */

import type { Language } from '../../shared/lang';
import { LEVEL_LABEL, STICK_COUNT, stickText, type FortuneStick } from '../../shared/sticks';
import { LEVEL_TONE } from '../constants';
import { hanNumber } from '../../shared/numerals';

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
    // 左邊一條朱紅籤頭（中文直排「第五签」），右邊一顆吉色小徽章加籤名。
    // 外層是 display: contents —— 兩塊各自落進記錄卡的格線（styles.css 的 .history-summary）。
    return (
      <div className="slip-mini" data-tone={tone.key} data-lang={language}>
        <span className="slip-mini-tab">
          {en ? (
            <>
              <small>NO.</small>
              {stick.no}
            </>
          ) : (
            `第${hanNumber(stick.no)}签`
          )}
        </span>
        <span className="slip-mini-head">
          <span className="slip-mini-level">
            <span className="lucky-pip" aria-hidden="true" />
            {level}
          </span>
          <span className="slip-mini-title">{text.title}</span>
        </span>
      </div>
    );
  }

  // 三個字（上上签）的印要小一號才放得下
  const longLevel = [...level].length >= 3 || en;
  return (
    <article className="slip" data-tone={tone.key} data-lang={language}>
      <header className="slip-head">
        <span className="slip-head-band">{en ? 'OMIKUJI' : '御神签'}</span>
        <span className="slip-no">{en ? `NO. ${stick.no} OF ${STICK_COUNT}` : `第${hanNumber(stick.no)}签`}</span>
      </header>

      {/* 等級是一顆朱紅大印：落印動畫套在整顆印上 */}
      <div className="slip-seal-row">
        <div className={`slip-level-box${longLevel ? ' long' : ''}`}>
          <strong className="slip-level">{level}</strong>
        </div>
      </div>

      <div className="slip-title-row">
        <strong className="slip-title">{text.title}</strong>
      </div>

      <div className="slip-body">
        {language === 'zh' ? (
          <div className="slip-grid-columns">
            <p className="slip-column slip-poem">{text.poem[0]}</p>
            <p className="slip-column slip-poem">{text.poem[1]}</p>
            <p className="slip-column slip-meaning">{text.meaning}</p>
          </div>
        ) : (
          <div className="slip-western-poem">
            <p className="slip-poem">{text.poem[0]}</p>
            <p className="slip-poem">{text.poem[1]}</p>
            <p className="slip-meaning">{text.meaning}</p>
          </div>
        )}
      </div>

      <footer className="slip-foot">
        <span className="slip-lucky-badge">
          <span className="lucky-pip" aria-hidden="true" />
          <span className="slip-lucky">
            {en ? `Lucky tone · ${tone.luckyColor.en}` : `吉色 · ${tone.luckyColor.zh}`}
          </span>
        </span>
        <span className="slip-sakura" aria-hidden="true" />
      </footer>
    </article>
  );
}
