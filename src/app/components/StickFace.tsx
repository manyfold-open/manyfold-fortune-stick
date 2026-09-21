/**
 * 一张签纸。揭晓、结果页和求签记录都用同一个组件，所以一支签在任何地方长得都一样。
 *
 * 版式照着老派的运势纸票：上面是牌记和纹章，中间一格大字等级，一格四字签名，
 * 下面一格直排的签诗与签意。等级只决定颜色（`data-tone`），不改变任何文字。
 *
 * small 版给求签记录用：同样的信息，压成一行，不排直排文字。
 *
 * 语言是这张纸自己的，由问题推导、印出来就定死（src/shared/lang.ts），**不是**
 * 右上角那个界面开关。所以 language 是必填的 prop —— 每个调用方都得想清楚自己
 * 手上这张纸是哪种语言，没有一条路径能不小心继续印中文。
 *
 * 中文直排、英文横排，分界写在 styles.css 的 `.slip[data-lang]` 上：七言两句竖着
 * 读是对的，一句英文竖着读不是。牌记那行「问一签」两种语言都留着 —— 那是机器的
 * 厂牌，不是文案。
 */

import type { Language } from '../../shared/lang';
import { LEVEL_LABEL, stickText, type FortuneStick } from '../../shared/sticks';
import { LEVEL_TONE } from '../constants';

function Emblem() {
  return (
    <svg className="slip-emblem" viewBox="0 0 64 64" aria-hidden focusable="false">
      <path d="M32 2 62 32 32 62 2 32Z" className="slip-emblem-field" />
      <path d="M32 9 55 32 32 55 9 32Z" className="slip-emblem-line" />
      <path d="M32 16 48 32 32 48 16 32Z" className="slip-emblem-line" />
      <rect x="24" y="24" width="16" height="16" rx="2" className="slip-emblem-core" />
      <path d="M32 0 32 12M32 52 32 64M0 32 12 32M52 32 64 32" className="slip-emblem-ray" />
    </svg>
  );
}

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
      <header className="slip-head">
        <p className="slip-brand">问一签</p>
        <p className="slip-brand-sub">WEN YI QIAN · FORTUNE PRINTER</p>
        <Emblem />
      </header>

      <div className="slip-cell slip-cell-level">
        <span className="slip-rail">{en ? `NO. ${stick.no}` : `第 ${stick.no} 签`}</span>
        <strong className="slip-level">{level}</strong>
        <span className="slip-rail">{en ? 'FORTUNE' : '之 签 运'}</span>
      </div>

      <div className="slip-cell slip-cell-title">
        <strong className="slip-title">{text.title}</strong>
      </div>

      <div className="slip-cell slip-cell-body">
        <div className="slip-vertical">
          <p className="slip-poem">{text.poem[0]}</p>
          <p className="slip-poem">{text.poem[1]}</p>
          <p className="slip-meaning">{text.meaning}</p>
          <p className="slip-lucky">
            {en ? `Lucky colour: ${tone.luckyColor.en}` : `幸运色：${tone.luckyColor.zh}`}
          </p>
        </div>
      </div>

      <footer className="slip-foot">
        {en ? 'FORTUNE PRINTER · A REFERENCE, NOT A ROUTE' : '问一签 · 签为参考，路要自己走'}
      </footer>
    </article>
  );
}
