import { afterEach, describe, expect, it } from 'vitest';
import {
  A2AError,
  consumeA2AStream,
  foldA2AResults,
  safeErrorText,
  validateA2AUrl,
} from '../src/worker/a2a';

describe('foldA2AResults (stream accumulator)', () => {
  it('accumulates artifact appends and reaches a terminal state', () => {
    const snapshot = foldA2AResults([
      { kind: 'status-update', taskId: 't1', contextId: 'c1', status: { state: 'working' } },
      { kind: 'artifact-update', artifact: { artifactId: 'a', parts: [{ kind: 'text', text: 'Hello' }] } },
      { kind: 'artifact-update', append: true, artifact: { artifactId: 'a', parts: [{ kind: 'text', text: ', world' }] } },
      { kind: 'status-update', status: { state: 'completed' }, final: true },
    ]);
    expect(snapshot.text).toBe('Hello, world');
    expect(snapshot.taskId).toBe('t1');
    expect(snapshot.contextId).toBe('c1');
    expect(snapshot.state).toBe('completed');
    expect(snapshot.terminal).toBe(true);
  });

  it('accepts append on the artifact for compatible A2A servers', () => {
    const snapshot = foldA2AResults([
      { kind: 'artifact-update', artifact: { artifactId: 'a', parts: [{ kind: 'text', text: 'Hello' }] } },
      {
        kind: 'artifact-update',
        artifact: { artifactId: 'a', append: true, parts: [{ kind: 'text', text: ', world' }] },
      },
    ]);
    expect(snapshot.text).toBe('Hello, world');
  });

  it('replaces an artifact when append is not set', () => {
    const snapshot = foldA2AResults([
      { kind: 'artifact-update', artifact: { artifactId: 'a', parts: [{ kind: 'text', text: 'draft' }] } },
      { kind: 'artifact-update', artifact: { artifactId: 'a', parts: [{ kind: 'text', text: 'final' }] } },
    ]);
    expect(snapshot.text).toBe('final');
  });

  it('joins multiple artifacts in insertion order', () => {
    const snapshot = foldA2AResults([
      { kind: 'artifact-update', artifact: { artifactId: 'one', parts: [{ kind: 'text', text: 'first' }] } },
      { kind: 'artifact-update', artifact: { artifactId: 'two', parts: [{ kind: 'text', text: 'second' }] } },
    ]);
    expect(snapshot.text).toBe('first\n\nsecond');
  });

  it('falls back to direct message text, then status text', () => {
    const direct = foldA2AResults([
      { kind: 'message', role: 'agent', parts: [{ kind: 'text', text: 'direct reply' }] },
    ]);
    expect(direct.text).toBe('direct reply');

    const status = foldA2AResults([
      { kind: 'status-update', status: { state: 'working', message: { parts: [{ kind: 'text', text: 'thinking…' }] } } },
    ]);
    expect(status.text).toBe('thinking…');
    // When status text is the only text, it must not double as progress.
    expect(status.progressText).toBe('');
  });

  it('keeps progress narration separate from artifact text', () => {
    const snapshot = foldA2AResults([
      { kind: 'status-update', status: { state: 'working', message: { parts: [{ kind: 'text', text: 'working on it' }] } } },
      { kind: 'artifact-update', artifact: { artifactId: 'a', parts: [{ kind: 'text', text: 'the answer' }] } },
    ]);
    expect(snapshot.text).toBe('the answer');
    expect(snapshot.progressText).toBe('working on it');
  });

  it('normalizes underscore and TASK_STATE_ prefixed states', () => {
    expect(foldA2AResults([{ status: { state: 'INPUT_REQUIRED' } }]).state).toBe('input-required');
    expect(foldA2AResults([{ status: { state: 'task_state_completed' } }]).terminal).toBe(true);
  });

  it('reads inline artifacts from a full task object', () => {
    const snapshot = foldA2AResults([
      {
        kind: 'task',
        id: 't9',
        status: { state: 'completed' },
        artifacts: [{ artifactId: 'a', parts: [{ kind: 'text', text: 'task result' }] }],
      },
    ]);
    expect(snapshot.text).toBe('task result');
    expect(snapshot.taskId).toBe('t9');
  });
});

