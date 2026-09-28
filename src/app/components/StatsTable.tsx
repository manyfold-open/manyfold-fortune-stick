/**
 * The two pieces every block of numbers on #settings is made of: a row of
 * summary cards for the chosen range, and a day-by-day table whose columns sit
 * in named groups. Daily numbers and Reading health both use them.
 */

import type { Copy } from '../../shared/i18n';
import type { DailyStats, Metric } from '../../shared/stats';
import { useT } from '../i18n';

/** One number for one day. */
export type Read = (row: DailyStats) => number;

export const sum = (row: DailyStats, metrics: readonly Metric[]): number =>
  metrics.reduce((total, metric) => total + (row.counts[metric] ?? 0), 0);

export const one =
  (metric: Metric): Read =>
  (row) =>
    row.counts[metric] ?? 0;

export const total = (days: readonly DailyStats[], value: Read): number =>
  days.reduce((acc, row) => acc + value(row), 0);

export const percent = (part: number, whole: number): string =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%';

export interface Card {
  label: keyof Copy;
  value: number | string;
  detail: string;
}

export type Group = { key: keyof Copy; columns: Array<{ key: keyof Copy; value: Read }> };

export function StatsCards(props: { cards: Card[] }) {
  const t = useT();
  return (
    <ul className="stats-cards">
      {props.cards.map((card) => (
        <li className="stats-card" key={card.label}>
          <span className="stats-card-label">{t(card.label)}</span>
          <strong className="stats-card-value">{card.value}</strong>
          <span className="stats-card-detail">{card.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** `totals` are the whole range; `rows` the days to list, newest first. */
export function StatsTable(props: { label: string; groups: Group[]; totals: readonly DailyStats[]; rows: readonly DailyStats[] }) {
  const t = useT();
  const { groups } = props;
  return (
    <div className="stats-table-wrap" tabIndex={0} aria-label={props.label}>
      <table className="stats-table">
        <thead>
          <tr className="stats-groups">
            <th scope="col" rowSpan={2} className="stats-day">
              {t('statsDay')}
            </th>
            {groups.map((group) => (
              <th scope="colgroup" colSpan={group.columns.length} key={group.key}>
                {t(group.key)}
              </th>
            ))}
          </tr>
          <tr>
            {groups.flatMap((group) =>
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
            {groups.flatMap((group) =>
              group.columns.map((column, index) => (
                <td key={`${group.key}-${column.key}`} className={index === 0 ? 'group-start' : undefined}>
                  {total(props.totals, column.value)}
                </td>
              )),
            )}
          </tr>
          {props.rows.map((row) => (
            <tr key={row.day}>
              <th scope="row" className="stats-day">
                {row.day.slice(5)}
              </th>
              {groups.flatMap((group) =>
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
  );
}
