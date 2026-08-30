import { supabase } from '@/integrations/supabase/client-safe';

const SPIRIT_TYPES = new Set(['destilado', 'whisky', 'gin', 'vodka', 'cachaca', 'licor', 'corote', 'vinho', 'tequila', 'conhaque', 'brandy']);

/**
 * Fetches allowed product IDs for a given drink config slug.
 * Returns empty Set if no products are configured (none allowed).
 */
export async function fetchAllowedProductIds(slug: string): Promise<Set<string>> {
  try {
    const { data: config, error: configError } = await supabase
      .from('special_drink_configs')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (configError || !config) {
      console.warn('[allowed-bottles] Config not found for slug:', slug, configError?.message);
      return new Set();
    }

    const { data: allowed, error: allowedError } = await (supabase
      .from('special_drink_allowed_products' as any)
      .select('product_id')
      .eq('config_id', config.id)) as any;

    if (allowedError) {
      console.warn('[allowed-bottles] Error fetching allowed products:', allowedError.message);
      return new Set();
    }

    if (!allowed || !Array.isArray(allowed) || allowed.length === 0) {
      return new Set();
    }

    return new Set(allowed.map((a: any) => String(a.product_id)));
  } catch (err) {
    console.warn('[allowed-bottles] Unexpected error:', err);
    return new Set();
  }
}

/**
 * Splits allowed product IDs into spirit IDs and energético IDs
 * based on actual product_type from the database.
 */
export async function fetchAllowedByType(slug: string): Promise<{
  spiritIds: Set<string>;
  energeticoIds: Set<string>;
  hasAny: boolean;
}> {
  const allIds = await fetchAllowedProductIds(slug);
  if (allIds.size === 0) {
    return { spiritIds: new Set(), energeticoIds: new Set(), hasAny: false };
  }

  // Fetch product types for all allowed IDs
  const ids = [...allIds];
  const { data: products } = await supabase
    .from('products')
    .select('id, product_type, is_active')
    .in('id', ids)
    .eq('is_active', true);

  const spiritIds = new Set<string>();
  const energeticoIds = new Set<string>();

  (products || []).forEach((p: { id: string; product_type: string | null }) => {
    const type = p.product_type || '';
    if (type === 'energetico') {
      energeticoIds.add(p.id);
    } else if (SPIRIT_TYPES.has(type)) {
      spiritIds.add(p.id);
    } else {
      // Unknown type — put in spirits as fallback
      spiritIds.add(p.id);
    }
  });

  return { spiritIds, energeticoIds, hasAny: true };
}

/**
 * Filters bottles based on allowed product IDs.
 * If allowedIds is empty, returns empty array.
 */
export function filterByAllowedProducts<T extends { product_id: string }>(
  bottles: T[],
  allowedIds: Set<string>
): T[] {
  return bottles.filter(b => allowedIds.has(b.product_id));
}
