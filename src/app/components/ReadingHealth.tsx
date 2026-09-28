/**
 * Reading health, under the daily numbers on #settings: of the sticks drawn,
 * how many people actually saw a reading, how long 解籤 kept them waiting, how
 * often the agent answered and how fast, and where each stick finally ended up.
 * It answers whether people who draw and never reach Tarot were let down by
 * the agent, by the wait, or just stopped at the slip.
 *
 * Two kinds of numbers. The counts (seen, waiting, tries) exist only from the
 * day they began, so their rates only divide by draws on those days. The
 * final state is read back from the readings table and goes back to the first
 * stick. Totals only, like everything else on this page.
 */

import {
  FALLBACK_REASONS,
  TAROT_DRAWS,
  REPLY_BUCKETS,
  type DailyStats,
  type FallbackReason,
  type Metric,
} from '../../shared/stats';
import { useT } from '../i18n';
import { StatsCards, StatsTable, one, percent, sum, total, type Card, type Group, type Read } from './StatsTable';

const FALLBACKS = FALLBACK_REASONS.map((reason) => `interpret:fallback-${reason}` as const);
const REPLIES = REPLY_BUCKETS.map((bucket) => `interpret:${bucket}` as const);
const SHOWN: Metric[] = ['reading:shown-ai', 'reading:shown-fallback'];

const AGAIN: Metric[] = ['reading:again-seen', 'reading:again-unseen'];

const shown: Read = (row) => sum(row, SHOWN);
const again: Read = (row) => sum(row, AGAIN);
const tarotDrew: Read = (row) => sum(row, TAROT_DRAWS);
const triesOk = one('interpret:ok');
const triesFellBack: Read = (row) => sum(row, FALLBACKS);
const endedFellBack: Read = (row) =>
  Object.values(row.outcomes.fallback).reduce((acc: number, n) => acc + (n ?? 0), 0);

/** A day on which the counts below were already being kept. */
const counted = (row: DailyStats): boolean =>
  Object.entries(row.counts).some(([metric, n]) => /^(interpret|reading|wait):/.test(metric) && (n ?? 0) > 0);

const GROUPS: Group[] = [
  {
    key: 'healthGroupSeen',
    columns: [
      { key: 'statsDraws', value: (row) => row.draws },
      { key: 'healthSaw', value: shown },
      { key: 'healthOfThemFallback', value: one('reading:shown-fallback') },
      { key: 'healthAgain', value: again },
      { key: 'healthAgainUnseen', value: one('reading:again-unseen') },
    ],
  },
  {
    key: 'healthGroupWait',
    columns: [
      { key: 'healthReady', value: one('wait:ready') },
      { key: 'healthUnder3', value: one('wait:lt3') },
      { key: 'healthUnder10', value: one('wait:lt10') },
      { key: 'healthUnder30', value: one('wait:lt30') },
      { key: 'health30More', value: one('wait:30plus') },
      { key: 'healthLeft', value: one('wait:left') },
    ],
  },
  {
    key: 'healthGroupTries',
    columns: [
      { key: 'healthAi', value: triesOk },
      { key: 'healthFallback', value: triesFellBack },
      { key: 'healthRetries', value: one('interpret:retry') },
      { key: 'healthUnder10', value: one('interpret:t10') },
      { key: 'healthUnder20', value: one('interpret:t20') },
      { key: 'healthUnder30', value: one('interpret:t30') },
      { key: 'healthUnder60', value: one('interpret:t60') },
      { key: 'healthLonger', value: one('interpret:t60plus') },
    ],
  },
  {
    key: 'healthGroupFinal',
    columns: [
      { key: 'healthAi', value: (row) => row.outcomes.ai },
      { key: 'healthFallback', value: endedFellBack },
      { key: 'healthStuck', value: (row) => row.outcomes.stuck },
    ],
  },
];

