// Hook que monitora a saúde real da conexão com o Supabase (Lovable Cloud).
// Combina dois sinais: ping leve via RPC + estado do canal Realtime.
// Retorna 'online' se qualquer um dos dois estiver vivo nos últimos N segundos.
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseSupabaseHealthOptions {
  /** Intervalo entre pings em ms (default 15s) */
  intervalMs?: number;
  /** Considera offline se nenhum sinal positivo nos últimos X ms (default 35s) */
  staleMs?: number;
  /** Sinal externo (ex: realtime conectado) que mantém o status online */
  externalAlive?: boolean;
  enabled?: boolean;
}

export function useSupabaseHealth(options: UseSupabaseHealthOptions = {}) {
  const { intervalMs = 15000, staleMs = 35000, externalAlive = false, enabled = true } = options;
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const lastOkRef = useRef<number | null>(null);
  const externalRef = useRef(externalAlive);

  useEffect(() => { externalRef.current = externalAlive; }, [externalAlive]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const ping = async () => {
      // Browser offline detector — short-circuit
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancelled) setIsOnline(false);
        return;
      }
      try {
        // Lightweight RPC that exists in this project and requires no params
        const { error } = await supabase.rpc('get_store_info');
        if (cancelled) return;
        if (!error) {
          const now = Date.now();
          lastOkRef.current = now;
          setLastOkAt(now);
          setIsOnline(true);
        } else {
          evaluateStaleness();
        }
      } catch {
        if (!cancelled) evaluateStaleness();
      }
    };

    const evaluateStaleness = () => {
      if (externalRef.current) {
        setIsOnline(true);
        return;
      }
      const last = lastOkRef.current;
      if (last === null) {
        setIsOnline(false);
        return;
      }
      setIsOnline(Date.now() - last < staleMs);
    };

    // First ping immediately
    ping();
    const id = setInterval(ping, intervalMs);

    // React to browser online/offline events
    const onOnline = () => ping();
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [enabled, intervalMs, staleMs]);

  // External alive (e.g. realtime connected) overrides to online
  useEffect(() => {
    if (externalAlive) setIsOnline(true);
  }, [externalAlive]);

  return { isOnline, lastOkAt };
}
