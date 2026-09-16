/**
 * Notification Sound Engine v5 — Resilient, Auto-Unlock, No Modal
 *
 * Princípios:
 *  - SEM modal de ativação obrigatório.
 *  - Auto-unlock invisível no PRIMEIRO gesto do usuário (qualquer click/touch/key).
 *  - DOIS caminhos de áudio em paralelo: Web Audio (sintetizado iFood-style) +
 *    HTMLAudioElement (MP3 em /assets/new-notification-026-380249_1765220299583.mp3).
 *    Se um falhar, o outro segue.
 *  - Loops INDEPENDENTES por tela (kitchen, logistics, motoboy, pdv, customer, generic).
 *    Parar uma tela NÃO afeta as outras.
 *  - SEM auto-stop — toca enquanto houver pedido pendente, até o operador parar.
 *  - Dedupe: ignora o mesmo orderId disparado em janela de 5s.
 *  - Recovery: ao voltar a aba (visibilitychange), tenta resume() do contexto.
 */

// ── Types ────────────────────────────────────────────────────
export type ScreenSoundId =
  | 'admin'
  | 'kitchen'
  | 'logistics'
  | 'motoboy'
  | 'pdv'
  | 'customer'
  | 'generic';

export type NotificationSoundType =
  | ScreenSoundId
  | 'ifood'
  | 'delivery'
  | 'cancelled'
  | 'status_update'
  | 'arrived';

type SoundStateListener = (enabled: boolean) => void;
type LoopStateListener = (anyActive: boolean) => void;

// ── State ────────────────────────────────────────────────────
const UNLOCK_STORAGE_KEY = 'vm_sound_unlocked_v2';
const LOOP_INTERVAL_MS = 1700;
const DEDUPE_WINDOW_MS = 5000;
const MP3_SRC = '/assets/new-notification-026-380249_1765220299583.mp3';

let audioCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
let unlocked = false;
let unlockListenersAdded = false;
let lastPdvCashAt = 0;

interface ScreenLoop {
  timer: ReturnType<typeof setInterval> | null;
  active: boolean;
  volume: number;
}
const loops = new Map<ScreenSoundId, ScreenLoop>();

const recentOrders = new Map<string, number>();

const stateListeners = new Set<SoundStateListener>();
const loopListeners = new Set<LoopStateListener>();

// ── Helpers ──────────────────────────────────────────────────
function emitState() {
  stateListeners.forEach((fn) => { try { fn(unlocked); } catch {} });
}
function anyLoopActive(): boolean {
  for (const l of loops.values()) if (l.active) return true;
  return false;
}
function emitLoop() {
  const any = anyLoopActive();
  loopListeners.forEach((fn) => { try { fn(any); } catch {} });
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return null;
    try { audioCtx = new Ctx(); } catch { return null; }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function ensureHtmlAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!htmlAudio) {
    try {
      htmlAudio = new Audio(MP3_SRC);
      htmlAudio.preload = 'auto';
      htmlAudio.crossOrigin = 'anonymous';
    } catch {
      return null;
    }
  }
  return htmlAudio;
}

function markUnlocked() {
  if (unlocked) return;
  unlocked = true;
  try { localStorage.setItem(UNLOCK_STORAGE_KEY, '1'); } catch {}
  console.log('[SoundEngine] Audio unlocked ✓');
  emitState();
}

// ── iFood-style synthesized pattern ──────────────────────────
type Beep = { freq: number; durationSec: number; delaySec: number; wave?: OscillatorType; gain?: number };

const IFOOD_PATTERN: Beep[] = [
  { freq: 880,  durationSec: 0.18, delaySec: 0.00, wave: 'square',   gain: 0.45 },
  { freq: 1320, durationSec: 0.18, delaySec: 0.22, wave: 'square',   gain: 0.45 },
  { freq: 880,  durationSec: 0.18, delaySec: 0.44, wave: 'square',   gain: 0.45 },
  { freq: 1320, durationSec: 0.28, delaySec: 0.66, wave: 'triangle', gain: 0.50 },
];

function playBeep(ctx: AudioContext, beep: Beep, startAt: number, masterVolume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = beep.wave ?? 'sine';
  osc.frequency.setValueAtTime(beep.freq, startAt);
  const peak = Math.max(0.001, Math.min(1, (beep.gain ?? 0.4) * masterVolume));
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + beep.durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + beep.durationSec + 0.02);
}

