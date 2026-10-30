import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { fetchAllowedByType } from '@/lib/allowed-bottles';
import { ENERGETICO_OR_FILTER, isEnergeticoProduct, isExcludedEnergetico, isFreeEnergeticoBrand } from '@/lib/copao-energetico';

const REFETCH_MS = 30_000;

interface OpenBottleRow {
  product_id: string;
}

interface ProductTypeRow {
  id: string;
  name: string | null;
  product_type: string | null;
}

/** Há garrafa aberta, com dose, de um destilado que o Copão pode usar? */
async function hasSpirit(bottleProductIds: string[], types: ProductTypeRow[]): Promise<boolean> {
  const { spiritIds, hasAny } = await fetchAllowedByType('copao');
  if (hasAny) return bottleProductIds.some((id) => spiritIds.has(id));
  // Sem lista liberada no admin, vale qualquer garrafa aberta que não seja energético.
  return types.some((p) => !isEnergeticoProduct(p));
}

/** Há energético para o Copão: garrafa aberta (Baly/Big Boss) ou lata com estoque? */
async function hasEnergetico(types: ProductTypeRow[]): Promise<boolean> {
  if (types.some(isEnergeticoProduct)) return true;
  const { data } = await supabase
    .from('products_public')
    .select('name, stock')
    .or(ENERGETICO_OR_FILTER)
    .eq('is_active', true);
  return (data ?? []).some(
    (p) => Number(p.stock ?? 0) > 0 && !isExcludedEnergetico(p.name ?? '') && !isFreeEnergeticoBrand(p.name ?? ''),
  );
}

/** O Copão só é vendável quando há destilado (garrafa aberta) E energético. */
async function fetchCopaoAvailable(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_available_bottles_for_assembly');
  if (error) throw error;
  const bottleProductIds = ((data ?? []) as OpenBottleRow[]).map((b) => b.product_id);
  if (bottleProductIds.length === 0) return false;
  const { data: types } = await supabase.from('products').select('id, name, product_type').in('id', bottleProductIds);
  const rows = (types ?? []) as ProductTypeRow[];
  return (await hasSpirit(bottleProductIds, rows)) && (await hasEnergetico(rows));
}

/**
 * Enquanto carrega (ou se a consulta falhar) assume disponível, para não esconder o
 * produto por um erro passageiro.
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