export default function ReadingHealth(props: { days: DailyStats[]; rows: DailyStats[] }) {
  const t = useT();
  const { days } = props;
  const since = days.filter(counted);
  const firstCounted = since[since.length - 1]?.day;
  // 再求一籤 began to be counted later than the rest, so it keeps its own days.
  const againSince = days.filter((row) => again(row) > 0);
  const of = (value: Read) => total(days, value);
  const metric = (m: Metric) => of(one(m));
  const tries = of(triesOk) + of(triesFellBack);
  const replies = of((row) => sum(row, REPLIES));
  const waits = of((row) =>
    sum(row, ['wait:ready', 'wait:lt3', 'wait:lt10', 'wait:lt30', 'wait:30plus', 'wait:left']),
  );
  const ended = of((row) => row.outcomes.ai) + of(endedFellBack) + of((row) => row.outcomes.stuck);
  const reasons = (read: (reason: FallbackReason) => number) => ({
    unparseable: read('unparseable'),
    empty: read('empty'),
    timeout: read('timeout'),
    manyfold: read('manyfold'),
    noAgent: read('no-interpreter'),
    other: read('other'),
  });

  const cards: Card[] = [
    {
      label: 'healthSawCard',
      value: percent(total(since, shown), total(since, (row) => row.draws)),
      detail: t('healthSawDetail', {
        n: total(since, shown),
        draws: total(since, (row) => row.draws),
        fallback: total(since, one('reading:shown-fallback')),
      }),
    },
    {
      // Of the Tarot visitors who drew, how often someone went back. Divided by
      // draws, not by readings seen: the claim plaque sits above 解籤, so many go
      // back without ever opening the reading. Same basis as the 43% baseline.
      label: 'healthClaimCard',
      value: percent(of(one('tarot:opened')), of(tarotDrew)),
      detail: t('healthClaimDetail', { n: of(one('tarot:opened')), drew: of(tarotDrew) }),
    },
    {
      label: 'healthAgainCard',
      value: percent(total(againSince, again), total(againSince, (row) => row.draws)),
      detail: t('healthAgainDetail', {
        n: total(againSince, again),
        draws: total(againSince, (row) => row.draws),
        unseen: total(againSince, one('reading:again-unseen')),
      }),
    },
    {
      label: 'healthWaitCard',
      value: percent(metric('wait:ready'), waits),
      detail: t('healthWaitDetail', {
        lt3: metric('wait:lt3'),
        lt10: metric('wait:lt10'),
        lt30: metric('wait:lt30'),
        more: metric('wait:30plus'),
        left: metric('wait:left'),
      }),
    },
    {
      label: 'healthTriesCard',
      value: percent(of(triesOk), tries),
      detail: t('healthTriesDetail', { ok: of(triesOk), tries, retries: metric('interpret:retry') }),
    },
    {
      label: 'healthReplyCard',
      value: percent(metric('interpret:t10'), replies),
      detail: t('healthReplyDetail', {
        t20: metric('interpret:t20'),
        t30: metric('interpret:t30'),
        t60: metric('interpret:t60'),
        more: metric('interpret:t60plus'),
      }),
    },
    {
      label: 'healthFinalCard',
      value: percent(of(endedFellBack), ended),
      detail: t('healthFinalDetail', {
        ai: of((row) => row.outcomes.ai),
        fallback: of(endedFellBack),
        stuck: of((row) => row.outcomes.stuck),
      }),
    },
  ];

  return (
    <>
      <h3>{t('healthTitle')}</h3>
      <p className="muted small">
        {firstCounted ? t('healthNote', { day: firstCounted.slice(5) }) : t('healthNoteNone')}
      </p>
      <StatsCards cards={cards} />
      <StatsTable label={t('healthTableLabel')} groups={GROUPS} totals={days} rows={props.rows} />
      <p className="muted small">
        {t('healthTriesWhy', reasons((reason) => metric(`interpret:fallback-${reason}`)))}
      </p>
      <p className="muted small">
        {t('healthFinalWhy', reasons((reason) => of((row) => row.outcomes.fallback[reason] ?? 0)))}
      </p>
      <p className="muted small">{t('healthHowTo')}</p>
    </>
  );
}
