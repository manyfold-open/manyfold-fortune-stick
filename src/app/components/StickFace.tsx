/**
 * 一张签纸。揭晓、结果页和求签记录都用同一个组件，所以一支签在任何地方长得都一样。
 *
 * 版式照着老派的运势纸票：上面是牌记，中间一格大字等级，一格四字签名，下面
 * 一格直排的签诗与签意。等级只决定颜色（`data-tone`），不改变任何文字。
 *
 * 这张纸是照着「走纸时要整张露得出来」裁的：机身底下只有 260px 上下，原来的
 * 签有 530px，永远只能吐出一半。为此撤掉了三样纯装饰的东西 ——
 * 牌记下的菱形纹章（58px）、牌记下面那行 WEN YI QIAN 拉丁副标，以及页脚那句
 * 「签为参考，路要自己走」（它和整页页脚重复了一遍）。内容一个字没动。
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
      <header className="slip-head">
        <p className="slip-brand">问一签</p>
      </header>

      <div className="slip-cell slip-cell-level">
        <span className="slip-rail">{en ? `NO. ${stick.no}` : `第 ${stick.no} 签`}</span>
        <strong className="slip-level">{level}</strong>
        <span className="slip-rail">{en ? `OF ${STICK_COUNT}` : '之 签 运'}</span>
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

    </article>
  );
}
