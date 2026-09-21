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
 * 缩放下都是干净的，放到 560px 也不会糊。
 *
 * ## 它凭什么看起来是个立体的东西
 *
 * **因为画得出顶面。** 这一版和之前所有版本最根本的区别在这里：机器不再是一张
 * 正面投影。视点略高于机器，所以顶面是一块往后收的梯形（`TOP`），正面接在它
 * 下面（`FRONT`）。一个盒子只要看得见两个朝向不同的面，它就立起来了 —— 反过来，
 * 只画正面的话，再多的高光和渐变也救不回来，那是上一版最后卡住的地方。
 *
 * 顺着这条，其余三条规矩：
 *
 *  1. **光从左上方来，顶面最亮。** 顶面正对光源，所以它是全机最亮的一块；正面
 *     是立起来的，暗一档；凹槽最暗。两个面交界的那道棱要压一条很亮的白 ——
 *     那道棱是「这里转了个方向」的唯一证据，省掉它顶面就贴回正面上了。
 *  2. **接缝是凹槽，不是线。** 一条暗 + 紧跟着一条亮 = 一道缝；单独一条半透明
 *     的带子只会看起来像脏了。上下盖、面板、键坑、格栅都用这一对。
 *  3. **亮暗只用黑白叠，不引入新颜色。** `#fff` / `#000` 压在 `--case*` 上面，
 *     深色模式换的是底下那层色，明暗关系自己跟着走，不用维护第二套配色。
 *
 * ## 影子在 SVG 里，不在 CSS 里
 *
 * 投影是下面第一个画的那个椭圆，**不是** `.printer-body` 上的 filter。用
 * `drop-shadow()` 描的是整条轮廓线，圆角处会糊出一圈贴边的黑边 —— 那不是投影，
 * 那是描边。地上的影子有自己的形状和方向，就得自己画。
 *
 * ## 改几何的话
 *
 * 屏和键是浮在 SVG 上的 HTML，位置按 viewBox 换算成百分比。这一版的 viewBox 是
 * 348×214，屏 155,91,154,24，键 198,135,116,32 —— 动了下面任何一个数，
 * styles.css 里 .lcd / .print-key 的四个百分比都要重算。
 *
 * viewBox 的下边界（214）只比机身底（212）低 2 —— 贴着切的。出纸口到 SVG 底之间
 * 每多留一点空，纸就从离出纸口那么远的地方冒出来，看着是两个物件而不是一卷纸。
 * 投影因此画到了框外，靠 styles.css 里 .printer-svg 的 overflow: visible 露出来；
 * 框外的东西不占布局，所以它撑不开下面那张纸。
 */

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useT, useUiLanguage } from '../i18n';

export type PrinterState = 'idle' | 'ready' | 'printing';

/** 机身的散热格栅 */
const VENTS = [91, 97, 103, 109, 115];
/** 前脸上的四色标 */
const CHIPS = ['#e8007d', '#c3dd4e', '#28a9e0', '#f2cf3f'];

/** 顶面：往后收的一块梯形。它和正面共用 y=80 那条前棱。 */
const TOP =
  'M78 46 H270 Q278 46 282 49 L320 77 Q326 80 318 80 H30 Q22 80 28 77 L66 49 Q70 46 78 46 Z';
