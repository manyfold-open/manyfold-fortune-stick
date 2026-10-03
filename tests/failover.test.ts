/**
 * Two agents: when one is down the other answers, and nothing about the stick moves.
 *
 * Driven against a real SQLite database with `fetch` stubbed per agent host, so what
 * is asserted is who was called, with what, and what the visitor ended up with.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_COOLDOWN_MS, orderAgents } from '../src/worker/agent-health';
import { saveDiscordWebhook, reportAgentFailure } from '../src/worker/alerts';
import { seal } from '../src/worker/crypto';
import { ensureSchema } from '../src/worker/db';
import { listConnectedAgents } from '../src/worker/connect';
import { noteAgentOk } from '../src/worker/failover';
import { createReading, handleFollowUp, interpretReading } from '../src/worker/fortune';
import type { ConnectedAgent } from '../src/shared/types';
import type { Env } from '../src/worker/types';
import { createD1, type FakeD1 } from './support/d1';

const QUESTION = '我该不该换工作呢';
const RUNNER_DOWN = "The agent's computer is unavailable. Reconnect it and try again.";

let d1: FakeD1;
let env: Env;
/** host → every request body it received. */
let calls: Record<string, any[]>;
/** host → how it answers. */
let behaviour: Record<string, 'ok' | 'runner-down' | 'ok-after-text-then-fail'>;
let discordPosts: string[];

beforeAll(() => {
  d1 = createD1();
});
afterAll(() => d1.close());

const sse = (...results: unknown[]) =>
  new Response(results.map((result) => `data: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result })}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });

const reply = (text: string, contextId = 'ctx-new') =>
  sse(
    { kind: 'artifact-update', taskId: 't', contextId, artifact: { artifactId: 'a', parts: [{ text }] } },
    { kind: 'status-update', taskId: 't', contextId, status: { state: 'completed' }, final: true },
  );

const ANSWER = JSON.stringify({ meaning: 'm', answer: '这是结合你的问题的解读', notice: 'n', action: 'a' });

async function addAgent(id: string, host: string) {
  const sealed = await seal(env, `token-${id}`);
  d1.query(
    `INSERT INTO agents (agent_id, name, rpc_url, token_ct, token_iv, verified, connected_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    id,
    `Agent ${id}`,
    `https://${host}/rpc`,
    sealed.ciphertext,
    sealed.iv,
    new Date().toISOString(),
  );
}

beforeEach(async () => {
  env = {
    DB: d1.db,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    ENVIRONMENT: 'test',
    CONFIG_ENCRYPTION_KEY: 'k'.repeat(40),
  } as Env;
  await ensureSchema(env.DB);
  for (const table of ['agents', 'readings', 'reading_messages', 'reading_agents', 'agent_failures']) {
    d1.query(`DELETE FROM ${table}`);
  }
  d1.query("DELETE FROM settings WHERE key LIKE 'agent:down:%' OR key LIKE 'alerts:%'");
  calls = { 'a.test': [], 'b.test': [] };
  behaviour = { 'a.test': 'ok', 'b.test': 'ok' };
  discordPosts = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === 'discord.com') {
      discordPosts.push(JSON.parse(String(init?.body)).content);
      return new Response(null, { status: 204 });
    }
    const body = JSON.parse(String(init?.body));
    calls[url.hostname].push(body);
    const how = behaviour[url.hostname];
    if (how === 'runner-down') {
      return sse({
        kind: 'status-update',
        taskId: 't',
        status: { state: 'failed', message: { parts: [{ text: RUNNER_DOWN }] } },
        final: true,
      });
    }
    return reply(url.pathname === '/rpc' && /追问|【他的追问】/.test(JSON.stringify(body)) ? '追问的回答' : ANSWER);
  });
  await addAgent('a', 'a.test');
  await addAgent('b', 'b.test');
});

afterEach(() => vi.unstubAllGlobals());

const owner = (readingId: string) =>
  (d1.query('SELECT agent_id FROM reading_agents WHERE reading_id = ?', readingId)[0] as any)?.agent_id;
const isDown = (agentId: string) => d1.query('SELECT 1 FROM settings WHERE key = ?', `agent:down:${agentId}`).length > 0;

/** Makes agent `first` the one a reading goes to first, whatever the spread says. */
function preferAgent(readingId: string, agentId: string, contextId = 'ctx-old') {
  d1.query('INSERT INTO reading_agents (reading_id, agent_id) VALUES (?, ?)', readingId, agentId);
  d1.query('UPDATE readings SET context_id = ? WHERE id = ?', contextId, readingId);
}

