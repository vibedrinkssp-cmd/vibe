import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';

export const DELIVERY_ENABLED_KEY = ['delivery-enabled'] as const;

async function fetchDeliveryEnabled(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_delivery_enabled' as any);
  // Banco ainda sem a migration (ou falha de rede): não bloqueia as entregas por engano.
  if (error) return true;
  return data !== false;
}

/** Entregas ligadas/desligadas pela loja (PDV/admin). Sincroniza em tempo real. */
export function useDeliveryEnabled(): { deliveryEnabled: boolean; isLoading: boolean } {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: DELIVERY_ENABLED_KEY,
    queryFn: fetchDeliveryEnabled,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel('delivery-enabled-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
        const next = (payload.new as { delivery_enabled?: unknown } | null)?.delivery_enabled;
        if (typeof next === 'boolean') queryClient.setQueryData(DELIVERY_ENABLED_KEY, next);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { deliveryEnabled: data ?? true, isLoading };
}
