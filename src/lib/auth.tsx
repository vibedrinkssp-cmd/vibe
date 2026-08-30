import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { User, Address } from '@/shared/schema';
import { supabase } from '@/integrations/supabase/client-safe';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
  safeLocalStorageRemoveItem,
} from '@/lib/safe-browser-storage';

type UserRole = 'customer' | 'admin' | 'kitchen' | 'motoboy' | 'pdv' | 'log';

interface AuthContextType {
  user: User | null;
  address: Address | null;
  role: UserRole | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  /** True once Supabase Auth session has been checked on mount */
  isAuthReady: boolean;
  /** True when the real backend auth session exists for protected operational RPCs */
  hasSupabaseSession: boolean;
  login: (user: User, role: UserRole, token?: string) => void;
  logout: () => void;
  setAddress: (address: Address) => void;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getStoredValue<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = safeLocalStorageGetItem(key);
    if (saved) {
      return JSON.parse(saved) as T;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function getStoredString(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return safeLocalStorageGetItem(key);
}

function setStoredValue(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  safeLocalStorageSetItem(key, JSON.stringify(value));
}

function setStoredString(key: string, value: string | null) {
  if (typeof window === 'undefined') return;

  if (value) {
    safeLocalStorageSetItem(key, value);
  } else {
    safeLocalStorageRemoveItem(key);
  }
}

// Staff roles that require a Supabase Auth session for RLS.
// NOTE: 'motoboy' is intentionally EXCLUDED. The motoboy panel relies on
// self-contained SECURITY DEFINER RPCs (get_motoboy_self, get_motoboy_orders,
// etc.) that do NOT need a Supabase auth session. Including it here caused the
// panel to log itself out whenever the backend token was missing or its
// refresh failed. Motoboys must stay logged in regardless of token state.
const STAFF_ROLES: UserRole[] = ['admin', 'pdv', 'kitchen', 'log'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasSupabaseSession, setHasSupabaseSession] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [address, setAddressState] = useState<Address | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const logoutCalledRef = useRef(false);

  // Hydrate from localStorage
  useEffect(() => {
    const storedUser = getStoredValue<User>('vibe-drinks-user');
    const storedAddress = getStoredValue<Address>('vibe-drinks-address');
    const storedRole = getStoredString('vibe-drinks-role') as UserRole | null;
    const storedToken = getStoredString('vibe-drinks-session-token');
    
    if (storedUser) setUser(storedUser);
    if (storedAddress) setAddressState(storedAddress);
    if (storedRole) setRole(storedRole);
    if (storedToken) setSessionToken(storedToken);
    
    setIsHydrated(true);
  }, []);

  // Global Supabase Auth session listener
  // Ensures that when the Supabase token expires/refreshes, we stay in sync
  useEffect(() => {
    if (!isHydrated) return;

    let mounted = true;

    const clearStaffSession = (reason: string) => {
      console.warn(`[Auth] ${reason} Clearing local panel session.`);
      setUser(null);
      setAddressState(null);
      setRole(null);
      setSessionToken(null);
      setStoredString('vibe-drinks-session-token', null);
      setStoredString('vibe-drinks-role', null);
      setStoredString('vibe-drinks-user', null);
      setStoredString('vibe-drinks-address', null);
    };

    // Attempts to recover a missing Supabase session before giving up.
    // Transient network blips can momentarily drop the session even though the
    // stored refresh token is still valid — so we proactively try to refresh
    // instead of immediately kicking the operator out of the panel.
    const recoverSession = async (): Promise<boolean> => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) return false;
        return !!data.session;
      } catch {
        return false;
      }
    };

    // 1. Check current session state
    supabase.auth.getSession().then(async (result) => {
      if (!mounted) return;

      const session = result?.data?.session ?? null;

      const currentRole = getStoredString('vibe-drinks-role') as UserRole | null;
      const isStaff = currentRole && STAFF_ROLES.includes(currentRole);

      if (session) {
        setHasSupabaseSession(true);
        setIsAuthReady(true);
        return;
      }

      if (isStaff) {
        // No session right now — try to recover before clearing.
        const recovered = await recoverSession();
        if (!mounted) return;
        setHasSupabaseSession(recovered);
        if (!recovered) {
          clearStaffSession('Staff role detected but Supabase session could not be recovered.');
        }
      } else {
        setHasSupabaseSession(false);
      }

      setIsAuthReady(true);
    }).catch(() => {
      if (!mounted) return;
      // Network error reaching auth — do NOT clear; let panels keep working and
      // retry. Clearing here would log operators out on every connectivity blip.
      setIsAuthReady(true);
    });

