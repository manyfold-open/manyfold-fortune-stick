import type { Language } from '../shared/lang';

const TAROT_URL = 'https://app.manyfold.ai/tarot/';

/** The URL contains only attribution, interface language, and an optional claim. */
export function tarotHandoffUrl(
  baseUrl: string,
  language: Language,
  bonusToken: string | null,
): string {
  const url = new URL(baseUrl || TAROT_URL);
  url.searchParams.set('utm_source', 'fortune-stick');
  url.searchParams.set('utm_medium', 'referral');
  const handoff = new URLSearchParams({ lang: language });
  if (bonusToken) handoff.set('bonus', bonusToken);
  url.hash = handoff.toString();
  return url.toString();
}
