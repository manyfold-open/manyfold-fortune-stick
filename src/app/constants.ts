import type { Language } from '../shared/lang';
import type { StickLevel } from '../shared/sticks';

/** 和服务端 src/worker/fortune.ts 里的校验保持一致。 */
export const QUESTION_MIN = 5;
export const QUESTION_MAX = 120;
/** 一轮追问的上限，对应服务端的 FOLLOW_UP_MAX_CHARS。 */
export const FOLLOW_UP_MAX = 200;

/** 打印机走纸动画的时长：按下按钮到签纸完全吐出来。 */
export const PRINT_MS = 1900;
/** 走纸跑完之后，画面从打印机切到签纸用的时间。 */
export const EJECT_MS = 620;

/**
 * 四个等级的视觉主题。`key` 是 CSS 里 `[data-tone]` 的取值 —— 颜色只写在 styles.css，
 * 这里只负责把等级映射过去，外加签纸上那一行「幸运色」。
 */
export const LEVEL_TONE: Record<
  StickLevel,
  { key: string; luckyColor: Record<Language, string> }
> = {
  上上签: { key: 'best', luckyColor: { zh: '靛蓝', en: 'Indigo', ja: '藍色', ko: '쪽빛' } },
  上签: { key: 'good', luckyColor: { zh: '金黄', en: 'Gold', ja: '山吹色', ko: '황금빛' } },
  中签: { key: 'fair', luckyColor: { zh: '青绿', en: 'Jade', ja: '若竹色', ko: '옥빛' } },
  下签: { key: 'low', luckyColor: { zh: '陶褐', en: 'Terracotta', ja: '弁柄色', ko: '황토빛' } },
};
