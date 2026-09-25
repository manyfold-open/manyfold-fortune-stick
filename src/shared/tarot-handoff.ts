import type { Language } from './lang';

export const TAROT_URL = 'https://app.manyfold.ai/tarot/';

/** The URL contains only attribution, interface language, and an optional claim. */
export function tarotHandoffUrl(
  baseUrl: string,
  language: Language,
  bonusToken: string | null,
): string {
  const url = new URL(baseUrl || TAROT_URL);
  url.searchParams.set('utm_source', 'fortune-stick');
  url.searchParams.set('utm_medium', 'referral');
  // Tarot 只认 zh 和 en：日文、韩文界面的人先落到英文，别把它不认得的值塞过去
  const handoff = new URLSearchParams({ lang: language === 'zh' ? 'zh' : 'en' });
  if (bonusToken) handoff.set('bonus', bonusToken);
  url.hash = handoff.toString();
  return url.toString();
}
