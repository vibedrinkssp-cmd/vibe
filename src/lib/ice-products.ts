import { supabase } from '@/integrations/supabase/client-safe';
import { listAvailableIceFlavors } from '@/lib/ice-flavor-icons';
import type { Product } from '@/shared/schema';

const SELECT_COLUMNS = 'id, name, image_url, sale_price, stock, category_id, is_active, sort_order';
const ICE_CATEGORY_RE = /^ices?$/i;
const BEER_CATEGORY_RE = /^cervejas?$/i;
const GELO_CATEGORY_RE = /gelo/i;
// Caipi Ice / caipirinhas prontas ficam na mesma categoria mas não são "a Ice" que entra na receita.
const PREMADE_RE = /^caip/i;

export function rowToProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url ?? undefined,
    salePrice: String(row.sale_price || 0),
    costPrice: '0',
    profitMargin: '0',
    stock: row.stock ?? 0,
    categoryId: row.category_id ?? null,
    isActive: row.is_active ?? true,
    sortOrder: row.sort_order ?? 0,
    isPrepared: false,
  };
}

async function categoryIds(match: RegExp): Promise<string[]> {
  const { data, error } = await supabase.from('categories_public').select('id, name');
  if (error) throw error;
  return (data || []).filter((c) => c.id && match.test((c.name || '').trim())).map((c) => c.id as string);
}

async function productsInCategories(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('products_public')
    .select(SELECT_COLUMNS)
    .in('category_id', ids)
    .eq('is_active', true);
  if (error) throw error;
  return data || [];
}

/** Gelos de sabor com estoque (categoria cujo nome tem "gelo"). */
export async function loadAvailableGelos(): Promise<Product[]> {
  const rows = await productsInCategories(await categoryIds(GELO_CATEGORY_RE));
  return listAvailableIceFlavors(rows).map(rowToProduct);
}

/** "Ice" (Smirnoff Ice, 51 Ice, Beats...) e longnecks com estoque, usadas na receita do Caipi Ice. */
export async function loadAvailableIces(): Promise<Product[]> {
  const [iceRows, beerRows] = await Promise.all([
    categoryIds(ICE_CATEGORY_RE).then(productsInCategories),
    categoryIds(BEER_CATEGORY_RE).then(productsInCategories),
  ]);
  const ices = iceRows.filter((p) => !PREMADE_RE.test(p.name || ''));
  const longnecks = beerRows.filter((p) => /longneck/i.test(p.name || ''));
  const seen = new Set<string>();
  return [...ices, ...longnecks]
    .filter((p) => Number(p.stock ?? 0) > 0 && p.id && !seen.has(p.id) && !!seen.add(p.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }))
    .map(rowToProduct);
}
