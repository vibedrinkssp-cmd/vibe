import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mock Web Audio API ─────────────────────────────────────

const oscStartMock = vi.fn();
const oscStopMock = vi.fn();
const oscConnectMock = vi.fn();
const gainConnectMock = vi.fn();

class MockOscillator {
  type = 'sine';
  frequency = { setValueAtTime: vi.fn() };
  start = oscStartMock;
  stop = oscStopMock;
  connect = oscConnectMock;
}

class MockGain {
  gain = {
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = gainConnectMock;
}

class MockAudioContext {
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { /* noop */ });
  createOscillator = () => new MockOscillator();
  createGain = () => new MockGain();
}

describe('notification-sound-engine v3 (Web Audio synthesis)', () => {
  beforeEach(() => {
    vi.resetModules();
    oscStartMock.mockClear();
    oscStopMock.mockClear();
    oscConnectMock.mockClear();
    gainConnectMock.mockClear();
    vi.stubGlobal('AudioContext', MockAudioContext);
  });

  afterEach(async () => {
    const engine = await import('@/lib/notification-sound-engine');
    engine.__resetNotificationSoundEngineForTests();
    vi.unstubAllGlobals();
  });

  it('playOnce schedules at least one oscillator', async () => {
    const { useNotificationSound } = await import('@/hooks/use-notification-sound');
    const { result } = renderHook(() => useNotificationSound({ screen: 'kitchen' }));

    await act(async () => {
      result.current.playOnce('kitchen');
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(oscStartMock).toHaveBeenCalled();
  });

  it('playLoop starts the loop and stopAll halts it', async () => {
    const { useNotificationSound } = await import('@/hooks/use-notification-sound');
    const { result } = renderHook(() => useNotificationSound({ screen: 'logistics' }));

    await act(async () => {
      result.current.playLoop('logistics');
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(oscStartMock).toHaveBeenCalled();

    act(() => {
      result.current.stopAll();
    });

    expect(result.current.isAlertActive).toBe(false);
  });

  it('enableSound marks audio as unlocked', async () => {
    const { useNotificationSound } = await import('@/hooks/use-notification-sound');
    const { result } = renderHook(() => useNotificationSound({ screen: 'pdv' }));

    await act(async () => {
      await result.current.enableSound('pdv');
    });

    expect(result.current.isSoundEnabled).toBe(true);
    expect(result.current.needsSoundActivation).toBe(false);
  });

  it('dedupes the same order per screen, not globally', async () => {
    const engine = await import('@/lib/notification-sound-engine');

    expect(engine.shouldAlertOrder('order-1', 'pdv')).toBe(true);
    expect(engine.shouldAlertOrder('order-1', 'pdv')).toBe(false);
    expect(engine.shouldAlertOrder('order-1', 'kitchen')).toBe(true);
    expect(engine.shouldAlertOrder('order-1', 'logistics')).toBe(true);
    expect(engine.shouldAlertOrder('order-1', 'motoboy')).toBe(true);
  });
});
