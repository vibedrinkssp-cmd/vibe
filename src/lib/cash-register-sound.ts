/**
 * Cash Register "Ka-ching!" Sound
 *
 * Synthesized via Web Audio API — no MP3 download needed.
 * Plays a classic cash register sound: mechanical click + bell ring.
 * Used to signal a successful PDV (counter) sale.
 */

let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Prime o AudioContext do caixa no primeiro gesto real do operador. */
export function primeCashRegisterSound(): boolean {
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    return true;
  } catch {
    return false;
  }
}

/**
 * Play a "ka-ching!" cash register sound.
 * Returns true if playback started, false if blocked (autoplay policy).
 */
export async function playCashRegisterSound(volume = 0.6): Promise<boolean> {
  const startedAt = Date.now();
  if (startedAt - lastPlayedAt < 450) return true;
  lastPlayedAt = startedAt;

  const ctx = getCtx();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => { /* noop */ });
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.value = Math.max(0.01, Math.min(1, volume));
    masterGain.connect(ctx.destination);

    // ── 1) Drawer "CLACK" — low mechanical hit, very different from the order alert ──
    const clickBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.075), ctx.sampleRate);
    const clickData = clickBuffer.getChannelData(0);
    for (let i = 0; i < clickData.length; i++) {
      const t = i / clickData.length;
      clickData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 18);
    }
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuffer;
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'lowpass';
    clickFilter.frequency.value = 900;
    const clickGain = ctx.createGain();
    clickGain.gain.value = 0.9;
    clickSrc.connect(clickFilter).connect(clickGain).connect(masterGain);
    clickSrc.start(now);

    const thumpOsc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thumpOsc.type = 'square';
    thumpOsc.frequency.setValueAtTime(96, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(48, now + 0.11);
    thumpGain.gain.setValueAtTime(0.22, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    thumpOsc.connect(thumpGain).connect(masterGain);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.14);

    // ── 2) One bright register bell — not the 880/1320 pattern used by delivery alerts ──
    const playBell = (freq: number, startOffset: number, duration: number, gain: number) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);

      // Sharp attack, long decay (bell-like envelope)
      oscGain.gain.setValueAtTime(0, now + startOffset);
      oscGain.gain.linearRampToValueAtTime(gain, now + startOffset + 0.005);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

      // Subtle harmonic (second oscillator at 2x for brighter bell timbre)
      const harm = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harm.type = 'sine';
      harm.frequency.setValueAtTime(freq * 2, now + startOffset);
      harmGain.gain.setValueAtTime(0, now + startOffset);
      harmGain.gain.linearRampToValueAtTime(gain * 0.35, now + startOffset + 0.005);
      harmGain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration * 0.8);

      osc.connect(oscGain).connect(masterGain);
      harm.connect(harmGain).connect(masterGain);

      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.05);
      harm.start(now + startOffset + 0.005);
      harm.stop(now + startOffset + duration);
    };

    playBell(1975, 0.055, 0.85, 0.48);
    playBell(2489, 0.105, 0.48, 0.24);

    // ── 3) Coin shake tail — short metallic rattle ──
    const coinBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
    const coinData = coinBuffer.getChannelData(0);
    for (let i = 0; i < coinData.length; i++) {
      const t = i / coinData.length;
      coinData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6) * 0.5;
    }
    const coinSrc = ctx.createBufferSource();
    coinSrc.buffer = coinBuffer;
    const coinFilter = ctx.createBiquadFilter();
    coinFilter.type = 'highpass';
    coinFilter.frequency.value = 2500;
    const coinGain = ctx.createGain();
    coinGain.gain.value = 0.25;
    coinSrc.connect(coinFilter).connect(coinGain).connect(masterGain);
    coinSrc.start(now + 0.12);

    return true;
  } catch (err) {
    console.warn('[CashRegisterSound] Play failed:', err);
    return false;
  }
}