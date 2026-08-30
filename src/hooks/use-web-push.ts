import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// This must match the VAPID_PUBLIC_KEY secret
const VAPID_PUBLIC_KEY_FALLBACK = 'BKMr5Y5qHGUO1YDZxdD8GzU2R-w9ZBVtWrw9m7Z2ZvRdMCNe4NgwgA9t8E8tyfqyDPR9Jsb7lHb4ngNCuwGOoBw';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      // Check existing subscription
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribe = useCallback(async (role: string = 'admin'): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const reg = await navigator.serviceWorker.ready;

      // Check if already subscribed
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY_FALLBACK).buffer as ArrayBuffer,
        });
      }

      // Save subscription to database
      const subJson = sub.toJSON();
      const { error } = await (supabase.from('push_subscriptions' as any) as any).upsert(
        {
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh || '',
          auth: subJson.keys?.auth || '',
          role,
        },
        { onConflict: 'endpoint' },
      );

      if (error) {
        console.error('[WebPush] Error saving subscription:', error);
        return false;
      }

      setIsSubscribed(true);
      console.log(`[WebPush] Subscribed successfully as ${role}`);
      return true;
    } catch (err) {
      console.error('[WebPush] Subscribe error:', err);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await (supabase.from('push_subscriptions' as any) as any).delete().eq('endpoint', endpoint);
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('[WebPush] Unsubscribe error:', err);
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe,
  };
}
