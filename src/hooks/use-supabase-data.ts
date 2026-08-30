import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import {
  mapProduct,
  mapCategory,
  mapOrder,
  mapAdminOrder,
  mapOrderItem,
  mapUser,
  mapMotoboy,
  mapBanner,
  mapSettings,
  mapAddress,
} from '@/lib/db-mappers';
import { fetchOrderItemsBatched } from '@/lib/order-items-fetch';
import type {
  Product,
  Category,
  Order,
  OrderItem,
  User,
  Motoboy,
  Banner,
  Settings,
  Address,
} from '@/shared/schema';

const CATALOG_QUERY_VERSION = '2026-04-18-macos-tab';

// Column selections — avoid select('*') to reduce payload and disk IO
const PRODUCT_COLUMNS = 'id, name, description, image_url, cost_price, profit_margin, sale_price, stock, category_id, is_active, sort_order, is_prepared, combo_eligible, barcode, product_type, created_at' as const;
const CATEGORY_COLUMNS = 'id, name, icon_url, sort_order, is_active, is_special, created_at' as const;
const ORDER_COLUMNS = 'id, user_id, address_id, motoboy_id, order_type, status, subtotal, delivery_fee, discount, total, payment_method, notes, salesperson, customer_name, created_at, accepted_at, preparing_at, ready_at, dispatched_at, picked_up_at, arrived_at, delivered_at, payment_confirmed, payment_confirmed_at, payment_confirmed_by, change_for, delivery_distance, delivery_fee_adjusted, delivery_fee_adjusted_at, original_delivery_fee, mp_payment_id' as const;
const USER_COLUMNS = 'id, name, whatsapp, cpf, is_blocked, requires_password_change, created_at' as const;
const MOTOBOY_COLUMNS = 'id, name, whatsapp, photo_url, is_active, is_online, slot_number, cpf, current_latitude, current_longitude, location_updated_at, logged_in_at, created_at' as const;
const BANNER_COLUMNS = 'id, title, description, image_url, link_url, is_active, sort_order, created_at' as const;

// Stale times — reduce unnecessary refetches
const CATALOG_STALE = 30_000; // 30s for products/categories
const ORDERS_STALE = 0; // orders always fresh
const STATIC_STALE = 60_000; // 60s for banners, settings
const QUERY_RETRY = 0;

function mapKitchenOrderWithItems(row: Record<string, unknown>): Order & { items?: OrderItem[]; userName?: string; userWhatsapp?: string; address?: Address } {
  const order = mapAdminOrder(row);
  const itemsPayload = row.items_payload;
  const items = Array.isArray(itemsPayload)
    ? itemsPayload.map((item) => mapOrderItem(item as Record<string, unknown>))
    : [];
  return { ...order, items };
}

