/**
 * 分享出去的那條連結：`?s=13&l=en` —— 只有籤號和這一局的語言。
 *
 * 故意不帶 readingId、不帶問題、不帶解籤：籤詩、等級、籤名都在 sticks.ts 裡，
 * 瀏覽器照籤號就畫得出那張籤紙，不用新開一條查資料的 API（AGENTS.md 第 15 條），
 * 也不會把誰問了什麼順手分享出去（分享圖預設不放問題，連結更不該放）。
 *
 * 瀏覽器（SharedStick 那一頁、分享圖上的二維碼）和 worker（連結預覽的 og 標籤）都用這支，
 * 所以放在 shared。
 */

import { LEVEL_LABEL, STICK_COUNT, stickByNo, stickText, type FortuneStick } from './sticks';
import { hanNumber } from './numerals';
import { PAPER } from './paper';
import { isLanguage, type Language } from './lang';

export interface SharedStick {
  stick: FortuneStick;
  language: Language;
}

/** 讀網址上的 `?s=` 與 `?l=`。籤號不是 1..STICK_COUNT 的整數就當沒有（別人亂改網址不能弄壞首頁）。 */
export function parseSharedStick(search: string): SharedStick | null {
  const params = new URLSearchParams(search);
  const raw = params.get('s');
  if (!raw || !/^\d{1,3}$/.test(raw)) return null;
  const no = Number(raw);
  if (no < 1 || no > STICK_COUNT) return null;
  const stick = stickByNo(no);
  if (!stick) return null;
  const language = params.get('l');
  return { stick, language: isLanguage(language) ? language : 'en' };
}

/**
 * 分享連結的查詢字串（含 `?`）。via 標出它是從分享圖上的 QR 碼（qr）還是文字連結（link）
 * 來的，只給 #settings 的每日統計用；讀籤時不看它。
 */
export const sharedStickQuery = (no: number, language: Language, via?: 'qr' | 'link'): string =>
  `?s=${no}&l=${language}${via ? `&via=${via}` : ''}`;

/** 連結預覽（og:title / og:description）要寫的字：籤號、等級、籤名，底下兩句籤詩。 */
export function sharedStickMeta({ stick, language }: SharedStick): { title: string; description: string } {
  const text = stickText(stick, language);
  const level = LEVEL_LABEL[language][stick.level];
  const paper = PAPER[language];
  // 中文的标题用签纸上那种国字签号（第十八签），其余语言用短签号
  const number = language === 'zh' ? `第${hanNumber(stick.no)}签` : paper.shortNumber(stick.no);
  const stop = language === 'en' || language === 'ko' ? '. ' : '。';
  return {
    title: `${number} · ${level} · ${text.title}`,
    description: `${paper.joinPoem(text.poem[0], text.poem[1])}${stop}${paper.inviteOwn}`,
  };
}

/** 沒有分享籤號時的預覽字。 */
export const SITE_META = {
  title: 'Omikuji · AI Fortune Stick',
  description: 'Write down what is on your mind, stir the fortune cylinder, and receive one fixed slip to think with.',
};
