/**
 * canvas 读不到 CSS 变量，分享图要用的字体顺序在这里另存一份 —— 跟 styles.css :root 的
 * --font-* 是同一套三个角色，改一边就要改另一边。
 *
 * Shippori Mincho B1 只打包了拉丁字母（见 styles.css 的 @font-face），英文排在前面也不会
 * 把中文画成日文字形；中文那一份打头的 Shippori 只认字母数字，让 … · — 用中文字形。
 */
const MINCHO_CJK = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';

/** 中文的纸：签诗、签名、等级印。打头的那份 Shippori 只认字母数字，… · — 仍是中文字形。 */
export const MINCHO_ZH = `"Shippori Mincho B1 Letters", ${MINCHO_CJK}`;
/** 英文的纸和中英混排的小字。 */
export const MINCHO_EN = `"Shippori Mincho B1", ${MINCHO_CJK}`;
/** 木头上写的字：绘马上的问题。霞鹜文楷 TC 简繁和英文字母都齐。 */
export const HAND = `"LXGW WenKai TC", "Kaiti SC", "STKaiti", ${MINCHO_CJK}`;
