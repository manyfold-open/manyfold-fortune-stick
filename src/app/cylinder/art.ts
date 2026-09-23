/**
 * 籤筒的插畫 —— 從使用者給的整張 SVG（docs/superpowers/assets/kawaii_omikuji_fortune_container.svg）拆出來。
 *
 * 那張是平面的整幅畫：筒身、五支透視的籤、籤頭、吉祥物全畫在一起，不能直接包到 3D 模型上。
 * 這裡只留模型上「印」得到的圖案，拆成三種貼圖要用的零件：
 *   - 杯身正面：GOOD LUCK、點線與蝴蝶結、上上籤、兩側四字、梅花與星、抱著梅花的吉祥物
 *   - 籤身：迷你梅花、小星、點、五種小圖（梅花、笑臉花、富士山、鳥居、達摩）
 *   - 籤頭：奶油圓盤、雙圈、「籤」
 * 筒身、杯口、籤的形狀和光影由 3D 模型負責，不從 SVG 拿；籤上的字（御神籤、第 N 籤、GOOD LUCK）
 * 由 materials.ts 用 canvas 寫 —— 抽出來那支要當場印號碼，不能等一張圖載入。
 *
 * SVG 當成 <img> 畫進 canvas：只用得到系統字型（跟 canvas 自己寫字一樣），所以字型清單照原檔。
 */

/** 原檔 <defs> 裡用得到的：漸層、字型、梅花、小星、迷你梅花 */
const DEFS = `
  <defs>
    <linearGradient id="medallion" x1="0" x2="0.8" y1="0" y2="1">
      <stop offset="0" stop-color="#fff9e7"/>
      <stop offset="0.7" stop-color="#f7e6c6"/>
      <stop offset="1" stop-color="#e8c79e"/>
    </linearGradient>
    <linearGradient id="red" x1="0" x2="0.8" y1="0" y2="1">
      <stop offset="0" stop-color="#f1745c"/>
      <stop offset="1" stop-color="#cf4537"/>
    </linearGradient>
    <style>
      .outline { stroke:#59382a; stroke-linejoin:round; stroke-linecap:round; }
      .ink { fill:#58382a; }
      .cn { font-family:'Hiragino Sans GB','Noto Sans CJK SC','Microsoft YaHei',sans-serif; font-weight:800; }
      .latin { font-family:'Arial Rounded MT Bold','Avenir Next',Arial,sans-serif; font-weight:800; }
    </style>
    <g id="plum">
      <g fill="url(#red)" stroke="#c94b3d" stroke-width="1.5" class="outline">
        <ellipse cx="0" cy="-9" rx="7" ry="10"/>
        <ellipse cx="8.6" cy="-2.8" rx="7" ry="10" transform="rotate(72 8.6 -2.8)"/>
        <ellipse cx="5.3" cy="7.3" rx="7" ry="10" transform="rotate(144 5.3 7.3)"/>
        <ellipse cx="-5.3" cy="7.3" rx="7" ry="10" transform="rotate(216 -5.3 7.3)"/>
        <ellipse cx="-8.6" cy="-2.8" rx="7" ry="10" transform="rotate(288 -8.6 -2.8)"/>
      </g>
      <circle r="3.5" fill="#fff0d4"/>
      <circle cx="-1" cy="-1" r="1" fill="#b73f32"/>
      <circle cx="2" cy="1" r="1" fill="#b73f32"/>
    </g>
    <g id="littleStar" fill="#68432f">
      <path d="M0-6.3 1.8-1.8 6.3 0 1.8 1.8 0 6.3-1.8 1.8-6.3 0-1.8-1.8Z"/>
    </g>
    <g id="miniPlum">
      <g fill="#e96a53" stroke="#613c2d" stroke-width="1.5" class="outline">
        <circle cy="-5" r="4.4"/><circle cx="4.8" cy="-1.5" r="4.4"/><circle cx="3" cy="4" r="4.4"/><circle cx="-3" cy="4" r="4.4"/><circle cx="-4.8" cy="-1.5" r="4.4"/>
      </g><circle r="1.9" fill="#fff2d8"/>
    </g>
  </defs>`;

const svg = (viewBox: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}">${DEFS}${body}</svg>`;

/* ── 杯身正面 ──
 * 原檔筒身 x 73～457、杯口領子下緣 y 484、筒底 y 1020；圖案置中在 x 265。
 * CUP_FACE 是從原檔座標裁出來的那一框：寬 433 × 高 536，比例等於 3D 杯身正面那一片
 * （711 × 杯高 86% 的像素），貼上去一個單位在兩邊都是正方形，圖案不會被拉扁。
 */
export const CUP_FACE = { x: 265 - 433 / 2, y: 484, w: 433, h: 536 };

