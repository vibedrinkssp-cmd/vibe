import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

type OrderEventHandler = (data: any) => void;

interface UseOrderUpdatesOptions {
  onOrderCreated?: OrderEventHandler;
  onOrderStatusChanged?: OrderEventHandler;
  onOrderAssigned?: OrderEventHandler;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useOrderUpdates(options: UseOrderUpdatesOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const optionsRef = useRef(options);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create a new realtime channel for orders
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          if (import.meta.env.DEV) console.log('New order received:', payload);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          optionsRef.current.onOrderCreated?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          if (import.meta.env.DEV) console.log('Order updated:', payload);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          
          if (oldStatus !== newStatus) {
            optionsRef.current.onOrderStatusChanged?.(payload.new);
          }
          
          const oldMotoboy = (payload.old as any)?.motoboy_id;
          const newMotoboy = (payload.new as any)?.motoboy_id;
          
          if (oldMotoboy !== newMotoboy && newMotoboy) {
            optionsRef.current.onOrderAssigned?.(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .subscribe((status) => {
        if (import.meta.env.DEV) console.log('Supabase realtime status:', status);
        if (status === 'SUBSCRIBED') {
          reconnectAttemptsRef.current = 0;
          setIsConnected(true);
          optionsRef.current.onConnected?.();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsConnected(false);
          optionsRef.current.onDisconnected?.();

          if (isMountedRef.current && !reconnectTimerRef.current) {
            const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 10000);
            reconnectAttemptsRef.current += 1;
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              if (isMountedRef.current) connect();
            }, delay);
          }
        }
      });

    channelRef.current = channel;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    reconnect: connect,
    disconnect,
  };
}