/** 正面：立起来的那一面，底下两个角是圆的。 */
const FRONT = 'M24 80 H324 V196 a16 16 0 0 1 -16 16 H40 a16 16 0 0 1 -16 -16 Z';

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
  const frame = useRef<HTMLDivElement | null>(null);
  const out = useRef<HTMLDivElement | null>(null);

  /**
   * 走纸要走完整张签，所以得知道这张签到底多高 —— 它随语言、字体、视口宽度变，
   * 写不死。签就挂在出纸窗口里（窗口 height:0 + overflow:hidden，但孩子自己
   * 的高度是量得到的），量到的值写进 --feed-h。
   *
   * 量一次不够。第一帧量到的是**网页字体还没换上**时的高度，Noto Serif SC 一
   * 载完文字重排，签会长高几十像素 —— 变量还停在旧值，窗口就短一截，签的尾巴
   * 又被切掉（矮屏上实测过 516 对 558）。所以挂 ResizeObserver 一直跟着。
   *
   * --feed-max 是另一半。机器钉住不动，机身底下就那么点地方，签一定放不下；
   * 而窗口是绝对定位的 —— 绝对定位照样把文档撑高，走纸时整页会多出一根滚动条，
   * 画面横着抖一下。所以给它封顶，让切口落到看不见的地方。
   *
   * 量的是到 **.shell 底**的距离，不是到视口下缘：
   *  - 视口下缘在矮屏上会量出很小的值（620px 高时只剩 98px，比原来写死的 236
   *    还短，签露出来的更少）—— 因为那时候整页本来就已经能滚了；
   *  - .shell 有 min-height:100dvh，页面能滚时它就是整页那么高，所以它的底
   *    永远在视口下缘或更低，切口一定在屏幕外；
   *  - 而且它的高度不受这张纸影响（纸是绝对定位的），不会量一次涨一次。
   *
   * useLayoutEffect 而不是 useEffect：变量要赶在浏览器绘制这一帧之前就位，
   * 晚一帧的话过渡会从 0 直接跳到终值，那 1.9 秒就没了。
   */
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const window_ = node.ownerDocument.defaultView;
    const box = out.current;
    const sheet = box?.firstElementChild;
    if (!feeding || !box || !sheet || !window_) {
      node.style.removeProperty('--feed-h');
      node.style.removeProperty('--feed-max');
      return;
    }
    const shell = node.closest('.shell');
    const apply = () => {
      node.style.setProperty('--feed-h', `${Math.ceil(sheet.getBoundingClientRect().height)}px`);
      const floor = shell ? shell.getBoundingClientRect().bottom : window_.innerHeight;
      const top = box.getBoundingClientRect().top;
      node.style.setProperty('--feed-max', `${Math.max(0, Math.ceil(floor - top))}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(sheet);
    window_.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window_.removeEventListener('resize', apply);
    };
  }, [feeding]);

  return (
    <div className={`printer printer-${state}`} ref={frame}>
      <div className="printer-body">
        <svg viewBox="0 0 348 214" className="printer-svg" aria-hidden focusable="false">
          <defs>
            {/* 顶面：正对光源，全机最亮的一块。
                但它不能提到发白 —— 托盘里的纸就压在这块面上，纸是冷白的、
                机身是暖奶油的，两者一旦都接近纯白，纸就从机器上消失了。
                顶面比正面亮一档就够，剩下的交给那道前棱。 */}
            <linearGradient id="wy-top" x1="0.2" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.26" />
              <stop offset="48%" stopColor="#fff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            {/* 正面：立起来的面，所以整条都要比顶面暗一档 —— 起手就是 --case，
                不是 --case-hi。两个面用同一个明度起头的话，前棱那条白线一撤，
                顶面立刻贴回正面上，白画了。最后一档回亮是地面的反光。 */}
            <linearGradient id="wy-front" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--case)" />
              <stop offset="58%" stopColor="var(--case)" />
              <stop offset="92%" stopColor="var(--case-lo)" />
              <stop offset="100%" stopColor="var(--case)" />
            </linearGradient>
            {/* 左右两道暗边：机身是个圆角的盒子，不是一块平板 */}
            <linearGradient id="wy-round" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--case-shadow)" stopOpacity="0.3" />
              <stop offset="7%" stopColor="var(--case-shadow)" stopOpacity="0" />
              <stop offset="90%" stopColor="var(--case-shadow)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--case-shadow)" stopOpacity="0.36" />
            </linearGradient>
            {/* 一大片光斜着扫过正面。上下方向的渐变只交代得了「上亮下暗」，
                大块平面还是平的 —— 让光斜着走，面才有朝向。 */}
            <linearGradient id="wy-sheen" x1="0.06" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.2" />
              <stop offset="38%" stopColor="#fff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="wy-sheet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tray-paper)" />
              <stop offset="100%" stopColor="var(--tray-paper-lo)" />
            </linearGradient>
            <linearGradient id="wy-tray" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--case)" />
              <stop offset="100%" stopColor="var(--case-lo)" />
            </linearGradient>
            {/* 一块东西压在另一块上面，接触的地方要暗下去（环境光遮蔽）。 */}
            <linearGradient id="wy-ao" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </linearGradient>
            {/* 地上的影子：光在左上，所以影子往右下偏一点。
                核心那一档要够重 —— 影子淡了，机器就是浮在底色上的一张图。 */}
            <radialGradient id="wy-cast" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000" stopOpacity="0.46" />
              <stop offset="42%" stopColor="#000" stopOpacity="0.3" />
              <stop offset="74%" stopColor="#000" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            {/* 屏的玻璃：顶上压一道暗，磷光才像沉在玻璃下面 */}
            <linearGradient id="wy-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
              <stop offset="26%" stopColor="#000" stopOpacity="0" />
              <stop offset="88%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.05" />
            </linearGradient>
            {/* 屏框的金属圈：亮—暗—亮地跳一遍，才像一圈车出来的金属，
                而不是一道描边。全机只有这一处是金属，它负责把档次拉起来。 */}
            <linearGradient id="wy-metal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.72" />
              <stop offset="24%" stopColor="#fff" stopOpacity="0.1" />
              <stop offset="52%" stopColor="#000" stopOpacity="0.2" />
              <stop offset="80%" stopColor="#fff" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.6" />
            </linearGradient>
            {/* 灯珠：树脂封装的那点透明感，中间亮、边上收掉 */}
            <radialGradient id="wy-lens" cx="34%" cy="28%" r="74%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.8" />
              <stop offset="48%" stopColor="#fff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
            </radialGradient>
            {/* 旋钮：左上接光，右下压暗 */}
            <linearGradient id="wy-knob" x1="0.15" y1="0" x2="0.75" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="52%" stopColor="#fff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* ── 地上的影子。第一个画，所以什么都压得住。
                两层：散开的那层比机身宽，从两侧溢出来，交代它离地多远；贴边的
                那层窄而重，压在机身底下，交代它确实落在地上。只画一层的话，
                机身会把它整个盖住，底下只剩一丝，等于没画。
                两个都钉在机身自己的中心（174）上。影子是整台机器里面积最大的
                一块暗，它偏 4 个单位，人眼看到的重心就跟着偏 —— 页面上所有东西
                都对齐在正中，唯独看起来是歪的，源头在这。 ── */}
          <ellipse cx="175" cy="210" rx="154" ry="11" fill="url(#wy-cast)" />
          <ellipse cx="175" cy="211" rx="122" ry="5.5" fill="url(#wy-cast)" opacity="0.75" />

          {/* ── 进纸盘：纸立在顶面上的一只托盘里 ── */}
          <g className="printer-tray">
            {/* 三张纸的边缘错开，才读得出是一叠。都走同一道渐变 ——
                最上面一张给纯白的话，整叠会在机身上烧出一块。 */}
            <path d="M120 10 H228 L236 54 H112 Z" fill="var(--tray-paper-lo)" />
            <path d="M124 13 H224 L232 54 H116 Z" fill="url(#wy-sheet)" />
            <path d="M128 16 H220 L228 54 H120 Z" fill="url(#wy-sheet)" />
            <path d="M124 13 H224 M128 16 H220" fill="none" stroke="var(--case-shadow)" strokeOpacity="0.3" />

            {/* 托盘：它躺在顶面上，所以往前是张开的，张开的斜度和顶面一致 */}
            <path d="M110 54 H238 L262 72 H86 Z" fill="url(#wy-tray)" />
            <path d="M110 54 H238" fill="none" stroke="#fff" strokeOpacity="0.4" />
            {/* 纸插进去的那道槽 */}
            <path d="M118 57 H230 L244 68 H104 Z" fill="var(--case-shadow)" opacity="0.32" />
            <rect x="104" y="57" width="140" height="11" fill="url(#wy-ao)" opacity="0.5" />
            <path d="M104 68 H244" fill="none" stroke="#fff" strokeOpacity="0.22" />
          </g>

          {/* ── 顶面 ── */}
          <path d={TOP} fill="var(--case-hi)" />
          <path d={TOP} fill="url(#wy-top)" />
          {/* 托盘压在顶面上的那团暗 */}
          <rect x="86" y="62" width="176" height="10" fill="url(#wy-ao)" opacity="0.3" />

          {/* ── 正面 ── */}
          <path d={FRONT} fill="url(#wy-front)" />
          <path d={FRONT} fill="url(#wy-sheen)" />

          {/* 顶面与正面之间那道棱 —— 全机最重要的一条线。
              它是「这里转了个方向」的唯一证据，省掉顶面就贴回正面上了。 */}
          <rect x="24" y="79" width="300" height="2.6" fill="#fff" opacity="0.8" />
          {/* 棱下面紧跟一道暗：正面从棱上卷下去，那一小段接不到光。
              这道暗只是交代那个卷边，浅浅一层就够 —— 再厚就成了横在机身上的
              一条黑带子，那是多出来的影子，不是形。 */}
          <rect x="24" y="81.6" width="300" height="5.5" fill="url(#wy-ao)" opacity="0.3" />

          {/* 散热格栅：坐在一块浅凹面里，每条槽下缘接一条光 */}
          <rect x="38" y="86" width="100" height="34" rx="4" fill="var(--case-shadow)" opacity="0.12" />
          <rect x="38" y="86" width="100" height="1" rx="0.5" fill="#000" opacity="0.14" />
          <rect x="38" y="119" width="100" height="1" rx="0.5" fill="#fff" opacity="0.4" />
          {VENTS.map((y) => (
            <g key={y}>
              <rect x="44" y={y} width="88" height="2.6" rx="1.3" fill="var(--case-shadow)" opacity="0.52" />
              <rect x="44" y={y + 2.6} width="88" height="0.9" rx="0.45" fill="#fff" opacity="0.46" />
            </g>
          ))}

          {/* 屏：一圈金属，框里是凹下去的玻璃。字是上面那层 HTML */}
          <rect x="150" y="86" width="164" height="34" rx="6" fill="var(--case-lo)" />
          <rect x="151.2" y="87.2" width="161.6" height="31.6" rx="5" fill="none"
                stroke="url(#wy-metal)" strokeWidth="2.4" />
          <rect x="155" y="91" width="154" height="24" rx="2" fill="var(--lcd-bg)" />
          <rect x="155" y="91" width="154" height="24" rx="2" fill="url(#wy-glass)" />
          {/* 玻璃上斜着掠过的两道反光 —— 很淡，只有在亮处才看得见 */}
          <path d="M155 91 H185 L163 115 H155 Z" fill="#fff" opacity="0.05" />
          <path d="M195 91 H204 L182 115 H173 Z" fill="#fff" opacity="0.032" />

          {/* 上下盖的接缝：一暗一亮，才是一道缝而不是一条脏带子 */}
          <rect x="24" y="126" width="300" height="1.8" fill="var(--case-shadow)" opacity="0.85" />
          <rect x="24" y="127.8" width="300" height="1.4" fill="#fff" opacity="0.48" />

          {/* 面板：指示灯、丝印、副键、主键凹槽 */}
          <g className="printer-panel">
            {/* 灯：灯座 → 灯珠 → 树脂的透明感 → 一点镜面高光 */}
            <circle cx="46" cy="149" r="6.2" fill="var(--case-shadow)" opacity="0.45" />
            <circle cx="46" cy="149" r="4.6" className="led led-power" />
            <circle cx="46" cy="149" r="4.6" fill="url(#wy-lens)" />
            <circle cx="44.5" cy="147.3" r="1.25" fill="#fff" opacity="0.85" />
            <circle cx="64" cy="149" r="6.2" fill="var(--case-shadow)" opacity="0.45" />
            <circle cx="64" cy="149" r="4.6" className={`led led-busy${state === 'printing' ? ' on' : ''}`} />
            <circle cx="64" cy="149" r="4.6" fill="url(#wy-lens)" />
            <circle cx="62.5" cy="147.3" r="1.25" fill="#fff" opacity="0.7" />

            {/* 四色标。它原先挂在下面那条铭牌带上 —— 丝印撤掉之后那条带子空了，
                四块颜色浮在一片空壳中间，没有东西把它们固定住。挪进面板这一排
                （正好是 POWER / BUSY 丝印腾出来的位置），和灯、旋钮、键排成一列，
                它们才是面板上的一个零件，不是一块补丁。
                印上去的，不是贴上去的：上缘接一线光，下缘压一线暗。 */}
            {CHIPS.map((color, index) => (
              <g key={color}>
                <rect x={92 + index * 13} y={143} width="11" height="13" fill={color} />
                <rect x={92 + index * 13} y={143} width="11" height="0.9" fill="#fff" opacity="0.32" />
                <rect x={92 + index * 13} y={155.1} width="11" height="0.9" fill="#000" opacity="0.18" />
              </g>
            ))}

            {/* 副键：一颗旋钮，带一道刻度 */}
            <circle cx="168" cy="150.5" r="10.5" fill="var(--case-shadow)" opacity="0.45" />
            <circle cx="168" cy="149" r="9" fill="var(--case-hi)" />
            <circle cx="168" cy="149" r="9" fill="url(#wy-knob)" />
            <circle cx="168" cy="149" r="9" fill="none" stroke="var(--case-shadow)" strokeOpacity="0.55" />
            <rect x="167.2" y="141.6" width="1.6" height="4.6" rx="0.8" fill="var(--case-shadow)" opacity="0.75" />

            {/* 主键的坑：只有一块暗，上下都不压倒角。
                坑只比键大 4 个单位。在这么窄的缝里，不管压暗线还是压亮线，出来
                的都不是凹槽的边 —— 是一条浮在键上方／下方的独立线条。键凸起来
                这件事已经由它自己的 box-shadow（styles.css .print-key）交代完了，
                坑只要是一块暗就够。 */}
            <rect x="194" y="131" width="124" height="40" rx="11" fill="var(--case-shadow)" opacity="0.38" />
          </g>

          {/* ── 出纸口：一道缝，外面一圈凹边 ──
              **一个口子只该有一块暗。** 凹面只比缝大一圈（上 3 下 2），它是缝的
              边，不是缝上面另外压的一层。之前这里除了凹面还在缝的正上方加了一条
              9 个单位高的檐影，于是看到的是「一条灰带 + 一条黑缝」两层影子 ——
              一层交代不清楚的话，加第二层只会更糟。
              缝的位置不能往上挪：它离 SVG 下边界越远，纸就从离出纸口越远的地方
              冒出来（见文件顶上那段）。 */}
          <rect x="54" y="197" width="240" height="13" rx="3" fill="var(--case-shadow)" opacity="0.3" />

          {/* 缝：整条只有一道从上往下散掉的暗，不放任何硬线 ——
              腔里的一条亮线在这个尺寸上读出来是刮痕，不是胶辊。 */}
          <rect x="58" y="200" width="232" height="8" rx="2" fill="var(--slot)" />
          <rect x="58" y="200" width="232" height="8" rx="2" fill="url(#wy-ao)" opacity="0.9" />

          {/* 凹面底下不再压亮线：缝已经黑到自己收得住口，再描一条白的，
              机身底部就多一条和形无关的线。 */}
          {/* 没有脚。从这个视点看过去，脚本来就藏在机身底下 —— 画出来只会
              在机器底下多两块灰疙瘩。机器落地这件事交给上面那团投影。 */}

          {/* 体积：压在所有东西上面的左右暗部。顶面也算进去，
              不然顶面的两头会翘起来不跟着机身转。 */}
          <path d={TOP} fill="url(#wy-round)" pointerEvents="none" />
          <path d={FRONT} fill="url(#wy-round)" pointerEvents="none" />
        </svg>

        {/* 屏：这一步的说明只写在这里。
            两个 key 是用来**重挂**元素的 —— CSS 动画只在挂载时跑一次，不加 key
            的话 React 会复用同一个节点，换了句话屏也不会重新打字。
            key 落在里层的 .lcd-typed 上，不在 .lcd-text 上：后者是 aria-live
            区域，重挂它会让读屏漏播或重播。 */}
        <div className={`lcd${alert ? ' alert' : ''}`}>
          <span className="lcd-code" key={code}>
            {code}
          </span>
          <span className="lcd-text" role="status" aria-live="polite">
            <span className="lcd-typed" key={message}>
              {message}
            </span>
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

      <div className={`printer-out${feeding ? ' feeding' : ''}`} ref={out}>
        {props.children}
      </div>
    </div>
  );
}
