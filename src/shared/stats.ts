/**
 * The deployer's own daily counts, shown on #settings until a real analytics
 * setup exists. Only totals per Taipei day are kept: no visitor, question,
 * stick or reading is ever stored against a count.
 *
 * Shared by the browser (which works out where a visit came from) and the
 * Worker (which only accepts the metric names listed here).
 */

import { UNPARSEABLE } from './error-copy';

/** Where a visit came from. Every visit has one: what is not a share, a Tarot
 *  link or a tagged campaign is organic, bucketed by the site that sent it. */
export const VISIT_SOURCES = [
  'share-qr',
  'share-link',
  'share-unknown',
  'tarot-outro',
  'tarot-locked',
  'tarot-other',
  'tarot-share',
  'organic-direct',
  'organic-search',
  'organic-social',
  'organic-other',
  'campaign',
] as const;
export type VisitSource = (typeof VISIT_SOURCES)[number];

/** How a shared link says it was passed on: the QR on the image, or the text link. */
export type ShareVia = 'qr' | 'link';

/** Why an interpretation fell back to the stick's own text, read off the code
 *  or sentence stored in readings.error. */
export const FALLBACK_REASONS = ['unparseable', 'empty', 'timeout', 'manyfold', 'no-interpreter', 'other'] as const;
export type FallbackReason = (typeof FALLBACK_REASONS)[number];

/** How long the agent took to answer one interpretation, in buckets of seconds. */
export const REPLY_BUCKETS = ['t10', 't20', 't30', 't60', 't60plus'] as const;
export type ReplyBucket = (typeof REPLY_BUCKETS)[number];

/** How long someone waited between pressing 解籤 and seeing the reading;
 *  `ready` means it was already there, `left` that they went before it came. */
export const WAIT_BUCKETS = ['ready', 'lt3', 'lt10', 'lt30', '30plus', 'left'] as const;
export type WaitBucket = (typeof WAIT_BUCKETS)[number];

/** Every metric the Worker will count. Anything else is refused. */
export const METRICS = [
  ...VISIT_SOURCES.map((source) => `visit:${source}` as const),
  ...VISIT_SOURCES.map((source) => `draw:${source}` as const),
  'share:sent',
  'share:downloaded',
  'tarot:opened',
  'visitor:new',
  'visitor:returning',
  // One per attempt to interpret, counted by the Worker.
  'interpret:ok',
  ...FALLBACK_REASONS.map((reason) => `interpret:fallback-${reason}` as const),
  'interpret:retry',
  ...REPLY_BUCKETS.map((bucket) => `interpret:${bucket}` as const),
  // Reported by the page, for a stick drawn in this visit only.
  'reading:shown-ai',
  'reading:shown-fallback',
  ...WAIT_BUCKETS.map((bucket) => `wait:${bucket}` as const),
] as const;
export type Metric = (typeof METRICS)[number];

export const isMetric = (value: unknown): value is Metric =>
  typeof value === 'string' && (METRICS as readonly string[]).includes(value);

/** Metrics the page may report on its own; the rest are counted by the Worker
 *  alongside what they belong to. */
export const isPageMetric = (value: unknown): value is Metric =>
  isMetric(value) && /^(visit|share|reading|wait):/.test(value);

/**
 * The bucket for a failed interpretation's stored error: a code the Worker
 * wrote (unparseable, no_interpreter, manyfold_*), or the agent's own sentence,
 * which is only ever sorted here and never shown on the numbers page.
 */
export function fallbackReason(error: string | null | undefined): FallbackReason {
  if (!error) return 'other';
  if (error === UNPARSEABLE || error.startsWith(`${UNPARSEABLE}:`)) return 'unparseable';
  if (error === 'no_interpreter') return 'no-interpreter';
  if (error.startsWith('manyfold_')) return 'manyfold';
  if (/timed out|timeout/i.test(error)) return 'timeout';
  if (/没有返回任何内容|returned nothing|empty/i.test(error)) return 'empty';
  return 'other';
}

export function replyBucket(ms: number): ReplyBucket {
  if (ms < 10_000) return 't10';
  if (ms < 20_000) return 't20';
  if (ms < 30_000) return 't30';
  if (ms < 60_000) return 't60';
  return 't60plus';
}

