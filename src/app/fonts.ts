/**
 * canvas 读不到 CSS 变量，分享图要用的字体顺序在这里另存一份 —— 跟 styles.css :root 的
 * --font-* 是同一套三个角色，改一边就要改另一边。
 *
 * Shippori Mincho B1 只打包了拉丁字母（见 styles.css 的 @font-face），英文排在前面也不会
 * 把中文画成日文字形；中文那一份打头的 Shippori 只认字母数字，让 … · — 用中文字形。
 */
import type { Language } from '../shared/lang';

const MINCHO_CJK = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';

/** 中文的纸：签诗、签名、等级印。打头的那份 Shippori 只认字母数字，… · — 仍是中文字形。 */
export const MINCHO_ZH = `"Shippori Mincho B1 Letters", ${MINCHO_CJK}`;
/** 英文的纸和中英混排的小字。 */
export const MINCHO_EN = `"Shippori Mincho B1", ${MINCHO_CJK}`;
/** 木头上写的字：绘马上的问题。霞鹜文楷 TC 简繁和英文字母都齐。 */
export const HAND = `"LXGW WenKai TC", "Kaiti SC", "STKaiti", ${MINCHO_CJK}`;

/**
 * 日文和韩文的纸。Noto Serif JP / KR 跟中文的 Noto Serif SC 是同一套设计，字宽、行高一样，
 * 放进为中文排好的版面不会撑开；日文要放在 SC 前面，汉字才是日文字形。
 */
export const MINCHO_JA = `"Shippori Mincho B1 Letters", "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", ${MINCHO_CJK}`;
export const MINCHO_KO = `"Shippori Mincho B1 Letters", "Noto Serif KR", "AppleMyungjo", "Batang", ${MINCHO_CJK}`;
/** 日文的手写字：Klee One 是霞鹜文楷的原型，同一只手。韩文还没有配得上的手写字，先用明朝。 */
export const HAND_JA = `"Klee One", "LXGW WenKai TC", ${MINCHO_JA}`;
export const HAND_KO = MINCHO_KO;

/** 某一种语言的纸用哪一套明朝。 */
export const minchoFor = (language: Language): string =>
  ({ zh: MINCHO_ZH, en: MINCHO_EN, ja: MINCHO_JA, ko: MINCHO_KO })[language];

/** 某一种语言写在木头上用哪一套手写字。中文和英文共用霞鹜文楷。 */
export const handFor = (language: Language): string =>
  ({ zh: HAND, en: HAND, ja: HAND_JA, ko: HAND_KO })[language];
