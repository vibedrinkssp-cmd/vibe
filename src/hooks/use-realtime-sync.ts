import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 
  | 'orders' 
  | 'order_items' 
  | 'motoboys' 
  | 'motoboy_locations' 
  | 'products' 
  | 'categories' 
  | 'cash_register_sessions' 
  | 'cash_register_closures' 
  | 'sangrias' 
  | 'addresses' 
  | 'banners'
  | 'pager_ads';

interface RealtimeEvent {
  table: TableName;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
}

interface UseRealtimeSyncOptions {
  tables: TableName[];
  onEvent?: (event: RealtimeEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  enabled?: boolean;
}

// Query keys mapping for each table
const TABLE_QUERY_KEYS: Record<TableName, string[]> = {
  orders: ['orders', 'admin-orders', 'admin-users', 'admin-addresses'],
  order_items: ['orders', 'order-items', 'admin-order-items'],
  motoboys: ['motoboys', 'admin-motoboys'],
  motoboy_locations: ['motoboy-locations'],
  products: ['products', 'pdv-products', 'admin-products', 'products-public'],
  categories: ['categories', 'pdv-categories', 'admin-categories', 'categories-public'],
  cash_register_sessions: ['cash-register', 'cash-balance', 'admin-cash-sessions'],
  cash_register_closures: ['cash-closures', 'admin-cash-closures'],
  sangrias: ['sangrias', 'admin-sangrias', 'saq-dep'],
  addresses: ['addresses', 'admin-addresses'],
  banners: ['banners', 'admin-banners', 'banners-public'],
  pager_ads: ['pager-ads'],
};

export function useRealtimeSync(options: UseRealtimeSyncOptions) {
  const { tables, onEvent, onConnected, onDisconnected, enabled = true } = options;
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Unique per hook instance so two subscribers (e.g. a panel + admin dashboard,
  // or a remount race) NEVER share a channel name — a shared name silently drops
  // postgres_changes for the second subscriber, which is a classic cause of
  // "pedidos não chegam / chegam com atraso".
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 10));
  const tablesKey = tables.sort().join(',');

  // Store callbacks in refs to avoid recreating channel
  const onEventRef = useRef(onEvent);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);

  useEffect(() => {
    onEventRef.current = onEvent;
    onConnectedRef.current = onConnected;
    onDisconnectedRef.current = onDisconnected;
  });

  const invalidateTableQueries = useCallback((table: TableName) => {
    const queryKeys = TABLE_QUERY_KEYS[table] || [];
    queryKeys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (!enabled || tables.length === 0) {
      return;
    }

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Create a single channel for all table subscriptions
    const channelName = `realtime-${tablesKey.replace(/,/g, '-')}-${instanceIdRef.current}`;
    let channel = supabase.channel(channelName);

    // Subscribe to each table
    tables.forEach(table => {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        (payload) => {
          if (!mountedRef.current) return;
          
          if (import.meta.env.DEV) {
            console.log(`[Realtime] ${table}:${payload.eventType}`);
          }

          // Invalidate relevant queries
          invalidateTableQueries(table);

          // Call event handler
          onEventRef.current?.({
            table,
            event: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            payload: payload.new || payload.old,
          });
        }
      );
    });

    // Subscribe and handle connection status
    channel.subscribe((status) => {
      if (!mountedRef.current) return;

      if (status === 'SUBSCRIBED') {
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
        onConnectedRef.current?.();
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
        setIsConnected(false);
        onDisconnectedRef.current?.();

        if (mountedRef.current && enabled && !reconnectTimerRef.current) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 10000);
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (mountedRef.current) {
              queryClient.invalidateQueries({ queryKey: ['orders'] });
              queryClient.invalidateQueries({ queryKey: ['order-items'] });
              queryClient.invalidateQueries({ queryKey: ['motoboy-locations'] });
            }
          }, delay);
        }
      }
    });

    channelRef.current = channel;

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, tablesKey, invalidateTableQueries]);

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

  const reconnect = useCallback(() => {
    disconnect();
    // Force re-run of effect by updating a state would be needed
    // For now, just disconnect - the effect will recreate on next mount
  }, [disconnect]);

  return {
    isConnected,
    reconnect,
    disconnect,
  };
}

// Convenience hooks for specific use cases

export function useOrdersRealtime(options: Omit<UseRealtimeSyncOptions, 'tables'> = {}) {
  return useRealtimeSync({
    ...options,
    tables: ['orders', 'order_items'],
  });
}

export function useKitchenRealtime(options: Omit<UseRealtimeSyncOptions, 'tables'> = {}) {
  return useRealtimeSync({
    ...options,
    tables: ['orders', 'order_items'],
  });
}

export function useAdminRealtime(options: Omit<UseRealtimeSyncOptions, 'tables'> = {}) {
  return useRealtimeSync({
    ...options,
    tables: ['orders', 'order_items', 'motoboys', 'cash_register_sessions', 'sangrias'],
  });
}

export function useMotoboyRealtime(options: Omit<UseRealtimeSyncOptions, 'tables'> = {}) {
  return useRealtimeSync({
    ...options,
    tables: ['orders', 'motoboys', 'motoboy_locations'],
  });
}

export function usePDVRealtime(options: Omit<UseRealtimeSyncOptions, 'tables'> = {}) {
  return useRealtimeSync({
    ...options,
    tables: ['orders', 'cash_register_sessions', 'sangrias', 'motoboys'],
  });
}

export function useCustomerRealtime(userId?: string, options: Omit<UseRealtimeSyncOptions, 'tables'> = {}) {
  return useRealtimeSync({
    ...options,
    tables: ['orders', 'motoboy_locations'],
    enabled: !!userId && (options.enabled !== false),
  });
}

export function useSettingsRealtime(options: Omit<UseRealtimeSyncOptions, 'tables'> = {}) {
  return useRealtimeSync({
    ...options,
    tables: ['banners', 'categories'],
  });
}

export function useProductsRealtime(options: Omit<UseRealtimeSyncOptions, 'tables'> = {}) {
  return useRealtimeSync({
    ...options,
    tables: ['products', 'categories'],
  });
}
