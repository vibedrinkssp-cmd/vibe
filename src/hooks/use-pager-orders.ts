import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { queryClient } from '@/lib/queryClient';
import type { OrderStatus, OrderType } from '@/shared/schema';

export interface PagerOrder {
  id: string;
  shortNumber: string;
  customerName: string;
  orderType: OrderType;
  status: OrderStatus;
  createdAt: string;
  readyAt: string | null;
}

const PAGER_QUERY_KEY = ['pager-orders'];

export function usePagerOrders() {
  // Realtime keeps the panel instant; polling is a safety net for the TV browser.
  useRealtimeSync({
    tables: ['orders'],
    onEvent: () => {
      queryClient.invalidateQueries({ queryKey: PAGER_QUERY_KEY });
    },
  });

  return useQuery<PagerOrder[]>({
    queryKey: PAGER_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pager_orders');
      if (error) {
        console.warn('[usePagerOrders] RPC error:', error.message);
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        shortNumber: row.short_number,
        customerName: row.customer_name,
        orderType: row.order_type as OrderType,
        status: row.status as OrderStatus,
        createdAt: row.created_at,
        readyAt: row.ready_at,
      }));
    },
    refetchInterval: 5000,
    staleTime: 0,
    retry: 0,
  });
}