    // 2. Listen for auth state changes (token refresh, sign out, etc.)
    const authStateResult = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setHasSupabaseSession(!!session);

      if (event === 'SIGNED_OUT' && !logoutCalledRef.current) {
        // Supabase fired SIGNED_OUT but the user did not click logout. This can
        // happen on a failed token refresh. Try to recover before clearing.
        const currentRole = getStoredString('vibe-drinks-role') as UserRole | null;
        const isStaff = currentRole && STAFF_ROLES.includes(currentRole);

        if (isStaff) {
          recoverSession().then((recovered) => {
            if (!mounted || logoutCalledRef.current) return;
            if (recovered) {
              setHasSupabaseSession(true);
              console.log('[Auth] Recovered Supabase session after unexpected SIGNED_OUT.');
            } else {
              clearStaffSession('Supabase session lost for staff user and could not be recovered.');
            }
          });
        }
      }

      if (event === 'TOKEN_REFRESHED') {
        console.log('[Auth] Supabase token refreshed successfully');
      }
    });

    const subscription = authStateResult?.data?.subscription;

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, [isHydrated]);

  // Persist state changes
  useEffect(() => {
    if (!isHydrated) return;
    if (user) {
      safeLocalStorageSetItem('vibe-drinks-user', JSON.stringify(user));
    } else {
      safeLocalStorageRemoveItem('vibe-drinks-user');
    }
  }, [user, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (address) {
      safeLocalStorageSetItem('vibe-drinks-address', JSON.stringify(address));
    } else {
      safeLocalStorageRemoveItem('vibe-drinks-address');
    }
  }, [address, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (role) {
      safeLocalStorageSetItem('vibe-drinks-role', role);
    } else {
      safeLocalStorageRemoveItem('vibe-drinks-role');
    }
  }, [role, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (sessionToken) {
      safeLocalStorageSetItem('vibe-drinks-session-token', sessionToken);
    } else {
      safeLocalStorageRemoveItem('vibe-drinks-session-token');
    }
  }, [sessionToken, isHydrated]);

  const login = useCallback((userData: User, userRole: UserRole, token?: string) => {
    logoutCalledRef.current = false;
    setUser(userData);
    setRole(userRole);

    const nextToken = token ?? null;
    setSessionToken(nextToken);

    setStoredValue('vibe-drinks-user', userData);
    setStoredString('vibe-drinks-role', userRole);
    setStoredString('vibe-drinks-session-token', nextToken);

    // Login callers set the backend auth session immediately before this.
    // Re-read it here so protected panels do not render as "expired" during
    // the small gap between setSession() and the auth-state listener update.
    supabase.auth.getSession()
      .then((result) => setHasSupabaseSession(!!result?.data?.session))
      .catch(() => setHasSupabaseSession(false));
  }, []);

  const logout = useCallback(() => {
    logoutCalledRef.current = true;
    setUser(null);
    setAddressState(null);
    setRole(null);
    setSessionToken(null);
    setHasSupabaseSession(false);

    setStoredString('vibe-drinks-session-token', null);
    setStoredString('vibe-drinks-role', null);
    setStoredString('vibe-drinks-user', null);
    setStoredString('vibe-drinks-address', null);

    // Clear Supabase Auth session
    supabase.auth.signOut().catch(() => {});
  }, []);

  const setAddress = useCallback((addr: Address) => {
    setAddressState(addr);
    setStoredValue('vibe-drinks-address', addr);
  }, []);

  const updateUser = useCallback((userData: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...userData } : null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        address,
        role,
        sessionToken,
        isAuthenticated: !!user,
        isHydrated,
        isAuthReady,
        hasSupabaseSession,
        login,
        logout,
        setAddress,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
