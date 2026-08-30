// Hook for admin data - uses resilient RPC calls with automatic retry
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { resilientRpc } from '@/lib/resilient-rpc';
import { fetchOrderItemsBatched } from '@/lib/order-items-fetch';
import {
  mapProduct,
  mapCategory,
  mapOrder,
  mapAdminOrder,
  mapUser,
  mapMotoboy,
  mapBanner,
  mapSettings,
  mapAddress,
} from '@/lib/db-mappers';
import type { Product, Category, Order, OrderItem, User, Motoboy, Banner, Settings, Address } from '@/shared/schema';
import { useToast } from '@/hooks/use-toast';

// Column selections — avoid select('*')
const PRODUCT_COLUMNS = 'id, name, description, image_url, cost_price, profit_margin, sale_price, stock, category_id, is_active, sort_order, is_prepared, combo_eligible, barcode, product_type, created_at, tier, on_99food, on_ifood, price_99food, price_ifood' as const;
const CATEGORY_COLUMNS = 'id, name, icon_url, sort_order, is_active, is_special, created_at' as const;
const BANNER_COLUMNS = 'id, title, description, image_url, link_url, is_active, sort_order, created_at' as const;

// Stale times
const ADMIN_CATALOG_STALE = 15_000; // 15s
// ONDA 2: listas operacionais (pedidos, motoboys, caixa) com staleTime=0
// para refletir mudanças imediatas após realtime invalidar a query
const ADMIN_ORDERS_STALE = 0;
export function useAdminOrders(options: { refetchInterval?: number } = {}) {
  return useQuery<Order[]>({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await resilientRpc('get_admin_orders_complete');
      if (error) throw error;
      return ((data || []) as any[]).map(mapAdminOrder);
    },
    staleTime: ADMIN_ORDERS_STALE,
    refetchInterval: options.refetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useAdminOrderItems(orderIds: string[]) {
  const sortedIds = [...orderIds].sort().join(',');
  
  return useQuery<OrderItem[]>({
    queryKey: ['admin-order-items', sortedIds],
    queryFn: async () => fetchOrderItemsBatched(orderIds, true),
    enabled: orderIds.length > 0,
    staleTime: 8000,
  });
}

export function useAdminProducts() {
  return useQuery<Product[]>({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(mapProduct);
    },
    staleTime: ADMIN_CATALOG_STALE,
  });
}

export function useAdminCategories() {
  return useQuery<Category[]>({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select(CATEGORY_COLUMNS)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(mapCategory);
    },
    staleTime: ADMIN_CATALOG_STALE,
  });
}

export function useAdminUsers() {
  return useQuery<User[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await resilientRpc('get_all_users_with_role');
      if (error) throw error;
      return ((data || []) as any[]).map(mapUser);
    },
    staleTime: 30_000,
  });
}

export function useAdminMotoboys() {
  return useQuery<Motoboy[]>({
    queryKey: ['admin-motoboys'],
    queryFn: async () => {
      const { data, error } = await resilientRpc('get_all_motoboys');
      if (error) throw error;
      return ((data || []) as any[]).map(mapMotoboy);
    },
    // ONDA 2: staleTime=0 — realtime + refetch on focus garantem dados frescos
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useAdminBanners() {
  return useQuery<Banner[]>({
    queryKey: ['admin-banners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banners')
        .select(BANNER_COLUMNS)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(mapBanner);
    },
    staleTime: 30_000,
  });
}

export function useAdminSettings() {
  return useQuery<Settings | null>({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapSettings(data) : null;
    },
    staleTime: 60_000,
  });
}


export function useAdminAddresses() {
  return useQuery<Address[]>({
    queryKey: ['admin-addresses'],
    queryFn: async () => {
      const { data, error } = await resilientRpc('get_all_addresses');
      if (error) throw error;
      return ((data || []) as any[]).map(mapAddress);
    },
    staleTime: 30_000,
  });
}

// Mutations
export function useUpdateOrderStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const now = new Date().toISOString();
      
      const { error } = await resilientRpc('update_order_status', {
        p_order_id: orderId,
        p_status: status,
        p_accepted_at: status === 'accepted' ? now : undefined,
        p_preparing_at: status === 'preparing' ? now : undefined,
        p_ready_at: status === 'ready' ? now : undefined,
        p_dispatched_at: status === 'dispatched' ? now : undefined,
        p_arrived_at: status === 'arrived' ? now : undefined,
        p_delivered_at: status === 'delivered' ? now : undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    },
  });
}

export function useDeleteOrder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await resilientRpc('delete_order', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order-items'] });
      toast({ title: 'Pedido excluído!' });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir pedido', variant: 'destructive' });
    },
  });
}

export function useAssignMotoboy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ orderId, motoboyId }: { orderId: string; motoboyId: string }) => {
      // ONDA 7: usa RPC atômica que valida motoboy ativo + sincroniza users/user_roles
      const { data, error } = await resilientRpc('assign_motoboy_atomic', {
        p_order_id: orderId,
        p_motoboy_id: motoboyId,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        throw new Error(result.error || 'Falha ao atribuir motoboy');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Motoboy atribuído!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao atribuir motoboy', description: err?.message, variant: 'destructive' });
    },
  });
}

export function useConfirmTotemPayment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ orderId, confirmedBy }: { orderId: string; confirmedBy?: string }) => {
      const { error } = await resilientRpc('confirm_totem_payment', {
        p_order_id: orderId,
        p_confirmed_by: confirmedBy || 'caixa',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: '✅ Pagamento confirmado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao confirmar pagamento', variant: 'destructive' });
    },
  });
}

// SINISTRO — força reversão de status (mesmo cancelled/delivered) para qualquer outro
export function useSinistroRevertStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      newStatus,
      responsible,
      reason,
    }: {
      orderId: string;
      newStatus: string;
      responsible?: string;
      reason?: string;
    }) => {
      const { data, error } = await resilientRpc('sinistro_revert_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus,
        p_responsible: responsible || 'admin',
        p_reason: reason || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({
        title: '🚨 SINISTRO aplicado',
        description: 'Status do pedido foi forçado com sucesso.',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao aplicar SINISTRO',
        description: err?.message || 'Falha ao reverter status',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateDeliveryFee() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ orderId, newFee }: { orderId: string; newFee: number }) => {
      const { error } = await resilientRpc('update_delivery_fee', {
        p_order_id: orderId,
        p_new_fee: newFee,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: 'Taxa de entrega atualizada!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar taxa', variant: 'destructive' });
    },
  });
}