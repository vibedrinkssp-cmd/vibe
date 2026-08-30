import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client-safe';
import { usePushNotifications } from './use-push-notifications';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/shared/schema';
import type { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = 'vm-order-badge-count';
const LAST_SEEN_KEY = 'vm-order-last-seen';

/**
 * Tracks accumulated order status updates for the logged-in customer.
 * Shows a red badge on "Pedidos" with the count of unread updates.
 * Clears when the user visits /pedidos.
 */
export function useCustomerOrderBadge() {
  const { user, role } = useAuth();
  const [badgeCount, setBadgeCount] = useState(() => {
    try {
      return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
    } catch {
      return 0;
    }
  });
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { notifyOrderStatusChange, requestPermission, permission } = usePushNotifications({ playSound: false });

  const isCustomer = role === 'customer' && !!user?.id;

  // Persist badge count
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(badgeCount));
    } catch { /* ignore */ }
  }, [badgeCount]);

  // Request notification permission for customers with active orders
  useEffect(() => {
    if (isCustomer && permission === 'default') {
      // Delay slightly so it doesn't block initial render
      const timer = setTimeout(() => requestPermission(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isCustomer, permission, requestPermission]);

  // Subscribe to realtime order updates for THIS customer
  useEffect(() => {
    if (!isCustomer) return;

    const channel = supabase
      .channel(`customer-badge-${user!.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const orderUserId = (payload.new as any)?.user_id;
          if (orderUserId !== user!.id) return;

          const oldStatus = (payload.old as any)?.status as OrderStatus | undefined;
          const newStatus = (payload.new as any)?.status as OrderStatus;
          const orderId = (payload.new as any)?.id as string;

          if (oldStatus && oldStatus !== newStatus) {
            // Increment badge only if user is NOT currently on /pedidos
            if (!window.location.pathname.startsWith('/pedidos')) {
              setBadgeCount(prev => prev + 1);
            }

            // Send browser notification
            const label = ORDER_STATUS_LABELS[newStatus] || newStatus;
            notifyOrderStatusChange(orderId, label);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isCustomer, user?.id, notifyOrderStatusChange]);

  // Clear badge when user visits orders page
  const clearBadge = useCallback(() => {
    setBadgeCount(0);
    try {
      localStorage.setItem(STORAGE_KEY, '0');
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    } catch { /* ignore */ }
  }, []);

  return { badgeCount, clearBadge };
}
