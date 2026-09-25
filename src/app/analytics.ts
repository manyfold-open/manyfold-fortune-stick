/**
 * The browser half of Google Analytics: naming the moments, and carrying the
 * visitor's answer about consent back to the tag.
 *
 * The tag itself is not set up here. The Worker writes it into `<head>` before
 * this bundle runs (src/worker/analytics.ts), which is why everything below does
 * nothing at all when `gtag` is absent. That is the normal state of a fork with
 * no GA_MEASUREMENT_ID, and nobody there should have to know what an event is.
 *
 * The events are one round, in order: a stick drawn, the reading opened, a
 * further question, a share, a trip to Tarot. `reading_completed` is the one
 * worth marking as a key event. None of them carries the question, the stick or
 * the text of the reading; the round's language is the most any of them says.
 */

import { browserStorage, safeGet, safeSet } from '../shared/safe-storage';

/** Same key the tag reads before its first hit (src/worker/analytics.ts). */
export const CONSENT_KEY = 'wenyiqian.consent';

export type Consent = 'granted' | 'denied';

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

const gtag = (...args: unknown[]): void => {
  if (typeof window.gtag === 'function') window.gtag(...args);
};

/** Whether this page has a Google tag on it at all. */
export const measuring = (): boolean => typeof window.gtag === 'function';

/** The choice this browser made last time, if it made one. */
export function storedConsent(): Consent | null {
  const value = safeGet(browserStorage('localStorage'), CONSENT_KEY);
  return value === 'granted' || value === 'denied' ? value : null;
}

/**
 * Records an answer and tells the tag about it in the same breath. The tag is
 * updated whether or not the write succeeds, so a browser that refuses
 * localStorage still gets the answer it gave for this page view.
 */
export function setConsent(choice: Consent): void {
  gtag('consent', 'update', {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
  safeSet(browserStorage('localStorage'), CONSENT_KEY, choice);
}

export type AnalyticsEvent =
  | 'stick_drawn'
  | 'reading_completed'
  | 'follow_up_asked'
  | 'reading_shared'
  | 'tarot_opened';

/** One named moment in the round. Silent when nothing is measuring. */
export const track = (event: AnalyticsEvent, params: Record<string, string> = {}): void => {
  gtag('event', event, params);
};
