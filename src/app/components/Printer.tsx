/**
 * 打印机：这台机器就是整个界面。
 *
 * 页面上唯一的实体控件是面板上那颗「印」键 —— 按一下开始打印。页面没有别的边框、
 * 没有输入框的框、没有按钮的框；机器自己就是按钮。
 *
 * 屏（LCD）是唯一说话的地方：当前这一步该做什么，都写在那里。所以调用方只要把
 * 状态和一行字交给它，界面上就不需要再多一行提示。
 *
 * 画法上有一条纪律：机身只用平涂加渐变，不用滤镜也不用阴影原语 —— 这样它在任何
 * 缩放下都是干净的，放到 560px 也不会糊。所有的「体积」来自明暗面：上盖最亮、
 * 前脸次之、凹槽最暗，左右两道渐变负责让它看起来是圆的。
 *
 * 屏和键是浮在 SVG 上的 HTML，位置按 viewBox 换算成百分比 —— 改了下面的几何，
 * styles.css 里 .lcd / .print-key 的四个百分比也要跟着改。
 */

import type { ReactNode } from 'react';
import { useT, useUiLanguage } from '../i18n';

export type PrinterState = 'idle' | 'ready' | 'printing';

/** 机身的散热格栅 */
const VENTS = [76, 82, 88, 94, 100];
/** 前脸上的四色标 */
const CHIPS = ['#e8007d', '#c3dd4e', '#28a9e0', '#f2cf3f'];

