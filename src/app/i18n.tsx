/**
 * 界面语言：机器说的话。
 *
 * 和签纸上的语言是两回事 —— 签纸跟着问题走（src/shared/lang.ts），这里跟着
 * 右上角那个开关走。一个人可以用英文界面读一张中文的签，那是对的：
 * 纸是那一刻印出来的，机器是现在正在用的。
 *
 * 文案表本身在 src/shared/i18n/，这里只有浏览器需要的那一层。
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Language } from '../shared/lang';
import { translatorFor, type Translate } from '../shared/i18n';

export { copyFor, translatorFor } from '../shared/i18n';
export type { Copy, Translate } from '../shared/i18n';

const LanguageContext = createContext<Language>('zh');

export function LanguageProvider(props: { language: Language; children: ReactNode }) {
  return (
    <LanguageContext.Provider value={props.language}>{props.children}</LanguageContext.Provider>
  );
}

export const useUiLanguage = (): Language => useContext(LanguageContext);

export function useT(): Translate {
  const language = useUiLanguage();
  return useMemo(() => translatorFor(language), [language]);
}
