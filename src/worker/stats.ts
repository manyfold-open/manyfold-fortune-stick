/**
 * Daily counts for the deployer's #settings page. One row per Taipei day and
 * metric, holding nothing but a number: no visitor, question, stick or reading
 * is stored against it. Draws and Tarot reward codes are read straight from
 * the tables that already hold them, so they need no counting of their own.
 */

import { fallbackReason, isMetric, type DailyStats, type Metric } from '../shared/stats';
import { taipeiDay } from './tarot-bridge';
import type { Env } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_STATS_DAYS = 90;
/** A stick still uninterpreted this long after it was drawn is not coming: the
 *  interpretation is 90 seconds at most, and nothing retries it on its own. */
export const STUCK_AFTER_MS = 2 * 60 * 1000;

/** Counts a metric as a side note to something else: a count that cannot be
 *  written must never fail the work it was counting. */
export const bumpStatQuietly = (env: Env, metric: Metric, nowMs?: number): Promise<void> =>
  bumpStat(env, metric, nowMs).catch(() => undefined);

/** Adds one to today's count for a metric. Unknown metrics are ignored. */
export async function bumpStat(env: Env, metric: Metric, nowMs: number = Date.now()): Promise<void> {
  if (!isMetric(metric)) return;
  await env.DB.prepare(
    `INSERT INTO daily_stats (day, metric, count) VALUES (?, ?, 1)
     ON CONFLICT (day, metric) DO UPDATE SET count = count + 1`,
  )
    .bind(taipeiDay(nowMs), metric)
    .run();
}

/** The last `days` Taipei days, newest first, today included even if empty. */
export async function readStats(env: Env, days: number, nowMs: number = Date.now()): Promise<DailyStats[]> {
  const span = Math.min(Math.max(Math.floor(days) || 1, 1), MAX_STATS_DAYS);
  const dayList = Array.from({ length: span }, (_, i) => taipeiDay(nowMs - i * DAY_MS));
  const since = dayList[dayList.length - 1]!;
  // readings.created_at is UTC ISO; +8 hours puts it on its Taipei day.
  const stuckBefore = new Date(nowMs - STUCK_AFTER_MS).toISOString();
  const [counts, draws, claims, outcomes] = await Promise.all([
    env.DB.prepare('SELECT day, metric, count FROM daily_stats WHERE day >= ?')
      .bind(since)
      .all<{ day: string; metric: string; count: number }>(),
    env.DB.prepare(
      `SELECT date(created_at, '+8 hours') AS day, COUNT(*) AS n FROM readings
       WHERE date(created_at, '+8 hours') >= ? GROUP BY 1`,
    )
      .bind(since)
      .all<{ day: string; n: number }>(),
    env.DB.prepare('SELECT day, COUNT(*) AS n FROM tarot_claims WHERE day >= ? GROUP BY day')
      .bind(since)
      .all<{ day: string; n: number }>(),
    // Where each stick ended up. Only the start of a failure's error is read,
    // enough to sort it; the sentence itself never leaves this function.
    env.DB.prepare(
      `SELECT date(created_at, '+8 hours') AS day, status,
              CASE WHEN status = 'failed' THEN substr(error, 1, 80) END AS error,
              COUNT(*) AS n, SUM(created_at < ?) AS old
       FROM readings WHERE date(created_at, '+8 hours') >= ? GROUP BY 1, 2, 3`,
    )
      .bind(stuckBefore, since)
      .all<{ day: string; status: string; error: string | null; n: number; old: number }>(),
  ]);
  const byDay = new Map<string, DailyStats>(
    dayList.map((day) => [day, { day, draws: 0, claims: 0, outcomes: { ai: 0, fallback: {}, stuck: 0 }, counts: {} }]),
  );
  for (const row of counts.results ?? []) {
    const entry = byDay.get(row.day);
    if (entry && isMetric(row.metric)) entry.counts[row.metric] = Number(row.count);
  }
  for (const row of draws.results ?? []) {
    const entry = byDay.get(row.day);
    if (entry) entry.draws = Number(row.n);
  }
  for (const row of claims.results ?? []) {
    const entry = byDay.get(row.day);
    if (entry) entry.claims = Number(row.n);
  }
  for (const row of outcomes.results ?? []) {
    const entry = byDay.get(row.day);
    if (!entry) continue;
    const { outcomes: out } = entry;
    if (row.status === 'interpreted') out.ai += Number(row.n);
    else if (row.status === 'failed') {
      const reason = fallbackReason(row.error);
      out.fallback[reason] = (out.fallback[reason] ?? 0) + Number(row.n);
    } else if (row.status === 'drawn') out.stuck += Number(row.old);
  }
  return dayList.map((day) => byDay.get(day)!);
}
