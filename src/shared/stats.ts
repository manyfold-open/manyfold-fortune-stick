/**
 * The deployer's own daily counts, shown on #settings until a real analytics
 * setup exists. Only totals per Taipei day are kept: no visitor, question,
 * stick or reading is ever stored against a count.
 *
 * Shared by the browser (which works out where a visit came from) and the
 * Worker (which only accepts the metric names listed here).
 */

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

/** Every metric the Worker will count. Anything else is refused. */
export const METRICS = [
  ...VISIT_SOURCES.map((source) => `visit:${source}` as const),
  ...VISIT_SOURCES.map((source) => `draw:${source}` as const),
  'share:sent',
  'share:downloaded',
  'tarot:opened',
  'visitor:new',
  'visitor:returning',
] as const;
export type Metric = (typeof METRICS)[number];

export const isMetric = (value: unknown): value is Metric =>
  typeof value === 'string' && (METRICS as readonly string[]).includes(value);

export const isVisitSource = (value: unknown): value is VisitSource =>
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
  counts: Partial<Record<Metric, number>>;
}
