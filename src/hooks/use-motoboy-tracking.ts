import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';

interface UseMotoboyTrackingOptions {
  motoboyId: string;
  orderId?: string;
  enabled?: boolean;
  updateInterval?: number;
}

type PermissionStatus = 'prompt' | 'granted' | 'denied' | 'unavailable';

// Minimal Wake Lock sentinel shape (subset of native WakeLockSentinel)
interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export function useMotoboyTracking({
  motoboyId,
  orderId,
  enabled = true,
  updateInterval,
}: UseMotoboyTrackingOptions) {
  // Dynamic interval: 3s on active delivery, 8s idle (overridable)
  const baseInterval = updateInterval ?? (orderId ? 3000 : 8000);
  const watchIdRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('prompt');
  const [lastError, setLastError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Stable refs for values that change but shouldn't trigger effect re-runs
  const motoboyIdRef = useRef(motoboyId);
  const orderIdRef = useRef(orderId);
  motoboyIdRef.current = motoboyId;
  orderIdRef.current = orderId;

  // ------- Wake Lock (keeps screen awake while app is open) -------
  const acquireWakeLock = useCallback(async () => {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl) return;
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) return;
      const sentinel = await wl.request('screen');
      wakeLockRef.current = sentinel;
      sentinel.addEventListener('release', () => {
        // Will be re-acquired on visibility change if still tracking
      });
      console.log('[MotoboyTracking] Wake lock acquired');
    } catch (err) {
      console.warn('[MotoboyTracking] Wake lock failed:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try {
        await wakeLockRef.current.release();
      } catch {}
    }
    wakeLockRef.current = null;
  }, []);

  // ------- Permission query -------
  useEffect(() => {
    mountedRef.current = true;
    if (!navigator.geolocation) {
      setPermissionStatus('unavailable');
      return;
    }
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionStatus(result.state as PermissionStatus);
        const handler = () => setPermissionStatus(result.state as PermissionStatus);
        result.addEventListener('change', handler);
        return () => result.removeEventListener('change', handler);
      }).catch(() => {});
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------- Send to DB (always sends if 5s+ elapsed, even if same coords = heartbeat) -------
  const sendLocation = useCallback(async (latitude: number, longitude: number, force = false) => {
    const mId = motoboyIdRef.current;
    if (!mId) return;

    const now = Date.now();
    const last = lastPositionRef.current;

    // Skip only if SAME position AND less than 4s since last send (avoid duplicate spam from watch+poll)
    if (
      !force &&
      last &&
      Math.abs(last.lat - latitude) < 0.00005 &&
      Math.abs(last.lng - longitude) < 0.00005 &&
      now - last.ts < 4000
    ) {
      return;
    }

    lastPositionRef.current = { lat: latitude, lng: longitude, ts: now };

    // Persist last known position for crash recovery
    try {
      localStorage.setItem(
        'motoboy:lastLoc',
        JSON.stringify({ lat: latitude, lng: longitude, ts: now }),
      );
    } catch {}

    try {
      const { error } = await supabase.rpc('update_motoboy_location', {
        p_motoboy_id: mId,
        p_latitude: latitude,
        p_longitude: longitude,
        p_order_id: orderIdRef.current || undefined,
      });

      if (!mountedRef.current) return;

      if (error) {
        console.error('[MotoboyTracking] DB error:', error.message);
        setLastError(error.message);
      } else {
        setLastError(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[MotoboyTracking] Send failed:', err);
      setLastError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, []);

  // ------- One-shot position fetch (used by polling fallback) -------
  const fetchOnce = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionStatus('denied');
        }
        // Don't spam errors here — watchPosition will report them too
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );
  }, [sendLocation]);

  // ------- Heartbeat: re-send last known position even if no GPS update -------
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = setInterval(() => {
      const last = lastPositionRef.current;
      if (last) {
        // Force re-send to keep "alive" timestamp updated in DB
        sendLocation(last.lat, last.lng, true);
      }
    }, 15000); // every 15s
  }, [sendLocation]);

  // ------- Stop everything -------
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    releaseWakeLock();
    setIsTracking(false);
  }, [releaseWakeLock]);

  // ------- Permission request + initial position -------
  const requestPermissionAndStart = useCallback(async (): Promise<boolean> => {
    if (!navigator.geolocation) {
      setPermissionStatus('unavailable');
      setLastError('Geolocalização não suportada neste navegador');
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPermissionStatus('granted');
          setLastError(null);
          sendLocation(position.coords.latitude, position.coords.longitude, true);
          resolve(true);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setPermissionStatus('denied');
            setLastError('Permissão de GPS negada. Habilite nas configurações do navegador.');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setLastError('Localização indisponível. Verifique se o GPS está ativado.');
          } else if (error.code === error.TIMEOUT) {
            setLastError('Tempo esgotado ao obter localização.');
          }
          resolve(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    });
  }, [sendLocation]);

  // ------- Start full tracking pipeline -------
  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) return false;

    const hasPermission = await requestPermissionAndStart();
    if (!hasPermission) return false;

    // 1. Wake lock to keep screen alive (browser pauses JS when screen off)
    acquireWakeLock();

    // 2. Continuous watch (most efficient when device is moving)
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        sendLocation(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.error('[MotoboyTracking] Watch error:', error.code);
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionStatus('denied');
          setLastError('Permissão de GPS revogada.');
          stopTracking();
        }
        // Other errors: poll fallback will keep trying
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );

    // 3. Polling fallback — watchPosition can silently die on mobile when app goes background.
    // getCurrentPosition is more resilient and re-arms each call.
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(fetchOnce, baseInterval);

    // 4. Heartbeat — even if motoboy is parked, keep DB timestamp fresh
    startHeartbeat();

    setIsTracking(true);
    return true;
  }, [requestPermissionAndStart, sendLocation, fetchOnce, stopTracking, acquireWakeLock, startHeartbeat, baseInterval]);

  // ------- Page Visibility: re-acquire wake lock + force fresh position when returning -------
  useEffect(() => {
    if (!enabled) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isTracking) {
        // Re-acquire wake lock (it's auto-released when page becomes hidden)
        acquireWakeLock();
        // Force a fresh position fetch — watchPosition often misses updates while hidden
        fetchOnce();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled, isTracking, acquireWakeLock, fetchOnce]);

  // ------- Auto-start / stop based on enabled + motoboyId -------
  useEffect(() => {
    if (!enabled || !motoboyId) {
      stopTracking();
      return;
    }

    const timer = setTimeout(() => {
      startTracking().then((ok) => {
        console.log('[MotoboyTracking]', ok ? 'Started' : 'Failed to start');
      });
    }, 500);

    return () => {
      clearTimeout(timer);
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, motoboyId]);

  return {
    isTracking,
    permissionStatus,
    lastError,
    startTracking,
    stopTracking,
    requestPermission: requestPermissionAndStart,
  };
}
