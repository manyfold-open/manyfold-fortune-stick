/**
 * 界面文案的两张表，外加取文案的纯函数。
 *
 * 放在 shared 而不是 app 下，原因很实在：tests/ 是在 worker 那个 tsconfig 项目里
 * 编译的（它只认 src/worker 和 src/shared），而这两张表最值得测的恰恰是
 * 「键对不对得上、占位符对不对得上、英文里有没有漏翻的汉字」。表本身是纯字符串，
 * 两个运行时都跑得动，符合 shared 的约定。
 *
 * React 那一层（context、useT）在 src/app/i18n.tsx —— 那部分只有浏览器需要。
 */

import type { Language } from '../lang';
import { withoutDashes } from '../text';
import { zh, type Copy } from './zh';
import { en } from './en';

export type { Copy };
export { zh, en };

const DISPLAY_TABLES: Record<Language, Copy> = {
  zh: Object.fromEntries(Object.entries(zh).map(([key, value]) => [key, withoutDashes(value)])) as Copy,
  en: Object.fromEntries(Object.entries(en).map(([key, value]) => [key, withoutDashes(value)])) as Copy,
};

/** 某种语言下的整张表。给那些不跟界面走的地方用（比如记录里某一条自己的语言）。 */
export const copyFor = (language: Language): Copy => DISPLAY_TABLES[language];

/** 把 {name} 换成值。没给值的占位符原样留着，方便一眼看出是哪个键漏了。 */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type Translate = (key: keyof Copy, vars?: Record<string, string | number>) => string;

/** 用某种语言取文案。不依赖 React，供 context 之外和非组件代码调用。 */
export const translatorFor =
  (language: Language): Translate =>
  (key, vars) =>
    format(DISPLAY_TABLES[language][key], vars);
