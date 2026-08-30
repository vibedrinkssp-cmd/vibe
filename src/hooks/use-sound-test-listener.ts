import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';
import type { NotificationSoundType } from '@/lib/notification-sound-engine';

const CHANNEL_NAME = 'sound-test-broadcast';
const CHANNEL_TOPIC = `realtime:${CHANNEL_NAME}`;
const SUBSCRIBE_TIMEOUT_MS = 3000;
const SEND_TIMEOUT_MS = 4000;
const TEMP_CHANNEL_CLEANUP_MS = 1000;

type SoundTestChannel = ReturnType<typeof supabase.channel> & {
  state?: string;
  topic: string;
};

type SoundTestPayload = {
  target: string;
  soundType: NotificationSoundType;
};

interface UseSoundTestListenerOptions {
  panelId: string;
  onTestSignal: (soundType: NotificationSoundType) => void;
  enabled?: boolean;
}

function createSoundTestChannel(): SoundTestChannel {
  return supabase.channel(CHANNEL_NAME, {
    config: {
      broadcast: {
        ack: true,
        self: false,
      },
    },
  }) as SoundTestChannel;
}

function getExistingSoundTestChannel(): SoundTestChannel | null {
  return (supabase.getChannels().find((channel) => channel.topic === CHANNEL_TOPIC) as SoundTestChannel | undefined) ?? null;
}

function getChannelState(channel: SoundTestChannel | null): string {
  return channel?.state ?? 'closed';
}

function isReusableChannel(channel: SoundTestChannel | null): channel is SoundTestChannel {
  const state = getChannelState(channel);
  return Boolean(channel) && state !== 'closed' && state !== 'errored' && state !== 'leaving';
}

async function ensureChannelSubscribed(channel: SoundTestChannel): Promise<void> {
  const state = getChannelState(channel);
  if (state === 'joined' || state === 'joining') return;

  const subscribed = await Promise.race([
    new Promise<boolean>((resolve) => {
      let settled = false;

      channel.subscribe((status, err) => {
        if (settled) return;

        if (status === 'SUBSCRIBED') {
          settled = true;
          resolve(true);
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          settled = true;
          console.warn(`[SoundTest] Subscription failed with status ${status}`, err);
          resolve(false);
        }
      });
    }),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), SUBSCRIBE_TIMEOUT_MS)),
  ]);

  if (!subscribed) {
    throw new Error('Timeout ao conectar canal de broadcast');
  }
}

/**
 * Listens for broadcast test signals sent from the Settings panel.
 * When a signal arrives matching this panel (or 'all'), calls onTestSignal.
 */
export function useSoundTestListener({ panelId, onTestSignal, enabled = true }: UseSoundTestListenerOptions) {
  const callbackRef = useRef(onTestSignal);
  callbackRef.current = onTestSignal;

  useEffect(() => {
    if (!enabled) return;

    const channel = createSoundTestChannel();

    channel
      .on('broadcast', { event: 'test-sound' }, (payload) => {
        const { target, soundType } = (payload.payload ?? {}) as Partial<SoundTestPayload>;

        if (!target || !soundType) return;

        if (target === 'all' || target === panelId) {
          console.log(`[SoundTest] Received test signal for ${panelId}, type: ${soundType}`);
          callbackRef.current(soundType);
        }
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[SoundTest] Listener status for ${panelId}: ${status}`, err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [panelId, enabled]);
}

/**
 * Sends a broadcast test signal to all listening panels.
 */
export async function sendSoundTestSignal(target: string, soundType: NotificationSoundType) {
  const existingChannel = getExistingSoundTestChannel();
  const reusableChannel = isReusableChannel(existingChannel) ? existingChannel : null;

  if (existingChannel && !reusableChannel) {
    await supabase.removeChannel(existingChannel);
  }

  const channel = reusableChannel ?? createSoundTestChannel();
  const createdTemporaryChannel = !reusableChannel;

  try {
    if (createdTemporaryChannel) {
      await ensureChannelSubscribed(channel);
    }

    const response = await channel.send(
      {
        type: 'broadcast',
        event: 'test-sound',
        payload: { target, soundType },
      },
      { timeout: SEND_TIMEOUT_MS },
    );

    if (response !== 'ok') {
      throw new Error(
        response === 'timed out'
          ? 'Timeout ao enviar alerta sonoro'
          : 'Falha ao enviar alerta sonoro',
      );
    }
  } finally {
    if (createdTemporaryChannel) {
      setTimeout(() => {
        void supabase.removeChannel(channel);
      }, TEMP_CHANNEL_CLEANUP_MS);
    }
  }
}
