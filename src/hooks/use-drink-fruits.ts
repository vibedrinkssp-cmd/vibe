import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export interface DrinkFruit {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  icon_url: string | null;
  sort_order: number | null;
}

const FRUITS_QUERY_KEY = ['drink-fruits'];
const FRUITS_ADMIN_QUERY_KEY = ['drink-fruits-admin'];

/**
 * Hook centralizado para frutas dos drinks.
 * - activeOnly=true (padrão): retorna apenas frutas ativas (para clientes/PDV/cozinha)
 * - activeOnly=false: retorna todas (para admin)
 */
export function useDrinkFruits({ activeOnly = true, enabled = true, refetchInterval }: {
  activeOnly?: boolean;
  enabled?: boolean;
  refetchInterval?: number;
} = {}) {
  return useQuery<DrinkFruit[]>({
    queryKey: activeOnly ? FRUITS_QUERY_KEY : FRUITS_ADMIN_QUERY_KEY,
    queryFn: async () => {
      if (activeOnly) {
        // Use public view or direct table for active fruits
        const { data, error } = await supabase
          .from('drink_fruits')
          .select('id, name, price, is_active, icon_url, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        return (data || []).map(mapFruit);
      } else {
        // Admin: get all fruits via RPC
        const { data, error } = await supabase.rpc('get_all_drink_fruits');
        if (error) throw error;
        return (data || []).map(mapFruit);
      }
    },
    enabled,
    refetchInterval,
  });
}

export function useToggleFruit() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.rpc('toggle_fruit_availability', {
        p_fruit_id: id,
        p_is_active: is_active,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_, { is_active }) => {
      invalidateAllFruits();
      toast({ title: is_active ? 'Fruta ativada' : 'Fruta desativada' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar disponibilidade', variant: 'destructive' });
    },
  });
}

export function useUpdateFruit() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (params: { id: string; price?: number; is_active?: boolean; name?: string }) => {
      const { error } = await supabase.rpc('update_drink_fruit', {
        p_id: params.id,
        ...(params.price !== undefined && { p_price: params.price }),
        ...(params.is_active !== undefined && { p_is_active: params.is_active }),
        ...(params.name !== undefined && { p_name: params.name }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAllFruits();
      toast({ title: '✅ Fruta atualizada!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar fruta', variant: 'destructive' });
    },
  });
}

function invalidateAllFruits() {
  queryClient.invalidateQueries({ queryKey: FRUITS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: FRUITS_ADMIN_QUERY_KEY });
  // Legacy keys used by some components
  queryClient.invalidateQueries({ queryKey: ['kitchen-drink-fruits'] });
}

function mapFruit(f: any): DrinkFruit {
  return {
    id: f.id,
    name: f.name,
    price: Number(f.price),
    is_active: f.is_active ?? true,
    icon_url: f.icon_url || null,
    sort_order: f.sort_order ?? 0,
  };
}
