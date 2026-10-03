import { describe, expect, it } from 'vitest';
import { backupHint } from '../src/shared/agent-backup';
import type { ConnectedAgent } from '../src/shared/types';

const NOW = Date.UTC(2026, 9, 3, 12);
const agent = (name: string, extra: Partial<ConnectedAgent> = {}): ConnectedAgent => ({
  agentId: name,
  name,
  description: '',
  rpcUrl: `https://${name}.test/rpc`,
  expiresAt: null,
  verified: true,
  warning: null,
  connectedAt: '2026-10-01T00:00:00.000Z',
  lastFailedAt: null,
  ...extra,
});

describe('backupHint（设置页的备援提示）', () => {
  it('一个都没连：交给「还没有连接」那句，不另外提示', () => {
    expect(backupHint([], NOW).state).toBe('none');
  });

  it('只连了一个：提示没有备援，不管它现在好不好', () => {
    expect(backupHint([agent('a')], NOW).state).toBe('single');
    expect(backupHint([agent('a', { lastFailedAt: '2026-10-03T11:00:00.000Z' })], NOW).state).toBe('single');
  });

  it('连了两个都正常：不提示', () => {
    expect(backupHint([agent('a'), agent('b')], NOW).state).toBe('ok');
  });

  it('连了两个但一个最近失败：只剩一个能用，点出是哪一个', () => {
    const hint = backupHint([agent('a', { lastFailedAt: '2026-10-03T11:00:00.000Z' }), agent('b')], NOW);
    expect(hint).toEqual({ state: 'one-left', workingName: 'b' });
  });

  it('两个都失败过：不再重复提示，两张卡片各自说明', () => {
    const failed = { lastFailedAt: '2026-10-03T11:00:00.000Z' };
    expect(backupHint([agent('a', failed), agent('b', failed)], NOW).state).toBe('ok');
  });

  it('授权已过期的不算备援：两个里一个过期，等于只有一个', () => {
    const expired = { expiresAt: '2026-10-01T00:00:00.000Z' };
    expect(backupHint([agent('a'), agent('b', expired)], NOW).state).toBe('single');
  });
});
