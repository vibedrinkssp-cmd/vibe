import { supabase } from '@/integrations/supabase/client-safe';
import { resilientRpc } from '@/lib/resilient-rpc';
import { mapOrderItem } from '@/lib/db-mappers';
import type { OrderItem } from '@/shared/schema';

const ORDER_ITEM_COLUMNS = 'id, order_id, product_id, product_name, quantity, unit_price, total_price, is_wizard_item' as const;
const ORDER_ITEMS_BATCH_SIZE = 80;

export async function fetchOrderItemsBatched(orderIds: string[], useAdminRpc = false): Promise<OrderItem[]> {
  if (orderIds.length === 0) return [];

  const batches = Array.from({ length: Math.ceil(orderIds.length / ORDER_ITEMS_BATCH_SIZE) }, (_, index) =>
    orderIds.slice(index * ORDER_ITEMS_BATCH_SIZE, (index + 1) * ORDER_ITEMS_BATCH_SIZE)
  );

  const results = await Promise.all(batches.map((batch) => fetchOrderItemsBatch(batch, useAdminRpc)));
  return results.flat();
}

async function fetchOrderItemsBatch(batch: string[], useAdminRpc: boolean): Promise<OrderItem[]> {
  if (useAdminRpc) {
    const { data, error } = await resilientRpc('get_all_order_items', { p_order_ids: batch });
    if (!error && Array.isArray(data)) {
      return data.map((item) => mapOrderItem(item as Record<string, unknown>));
    }

    console.warn('[fetchOrderItemsBatched] RPC failed, trying direct fallback:', error?.message || error);
  }

  const { data, error } = await supabase
    .from('order_items')
    .select(ORDER_ITEM_COLUMNS)
    .in('order_id', batch);

  if (error) {
    console.warn('[fetchOrderItemsBatched] direct query error:', error.message);
    return [];
  }

  return (data || []).map(mapOrderItem);
}