export function useProducts(options: { enabled?: boolean; activeOnly?: boolean } = {}) {
  const { enabled = true, activeOnly = true } = options;
  
  return useQuery<Product[]>({
    queryKey: ['products', { activeOnly, version: CATALOG_QUERY_VERSION }],
    queryFn: async () => {
      let query = supabase.from('products').select(PRODUCT_COLUMNS).order('sort_order', { ascending: true });
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) {
        console.error('[useProducts] query error:', error.message);
        throw error;
      }
      return (data || []).map(mapProduct);
    },
    enabled,
    staleTime: CATALOG_STALE,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useCategories(options: { enabled?: boolean; activeOnly?: boolean } = {}) {
  const { enabled = true, activeOnly = true } = options;
  
  return useQuery<Category[]>({
    queryKey: ['categories', { activeOnly, version: CATALOG_QUERY_VERSION }],
    queryFn: async () => {
      let query = supabase.from('categories').select(CATEGORY_COLUMNS).order('sort_order', { ascending: true });
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) {
        console.error('[useCategories] query error:', error.message);
        throw error;
      }
      return (data || []).map(mapCategory);
    },
    enabled,
    staleTime: CATALOG_STALE,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useOrders(options: { enabled?: boolean; userId?: string; refetchInterval?: number; useRpc?: boolean; useAdminRpc?: boolean; useKitchenRpc?: boolean; useLogRpc?: boolean } = {}) {
  const { enabled = true, userId, refetchInterval, useRpc = false, useAdminRpc = false, useKitchenRpc = false, useLogRpc = false } = options;
  
  return useQuery<Order[]>({
    queryKey: ['orders', { userId, useRpc, useAdminRpc, useKitchenRpc, useLogRpc }],
    queryFn: async () => {
      if (useLogRpc) {
        const { data, error } = await supabase.rpc('get_log_orders_complete');
        if (error) { console.error('[useOrders] Log RPC error:', error.message); throw error; }
        return (data || []).map(mapAdminOrder);
      }
      if (useKitchenRpc) {
        let { data, error } = await supabase.rpc('get_kitchen_orders_with_items');
        // Session may have silently expired → RPC raises "Acesso negado".
        // Try to refresh the auth session once and retry before giving up,
        // so the panel never goes blank from a stale token.
        if (error) {
          console.warn('[useOrders] Kitchen RPC error, refreshing session:', error.message);
          try { await supabase.auth.refreshSession(); } catch { /* ignore */ }
          const retry = await supabase.rpc('get_kitchen_orders_with_items');
          data = retry.data; error = retry.error;
        }
        if (error) {
          console.error('[useOrders] Kitchen RPC failed after retry:', error.message);
          throw error;
        }
        return (data || []).map(mapKitchenOrderWithItems);
      }
      if (useAdminRpc) {
        const { data, error } = await supabase.rpc('get_admin_orders_complete');
        if (error) { console.error('[useOrders] RPC error:', error.message); throw error; }
        return (data || []).map(mapAdminOrder);
      }
      if (useRpc && userId) {
        const { data, error } = await supabase.rpc('get_user_orders', { p_user_id: userId });
        if (error) { console.error('[useOrders] RPC error:', error.message); throw error; }
        return (data || []).map(mapOrder);
      }
      let query = supabase.from('orders').select(ORDER_COLUMNS).order('created_at', { ascending: false });
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query;
      if (error) { console.error('[useOrders] query error:', error.message); throw error; }
      return (data || []).map(mapOrder);
    },
    enabled,
    staleTime: ORDERS_STALE,
    refetchInterval,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useOrderItems(orderIds: string[], options: { enabled?: boolean; refetchInterval?: number; useAdminRpc?: boolean } = {}) {
  const { enabled = true, refetchInterval, useAdminRpc = false } = options;
  
  return useQuery<OrderItem[]>({
    queryKey: ['order-items', orderIds.join(','), { useAdminRpc }],
    queryFn: async () => fetchOrderItemsBatched(orderIds, useAdminRpc),
    enabled: enabled && orderIds.length > 0,
    staleTime: ORDERS_STALE,
    refetchInterval,
    // Keep the last items while a new order changes the id set, so KDE/Log
    // classification never flickers to "empty" and hides/duplicates orders.
    placeholderData: (prev) => prev,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useUsers(options: { enabled?: boolean; useAdminRpc?: boolean } = {}) {
  const { enabled = true, useAdminRpc = false } = options;
  
  return useQuery<User[]>({
    queryKey: ['users', { useAdminRpc }],
    queryFn: async () => {
      if (useAdminRpc) {
        const { data, error } = await supabase.rpc('get_all_users');
        if (error) { console.error('[useUsers] RPC error:', error.message); throw error; }
        return (data || []).map(mapUser);
      }
      const { data, error } = await supabase.from('users').select(USER_COLUMNS);
      if (error) { console.error('[useUsers] query error:', error.message); throw error; }
      return (data || []).map(mapUser);
    },
    enabled,
    staleTime: STATIC_STALE,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useMotoboys(options: { enabled?: boolean; activeOnly?: boolean; useAdminRpc?: boolean } = {}) {
  const { enabled = true, activeOnly = false, useAdminRpc = false } = options;
  
  return useQuery<Motoboy[]>({
    queryKey: ['motoboys', { activeOnly, useAdminRpc }],
    queryFn: async () => {
      if (useAdminRpc) {
        const { data, error } = await supabase.rpc('get_all_motoboys');
        if (error) { console.error('[useMotoboys] RPC error:', error.message); throw error; }
        return (data || []).map(mapMotoboy);
      }
      let query = supabase.from('motoboys').select(MOTOBOY_COLUMNS).order('slot_number', { ascending: true, nullsFirst: false });
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) { console.error('[useMotoboys] query error:', error.message); throw error; }
      return (data || []).map(mapMotoboy);
    },
    enabled,
    staleTime: CATALOG_STALE,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useBanners(options: { enabled?: boolean; activeOnly?: boolean } = {}) {
  const { enabled = true, activeOnly = true } = options;
  
  return useQuery<Banner[]>({
    queryKey: ['banners', { activeOnly }],
    queryFn: async () => {
      let query = supabase.from('banners').select(BANNER_COLUMNS).order('sort_order', { ascending: true });
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) { console.error('[useBanners] query error:', error.message); throw error; }
      return (data || []).map(mapBanner);
    },
    enabled,
    staleTime: STATIC_STALE,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}


export function useSettings(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  
  return useQuery<Settings | null>({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      if (error) { console.error('[useSettings] query error:', error.message); throw error; }
      return data ? mapSettings(data) : null;
    },
    enabled,
    staleTime: STATIC_STALE,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}

export function useAddresses(userId: string, options: { enabled?: boolean; useAdminRpc?: boolean } = {}) {
  const { enabled = true, useAdminRpc = false } = options;
  
  return useQuery<Address[]>({
    queryKey: ['addresses', userId, { useAdminRpc }],
    queryFn: async () => {
      if (useAdminRpc) {
        const { data, error } = await supabase.rpc('get_all_addresses');
        if (error) { console.error('[useAddresses] RPC error:', error.message); throw error; }
        return (data || []).map(mapAddress);
      }
      const { data, error } = await supabase.rpc('get_user_addresses', { p_user_id: userId });
      if (error) { console.error('[useAddresses] RPC error:', error.message); throw error; }
      return (data || []).map(mapAddress);
    },
    enabled: enabled && !!userId,
    staleTime: STATIC_STALE,
    retry: QUERY_RETRY,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
  });
}