export default function Printer(props: {
  state: PrinterState;
  /** 屏上左边那截状态码，例如 READY / PRINT / E-02。 */
  code: string;
  /** 屏上右边那句话，就是这一步的说明。调用方已经按界面语言取好了。 */
  message: string;
  /** 屏的颜色：正常绿，提醒琥珀。 */
  alert?: boolean;
  /** 纸正在吐出来。 */
  feeding?: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  const language = useUiLanguage();
  const { state, code, message, alert = false, feeding = false } = props;

  return (
    <div className={`printer printer-${state}`}>
      <div className="printer-body">
        <svg viewBox="0 0 340 214" className="printer-svg" aria-hidden focusable="false">
          <defs>
            <linearGradient id="wy-deck" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--case-hi)" />
              <stop offset="70%" stopColor="var(--case)" />
              <stop offset="100%" stopColor="var(--case-lo)" />
            </linearGradient>
            <linearGradient id="wy-front" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--case)" />
              <stop offset="55%" stopColor="var(--case)" />
              <stop offset="100%" stopColor="var(--case-lo)" />
            </linearGradient>
            {/* 左右两道渐变负责体积：机身是个圆角的塑料盒子，不是一块平板。 */}
            <linearGradient id="wy-round" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--case-shadow)" stopOpacity="0.42" />
              <stop offset="9%" stopColor="var(--case-shadow)" stopOpacity="0" />
              <stop offset="88%" stopColor="var(--case-shadow)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--case-shadow)" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="wy-sheet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tray-paper)" />
              <stop offset="100%" stopColor="var(--tray-paper-lo)" />
            </linearGradient>
          </defs>

          {/* ── 进纸盘，两张纸支棱在上面 ── */}
          <g className="printer-tray">
            <path d="M132 13 H208 L214 44 H126 Z" fill="url(#wy-sheet)" />
            <path d="M141 20 H199 L204 44 H136 Z" fill="var(--tray-paper-lo)" opacity="0.7" />
            <path d="M132 13 H208 L214 44" fill="none" stroke="var(--case-shadow)" strokeOpacity="0.32" />
            <path d="M88 38 H252 L262 62 H78 Z" fill="var(--case-lo)" />
            <path d="M99 42 H241 L245 51 H95 Z" fill="var(--case-shadow)" opacity="0.42" />
            <path d="M78 62 H262 V66 H78 Z" fill="var(--case-shadow)" opacity="0.32" />
          </g>

          {/* ── 上盖 ── */}
          <path
            d="M32 60 H308 a12 12 0 0 1 12 12 V108 H20 V72 a12 12 0 0 1 12 -12 Z"
            fill="url(#wy-deck)"
          />
          <path
            d="M32 60 H308 a12 12 0 0 1 12 12 v1 H20 v-1 a12 12 0 0 1 12 -12 Z"
            fill="#fff"
            opacity="0.5"
          />
          <rect x="20" y="105" width="300" height="3" fill="var(--case-shadow)" opacity="0.38" />

          {/* 散热格栅 */}
          <g fill="var(--case-shadow)" opacity="0.34">
            {VENTS.map((y) => (
              <rect key={y} x="40" y={y} width="84" height="2.4" rx="1.2" />
            ))}
          </g>

          {/* 屏的凹槽（字是上面那层 HTML） */}
          <rect x="136" y="69" width="174" height="34" rx="5" fill="var(--case-shadow)" opacity="0.85" />
          <rect x="136" y="69" width="174" height="34" rx="5" fill="none" stroke="#000" strokeOpacity="0.16" />
          <rect x="142" y="74" width="162" height="24" rx="2" fill="var(--lcd-bg)" />
          <rect x="142" y="74" width="162" height="2" fill="#000" opacity="0.4" />

          {/* ── 机身 ── */}
          <path d="M20 108 H320 V194 a10 10 0 0 1 -10 10 H30 a10 10 0 0 1 -10 -10 Z" fill="url(#wy-front)" />
          {/* 塑料上的细纹，很淡，只在近看时有 */}
          <g fill="#fff" opacity="0.14">
            <rect x="20" y="112" width="300" height="1" />
            <rect x="20" y="158" width="300" height="1" />
          </g>

          {/* 面板：指示灯、丝印、副键、主键凹槽 */}
          <g className="printer-panel">
            <circle cx="44" cy="134" r="4.5" className="led led-power" />
            <circle cx="60" cy="134" r="4.5" className={`led led-busy${state === 'printing' ? ' on' : ''}`} />
            <text x="74" y="137" className="silk">POWER / BUSY</text>
            <circle cx="162" cy="134" r="10" fill="var(--case-shadow)" opacity="0.5" />
            <circle cx="162" cy="133" r="8" fill="var(--case-hi)" />
            <circle cx="162" cy="133" r="8" fill="none" stroke="var(--case-shadow)" strokeOpacity="0.5" />
            <rect x="186" y="114" width="122" height="42" rx="11" fill="var(--case-shadow)" opacity="0.5" />
          </g>

          {/* ── 前脸：色标、铭牌、型号 ── */}
          <g className="printer-face">
            <rect x="36" y="160" width="268" height="34" rx="3" fill="var(--case-lo)" opacity="0.55" />
            <rect x="36" y="160" width="268" height="1" fill="#fff" opacity="0.35" />
            {CHIPS.map((color, index) => (
              <rect key={color} x={48 + index * 13} y={168} width="11" height="13" fill={color} />
            ))}
            <text x="110" y="174" className="plate">问一签</text>
            <text x="110" y="185" className="silk">FORTUNE PRINTER</text>
            <text x="292" y="174" className="silk" textAnchor="end">MODEL WY-36</text>
            <text x="292" y="185" className="silk" textAnchor="end">MADE IN CHINA</text>
          </g>

          {/* ── 出纸口：一道往外探的唇口，纸从这里下来 ── */}
          <path d="M50 192 H290 L296 202 H44 Z" fill="var(--case-hi)" />
          <path d="M50 192 H290 L296 202" fill="none" stroke="var(--case-shadow)" strokeOpacity="0.4" />
          <rect x="56" y="194" width="228" height="7" rx="3" fill="var(--slot)" opacity="0.9" />
          <rect x="60" y="194" width="220" height="2" rx="1" fill="#000" opacity="0.22" />
          <rect x="52" y="202" width="34" height="6" rx="3" fill="var(--case-shadow)" opacity="0.8" />
          <rect x="254" y="202" width="34" height="6" rx="3" fill="var(--case-shadow)" opacity="0.8" />

          {/* 体积：压在所有东西上面的左右暗部 */}
          <path
            d="M20 60 H320 V194 a10 10 0 0 1 -10 10 H30 a10 10 0 0 1 -10 -10 Z"
            fill="url(#wy-round)"
            pointerEvents="none"
          />
        </svg>

        {/* 屏：这一步的说明只写在这里 */}
        <div className={`lcd${alert ? ' alert' : ''}`}>
          <span className="lcd-code">{code}</span>
          <span className="lcd-text" role="status" aria-live="polite">
            {message}
          </span>
          {state === 'ready' && <span className="lcd-caret" aria-hidden />}
        </div>

        {/* 面板上那颗键 —— 页面上唯一的实体控件 */}
        <button
          type="button"
          className="print-key"
          onClick={props.onPress}
          disabled={state === 'printing'}
          aria-label={state === 'printing' ? t('printKeyBusy') : t('printKeyIdle')}
          data-lang={language}
        >
          <span className="print-key-cap">{t('printKeyCap')}</span>
        </button>
      </div>

      <div className={`printer-out${feeding ? ' feeding' : ''}`}>{props.children}</div>
    </div>
  );
}