describe('validateA2AUrl', () => {
  const label = 'the rpcUrl';

  it('accepts a public https URL and strips fragments', () => {
    expect(validateA2AUrl('https://api.manyfold.ai/api/a2a/agents/x/rpc#frag', true, label)).toBe(
      'https://api.manyfold.ai/api/a2a/agents/x/rpc',
    );
  });

  it.each([
    'http://api.manyfold.ai/rpc',
    'https://user:pass@api.manyfold.ai/rpc',
    'https://localhost/rpc',
    'https://127.0.0.1/rpc',
    'https://10.0.0.8/rpc',
    'https://192.168.1.5/rpc',
    'https://172.16.0.1/rpc',
    'https://169.254.169.254/latest/meta-data',
    'https://agent.local/rpc',
    'https://[::1]/rpc',
    'https://[fd00::1]/rpc',
    'not a url',
  ])('rejects %s in production', (url) => {
    expect(() => validateA2AUrl(url, true, label)).toThrow(A2AError);
  });

  it('allows http and private hosts in development', () => {
    expect(validateA2AUrl('http://localhost:8787/rpc', false, label)).toBe('http://localhost:8787/rpc');
  });
});

describe('safeErrorText', () => {
  it('redacts bearer tokens and JWTs', () => {
    const jwt = `eyJ${'a'.repeat(24)}.${'b'.repeat(24)}.${'c'.repeat(16)}`;
    const input = `HTTP 401 Bearer nca_secret_token for ${jwt} via ?token=abc123&x=1`;
    const output = safeErrorText(input);
    expect(output).not.toContain('nca_secret_token');
    expect(output).not.toContain(jwt);
    expect(output).not.toContain('abc123');
    expect(output).toContain('Bearer [redacted]');
  });

  it('collapses whitespace and truncates', () => {
    expect(safeErrorText('a\n\n  b')).toBe('a b');
    expect(safeErrorText('x'.repeat(2000)).length).toBeLessThanOrEqual(600);
  });
});

describe('consumeA2AStream（SSE 读取）', () => {
  const cred = { rpcUrl: 'https://agent.example/rpc', token: 'tok', label: 'fortune-stick' };
  const realFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as { fetch: typeof fetch }).fetch = realFetch;
  });

  /** 一帧 JSON-RPC：agent 把整段回覆放在一条 message 里。 */
  const frame = (text: string): string =>
    JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      result: {
        kind: 'message',
        role: 'agent',
        messageId: 'm1',
        contextId: 'c1',
        parts: [{ kind: 'text', text }],
      },
    });

  const serve = (body: string): void => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof fetch;
  };

  const read = () =>
    consumeA2AStream({ cred, params: {}, signal: new AbortController().signal });

  it('最后一个事件没有空行收尾也要读出来 —— 少读这一块，整段解签就等于没回', async () => {
    serve(`data: ${frame('这是解签')}\n`);
    await expect(read()).resolves.toMatchObject({ text: '这是解签' });
  });

  it('真的一个事件都没有时，说清楚收到了多少字节，别让人以为 agent 没回', async () => {
    serve(': ping\n\n');
    await expect(read()).rejects.toThrow(/8 bytes/);
  });

  // 上面那一手是在流尾巴上补空行，别把正常收尾的流读串了。
  it('正常收尾的多帧流照旧：分片累加，终态就收工', async () => {
    const artifact = (text: string, append: boolean) =>
      JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        result: {
          kind: 'artifact-update',
          taskId: 't1',
          contextId: 'c1',
          append,
          artifact: { artifactId: 'a', parts: [{ kind: 'text', text }] },
        },
      });
    const done = JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      result: { kind: 'status-update', status: { state: 'completed' }, final: true },
    });
    serve(
      `data: ${artifact('前半段', false)}\n\n` +
        `data: ${artifact('后半段', true)}\n\n` +
        `data: ${done}\n\n`,
    );
    await expect(read()).resolves.toMatchObject({
      text: '前半段后半段',
      state: 'completed',
      terminal: true,
    });
  });
});
