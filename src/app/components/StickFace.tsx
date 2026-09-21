/**
 * 一张签纸。揭晓、结果页和求签记录都用同一个组件，所以一支签在任何地方长得都一样。
 *
 * 版式照着老派的运势纸票：上面是牌记和纹章，中间一格大字等级，一格四字签名，
 * 下面一格直排的签诗与签意。等级只决定颜色（`data-tone`），不改变任何文字。
 *
 * small 版给求签记录用：同样的信息，压成一行，不排直排文字。
 */

import { stickText, type FortuneStick } from '../../shared/sticks';
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

export default function StickFace(props: { stick: FortuneStick; size?: 'large' | 'small' }) {
  const { stick } = props;
  const tone = LEVEL_TONE[stick.level];
  const text = stickText(stick, 'zh');

  if (props.size === 'small') {
    return (
      <div className="slip-mini" data-tone={tone.key}>
        <span className="slip-mini-no">第 {stick.no} 签</span>
        <span className="slip-mini-level">{stick.level}</span>
        <span className="slip-mini-title">{text.title}</span>
      </div>
    );
  }

  return (
    <article className="slip" data-tone={tone.key}>
      <header className="slip-head">
        <p className="slip-brand">问一签</p>
        <p className="slip-brand-sub">WEN YI QIAN · FORTUNE PRINTER</p>
        <Emblem />
      </header>

      <div className="slip-cell slip-cell-level">
        <span className="slip-rail">第 {stick.no} 签</span>
        <strong className="slip-level">{stick.level}</strong>
        <span className="slip-rail">之 签 运</span>
      </div>

      <div className="slip-cell slip-cell-title">
        <strong className="slip-title">{text.title}</strong>
      </div>

      <div className="slip-cell slip-cell-body">
        <div className="slip-vertical">
          <p className="slip-poem">{text.poem[0]}</p>
          <p className="slip-poem">{text.poem[1]}</p>
          <p className="slip-meaning">{text.meaning}</p>
          <p className="slip-lucky">幸运色：{tone.luckyColor.zh}</p>
        </div>
      </div>

      <footer className="slip-foot">问一签 · 签为参考，路要自己走</footer>
    </article>
  );
}
