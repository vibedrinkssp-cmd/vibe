import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';
import { useAuth } from '@/lib/auth';
import { usePushNotifications } from './use-push-notifications';
import { useQueryClient } from '@tanstack/react-query';

export function useCouponNotifications() {
  const { user, isAuthenticated } = useAuth();
  const { notifyNewCoupon, isGranted } = usePushNotifications();
  const queryClient = useQueryClient();
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || subscribedRef.current) return;

    const channel = supabase
      .channel(`user-coupons-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_coupons',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('[CouponNotification] New coupon assigned:', payload);
          
          // Fetch coupon details
          const { data: couponData } = await supabase
            .from('coupons')
            .select('code, discount_percent')
            .eq('id', payload.new.coupon_id)
            .single();

          if (couponData && isGranted) {
            notifyNewCoupon(couponData.discount_percent, couponData.code);
          }

          // Invalidate coupons query to refresh the list
          queryClient.invalidateQueries({ queryKey: ['user-coupons', user.id] });
        }
      )
      .subscribe((status) => {
        console.log('[CouponNotification] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true;
        }
      });

    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user?.id, notifyNewCoupon, isGranted, queryClient]);
}
