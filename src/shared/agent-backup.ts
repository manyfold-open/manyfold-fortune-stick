/**
 * What the settings page tells the deployer about backup agents.
 *
 * Failover is silent: when one agent fails, visitors see nothing, and neither does
 * the deployer. So the page has to say when there is nothing to fall back on, which
 * `verified` cannot, because it is only the probe made when the agent was connected.
 * `lastFailedAt` (set by a failed turn, cleared by the next good one) is what shows
 * an agent whose runner went down later.
 */

import type { ConnectedAgent } from './types';

export type BackupState =
  /** Nothing usable is connected; the page already says so. */
  | 'none'
  /** One usable agent: if it fails there is nothing to hand the turn to. */
  | 'single'
  /** Several connected, but only one has not failed recently. */
  | 'one-left'
  /** Several connected, more than one working, or none working (each card says why). */
  | 'ok';

export interface BackupHint {
  state: BackupState;
  /** For `one-left`: the agent still working. */
  workingName: string | null;
}

export function backupHint(agents: ConnectedAgent[], nowMs: number = Date.now()): BackupHint {
  const usable = agents.filter((agent) => !agent.expiresAt || Date.parse(agent.expiresAt) > nowMs);
  if (usable.length === 0) return { state: 'none', workingName: null };
  if (usable.length === 1) return { state: 'single', workingName: null };
  const working = usable.filter((agent) => agent.lastFailedAt === null);
  if (working.length === 1) return { state: 'one-left', workingName: working[0].name };
  return { state: 'ok', workingName: null };
}
