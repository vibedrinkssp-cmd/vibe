import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureNotificationSoundUnlockListeners,
  isNotificationSoundReady,
  playAlertOnce,
  playScreenSound,
  startScreenAlert,
  stopAllAlerts,
  stopScreenAlert,
  enableNotificationSound,
  subscribeToNotificationSoundState,
  subscribeToAlertLoopState,
  type ScreenSoundId,
  type NotificationSoundType,
} from '@/lib/notification-sound-engine';

export type SoundType = NotificationSoundType;

interface UseNotificationSoundOptions {
  volume?: number;
  /** Mantido por compat — ignorado, som é único no sistema. */
  screen?: ScreenSoundId;
}

/**
 * Hook unificado de alerta sonoro.
 * Som único (alarme estilo iFood) para todo o sistema.
 * Loop por tela permanece ativo até o pedido ser tratado ou parado manualmente.
 */
export function useNotificationSound(options: UseNotificationSoundOptions = {}) {
  const { volume = 0.85, screen = 'generic' } = options;
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => isNotificationSoundReady());
  const [isAlertActive, setIsAlertActive] = useState(false);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    ensureNotificationSoundUnlockListeners();
    const u1 = subscribeToNotificationSoundState(setIsSoundEnabled);
    const u2 = subscribeToAlertLoopState((active) => {
      setIsAlertActive(active);
      isPlayingRef.current = active;
    });
    return () => { u1(); u2(); };
  }, []);

  const enableSound = useCallback(async (_soundType?: SoundType) => {
    return enableNotificationSound({ volume });
  }, [volume]);

  const playOnce = useCallback((_soundType?: SoundType) => {
    if (_soundType === 'pdv') {
      playScreenSound('pdv', volume);
      return;
    }
    playAlertOnce(volume);
  }, [volume]);

  const playLoop = useCallback((soundType?: SoundType, _intervalMs?: number) => {
    const target = (soundType === 'kitchen' || soundType === 'logistics' || soundType === 'motoboy' || soundType === 'pdv' || soundType === 'customer' || soundType === 'generic')
      ? soundType
      : screen;
    startScreenAlert(target, volume);
  }, [screen, volume]);

  const playMultiple = useCallback(async (times = 3, delayMs = 700, _soundType?: SoundType) => {
    if (_soundType === 'pdv') {
      playScreenSound('pdv', volume);
      return;
    }
    for (let i = 0; i < times; i++) {
      playAlertOnce(volume);
      if (i < times - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }, [volume]);

  const stopAll = useCallback(() => { stopAllAlerts(); }, []);
  const stopScreen = useCallback((soundType?: SoundType) => {
    const target = (soundType === 'kitchen' || soundType === 'logistics' || soundType === 'motoboy' || soundType === 'pdv' || soundType === 'customer' || soundType === 'generic')
      ? soundType
      : screen;
    stopScreenAlert(target);
  }, [screen]);

  return {
    playOnce,
    playMultiple,
    playLoop,
    stopAll,
    stopScreen,
    enableSound,
    isPlaying: isPlayingRef,
    isAlertActive,
    isSoundEnabled,
    needsSoundActivation: !isSoundEnabled,
  };
}
