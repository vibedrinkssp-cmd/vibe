import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  enableNotificationSound,
  isNotificationSoundReady,
  subscribeToNotificationSoundState,
  subscribeToAlertLoopState,
  primeAudio,
} from '@/lib/notification-sound-engine';

/**
 * Banner global que aparece SOMENTE em telas operacionais quando o áudio
 * ainda não foi destravado pelo navegador. Ao clicar, faz unlock síncrono
 * do AudioContext + HTMLAudioElement e toca um beep de teste.
 *
 * Web/PWA: navegadores bloqueiam autoplay até o primeiro gesto direto.
 * Esse banner garante que o operador tenha um caminho claro para liberar
 * o som quando ele ainda não interagiu com o painel.
 */
export function SoundUnlockBanner() {
  const [unlocked, setUnlocked] = useState(() => isNotificationSoundReady());
  const [hasPendingAlert, setHasPendingAlert] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u1 = subscribeToNotificationSoundState(setUnlocked);
    const u2 = subscribeToAlertLoopState(setHasPendingAlert);
    return () => { u1(); u2(); };
  }, []);

  // Não polui a tela quando já está liberado
  if (unlocked) return null;

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      primeAudio();
      await enableNotificationSound({ volume: 0.85 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-[60] w-[calc(100vw-1rem)] max-w-md ${
        hasPendingAlert ? 'top-2 animate-pulse' : 'top-2'
      }`}
    >
      <Button
        onClick={handleEnable}
        disabled={busy}
        className={`w-full h-12 text-base font-bold shadow-lg ${
          hasPendingAlert
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-amber-500 hover:bg-amber-600 text-black'
        }`}
        data-testid="button-unlock-sound"
      >
        {hasPendingAlert ? (
          <>
            <Volume2 className="h-5 w-5 mr-2" />
            🔔 PEDIDOS CHAMANDO — Toque para ativar som
          </>
        ) : (
          <>
            <VolumeX className="h-5 w-5 mr-2" />
            Ativar som de alertas neste dispositivo
          </>
        )}
      </Button>
    </div>
  );
}