describe('解签：一个 agent 挂了，另一个接手', () => {
  it('第一个 agent 的 runner 掉线：换第二个，用户拿到个性化解读，签不变', async () => {
    behaviour['a.test'] = 'runner-down';
    const reading = await createReading(env, QUESTION);
    preferAgent(reading.id, 'a');

    const result = await interpretReading(env, reading.id);

    expect(result.status).toBe('interpreted');
    expect(result.interpretation?.source).toBe('ai');
    expect(result.error).toBeNull();
    expect(result.stick.no).toBe(reading.stick.no);
    expect(calls['a.test']).toHaveLength(1);
    expect(calls['b.test']).toHaveLength(1);
    expect(owner(reading.id)).toBe('b');
    expect(isDown('a')).toBe(true);
    expect(isDown('b')).toBe(false);
  });

  it('换 agent 时不把第一个 agent 的 contextId 带给第二个', async () => {
    behaviour['a.test'] = 'runner-down';
    const reading = await createReading(env, QUESTION);
    preferAgent(reading.id, 'a', 'ctx-of-a');

    await interpretReading(env, reading.id);

    expect(calls['a.test'][0].params.message.contextId).toBe('ctx-of-a');
    expect(calls['b.test'][0].params.message.contextId).toBeUndefined();
    // 两个 agent 收到的是同一则提示词：解读同一支签。
    expect(calls['b.test'][0].params.message.parts[0].text).toBe(calls['a.test'][0].params.message.parts[0].text);
  });

  it('失败过的 agent 之后排到最后：下一位访客不再先撞上它', async () => {
    behaviour['a.test'] = 'runner-down';
    const first = await createReading(env, QUESTION);
    preferAgent(first.id, 'a');
    await interpretReading(env, first.id);
    calls['a.test'].length = 0;
    calls['b.test'].length = 0;

    for (let index = 0; index < 5; index += 1) {
      const next = await createReading(env, QUESTION);
      expect((await interpretReading(env, next.id)).status).toBe('interpreted');
    }
    expect(calls['a.test']).toHaveLength(0);
    expect(calls['b.test']).toHaveLength(5);
  });

  it('两个都挂：落回这支签自己的解释，错误原因保留，签不变', async () => {
    behaviour['a.test'] = 'runner-down';
    behaviour['b.test'] = 'runner-down';
    const reading = await createReading(env, QUESTION);

    const result = await interpretReading(env, reading.id);

    expect(result.status).toBe('failed');
    expect(result.interpretation?.source).toBe('fallback');
    expect(result.error).toContain('computer is unavailable');
    expect(result.stick.no).toBe(reading.stick.no);
    expect(calls['a.test']).toHaveLength(1);
    expect(calls['b.test']).toHaveLength(1);
    // 每个失败都记了一行，没有重复记录最后那一次。
    expect(d1.query('SELECT 1 FROM agent_failures')).toHaveLength(2);
  });

  it('只有一个 agent 且它挂了：照旧，一次调用，没有别处可去', async () => {
    d1.query("DELETE FROM agents WHERE agent_id = 'b'");
    behaviour['a.test'] = 'runner-down';
    const reading = await createReading(env, QUESTION);

    const result = await interpretReading(env, reading.id);

    expect(result.status).toBe('failed');
    expect(calls['a.test']).toHaveLength(1);
  });

  it('agent 回了内容但解析不出来：不换 agent（它已经答了，也已经计费）', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      calls[url.hostname].push(JSON.parse(String(init?.body)));
      return reply('{ "answer": ');
    });
    const reading = await createReading(env, QUESTION);

    const result = await interpretReading(env, reading.id);

    expect(result.status).toBe('failed');
    expect(calls['a.test'].length + calls['b.test'].length).toBe(1);
  });

  it('两个都正常：读数在两个 agent 之间分开，不是全压在一个上', async () => {
    for (let index = 0; index < 40; index += 1) {
      const reading = await createReading(env, QUESTION);
      await interpretReading(env, reading.id);
    }
    expect(calls['a.test'].length).toBeGreaterThan(5);
    expect(calls['b.test'].length).toBeGreaterThan(5);
    expect(calls['a.test'].length + calls['b.test'].length).toBe(40);
  });
});

describe('追问：同样的备援', () => {
  async function drain(response: Response): Promise<any[]> {
    const text = await response.text();
    return text
      .split('\n\n')
      .filter((block) => block.startsWith('data:'))
      .map((block) => JSON.parse(block.slice(5)));
  }

  it('第一个 agent 失败：第二个接手回答，页面上只有第二个的回答', async () => {
    const reading = await createReading(env, QUESTION);
    await interpretReading(env, reading.id);
    const first = owner(reading.id) as string;
    const second = first === 'a' ? 'b' : 'a';
    behaviour[`${first}.test`] = 'runner-down';
    calls['a.test'].length = 0;
    calls['b.test'].length = 0;

    const pending: Promise<unknown>[] = [];
    const response = await handleFollowUp({
      env,
      readingId: reading.id,
      message: '那我该怎么做',
      waitUntil: (promise) => pending.push(promise),
    });
    const events = await drain(response);
    await Promise.all(pending);

    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(events.some((event) => event.type === 'error')).toBe(false);
    // 失败原因不是回答：不会作为 text 事件送到页面上。
    expect(events.some((event) => String(event.text ?? '').includes('computer is unavailable'))).toBe(false);
    expect(calls[`${first}.test`]).toHaveLength(1);
    expect(calls[`${second}.test`]).toHaveLength(1);
    expect(calls[`${second}.test`][0].params.message.contextId).toBeUndefined();
    expect(owner(reading.id)).toBe(second);
  });

  it('两个都失败：页面收到 error，记录里留下失败的那一条', async () => {
    const reading = await createReading(env, QUESTION);
    await interpretReading(env, reading.id);
    behaviour['a.test'] = 'runner-down';
    behaviour['b.test'] = 'runner-down';

    const pending: Promise<unknown>[] = [];
    const response = await handleFollowUp({
      env,
      readingId: reading.id,
      message: '那我该怎么做',
      waitUntil: (promise) => pending.push(promise),
    });
    const events = await drain(response);
    await Promise.all(pending);

    expect(events.at(-1)).toMatchObject({ type: 'error' });
    expect(String(events.at(-1).message)).toContain('computer is unavailable');
    const rows = d1.query("SELECT status FROM reading_messages WHERE role = 'agent'") as any[];
    expect(rows.map((row) => row.status)).toEqual(['error']);
  });
});

