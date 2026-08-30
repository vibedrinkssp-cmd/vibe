const MANAGER_SESSION_KEY = '__manager_auth';
const MANAGER_SESSION_EXPIRY_KEY = '__manager_auth_exp';
export const MANAGER_SESSION_TOKEN_KEY = '__manager_session_token';
// DB session TTL (issue_session_token) atualmente é 24h. Deixamos o cliente
// em 12h para dar folga (renova em cada ação do manager via refreshManagerSession)
// e evitar que funcionários precisem relogar toda hora.
const MANAGER_SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours

function getStoredString(key: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredString(key: string, value: string | null) {
  if (typeof window === 'undefined') return;

  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore storage failures
  }
}

export function isManagerSessionValid(): boolean {
  const flag = getStoredString(MANAGER_SESSION_KEY);
  const expiry = getStoredString(MANAGER_SESSION_EXPIRY_KEY);

  if (flag !== '1' || !expiry) return false;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt)) return false;

  return Date.now() < expiresAt;
}

export function refreshManagerSession() {
  setStoredString(MANAGER_SESSION_KEY, '1');
  setStoredString(MANAGER_SESSION_EXPIRY_KEY, String(Date.now() + MANAGER_SESSION_DURATION));
}

export function getManagerSessionToken(): string | null {
  if (!isManagerSessionValid()) return null;
  return getStoredString(MANAGER_SESSION_TOKEN_KEY);
}

export function setManagerSessionToken(token: string | null) {
  setStoredString(MANAGER_SESSION_TOKEN_KEY, token);
}

export function getAdminSessionToken(fallbackToken?: string | null): string | null {
  const managerToken = getManagerSessionToken();
  if (managerToken) return managerToken;

  const role = getStoredString('vibe-drinks-role');
  const authToken = fallbackToken ?? getStoredString('vibe-drinks-session-token');

  if (authToken && (role === 'admin' || role === 'pdv')) {
    return authToken;
  }

  return null;
}

export function clearManagerSession() {
  setStoredString(MANAGER_SESSION_KEY, null);
  setStoredString(MANAGER_SESSION_EXPIRY_KEY, null);
  setStoredString(MANAGER_SESSION_TOKEN_KEY, null);
}