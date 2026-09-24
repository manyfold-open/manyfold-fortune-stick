import { browserStorage, safeGet, safeSet } from '../shared/safe-storage';

export { TAROT_URL, tarotHandoffUrl } from '../shared/tarot-handoff';

const RETURN_PARAM = 'tarot_return';
const RETURN_KEY = 'wenyiqian.tarotReturn';

/**
 * Tarot links here with `?tarot_return=<its own URL>`, so a visitor goes back to
 * the Tarot host they came from. Kept for the tab only; the Worker decides
 * whether the URL is one it will actually send anyone to.
 */
export function rememberTarotReturn(href: string): void {
  const value = new URL(href).searchParams.get(RETURN_PARAM);
  if (value) safeSet(browserStorage('sessionStorage'), RETURN_KEY, value);
}

export const rememberedTarotReturn = (): string | null =>
  safeGet(browserStorage('sessionStorage'), RETURN_KEY);
