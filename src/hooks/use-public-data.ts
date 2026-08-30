// Public data hooks - use secure views that don't expose sensitive data
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import type { Product, Category, Banner, Settings } from '@/shared/schema';

// Map public product (without cost_price and profit_margin)
function mapPublicProduct(data: any): Product {
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? undefined,
    imageUrl: data.image_url ?? undefined,
    salePrice: String(data.sale_price || 0),
    costPrice: '0', // Hidden for security
    profitMargin: '0', // Hidden for security
    stock: data.stock ?? 0,
    categoryId: data.category_id ?? null,
    isActive: data.is_active ?? true,
    sortOrder: data.sort_order ?? 0,
    isPrepared: data.is_prepared ?? false,
    comboEligible: data.combo_eligible ?? false,
    barcode: data.barcode ?? undefined,
    productType: data.product_type ?? undefined,
    createdAt: data.created_at ?? undefined,
  };
}

// Map public category (without sort_order internal)
function mapPublicCategory(data: any): Category {
  return {
    id: data.id,
    name: data.name,
    iconUrl: data.icon_url ?? undefined,
    isActive: data.is_active ?? true,
    sortOrder: 0,
    createdAt: data.created_at ?? undefined,
  };
}

// Map public banner (keep sort_order for proper ordering)
function mapPublicBanner(data: any): Banner {
  return {
    id: data.id,
    title: data.title,
    description: data.description ?? undefined,
    imageUrl: data.image_url,
    linkUrl: data.link_url ?? undefined,
    isActive: data.is_active ?? true,
    sortOrder: data.sort_order ?? 0,
    createdAt: data.created_at ?? undefined,
  };
}

// Map public store info (without pix_key)
function mapStoreInfo(data: any): Settings {
  return {
    id: 'public',
    isOpen: data.is_open ?? false,
    openingHours: data.opening_hours ?? undefined,
    maxDeliveryDistance: String(data.max_delivery_distance || 15),
    minDeliveryFee: String(data.min_delivery_fee || 3),
    deliveryRatePerKm: String(data.delivery_rate_per_km || 1.5),
    storeLat: data.store_lat ? String(data.store_lat) : undefined,
    storeLng: data.store_lng ? String(data.store_lng) : undefined,
    storeAddress: data.store_address ?? undefined,
    pixKey: undefined, // Hidden for security - only staff can see
  };
}

// Aggressive caching defaults for read-only public catalog data.
// Realtime subscriptions invalidate these queries when data changes,
// so we don't need to refetch on mount/focus.
const PUBLIC_CACHE = {
  staleTime: 5 * 60_000,   // 5 min — fresh enough; realtime invalidates
  gcTime: 30 * 60_000,     // 30 min — keep in memory for fast back/forward
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: 1,
  placeholderData: (prev: any) => prev,
} as const;

// Hook for public products (customers)
export function usePublicProducts(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  
  return useQuery<Product[]>({
    queryKey: ['products-public'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_products_public', { p_active_only: true });
      if (error) {
        // Fallback to direct query if RPC fails
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('products')
          .select('id, name, description, image_url, sale_price, stock, category_id, is_active, sort_order, is_prepared, combo_eligible, barcode, product_type, created_at')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (fallbackError) throw fallbackError;
        return (fallbackData || []).map(mapPublicProduct);
      }
      return (data || []).map(mapPublicProduct);
    },
    enabled,
    ...PUBLIC_CACHE,
  });
}

// Hook for public categories (customers)
export function usePublicCategories(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  
  return useQuery<Category[]>({
    queryKey: ['categories-public'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_categories_public', { p_active_only: true });
      if (error) {
        // Fallback to direct query if RPC fails
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('categories')
          .select('id, name, icon_url, is_active, is_special, created_at')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (fallbackError) throw fallbackError;
        return (fallbackData || []).map(mapPublicCategory);
      }
      return (data || []).map(mapPublicCategory);
    },
    enabled,
    ...PUBLIC_CACHE,
  });
}

// Hook for public banners (customers)
export function usePublicBanners(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  
  return useQuery<Banner[]>({
    queryKey: ['banners-public'],
    queryFn: async () => {
      // Direct query to get banners with sort_order for proper ordering
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, description, image_url, link_url, is_active, sort_order, created_at')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) { console.warn('[usePublicBanners] query error:', error.message); return []; }
      return (data || []).map(mapPublicBanner);
    },
    enabled,
    ...PUBLIC_CACHE,
  });
}

// Hook for public store info (customers) - without PIX key
export function usePublicStoreInfo(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  
  return useQuery<Settings | null>({
    queryKey: ['store-info-public'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_store_info');
      if (error) {
        // Fallback - return minimal info
        return {
          id: 'public',
          isOpen: true,
          maxDeliveryDistance: '15',
          minDeliveryFee: '4',
          deliveryRatePerKm: '1',
        } as Settings;
      }
      if (!data || (Array.isArray(data) && data.length === 0)) return null;
      const row = Array.isArray(data) ? data[0] : data;
      return mapStoreInfo(row);
    },
    enabled,
    // Status is also synced via realtime — reduce polling pressure
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