/**
 * 杯身正面照原檔排，只改兩處：原檔的筒是瘦高的（寬:高 ≈ 0.72），3D 杯身胖很多（≈ 0.97，使用者要的
 * 「更胖更寬」），圖案照高度縮進來以後兩側空一大塊、字也顯得小。所以
 *   - 兩側那一排（四字、梅花、小星、點線）各往外推 SIDE 個單位
 *   - GOOD LUCK、上上籤、兩側四字放大一點（38→46、50→58、25→28）
 * 中間的蝴蝶結與吉祥物不動。
 */
const SIDE = 45;

const CUP_FACE_BODY = `
  <g id="typography">
    <text x="265" y="552" text-anchor="middle" class="latin" fill="#684534" stroke="#684534" stroke-width=".9" font-size="46" letter-spacing="4.5">GOOD LUCK</text>
    <g fill="#68432f" transform="translate(${-SIDE} 0)">
      <circle cx="126" cy="583" r="3.3"/><circle cx="138" cy="583" r="2.8"/><circle cx="151" cy="583" r="2.8"/><circle cx="164" cy="583" r="2.8"/><circle cx="177" cy="583" r="2.8"/><circle cx="190" cy="583" r="2.8"/><circle cx="203" cy="583" r="2.8"/><circle cx="216" cy="583" r="2.8"/><circle cx="229" cy="583" r="2.8"/><circle cx="242" cy="583" r="2.8"/>
    </g>
    <g fill="#68432f" transform="translate(${SIDE} 0)">
      <circle cx="288" cy="583" r="2.8"/><circle cx="301" cy="583" r="2.8"/><circle cx="314" cy="583" r="2.8"/><circle cx="327" cy="583" r="2.8"/><circle cx="340" cy="583" r="2.8"/><circle cx="353" cy="583" r="2.8"/><circle cx="366" cy="583" r="2.8"/><circle cx="379" cy="583" r="2.8"/><circle cx="392" cy="583" r="3.3"/>
    </g>
    <g transform="translate(${-SIDE} 0)">
      <text x="138" y="701" text-anchor="middle" class="cn ink" font-size="28">萬</text><text x="138" y="737" text-anchor="middle" class="cn ink" font-size="28">事</text><text x="138" y="773" text-anchor="middle" class="cn ink" font-size="28">順</text><text x="138" y="809" text-anchor="middle" class="cn ink" font-size="28">利</text>
    </g>
    <g transform="translate(${SIDE} 0)">
      <text x="393" y="701" text-anchor="middle" class="cn ink" font-size="28">心</text><text x="393" y="737" text-anchor="middle" class="cn ink" font-size="28">想</text><text x="393" y="773" text-anchor="middle" class="cn ink" font-size="28">事</text><text x="393" y="809" text-anchor="middle" class="cn ink" font-size="28">成</text>
    </g>
    <text x="265" y="664" text-anchor="middle" class="cn ink" font-size="58">上</text>
    <text x="265" y="724" text-anchor="middle" class="cn ink" font-size="58">上</text>
    <text x="265" y="784" text-anchor="middle" class="cn ink" font-size="58">籤</text>
  </g>
  <g id="icons">
    <g transform="translate(${-SIDE} 0)">
      <use xlink:href="#plum" x="132" y="640"/>
      <use xlink:href="#littleStar" x="138" y="842"/>
      <use xlink:href="#plum" x="132" y="899"/>
    </g>
    <g transform="translate(${SIDE} 0)">
      <use xlink:href="#plum" x="397" y="640"/>
      <use xlink:href="#littleStar" x="393" y="842"/>
      <use xlink:href="#plum" x="398" y="899"/>
    </g>
    <g id="red_bow" transform="translate(265 584)">
      <path d="M-3-1 C-14-14-28-19-30-10 C-32-2-20 4-5 3 C-11-2-13-7-12-11 C-8-8-5-4-3-1Z" fill="#f6d8bd" stroke="#cf4a3c" stroke-width="6" stroke-linejoin="round"/>
      <path d="M3-1 C14-14 28-19 30-10 C32-2 20 4 5 3 C11-2 13-7 12-11 C8-8 5-4 3-1Z" fill="#f6d8bd" stroke="#cf4a3c" stroke-width="6" stroke-linejoin="round"/>
      <path d="M-3 2 Q-10 12-21 18 M3 2 Q10 12 21 18" fill="none" stroke="#d84b3d" stroke-width="6" stroke-linecap="round"/>
      <circle r="5.5" fill="#e65341" stroke="#c9493a" stroke-width="1.5"/>
    </g>
  </g>
  <g id="character" class="outline" stroke="#59382a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M221 858 C199 857 185 847 183 832 C181 816 194 806 210 808 C225 810 235 821 239 834Z" fill="#80533d"/>
    <path d="M302 868 C315 850 333 845 349 851 C365 858 369 875 361 890 C353 906 338 911 320 903Z" fill="#80533d"/>
    <path d="M217 830 C234 817 258 816 277 825 C300 836 316 858 319 884 L324 917 C330 938 320 958 300 970 L229 972 C206 965 196 950 199 930 C184 920 179 901 187 878 C193 858 203 841 217 830Z" fill="#fff0d7"/>
    <path d="M218 836 C234 824 253 822 271 828" fill="none" stroke="#dfc49f" stroke-width="2.2"/>
    <ellipse cx="239" cy="884" rx="5.2" ry="7" fill="#59382a" stroke="none"/>
    <ellipse cx="286" cy="891" rx="5.2" ry="7" fill="#59382a" stroke="none"/>
    <ellipse cx="261" cy="896" rx="9" ry="6.3" fill="#754a34" stroke="none"/>
    <ellipse cx="221" cy="899" rx="12" ry="8" fill="#f0aa8b" stroke="none"/>
    <ellipse cx="300" cy="911" rx="12" ry="8" fill="#f0aa8b" stroke="none"/>
    <path d="M240 946 C229 939 218 942 218 954 C218 964 227 969 239 968 M286 946 C298 941 307 948 305 959 C304 966 299 970 291 971" fill="#fff0d7"/>
    <g transform="translate(263 947) scale(1.2)" stroke-width="2.1">
      <use xlink:href="#plum"/>
      <circle cx="-2" cy="-2" r="1.5" fill="#fff9e7" stroke="none"/><circle cx="3" cy="2" r="1.5" fill="#fff9e7" stroke="none"/>
    </g>
    <path d="M176 938 Q181 939 186 944 M178 951 185 948 M347 938 353 934 M352 927 354 921" fill="none" stroke="#ba513c" stroke-width="3"/>
  </g>`;

