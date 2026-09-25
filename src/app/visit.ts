/**
 * Reports where a visit came from (a shared stick, by QR or link; or one of
 * Tarot's links) to the deployer's daily counts, once per tab, and remembers it
 * so the visit's first draw can be counted against the same source.
 * Nothing about the visitor goes with it: just the source name.
 */

import { api } from './api';
import { browserStorage, safeGet, safeRemove, safeSet } from '../shared/safe-storage';
import { isVisitSource, visitSourceFrom, type VisitSource } from '../shared/stats';

const SOURCE_KEY = 'wenyiqian.visitSource';
const COUNTED_KEY = 'wenyiqian.visitCounted';

export function recordVisit(href: string): void {
  const url = new URL(href);
  const source = visitSourceFrom(url.search);
  if (!source) return;
  const storage = browserStorage('sessionStorage');
  // A reload of the same arrival is the same visit.
  if (safeGet(storage, COUNTED_KEY) === url.search) return;
  safeSet(storage, COUNTED_KEY, url.search);
  safeSet(storage, SOURCE_KEY, source);
  void api(`/api/stats/${encodeURIComponent(`visit:${source}`)}`, { method: 'POST', body: '{}' }).catch(
    () => undefined,
  );
}

/** The source to credit this visit's first draw to; later draws are not credited again. */
export function takeVisitSourceForDraw(): VisitSource | null {
  const storage = browserStorage('sessionStorage');
  const source = safeGet(storage, SOURCE_KEY);
  safeRemove(storage, SOURCE_KEY);
  return isVisitSource(source) ? source : null;
}

/** A share went out (the share sheet) or was saved (a download). */
export function recordShare(outcome: 'sent' | 'downloaded'): void {
  void api(`/api/stats/share:${outcome}`, { method: 'POST', body: '{}' }).catch(() => undefined);
}