function playWebAudioOnce(volume: number): boolean {
  const ctx = ensureContext();
  if (!ctx) return false;
  if ((ctx.state as string) !== 'running') {
    ctx.resume().catch(() => {});
    if ((ctx.state as string) !== 'running') return false;
  }
  try {
    const now = ctx.currentTime + 0.02;
    for (const b of IFOOD_PATTERN) playBeep(ctx, b, now + b.delaySec, volume);
    markUnlocked();
    return true;
  } catch (e) {
    console.warn('[SoundEngine] WebAudio play failed', e);
    return false;
  }
}

function playHtmlAudioOnce(volume: number): boolean {
  const a = ensureHtmlAudio();
  if (!a) return false;
  try {
    a.volume = Math.max(0, Math.min(1, volume));
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => markUnlocked()).catch(() => {});
    } else {
      markUnlocked();
    }
    return true;
  } catch {
    return false;
  }
}

function playOnceDual(volume: number): boolean {
  const wa = playWebAudioOnce(volume);
  const ha = playHtmlAudioOnce(volume);
  return wa || ha;
}

// ── Per-screen loop control ──────────────────────────────────
function getLoop(screen: ScreenSoundId): ScreenLoop {
  let l = loops.get(screen);
  if (!l) {
    l = { timer: null, active: false, volume: 0.85 };
    loops.set(screen, l);
  }
  return l;
}

function startLoop(screen: ScreenSoundId, volume: number) {
  const l = getLoop(screen);
  l.volume = volume;
  if (l.active) return;
  l.active = true;
  playOnceDual(volume);
  l.timer = setInterval(() => {
    if (!l.active) return;
    playOnceDual(l.volume);
  }, LOOP_INTERVAL_MS);
  emitLoop();
}

function stopLoop(screen: ScreenSoundId) {
  const l = loops.get(screen);
  if (!l) return;
  if (l.timer) { clearInterval(l.timer); l.timer = null; }
  l.active = false;
  emitLoop();
}

function stopAllLoops() {
  for (const screen of loops.keys()) stopLoop(screen);
}

// ── Dedupe ───────────────────────────────────────────────────
// IMPORTANTE: dedupe só evita disparar o MESMO orderId várias vezes em
// rajada (5s). Ele NÃO impede que um pedido ainda pendente volte a entrar
// na fila quando o reconciliador detecta que foi perdido — para isso, o
// chamador (useOrderAlert) cuida de manter o conjunto de pedidos pendentes.
export function shouldAlertOrder(orderId: string, scope: ScreenSoundId = 'generic'): boolean {
  if (!orderId) return true;
  const now = Date.now();
  const key = `${scope}:${orderId}`;
  const last = recentOrders.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  recentOrders.set(key, now);
  // Cleanup
  if (recentOrders.size > 200) {
    for (const [k, t] of recentOrders) {
      if (now - t > DEDUPE_WINDOW_MS * 4) recentOrders.delete(k);
    }
  }
  return true;
}

/**
 * Garante que o loop de uma tela esteja tocando se houver pedidos pendentes.
 * Diferente de shouldAlertOrder, NÃO aplica dedupe — é seguro para chamar
 * em polling de reconciliação.
 */
export function ensureScreenAlertActive(screen: ScreenSoundId = 'generic', volume = 0.85): boolean {
  const l = loops.get(screen);
  if (l?.active) return false; // já tocando
  startLoop(screen, volume);
  return true;
}

// ── Public API ───────────────────────────────────────────────
export function isNotificationSoundReady(): boolean { return unlocked; }
export function isAlertLoopActive(): boolean { return anyLoopActive(); }
export function isScreenAlertActive(screen: ScreenSoundId = 'generic'): boolean {
  return !!loops.get(screen)?.active;
}

export function subscribeToNotificationSoundState(listener: SoundStateListener) {
  stateListeners.add(listener);
  listener(unlocked);
  return () => { stateListeners.delete(listener); };
}

export function subscribeToAlertLoopState(listener: LoopStateListener) {
  loopListeners.add(listener);
  listener(anyLoopActive());
  return () => { loopListeners.delete(listener); };
}

export function playAlertOnce(volume = 0.85): boolean {
  return playOnceDual(volume);
}

export function startAlertLoop(volume = 0.85) {
  startLoop('generic', volume);
}

export function stopAlertLoop() {
  stopLoop('generic');
}