/* ── 籤身 ──
 * 原檔五支籤各自是透視畫的；這裡把每支的圖案移到自己的原點，排版由 materials.ts 用同一套距離排。
 * 距離量自最直的那支（富士山，籤面 x 222～307、正中 264.5）：籤頂正中 y≈141，
 * 迷你梅花 (-18, +36)、小星 (-2, +52)、字 +98、GOOD +132、LUCK +155、點 +181、小圖 +232。
 * 單位是原檔的；貼到 128px 寬的籤上乘 128 / faceW。字的 y 是基線（跟 SVG 的 <text> 一樣）。
 */
export const STICK_ART = {
  /** 原檔籤面寬（富士山那支 222～307）→ 貼圖一格 128px */
  faceW: 85,
  miniPlum: { dx: -18, dy: 36 },
  star: { dx: -2, dy: 52 },
  label: 98,
  good: 132,
  luck: 155,
  dots: 181,
  icon: 232,
} as const;

/** 五種小圖，原點在圖的中心；順序跟 STICK_VARIANTS 一樣（梅花、笑臉花、富士山、鳥居、達摩） */
const STICK_ICONS = [
  // 梅花：原檔縮 0.85
  `<g transform="scale(.85)"><use xlink:href="#plum"/></g>`,
  // 笑臉花
  `<g>
    <path d="M0-17 C4-24 12-21 14-15 C23-17 28-10 24-4 C31 3 26 11 18 11 C15 20 7 21 1 16 C-7 22-15 18-15 10 C-24 8-26 0-20-6 C-22-15-14-20-7-16Z" fill="#fff1d7" stroke="#65402d" stroke-width="3" class="outline"/>
    <circle cx="-4" cy="-2" r="1.8" fill="#59382a"/><circle cx="6" cy="-2" r="1.8" fill="#59382a"/>
    <path d="M-2 4 Q1 8 4 4" fill="none" stroke="#59382a" stroke-width="1.7" stroke-linecap="round"/>
  </g>`,
  // 富士山
  `<g>
    <path d="M-22 7 0-24 23 7 Q24 10 20 10 H-19Q-24 10-22 7Z" fill="#ceb8a1" stroke="#59382a" stroke-width="3" class="outline"/>
    <path d="M-13 0-7-8-2-3 3-8 10 0Z" fill="#fff2d9"/>
    <path d="M-20 8H21" stroke="#6a4634" stroke-width="2"/>
  </g>`,
  // 鳥居（原檔斜 4°；籤已經扇形排開，這裡擺正）
  `<g>
    <path d="M-19-19 H18 Q21-19 20-15 L18-11 H-20 L-22-16Q-22-19-19-19Z" fill="#cc5943" stroke="#59382a" stroke-width="3" class="outline"/>
    <path d="M-15-11  -16 20 M13-11 12 20" stroke="#68432f" stroke-width="6" stroke-linecap="round"/>
    <path d="M-17-4H15" stroke="#f7dcae" stroke-width="2"/>
    <path d="M-12-18V-11 M0-18V-11 M12-18V-11" stroke="#f8e8c8" stroke-width="2"/>
  </g>`,
  // 達摩
  `<g>
    <path d="M-20 2 C-21-13-11-23 2-23 C17-23 25-11 22 3 C20 15 11 22-1 20 C-14 19-20 12-20 2Z" fill="#d77659" stroke="#59382a" stroke-width="3" class="outline"/>
    <path d="M-17 6 Q-10 1-3 5 Q4 2 17 8 L17 14 Q0 23-15 15Z" fill="#f8e5c8" stroke="#59382a" stroke-width="2.2" class="outline"/>
    <ellipse cx="-7" cy="-5" rx="2.1" ry="3.2" fill="#59382a"/><ellipse cx="7" cy="-5" rx="2.1" ry="3.2" fill="#59382a"/>
    <path d="M-2 1 Q0 3 2 1" fill="none" stroke="#59382a" stroke-width="1.7"/>
    <circle cx="-10" cy="3" r="2.3" fill="#f1a188"/><circle cx="11" cy="3" r="2.3" fill="#f1a188"/>
  </g>`,
];