describe('恢复通知', () => {
  const WEBHOOK = 'https://discord.com/api/webhooks/123456/abc-DEF_789';

  it('健康的那个 agent 答了，不代表坏的那个好了：另一个还挂着就不报「已恢复」', async () => {
    await saveDiscordWebhook(env, WEBHOOK);
    discordPosts.length = 0;
    await reportAgentFailure(env, 'interpret', 'Agent a runner unavailable');
    expect(discordPosts).toHaveLength(1);
    d1.query("INSERT INTO settings (key, value, updated_at) VALUES ('agent:down:a', ?, ?)", String(Date.now()), 'x');

    await noteAgentOk(env, 'b');
    expect(discordPosts).toHaveLength(1);

    await noteAgentOk(env, 'a');
    expect(discordPosts).toHaveLength(2);
    expect(discordPosts[1]).toContain('已恢復');
    expect(isDown('a')).toBe(false);
  });
});

describe('设置页看得见的失败标记', () => {
  it('失败的 agent 带着 lastFailedAt，下一次成功就清掉；没失败过的是 null', async () => {
    behaviour['a.test'] = 'runner-down';
    const reading = await createReading(env, QUESTION);
    preferAgent(reading.id, 'a');
    await interpretReading(env, reading.id);

    let agents = await listConnectedAgents(env);
    const failed = agents.find((agent) => agent.agentId === 'a')!;
    expect(Date.parse(failed.lastFailedAt!)).toBeGreaterThan(Date.now() - 60_000);
    expect(agents.find((agent) => agent.agentId === 'b')!.lastFailedAt).toBeNull();

    await noteAgentOk(env, 'a');
    agents = await listConnectedAgents(env);
    expect(agents.every((agent) => agent.lastFailedAt === null)).toBe(true);
  });
});

describe('orderAgents', () => {
  const agent = (agentId: string, verified = true): ConnectedAgent => ({
    agentId,
    name: agentId,
    description: '',
    rpcUrl: `https://${agentId}.test/rpc`,
    expiresAt: null,
    verified,
    warning: null,
    connectedAt: '2026-10-01T00:00:00.000Z',
    lastFailedAt: null,
  });
  const NOW = Date.UTC(2026, 9, 3, 12);
  const ids = (list: ConnectedAgent[]) => list.map((entry) => entry.agentId);

  it('同一个 seed 永远得到同一个顺序；不同 seed 会换头一位', () => {
    const agents = [agent('a'), agent('b'), agent('c')];
    expect(ids(orderAgents(agents, new Map(), 'seed-1', NOW))).toEqual(ids(orderAgents(agents, new Map(), 'seed-1', NOW)));
    const firsts = new Set(Array.from({ length: 30 }, (_, index) => orderAgents(agents, new Map(), `s${index}`, NOW)[0].agentId));
    expect(firsts.size).toBe(3);
  });

  it('冷却中的排到最后，冷却过了就恢复原位', () => {
    const agents = [agent('a'), agent('b')];
    const down = new Map([['a', NOW - 1_000]]);
    for (let index = 0; index < 20; index += 1) {
      expect(ids(orderAgents(agents, down, `s${index}`, NOW))).toEqual(['b', 'a']);
    }
    const later = NOW + AGENT_COOLDOWN_MS;
    const firsts = new Set(Array.from({ length: 30 }, (_, index) => orderAgents(agents, down, `s${index}`, later)[0].agentId));
    expect(firsts.size).toBe(2);
  });

  it('全都在冷却：照旧都会试，失败得最早的先试', () => {
    const agents = [agent('a'), agent('b')];
    const down = new Map([['a', NOW - 1_000], ['b', NOW - 60_000]]);
    expect(ids(orderAgents(agents, down, 's', NOW))).toEqual(['b', 'a']);
  });

  it('已验证的排在未验证的前面；持有上下文的 agent 健康时排第一', () => {
    const agents = [agent('a', false), agent('b'), agent('c')];
    expect(orderAgents(agents, new Map(), 's', NOW).at(-1)?.agentId).toBe('a');
    expect(orderAgents(agents, new Map(), 's', NOW, 'c')[0].agentId).toBe('c');
    expect(orderAgents(agents, new Map([['c', NOW - 1]]), 's', NOW, 'c')[0].agentId).not.toBe('c');
  });
});
