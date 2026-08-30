import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePushNotifications } from '@/hooks/use-push-notifications';

// Mock the notification sound hook
vi.mock('@/hooks/use-notification-sound', () => ({
  useNotificationSound: () => ({
    playOnce: vi.fn(),
    playMultiple: vi.fn(),
    stopAll: vi.fn(),
  }),
}));

describe('usePushNotifications', () => {
  beforeEach(() => {
    (window.Notification as any).permission = 'granted';
  });

  it('detects notification support', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(true);
  });

  it('requests permission', async () => {
    const { result } = renderHook(() => usePushNotifications());
    let granted: boolean | undefined;
    await act(async () => {
      granted = await result.current.requestPermission();
    });
    expect(granted).toBe(true);
  });

  it('creates new order notification', () => {
    const { result } = renderHook(() => usePushNotifications());
    const notification = result.current.notifyNewOrder('abc123', 'Carlos');
    expect(notification).not.toBeNull();
    expect(notification?.title).toBe('Novo Pedido!');
  });

  it('creates motoboy arriving notification', () => {
    const { result } = renderHook(() => usePushNotifications());
    const notification = result.current.notifyMotoboyArriving('abc123', 'Lucas');
    expect(notification).not.toBeNull();
    expect(notification?.title).toContain('Motoboy Chegando');
  });

  it('returns null when permission denied', () => {
    (window.Notification as any).permission = 'denied';
    const { result } = renderHook(() => usePushNotifications());
    const notification = result.current.showNotification('Test', 'body');
    expect(notification).toBeNull();
  });
});