/** `null` when the reading was already there when 解籤 was pressed. */
export function waitBucket(ms: number | null): Exclude<WaitBucket, 'left'> {
  if (ms === null) return 'ready';
  if (ms < 3_000) return 'lt3';
  if (ms < 10_000) return 'lt10';
  if (ms < 30_000) return 'lt30';
  return '30plus';
}

export const isVisitSource =(value: unknown): value is VisitSource =>
  typeof value === 'string' && (VISIT_SOURCES as readonly string[]).includes(value);

const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|baidu|yandex|naver|ecosia|search\.brave)\./;
const SOCIAL_HOSTS =
  /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|messenger\.com|threads\.net|threads\.com|line\.me|t\.co|twitter\.com|x\.com|reddit\.com|tiktok\.com|linkedin\.com|lnkd\.in|pinterest\.[a-z.]+|youtube\.com|youtu\.be|dcard\.tw|ptt\.cc|weibo\.com|xiaohongshu\.com|discord\.com|telegram\.org|t\.me|whatsapp\.com)$/;

/** The organic bucket for the site that sent a visitor, from its hostname alone. */
export function organicSourceFrom(referrerHost: string | null): VisitSource {
  if (!referrerHost) return 'organic-direct';
  const host = referrerHost.toLowerCase();
  if (SEARCH_HOSTS.test(host)) return 'organic-search';
  if (SOCIAL_HOSTS.test(host)) return 'organic-social';
  return 'organic-other';
}

/**
 * Where this visit came from, read off the address it arrived at and, failing
 * that, the site that sent it:
 *   ?s=12&via=qr            a shared stick, from the QR on the share image
 *   ?s=12&via=link          a shared stick, from the text link
 *   ?s=12                   a shared stick, from an older share with no marker
 *   ?utm_source=tarot&utm_content=outro|locked   Tarot's own links
 *   ?utm_source=tarot-share Tarot's share page
 *   any other ?utm_source   a tagged campaign (an ad, a newsletter): not organic
 *   otherwise               organic: direct, search, social or another site,
 *                           judged by the referrer's hostname only
 * A referrer from this same site (a reload, say) counts as direct; one from
 * Tarot without its tags still counts as Tarot.
 */
export function visitSourceFrom(search: string, referrer = '', selfOrigin = ''): VisitSource {
  const params = new URLSearchParams(search);
  if (params.get('s')) {
    const via = params.get('via');
    return via === 'qr' ? 'share-qr' : via === 'link' ? 'share-link' : 'share-unknown';
  }
  const utm = params.get('utm_source');
  if (utm === 'tarot') {
    const placement = params.get('utm_content');
    return placement === 'outro' ? 'tarot-outro' : placement === 'locked' ? 'tarot-locked' : 'tarot-other';
  }
  if (utm === 'tarot-share') return 'tarot-share';
  if (utm) return 'campaign';
  let from: URL | null = null;
  try {
    from = referrer ? new URL(referrer) : null;
  } catch {
    from = null;
  }
  if (!from) return 'organic-direct';
  if (/(^|\.)tarot\.manyfold\.ai$/.test(from.hostname) || /^\/tarot(\/|$)/.test(from.pathname)) {
    if (!selfOrigin || from.origin === selfOrigin || from.hostname.startsWith('tarot.')) return 'tarot-other';
  }
  if (selfOrigin && from.origin === selfOrigin) return 'organic-direct';
  return organicSourceFrom(from.hostname);
}

/** One day of counts, as the settings page receives it. */
export interface DailyStats {
  /** YYYY-MM-DD, Taipei. */
  day: string;
  /** Every stick drawn that day, from the readings table itself. */
  draws: number;
  /** Tarot reward codes issued that day (one per finished reading at most). */
  claims: number;
  /** Where that day's sticks ended up, read back from the readings table. */
  outcomes: ReadingOutcomes;
  counts: Partial<Record<Metric, number>>;
}

/**
 * The last state of each stick drawn that day. A retry overwrites the row, so
 * this is where a stick ended, not how many tries it took.
 */
export interface ReadingOutcomes {
  /** Interpreted by the agent. */
  ai: number;
  /** Showing the stick's own text, by why the last try failed. */
  fallback: Partial<Record<FallbackReason, number>>;
  /** Never interpreted, and drawn long enough ago that nothing is still on its way. */
  stuck: number;
}
