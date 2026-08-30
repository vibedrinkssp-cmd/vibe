import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedSupabase = {
  getChannels: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
};

vi.mock('@/integrations/supabase/client-safe', () => ({
  supabase: mockedSupabase,
}));

type SendResult = 'ok' | 'timed out' | 'error';

type MockChannel = {
  topic: string;
  state?: string;
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

function createMockChannel(options: {
  state?: string;
  sendResult?: SendResult;
} = {}): MockChannel {
  const { state = 'joined', sendResult = 'ok' } = options;

  const channel = {
    topic: 'realtime:sound-test-broadcast',
    state,
    on: vi.fn(),
    send: vi.fn().mockResolvedValue(sendResult),
    subscribe: vi.fn(),
  } as MockChannel;

  channel.on.mockReturnValue(channel);
  channel.subscribe.mockImplementation((callback?: (status: string) => void) => {
    channel.state = 'joined';
    callback?.('SUBSCRIBED');
    return channel;
  });

  return channel;
}

describe('sendSoundTestSignal', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mockedSupabase.getChannels.mockReset();
    mockedSupabase.channel.mockReset();
    mockedSupabase.removeChannel.mockReset();
    mockedSupabase.removeChannel.mockResolvedValue('ok');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('reuses an existing listener channel without re-subscribing or removing it', async () => {
    const existingChannel = createMockChannel({ state: 'joined', sendResult: 'ok' });
    mockedSupabase.getChannels.mockReturnValue([existingChannel]);
    mockedSupabase.channel.mockReturnValue(existingChannel);

    const { sendSoundTestSignal } = await import('@/hooks/use-sound-test-listener');

    await sendSoundTestSignal('kitchen', 'kitchen');
    await vi.runAllTimersAsync();

    expect(existingChannel.subscribe).not.toHaveBeenCalled();
    expect(existingChannel.send).toHaveBeenCalledWith(
      {
        type: 'broadcast',
        event: 'test-sound',
        payload: { target: 'kitchen', soundType: 'kitchen' },
      },
      { timeout: 4000 },
    );
    expect(mockedSupabase.removeChannel).not.toHaveBeenCalled();
  });

  it('creates, subscribes and cleans up a temporary channel when needed', async () => {
    const temporaryChannel = createMockChannel({ state: 'closed', sendResult: 'ok' });
    mockedSupabase.getChannels.mockReturnValue([]);
    mockedSupabase.channel.mockReturnValue(temporaryChannel);

    const { sendSoundTestSignal } = await import('@/hooks/use-sound-test-listener');

    await sendSoundTestSignal('motoboy', 'motoboy');
    expect(temporaryChannel.subscribe).toHaveBeenCalledTimes(1);

    await vi.runAllTimersAsync();
    expect(mockedSupabase.removeChannel).toHaveBeenCalledWith(temporaryChannel);
  });

  it('recreates stale channels before sending', async () => {
    const staleChannel = createMockChannel({ state: 'errored', sendResult: 'ok' });
    const freshChannel = createMockChannel({ state: 'closed', sendResult: 'ok' });

    mockedSupabase.getChannels.mockReturnValue([staleChannel]);
    mockedSupabase.channel.mockReturnValue(freshChannel);

    const { sendSoundTestSignal } = await import('@/hooks/use-sound-test-listener');

    await sendSoundTestSignal('log', 'logistics');

    expect(mockedSupabase.removeChannel).toHaveBeenCalledWith(staleChannel);
    expect(freshChannel.subscribe).toHaveBeenCalledTimes(1);
    expect(freshChannel.send).toHaveBeenCalledTimes(1);
  });

  it('throws when realtime send times out and still cleans up the temporary channel', async () => {
    const temporaryChannel = createMockChannel({ state: 'closed', sendResult: 'timed out' });
    mockedSupabase.getChannels.mockReturnValue([]);
    mockedSupabase.channel.mockReturnValue(temporaryChannel);

    const { sendSoundTestSignal } = await import('@/hooks/use-sound-test-listener');

    await expect(sendSoundTestSignal('all', 'generic')).rejects.toThrow('Timeout ao enviar alerta sonoro');

    await vi.runAllTimersAsync();
    expect(mockedSupabase.removeChannel).toHaveBeenCalledWith(temporaryChannel);
  });
});