export function startScreenAlert(screen: ScreenSoundId = 'generic', volume = 0.85, _intervalMs?: number) {
  if (screen === 'pdv') {
    const now = Date.now();
    if (now - lastPdvCashAt > 900) {
      lastPdvCashAt = now;
      import('@/lib/cash-register-sound')
        .then(({ playCashRegisterSound }) => playCashRegisterSound(volume))
        .catch(() => playOnceDual(volume));
    }
    return;
  }
  startLoop(screen, volume);
}

export function stopScreenAlert(screen: ScreenSoundId = 'generic') {
  stopLoop(screen);
}

export function stopAllAlerts() {
  stopAllLoops();
}

export function playScreenSound(_screen?: ScreenSoundId, volume = 0.85) {
  if (_screen === 'pdv') {
    import('@/lib/cash-register-sound')
      .then(({ playCashRegisterSound }) => playCashRegisterSound(volume))
      .catch(() => playOnceDual(volume));
    return true;
  }
  return playOnceDual(volume);
}

export function primeAudio() {
  // Web Audio prime
  const ctx = ensureContext();
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    } catch {}
    if ((ctx.state as string) === 'running') markUnlocked();
  }
  // HTML5 prime — toca silenciosamente para destravar
  const a = ensureHtmlAudio();
  if (a) {
    try {
      const prevVol = a.volume;
      a.volume = 0.0001;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          try { a.pause(); a.currentTime = 0; a.volume = prevVol; } catch {}
          markUnlocked();
        }).catch(() => { try { a.volume = prevVol; } catch {} });
      } else {
        try { a.pause(); a.currentTime = 0; a.volume = prevVol; } catch {}
      }
    } catch {}
  }
}

export async function enableNotificationSound(opts: { volume?: number } = {}): Promise<boolean> {
  const { volume = 0.7 } = opts;
  primeAudio();
  await new Promise((r) => setTimeout(r, 30));
  const ok = playOnceDual(volume);
  emitState();
  return ok || unlocked;
}

export function ensureNotificationSoundUnlockListeners() {
  if (unlockListenersAdded || typeof window === 'undefined') return;
  unlockListenersAdded = true;

  const unlock = () => {
    primeAudio();
    if (unlocked) {
      // Once unlocked, no need to keep listening — but harmless to keep.
      removeListeners();
    }
  };

  const events: (keyof WindowEventMap)[] = [
    'pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'keydown', 'mousedown',
  ];
  const removeListeners = () => {
    events.forEach((evt) => {
      window.removeEventListener(evt, unlock as EventListener, { capture: true } as any);
      document.removeEventListener(evt, unlock as EventListener, { capture: true } as any);
    });
  };
  events.forEach((evt) => {
    window.addEventListener(evt, unlock, { capture: true, passive: true });
    document.addEventListener(evt, unlock as EventListener, { capture: true, passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      ensureContext()?.resume().catch(() => {});
    }
  });

  // Try once immediately (can succeed if user already gestured before this ran)
  setTimeout(unlock, 50);
}

// ── Backward-compat shims ────────────────────────────────────
export async function playNotificationSound(volume = 0.85, _soundType: NotificationSoundType = 'generic') {
  return playOnceDual(volume);
}
export function startNotificationLoop(volume = 0.85, _intervalMs?: number, _soundType?: NotificationSoundType) {
  startLoop('generic', volume);
}
export function stopNotificationSound(_soundType?: NotificationSoundType) {
  stopAllLoops();
}
export function primeNotificationSound() { primeAudio(); }
export function getNotificationFallbackDuration() { return 800; }
export function getPatternDuration(_soundType?: NotificationSoundType) {
  return Math.ceil(IFOOD_PATTERN.reduce((m, b) => Math.max(m, b.delaySec + b.durationSec), 0) * 1000);
}
export function playSoundPattern(_soundType: NotificationSoundType, volume: number) {
  return playOnceDual(volume);
}

// Local agent removed entirely.

// ── Test helper ──────────────────────────────────────────────
export function __resetNotificationSoundEngineForTests() {
  stopAllLoops();
  loops.clear();
  recentOrders.clear();
  unlocked = false;
  unlockListenersAdded = false;
  if (audioCtx) { try { void audioCtx.close(); } catch {} audioCtx = null; }
  if (htmlAudio) { try { htmlAudio.pause(); } catch {} htmlAudio = null; }
  stateListeners.clear();
  loopListeners.clear();
  try { localStorage.removeItem(UNLOCK_STORAGE_KEY); } catch {}
}
