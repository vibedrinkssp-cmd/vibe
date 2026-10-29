import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { fetchAllowedByType } from '@/lib/allowed-bottles';

const REFETCH_MS = 30_000;

/** Há garrafa aberta, com dose, de um destilado liberado para o Copão? */
async function fetchCopaoAvailable(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_available_bottles_for_assembly');
  if (error) throw error;
  const bottleProductIds = ((data ?? []) as { product_id: string }[]).map((b) => b.product_id);
  if (bottleProductIds.length === 0) return false;
  const { spiritIds, hasAny } = await fetchAllowedByType('copao');
  return hasAny && bottleProductIds.some((id) => spiritIds.has(id));
}

/**
 * Copão só é vendável com garrafa disponível. Enquanto carrega (ou se a consulta falhar)
 * assume disponível, para não esconder o produto por um erro passageiro.
 */
export function useCopaoAvailable(): boolean {
  const { data } = useQuery({
    queryKey: ['copao-available'],
    queryFn: fetchCopaoAvailable,
    staleTime: REFETCH_MS,
    refetchInterval: REFETCH_MS,
  });
  return data ?? true;
}
