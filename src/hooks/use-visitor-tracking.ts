import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client-safe';
import { nanoid } from 'nanoid';
import {
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from '@/lib/safe-browser-storage';

const SESSION_KEY = 'visitor_session_id';
const TRACKING_DISABLED_KEY = 'visitor_tracking_disabled';
const HEARTBEAT_INTERVAL = 180000; // 3 minutes (was 60s)

function getSessionFlag(key: string): boolean {
  return safeSessionStorageGetItem(key) === '1';
}

function setSessionFlag(key: string, value: boolean) {
  try {
    if (value) safeSessionStorageSetItem(key, '1');
    else safeSessionStorageRemoveItem(key);
  } catch {}
}

function getOrCreateSessionId(): string {
  let sessionId = safeSessionStorageGetItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = nanoid();
    safeSessionStorageSetItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function useVisitorTracking(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const location = useLocation();
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const lastPageRef = useRef<string>('');
  const trackingDisabledRef = useRef(getSessionFlag(TRACKING_DISABLED_KEY));

  const disableTracking = useCallback(() => {
    trackingDisabledRef.current = true;
    setSessionFlag(TRACKING_DISABLED_KEY, true);
  }, []);

  const registerSession = useCallback(async (sessionId: string, currentPage: string) => {
    if (trackingDisabledRef.current) return;

    try {
      const { error } = await supabase
        .from('visitor_sessions')
        .upsert({
          session_id: sessionId,
          current_page: currentPage,
          user_agent: navigator.userAgent,
          last_activity_at: new Date().toISOString(),
          is_active: true,
        }, { onConflict: 'session_id' });
      if (error) throw error;
    } catch {
      disableTracking();
    }
  }, [disableTracking]);

  const updateActivity = useCallback(async (sessionId: string, currentPage: string) => {
    if (trackingDisabledRef.current) return;

    try {
      const { error } = await supabase
        .from('visitor_sessions')
        .update({
          last_activity_at: new Date().toISOString(),
          current_page: currentPage,
          is_active: true,
        })
        .eq('session_id', sessionId);
      if (error) throw error;
    } catch {
      disableTracking();
    }
  }, [disableTracking]);

  const markInactive = useCallback(async (sessionId: string) => {
    if (trackingDisabledRef.current) return;

    try {
      const { error } = await supabase
        .from('visitor_sessions')
        .update({ is_active: false })
        .eq('session_id', sessionId);
      if (error) throw error;
    } catch {
      disableTracking();
    }
  }, [disableTracking]);

  // Initialize session on mount
  useEffect(() => {
    if (!enabled) return;
    const sessionId = getOrCreateSessionId();
    sessionIdRef.current = sessionId;
    lastPageRef.current = location.pathname;

    if (!trackingDisabledRef.current) {
      registerSession(sessionId, location.pathname);
    }

    heartbeatRef.current = setInterval(() => {
      if (sessionIdRef.current && !trackingDisabledRef.current) {
        updateActivity(sessionIdRef.current, lastPageRef.current);
      }
    }, HEARTBEAT_INTERVAL);

    const handleUnload = () => {
      if (sessionIdRef.current && !trackingDisabledRef.current) {
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

        if (!anonKey || !supabaseUrl) {
          return;
        }

        const url = `${supabaseUrl}/rest/v1/visitor_sessions?session_id=eq.${sessionIdRef.current}`;
        const body = JSON.stringify({ is_active: false });
        const blob = new Blob([body], { type: 'application/json' });
        // sendBeacon doesn't support custom headers, use fetch keepalive instead
        try {
          fetch(url, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
              'Prefer': 'return=minimal',
            },
            body,
            keepalive: true,
          }).catch(() => {});
        } catch {
          // Last resort fallback
          try { navigator.sendBeacon?.(url, blob); } catch {}
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener('beforeunload', handleUnload);
      if (sessionIdRef.current && !trackingDisabledRef.current) markInactive(sessionIdRef.current);
    };
  }, [enabled, location.pathname, registerSession, updateActivity, markInactive]);

  // Track page changes - only update on actual route change, no more incrementPageViews
  useEffect(() => {
    if (!enabled) return;
    if (sessionIdRef.current && location.pathname !== lastPageRef.current) {
      lastPageRef.current = location.pathname;
      updateActivity(sessionIdRef.current, location.pathname);
    }
  }, [enabled, location.pathname, updateActivity]);

  return { sessionId: sessionIdRef.current };
}