/** 每種籤的小細節：有沒有迷你梅花（鳥居那支沒有）、幾個點（笑臉花那支兩個） */
export const STICK_VARIANT_DETAIL: ReadonlyArray<{ miniPlum: boolean; dots: number }> = [
  { miniPlum: true, dots: 1 },
  { miniPlum: true, dots: 2 },
  { miniPlum: true, dots: 1 },
  { miniPlum: false, dots: 1 },
  { miniPlum: true, dots: 1 },
];

/** 小圖、迷你梅花、小星都放進 -30..30 的方框（原檔單位），畫的時候再縮放 */
export const PIECE_BOX = 60;
const piece = (body: string): string => svg(`${-PIECE_BOX / 2} ${-PIECE_BOX / 2} ${PIECE_BOX} ${PIECE_BOX}`, body);

/* ── 籤頭 ── 原檔的籤頭：半徑 59 的奶油圓盤、淺色外框、一圈細線、「籤」。方框 -64..64 */
export const HEAD_BOX = 128;
const HEAD_BODY = `
  <circle cx="0" cy="0" r="64" fill="#f7e6c6"/>
  <circle cx="0" cy="0" r="59" fill="url(#medallion)" stroke="#f8eed9" stroke-width="5"/>
  <circle cx="0" cy="0" r="49" fill="none" stroke="#e9c995" stroke-width="1.6"/>
  <text x="0" y="15" text-anchor="middle" class="cn ink" font-size="42">籤</text>`;

export interface CylinderArt {
  cupFace: HTMLImageElement;
  stickIcons: HTMLImageElement[];
  miniPlum: HTMLImageElement;
  star: HTMLImageElement;
  head: HTMLImageElement;
}

/** 一段 SVG 變成一張解碼好的圖。給一個夠大的點陣尺寸，縮小畫進 canvas 才不會糊。 */
function image(source: string, w: number, h: number): Promise<HTMLImageElement> {
  const img = new Image(w, h);
  img.width = w;
  img.height = h;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source.replace('<svg ', `<svg width="${w}" height="${h}" `))}`;
  return img.decode().then(() => img);
}

let loading: Promise<CylinderArt> | null = null;
let loaded: CylinderArt | null = null;

/** 載入一次、之後都拿同一份。籤筒一開場就叫它，抽出來那支要印號碼時早就好了。 */
export function loadCylinderArt(): Promise<CylinderArt> {
  if (!loading) {
    loading = Promise.all([
      image(svg(`${CUP_FACE.x} ${CUP_FACE.y} ${CUP_FACE.w} ${CUP_FACE.h}`, CUP_FACE_BODY), 866, 1072),
      Promise.all(STICK_ICONS.map((body) => image(piece(body), 240, 240))),
      image(piece(`<use xlink:href="#miniPlum"/>`), 240, 240),
      image(piece(`<use xlink:href="#littleStar"/>`), 240, 240),
      image(svg(`${-HEAD_BOX / 2} ${-HEAD_BOX / 2} ${HEAD_BOX} ${HEAD_BOX}`, HEAD_BODY), 512, 512),
    ]).then(([cupFace, stickIcons, miniPlum, star, head]) => {
      loaded = { cupFace, stickIcons, miniPlum, star, head };
      return loaded;
    });
  }
  return loading;
}

/** 已經載好就回傳，還沒就是 null（抽出來那支先印字，圖好了再補上） */
export const cylinderArt = (): CylinderArt | null => loaded;
