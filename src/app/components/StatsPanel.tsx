/**
 * The deployer's daily counts, on #settings only. Totals per Taipei day and
 * nothing else: where visits came from (a shared stick by QR or link, or one of
 * Tarot's links), how many of them went on to draw, how many sticks were
 * shared, and how many visitors went on to Tarot. A stand-in until a real
 * analytics setup exists; it reads GET /api/stats behind the admin password.
 *
 * Summary cards for the chosen range come first, the day-by-day table under
 * them. Both sit on paper, so their text uses the --ink scale.
 */

import { useEffect, useState } from 'react';
import type { Copy } from '../../shared/i18n';
import type { DailyStats, Metric } from '../../shared/stats';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';

const RANGES = [7, 14, 30] as const;

const sum = (row: DailyStats, metrics: Metric[]): number =>
  metrics.reduce((total, metric) => total + (row.counts[metric] ?? 0), 0);

const TAROT_VISITS: Metric[] = ['visit:tarot-outro', 'visit:tarot-locked', 'visit:tarot-share', 'visit:tarot-other'];
const TAROT_DRAWS: Metric[] = ['draw:tarot-outro', 'draw:tarot-locked', 'draw:tarot-share', 'draw:tarot-other'];
const SHARE_VISITS: Metric[] = ['visit:share-qr', 'visit:share-link', 'visit:share-unknown'];
const SHARE_DRAWS: Metric[] = ['draw:share-qr', 'draw:share-link', 'draw:share-unknown'];

type Read = (row: DailyStats) => number;
const draws: Read = (row) => row.draws;
const fromTarot: Read = (row) => sum(row, TAROT_VISITS);
const fromTarotDrew: Read = (row) => sum(row, TAROT_DRAWS);
const toTarot: Read = (row) => sum(row, ['tarot:opened']);
const claims: Read = (row) => row.claims;
const shares: Read = (row) => sum(row, ['share:sent', 'share:downloaded']);
const fromShare: Read = (row) => sum(row, SHARE_VISITS);
const fromShareDrew: Read = (row) => sum(row, SHARE_DRAWS);

/** The table: column groups, each a heading over its columns. */
const GROUPS: Array<{ key: keyof Copy; columns: Array<{ key: keyof Copy; value: Read }> }> = [
  { key: 'statsGroupDraws', columns: [{ key: 'statsDraws', value: draws }] },
  {
    key: 'statsGroupTarot',
    columns: [
      { key: 'statsFromTarot', value: fromTarot },
      { key: 'statsOfThemDrew', value: fromTarotDrew },
      { key: 'statsToTarot', value: toTarot },
      { key: 'statsClaims', value: claims },
    ],
  },
  {
    key: 'statsGroupShare',
    columns: [
      { key: 'statsShares', value: shares },
      { key: 'statsScanned', value: (row) => sum(row, ['visit:share-qr']) },
      { key: 'statsLinked', value: (row) => sum(row, ['visit:share-link']) },
      { key: 'statsOldShares', value: (row) => sum(row, ['visit:share-unknown']) },
      { key: 'statsOfThemDrew', value: fromShareDrew },
    ],
  },
];
const percent = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%');

