import { describe, expect, it } from 'vitest';
import { browserStorage, safeGet, safeRemove, safeSet, type StoragePort } from '../src/shared/safe-storage';

function memoryStorage(): StoragePort & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe('safe browser storage', () => {
  it('reads, writes, and removes values', () => {
    const storage = memoryStorage();
    expect(safeSet(storage, 'privacy.consent', 'declined')).toBe(true);
    expect(safeGet(storage, 'privacy.consent')).toBe('declined');
    safeRemove(storage, 'privacy.consent');
    expect(safeGet(storage, 'privacy.consent')).toBeNull();
  });

  it('turns blocked storage into a no-op instead of throwing', () => {
    const blocked: StoragePort = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(safeGet(blocked, 'x')).toBeNull();
    expect(safeSet(blocked, 'x', 'y')).toBe(false);
    expect(() => safeRemove(blocked, 'x')).not.toThrow();
  });

  it('does not invent browser storage in a non-browser runtime', () => {
    expect(browserStorage('localStorage')).toBeNull();
    expect(browserStorage('sessionStorage')).toBeNull();
  });
});
