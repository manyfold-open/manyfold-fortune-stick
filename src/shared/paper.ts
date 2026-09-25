/**
 * 纸上印的那几个固定字眼：表头、签号、吉色、开运、绘马、扫码。
 *
 * 签纸（StickFace）、分享图（share.ts）、滚印机的纹理（roll/textures.ts）和连结预览
 * 都印这几样，以前各自写一个 `en ? 'OMIKUJI' : '御神签'`，第三种语言一来就全落到中文。
 * 现在都从这里按语言取 —— 跟 LEVEL_LABEL 一样，是纸的语言，不是界面语言。
 */

import type { Language } from './lang';
import { hanNumber, kanjiNumber } from './numerals';

export interface PaperCopy {
  /** 签纸顶上那条朱红带。 */
  band: string;
  /** 签纸表头下面那一行签号。 */
  number: (no: number, count: number) => string;
  /**
   * 记录卡左边那条朱红签头。有 small 就是横排的「小字 + 大号码」（英文、韩文），
   * 没有就是直排的一整串（中文、日文）。
   */
  tab: (no: number) => { small?: string; main: string };
  /** 分享文字和连结预览里的签号，比签纸上那行短。 */
  shortNumber: (no: number) => string;
  luckyTone: (color: string) => string;
  luckyCharm: (item: string) => string;
  /** 分享图上绘马那一行小字。 */
  emaCaption: string;
  /** 分享图二维码下面那一行。 */
  scanToDraw: string;
  /** 下载下来的分享图叫什么。 */
  fileName: (no: number) => string;
  /** 两句签诗接成一行（分享文字、连结预览）。 */
  joinPoem: (first: string, second: string) => string;
  /** 连结预览的描述结尾：请朋友也来求一支。 */
  inviteOwn: string;
}

export const PAPER: Record<Language, PaperCopy> = {
  zh: {
    band: '御神签',
    number: (no) => `第${hanNumber(no)}签`,
    tab: (no) => ({ main: `第${hanNumber(no)}签` }),
    shortNumber: (no) => `第 ${no} 签`,
    luckyTone: (color) => `吉色 · ${color}`,
    luckyCharm: (item) => `开运 · ${item}`,
    emaCaption: '絵馬 · 心願',
    scanToDraw: '扫码求一签',
    fileName: (no) => `问一签-第${no}签.png`,
    joinPoem: (first, second) => `${first}，${second}`,
    inviteOwn: '来求一支你自己的签。',
  },
  en: {
    band: 'OMIKUJI',
    number: (no, count) => `NO. ${no} OF ${count}`,
    tab: (no) => ({ small: 'NO.', main: String(no) }),
    shortNumber: (no) => `No. ${no}`,
    luckyTone: (color) => `Lucky tone · ${color}`,
    luckyCharm: (item) => `Lucky charm · ${item}`,
    emaCaption: 'EMA · MAKE A WISH',
    scanToDraw: 'SCAN TO DRAW',
    fileName: (no) => `fortune-stick-${no}.png`,
    joinPoem: (first, second) => `${first} / ${second}`,
    inviteOwn: 'Draw your own slip at the shrine.',
  },
  ja: {
    band: 'おみくじ',
    number: (no) => `第${kanjiNumber(no)}番`,
    tab: (no) => ({ main: `第${kanjiNumber(no)}番` }),
    shortNumber: (no) => `第${no}番`,
    luckyTone: (color) => `吉色 · ${color}`,
    luckyCharm: (item) => `開運 · ${item}`,
    emaCaption: '絵馬 · 願い事',
    scanToDraw: 'おみくじを引く',
    fileName: (no) => `おみくじ-第${no}番.png`,
    joinPoem: (first, second) => `${first}、${second}`,
    inviteOwn: 'あなたも一枚引いてみて。',
  },
  ko: {
    band: '오미쿠지',
    number: (no, count) => `${count}개 중 ${no}번`,
    tab: (no) => ({ small: 'NO.', main: String(no) }),
    shortNumber: (no) => `${no}번`,
    luckyTone: (color) => `행운의 색 · ${color}`,
    luckyCharm: (item) => `행운템 · ${item}`,
    emaCaption: '에마 · 소원',
    scanToDraw: '스캔해서 뽑기',
    fileName: (no) => `오미쿠지-${no}번.png`,
    joinPoem: (first, second) => `${first} / ${second}`,
    inviteOwn: '당신도 한 장 뽑아 보세요.',
  },
};
