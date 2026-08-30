import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';
import { useAuth } from '@/lib/auth';
import type { UserCoupon, CouponType } from '@/lib/coupon-utils';

export function useUserCoupons() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user-coupons', userId],
    queryFn: async (): Promise<UserCoupon[]> => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('user_coupons')
        .select(`
          id,
          assigned_at,
          is_used,
          used_at,
          coupons (
            id,
            code,
            description,
            discount_percent,
            coupon_type,
            max_discount_value,
            product_id,
            category_id,
            min_quantity
          )
        `)
        .eq('user_id', userId)
        .order('assigned_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(uc => ({
        id: uc.id,
        coupon_id: (uc.coupons as any)?.id || '',
        code: (uc.coupons as any)?.code || '',
        description: (uc.coupons as any)?.description || null,
        discount_percent: (uc.coupons as any)?.discount_percent || 0,
        coupon_type: ((uc.coupons as any)?.coupon_type || 'percent') as CouponType,
        max_discount_value: (uc.coupons as any)?.max_discount_value || null,
        product_id: (uc.coupons as any)?.product_id || null,
        category_id: (uc.coupons as any)?.category_id || null,
        min_quantity: (uc.coupons as any)?.min_quantity || 1,
        assigned_at: uc.assigned_at || '',
        is_used: uc.is_used || false,
        used_at: uc.used_at || null,
      }));
    },
    enabled: !!userId,
  });

  // Realtime subscription for user's coupons
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user-coupons-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_coupons',
        filter: `user_id=eq.${userId}`,
      }, () => {
        // Invalidate and refetch when user's coupons change
        queryClient.invalidateQueries({ queryKey: ['user-coupons', userId] });
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const availableCoupons = (query.data || []).filter(c => !c.is_used);
  const usedCoupons = (query.data || []).filter(c => c.is_used);

  return {
    coupons: query.data || [],
    availableCoupons,
    usedCoupons,
    isLoading: query.isLoading,
    isAuthenticated,
    refetch: query.refetch,
  };
}
