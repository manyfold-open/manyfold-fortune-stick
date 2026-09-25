/**
 * 一局求签用哪种语言，由问题本身决定 —— 不是界面上的开关。
 *
 * 规则故意写得很钝，只看文字系统，不猜词：
 *  - 有一个假名（平假名、片假名）就是日文 —— 日文句子几乎一定带假名（助词、语尾），
 *    而中文句子里不会有；所以这一条要排在汉字前面，否则「明日の面接」会被判成中文；
 *  - 有一个谚文（韩文字母）就是韩文；
 *  - 有一个汉字就是中文；
 *  - 都没有就是英文。
 * 钝有两个好处 —— 用户能预测（我打日文就得到日文），以及 workerd 和浏览器跑的是
 * 同一个函数，两边永远不会得出不同的答案。代价也写在这里：一句只有汉字、没有假名的
 * 日文（「転職可否」）会落到中文。
 *
 * 这个值从不落库。它是 `readings.question` 的纯函数，而那一列写进去之后就不再改，
 * 所以每次读取都能算回当初印出来的那张纸的语言 —— 这个库没有迁移步骤，
 * 能不加列就不加列。
 *
 * 全角标点和长音符「ー」、中点「・」不算：一个中文问号或者一个「・」，
 * 都不代表这个人要读哪一种文字的解签。
 */

export type Language = 'zh' | 'en' | 'ja' | 'ko';

/** 界面语言选单的顺序。 */
export const LANGUAGES: readonly Language[] = ['zh', 'en', 'ja', 'ko'];

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/** CJK 统一表意文字：基本区、扩展 A 区、兼容表意文字。不含假名与标点。 */
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
/** 平假名、片假名（含小写扩展与半角片假名）。不含「ー」「・」这类符号。 */
const KANA = /[\u3041-\u3096\u30a1-\u30fa\u31f0-\u31ff\uff66-\uff9d]/;
/** 谚文：音节、字母（兼容区与组合区）。 */
const HANGUL = /[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f]/;

export function detectLanguage(question: string): Language {
  if (KANA.test(question)) return 'ja';
  if (HANGUL.test(question)) return 'ko';
  if (HAN.test(question)) return 'zh';
  return 'en';
}

/**
 * 签纸怎么排：中文和日文照御神签直排；英文和韩文横排。
 * 韩文虽然也能直排，但今天的韩文读者读的是横排，直排反而像古籍。
 */
export const writesVertically = (language: Language): boolean =>
  language === 'zh' || language === 'ja';

/**
 * 在哪里换行：英文和韩文词与词之间有空格，按词换；中文和日文按字换
 * （日文另有禁则，交给浏览器的 line-break: strict）。
 */
export const wrapsByWord = (language: Language): boolean => language === 'en' || language === 'ko';

/** `<html lang>` 的值。读屏软件靠它决定怎么念。 */
export const HTML_LANG: Record<Language, string> = {
  zh: 'zh-CN',
  en: 'en-GB',
  ja: 'ja',
  ko: 'ko',
};

/**
 * 语言选单上每一种语言的名字。一律用它自己的文字写 ——
 * 看不懂当前界面的人，也要认得出自己的语言在哪一行。
 */
export const LANGUAGE_NAME: Record<Language, string> = {
  zh: '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

/** 顶栏开关上的短名字：只标当前是哪一种，点开再选。 */
export const LANGUAGE_SHORT: Record<Language, string> = {
  zh: '中文',
  en: 'EN',
  ja: '日本語',
  ko: '한국어',
};
