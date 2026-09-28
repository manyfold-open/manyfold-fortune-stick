/**
 * The share experiment, on #settings: the top and bottom sticks ask to be
 * shared, the rest do not, and their share rates sit side by side. Only days
 * from SHARE_EXPERIMENT_SINCE count, so a day half before it cannot skew the
 * rates. Openings of the share panel against shares that went out tell apart
 * people who never wanted to share from people who tried and gave up.
 */

import { SHARE_EXPERIMENT_SINCE, type DailyStats } from '../../shared/stats';
import { useT } from '../i18n';
import { StatsCards, one, sum, total, type Card } from './StatsTable';

/** Share rates are small; a whole percent would round most of them to 0%. */
const rate = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '0%';

export default function ShareExperiment(props: { days: DailyStats[] }) {
  const t = useT();
  const days = props.days.filter((row) => row.day >= SHARE_EXPERIMENT_SINCE);
  const of = (read: (row: DailyStats) => number) => total(days, read);
  const opened = of(one('share:opened'));
  const done = of((row) => sum(row, ['share:sent', 'share:downloaded']));
  const extremeDone = of(one('share:extreme-done'));
  const extremeDraws = of((row) => row.extremeDraws);
  const otherDraws = of((row) => row.draws) - extremeDraws;
  const otherDone = done - extremeDone;

  const cards: Card[] = [
    {
      label: 'shareExpOpened',
      value: opened,
      detail: t('shareExpOpenedDetail', { done, rate: rate(done, opened) }),
    },
    {
      label: 'shareExpExtreme',
      value: rate(extremeDone, extremeDraws),
      detail: t('shareExpRateDetail', {
        done: extremeDone,
        draws: extremeDraws,
        opened: of(one('share:extreme-opened')),
      }),
    },
    {
      label: 'shareExpOther',
      value: rate(otherDone, otherDraws),
      detail: t('shareExpRateDetail', {
        done: otherDone,
        draws: otherDraws,
        opened: opened - of(one('share:extreme-opened')),
      }),
    },
  ];

  return (
    <>
      <h3>{t('shareExpTitle')}</h3>
      <p className="muted small">{t('shareExpNote', { day: SHARE_EXPERIMENT_SINCE.slice(5) })}</p>
      {days.length > 0 ? <StatsCards cards={cards} /> : <p className="muted small">{t('shareExpNotYet')}</p>}
    </>
  );
}
