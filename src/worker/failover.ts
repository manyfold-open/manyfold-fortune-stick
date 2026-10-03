/**
 * Running one turn against whichever connected agent can take it.
 *
 * Connecting a second agent, ideally one that runs somewhere else, is the whole
 * setup: readings are shared out across the connected agents, and when the one a
 * turn lands on fails (its runner is gone, the stream dies, it is out of quota,
 * it times out) the same turn goes to the next one. The visitor only sees an
 * error once every agent has failed.
 *
 * What does not change when a turn moves to another agent:
 *  · the stick. This module only chooses who interprets; nothing here touches
 *    `stick_no` (AGENTS.md invariants 4 and 5);
 *  · the prompt and the A2A messageId. A messageId only means something to the agent
 *    that receives it, so two agents cannot dedupe each other, and the second agent
 *    is a different bill only because the first one never answered;
 *  · grounding. A follow-up prompt carries the question, stick and reading
 *    (`buildFollowUpPrompt`), so an agent that never saw the first turn answers the
 *    same reading.
 *
 * What does: the agent's own `contextId` / `taskId` belong to the agent that issued
 * them, so they are only sent back to that agent (`reading_agents`).
 *
 * A reply that arrives but cannot be parsed is not a failover case: the agent did
 * answer (and bill), and another agent would be a second bill for the same question.
 */

import type { ConnectedAgent } from '../shared/types';
import { reportAgentFailure, reportAgentSuccess, type FailureKind } from './alerts';
import { markAgentDown, markAgentUp, orderAgents } from './agent-health';
import { credentialFor, listConnectedAgents } from './connect';
import { HttpError, type AgentCredential, type Env } from './types';

/** A turn handed on to another agent gets at most this long, so the next one has time left. */
export const HANDOFF_ATTEMPT_MS = 60_000;
/** Never start another agent with less than this left of the budget. */
const MIN_ATTEMPT_MS = 10_000;

const notExpired = (expiresAt: string | null): boolean => !expiresAt || Date.parse(expiresAt) > Date.now();

/**
 * The agents a turn may use, in the order to try them. Throws `no_interpreter`
 * before anything is billed or streamed when none is connected.
 */
export async function planAgents(
  env: Env,
  seed: string,
  preferred: string | null = null,
): Promise<ConnectedAgent[]> {
  const usable = (await listConnectedAgents(env)).filter((agent) => notExpired(agent.expiresAt));
  if (usable.length === 0) {
    throw new HttpError(
      503,
      'no_interpreter',
      '解签的 agent 还没连上。先到设置页连接一个 Manyfold agent。',
    );
  }
  const down = new Map<string, number>();
  for (const agent of usable) if (agent.lastFailedAt) down.set(agent.agentId, Date.parse(agent.lastFailedAt));
  return orderAgents(usable, down, seed, Date.now(), preferred);
}

export interface Attempt {
  agent: ConnectedAgent;
  cred: AgentCredential;
  /** How long this attempt may take. */
  timeoutMs: number;
  /** How many agents this turn could have used; with one, there is nowhere to hand on to. */
  total: number;
}

/**
 * Tries `agents` in order until one of them completes `run`.
 *
 * Every failure marks that agent down. A failure that is handed on is reported
 * here; the failure that ends the turn is thrown for the caller to report, as it
 * always did, so a visitor-visible failure is still reported exactly once.
 */
export async function withFailover<T>(
  env: Env,
  options: {
    agents: ConnectedAgent[];
    kind: FailureKind;
    /** What the last (or only) agent gets. */
    attemptMs: number;
    /** What the whole turn gets, across every agent. */
    budgetMs: number;
    /** False once handing on would be wrong, e.g. text has already reached the visitor. */
    canHandOn?: () => boolean;
    run: (attempt: Attempt) => Promise<T>;
  },
): Promise<{ value: T; agent: ConnectedAgent }> {
  const { agents } = options;
  const startedAt = Date.now();
  let failure: unknown = new HttpError(503, 'no_interpreter', 'No agent is connected.');

  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index];
    const remaining = options.budgetMs - (Date.now() - startedAt);
    if (index > 0 && remaining < MIN_ATTEMPT_MS) break;
    const hasNext = index < agents.length - 1;
    const timeoutMs = Math.max(
      MIN_ATTEMPT_MS,
      Math.min(hasNext ? Math.min(options.attemptMs, HANDOFF_ATTEMPT_MS) : options.attemptMs, remaining),
    );

    try {
      const cred = await credentialFor(env, agent.agentId);
      const value = await options.run({ agent, cred, timeoutMs, total: agents.length });
      return { value, agent };
    } catch (error) {
      failure = error;
      await markAgentDown(env, agent.agentId);
      if (options.canHandOn && !options.canHandOn()) throw error;
      if (hasNext) await reportAgentFailure(env, options.kind, error);
    }
  }
  throw failure;
}

/**
 * A turn succeeded on `agentId`. Clears that agent's mark, and announces a recovery
 * only if nothing else is still down: the healthy agent answering is not news
 * while the broken one is still broken.
 */
export async function noteAgentOk(env: Env, agentId: string): Promise<void> {
  await markAgentUp(env, agentId);
  const stillDown = (await listConnectedAgents(env)).some((agent) => agent.lastFailedAt !== null);
  if (!stillDown) await reportAgentSuccess(env);
}
