/**
 * Small storage adapter shared by browser-only modules and tests.
 * Browsers can throw on access when storage is disabled or unavailable, so every
 * operation is deliberately best effort.
 */

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type GlobalWithStorage = typeof globalThis & {
  localStorage?: StoragePort;
  sessionStorage?: StoragePort;
};

export function browserStorage(kind: 'localStorage' | 'sessionStorage'): StoragePort | null {
  try {
    return (globalThis as GlobalWithStorage)[kind] ?? null;
  } catch {
    return null;
  }
}

export function safeGet(storage: StoragePort | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSet(storage: StoragePort | null, key: string, value: string): boolean {
  try {
    storage?.setItem(key, value);
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function safeRemove(storage: StoragePort | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* Storage is optional; clearing it must never block the app. */
  }
}
