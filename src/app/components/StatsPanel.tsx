/**
 * The deployer's daily counts, on #settings only. Totals per Taipei day and
 * nothing else: where visits came from (a shared stick by QR or link, or one of
 * Tarot's links), how many of them went on to draw, how many sticks were
 * shared, and how many visitors went on to Tarot. A stand-in until a real
 * analytics setup exists; it reads GET /api/stats behind the admin password.
 */

import { useEffect, useState } from 'react';
import type { DailyStats, Metric } from '../../shared/stats';
import type { Copy } from '../../shared/i18n';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';

const RANGES = [7, 14, 30] as const;

const sum = (row: DailyStats, metrics: Metric[]): number =>
  metrics.reduce((total, metric) => total + (row.counts[metric] ?? 0), 0);

const TAROT_VISITS: Metric[] = ['visit:tarot-outro', 'visit:tarot-locked', 'visit:tarot-share', 'visit:tarot-other'];
const TAROT_DRAWS: Metric[] = ['draw:tarot-outro', 'draw:tarot-locked', 'draw:tarot-share', 'draw:tarot-other'];
const SHARE_DRAWS: Metric[] = ['draw:share-qr', 'draw:share-link', 'draw:share-unknown'];

/** The table's columns: a heading key and how to read the number off a day. */
const COLUMNS: Array<{ key: keyof Copy; value: (row: DailyStats) => number }> = [
  { key: 'statsDraws', value: (row) => row.draws },
  { key: 'statsFromTarot', value: (row) => sum(row, TAROT_VISITS) },
  { key: 'statsFromTarotDrew', value: (row) => sum(row, TAROT_DRAWS) },
  { key: 'statsToTarot', value: (row) => sum(row, ['tarot:opened']) },
  { key: 'statsClaims', value: (row) => row.claims },
  { key: 'statsShares', value: (row) => sum(row, ['share:sent', 'share:downloaded']) },
  { key: 'statsScanned', value: (row) => sum(row, ['visit:share-qr']) },
  { key: 'statsLinked', value: (row) => sum(row, ['visit:share-link']) },
  { key: 'statsOldShares', value: (row) => sum(row, ['visit:share-unknown']) },
  { key: 'statsFromShareDrew', value: (row) => sum(row, SHARE_DRAWS) },
];

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

  const total = (value: (row: DailyStats) => number): number =>
    (days ?? []).reduce((acc, row) => acc + value(row), 0);
  const placement = (metric: Metric): number => (days ?? []).reduce((acc, row) => acc + (row.counts[metric] ?? 0), 0);

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
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">{t('statsDay')}</th>
                  {COLUMNS.map((column) => (
                    <th scope="col" key={column.key}>
                      {t(column.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="stats-total">
                  <th scope="row">{t('statsTotal')}</th>
                  {COLUMNS.map((column) => (
                    <td key={column.key}>{total(column.value)}</td>
                  ))}
                </tr>
                {days.map((row) => (
                  <tr key={row.day}>
                    <th scope="row">{row.day.slice(5)}</th>
                    {COLUMNS.map((column) => {
                      const value = column.value(row);
                      return (
                        <td key={column.key} className={value === 0 ? 'is-zero' : undefined}>
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            {t('statsTarotBreakdown', {
              outro: placement('visit:tarot-outro'),
              locked: placement('visit:tarot-locked'),
              share: placement('visit:tarot-share'),
              other: placement('visit:tarot-other'),
            })}
          </p>
          <p className="muted small">{t('statsHowTo')}</p>
        </>
      )}
    </div>
  );
}
