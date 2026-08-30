type StorageKind = 'local' | 'session';

function getStorage(kind: StorageKind): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeStorageGetItem(kind: StorageKind, key: string): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageSetItem(kind: StorageKind, key: string, value: string) {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {}
}

export function safeStorageRemoveItem(kind: StorageKind, key: string) {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {}
}

export function safeStorageGetJson<T>(kind: StorageKind, key: string, fallback: T): T {
  const raw = safeStorageGetItem(kind, key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const safeLocalStorageGetItem = (key: string) => safeStorageGetItem('local', key);
export const safeLocalStorageSetItem = (key: string, value: string) => safeStorageSetItem('local', key, value);
export const safeLocalStorageRemoveItem = (key: string) => safeStorageRemoveItem('local', key);
export const safeLocalStorageGetJson = <T,>(key: string, fallback: T) => safeStorageGetJson('local', key, fallback);

export const safeSessionStorageGetItem = (key: string) => safeStorageGetItem('session', key);
export const safeSessionStorageSetItem = (key: string, value: string) => safeStorageSetItem('session', key, value);
export const safeSessionStorageRemoveItem = (key: string) => safeStorageRemoveItem('session', key);
export const safeSessionStorageGetJson = <T,>(key: string, fallback: T) => safeStorageGetJson('session', key, fallback);