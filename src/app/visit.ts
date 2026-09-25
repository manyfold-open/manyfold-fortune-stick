/**
 * Reports where a visit came from (a shared stick, by QR or link; one of
 * Tarot's links; a tagged campaign; or organic: direct, search, social or
 * another site) to the deployer's daily counts, once per tab, and remembers it
 * so the visit's first draw can be counted against the same source.
 *
 * What goes to the server is the source name and whether this browser has been
 * here before, nothing else: the referring site is reduced to a bucket here in
 * the browser and never sent.
 */

import { api } from './api';
import { browserStorage, safeGet, safeRemove, safeSet } from '../shared/safe-storage';
import { isVisitSource, visitSourceFrom, type VisitSource } from '../shared/stats';

const SOURCE_KEY = 'wenyiqian.visitSource';
const COUNTED_KEY = 'wenyiqian.visitCounted';
/** Set on a browser's first visit, so a later one counts as returning. */
const SEEN_KEY = 'wenyiqian.seen';
/** Browsers that drew before this flag existed have records already. */
const RECORDS_KEY = 'wenyiqian.records';

export function recordVisit(href: string, referrer: string): void {
  const url = new URL(href);
  // The deployer looking at #settings is not a visitor.
  if (url.hash === '#settings' || /\/settings\/?$/.test(url.pathname)) return;
  const storage = browserStorage('sessionStorage');
  // A reload, or moving around inside the app, is the same visit.
  if (safeGet(storage, COUNTED_KEY) === url.search) return;
  const source = visitSourceFrom(url.search, referrer, url.origin);
  safeSet(storage, COUNTED_KEY, url.search);
  safeSet(storage, SOURCE_KEY, source);
  const local = browserStorage('localStorage');
  const returning = Boolean(safeGet(local, SEEN_KEY) || safeGet(local, RECORDS_KEY));
  safeSet(local, SEEN_KEY, '1');
  void api(`/api/stats/${encodeURIComponent(`visit:${source}`)}`, {
    method: 'POST',
    body: JSON.stringify({ returning }),
  }).catch(() => undefined);
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
