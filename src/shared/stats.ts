/**
 * The deployer's own daily counts, shown on #settings until a real analytics
 * setup exists. Only totals per Taipei day are kept: no visitor, question,
 * stick or reading is ever stored against a count.
 *
 * Shared by the browser (which works out where a visit came from) and the
 * Worker (which only accepts the metric names listed here).
 */

/** Where a visit came from, when it came from somewhere we can name. */
export const VISIT_SOURCES = [
  'share-qr',
  'share-link',
  'share-unknown',
  'tarot-outro',
  'tarot-locked',
  'tarot-other',
  'tarot-share',
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
] as const;
export type Metric = (typeof METRICS)[number];

export const isMetric = (value: unknown): value is Metric =>
  typeof value === 'string' && (METRICS as readonly string[]).includes(value);

export const isVisitSource = (value: unknown): value is VisitSource =>
  typeof value === 'string' && (VISIT_SOURCES as readonly string[]).includes(value);

/**
 * Where this visit came from, read off the address it arrived at:
 *   ?s=12&via=qr            a shared stick, from the QR on the share image
 *   ?s=12&via=link          a shared stick, from the text link
 *   ?s=12                   a shared stick, from an older share with no marker
 *   ?utm_source=tarot&utm_content=outro|locked   Tarot's own links
 *   ?utm_source=tarot-share Tarot's share page
 * A plain visit is null and is not counted as a visit.
 */
export function visitSourceFrom(search: string): VisitSource | null {
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
  return null;
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