export default function StatsPanel() {
  const t = useT();
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [days, setDays] = useState<DailyStats[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api<{ days: DailyStats[] }>(`/api/stats?days=${range}`)
      .then((body) => {
        if (!cancelled) setDays(body.days);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause, t));
      });
    return () => {
      cancelled = true;
    };
  }, [range, t]);

  const total = (value: Read): number => (days ?? []).reduce((acc, row) => acc + value(row), 0);
  const metricTotal = (metric: Metric): number => total((row) => row.counts[metric] ?? 0);

  /** The few numbers worth seeing before the table, for the chosen range. */
  const cards: Array<{ label: keyof Copy; value: number; detail: string }> = days
    ? [
        { label: 'statsDraws', value: total(draws), detail: t('statsCardDrawsDetail', { n: range }) },
        {
          label: 'statsFromTarot',
          value: total(fromTarot),
          detail: t('statsCardDrew', { n: total(fromTarotDrew), rate: percent(total(fromTarotDrew), total(fromTarot)) }),
        },
        {
          label: 'statsFromShare',
          value: total(fromShare),
          detail: t('statsCardShareDetail', {
            qr: metricTotal('visit:share-qr'),
            link: metricTotal('visit:share-link'),
            old: metricTotal('visit:share-unknown'),
          }),
        },
        {
          label: 'statsFromShareDrewCard',
          value: total(fromShareDrew),
          detail: t('statsCardRate', { rate: percent(total(fromShareDrew), total(fromShare)) }),
        },
        {
          label: 'statsToTarot',
          value: total(toTarot),
          detail: t('statsCardClaims', { n: total(claims) }),
        },
        {
          label: 'statsShares',
          value: total(shares),
          detail: t('statsCardSharesDetail', {
            sent: metricTotal('share:sent'),
            saved: metricTotal('share:downloaded'),
          }),
        },
      ]
    : [];

  return (
    <div className="stats-panel">
      <p className="muted small">{t('statsNote')}</p>
      <div className="row stats-range" role="group" aria-label={t('statsRangeLabel')}>
        {RANGES.map((n) => (
          <button
            key={n}
            type="button"
            className={`text-action tiny${n === range ? ' strong' : ''}`}
            aria-pressed={n === range}
            onClick={() => setRange(n)}
          >
            {t('statsDays', { n })}
          </button>
        ))}
      </div>

      {error && <div className="notice error">{error}</div>}
      {!days && !error && <p className="muted small">{t('statsLoading')}</p>}

      {days && (
        <>
          <ul className="stats-cards">
            {cards.map((card) => (
              <li className="stats-card" key={card.label}>
                <span className="stats-card-label">{t(card.label)}</span>
                <strong className="stats-card-value">{card.value}</strong>
                <span className="stats-card-detail">{card.detail}</span>
              </li>
            ))}
          </ul>

          <div className="stats-table-wrap" tabIndex={0} aria-label={t('statsTableLabel')}>
            <table className="stats-table">
              <thead>
                <tr className="stats-groups">
                  <th scope="col" rowSpan={2} className="stats-day">
                    {t('statsDay')}
                  </th>
                  {GROUPS.map((group) => (
                    <th scope="colgroup" colSpan={group.columns.length} key={group.key}>
                      {t(group.key)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {GROUPS.flatMap((group) =>
                    group.columns.map((column, index) => (
                      <th scope="col" key={`${group.key}-${column.key}`} className={index === 0 ? 'group-start' : undefined}>
                        {t(column.key)}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr className="stats-total">
                  <th scope="row" className="stats-day">
                    {t('statsTotal')}
                  </th>
                  {GROUPS.flatMap((group) =>
                    group.columns.map((column, index) => (
                      <td key={`${group.key}-${column.key}`} className={index === 0 ? 'group-start' : undefined}>
                        {total(column.value)}
                      </td>
                    )),
                  )}
                </tr>
                {days.map((row) => (
                  <tr key={row.day}>
                    <th scope="row" className="stats-day">
                      {row.day.slice(5)}
                    </th>
                    {GROUPS.flatMap((group) =>
                      group.columns.map((column, index) => {
                        const value = column.value(row);
                        const classes = [index === 0 ? 'group-start' : '', value === 0 ? 'is-zero' : '']
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <td key={`${group.key}-${column.key}`} className={classes || undefined}>
                            {value}
                          </td>
                        );
                      }),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            {t('statsTarotBreakdown', {
              outro: metricTotal('visit:tarot-outro'),
              locked: metricTotal('visit:tarot-locked'),
              share: metricTotal('visit:tarot-share'),
              other: metricTotal('visit:tarot-other'),
            })}
          </p>
          <p className="muted small">{t('statsHowTo')}</p>
        </>
      )}
    </div>
  );
}

