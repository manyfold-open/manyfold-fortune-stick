import { describe, expect, it } from 'vitest';
import { isSettingsApiPath } from '../src/worker/auth';

describe('settings API access policy', () => {
  it('protects agent-management endpoints', () => {
    expect(isSettingsApiPath('/api/connect')).toBe(true);
    expect(isSettingsApiPath('/api/connect/session-123/poll')).toBe(true);
    expect(isSettingsApiPath('/api/agents')).toBe(true);
    expect(isSettingsApiPath('/api/agents/agent-123/verify')).toBe(true);
  });

  it('leaves the game and health endpoints public', () => {
    expect(isSettingsApiPath('/api/readings')).toBe(false);
    expect(isSettingsApiPath('/api/readings/reading-123/interpret')).toBe(false);
    expect(isSettingsApiPath('/api/readings/reading-123/follow-up')).toBe(false);
    expect(isSettingsApiPath('/api/health')).toBe(false);
    expect(isSettingsApiPath('/api/state')).toBe(false);
  });
});
