import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Store, Tablet, ShoppingBag, Volume2, VolumeX, Maximize } from 'lucide-react';
import { usePagerOrders, type PagerOrder } from '@/hooks/use-pager-orders';
import { usePagerAds } from '@/hooks/use-pager-ads';
import { ensureImageUrl } from '@/lib/supabase';
import type { OrderType } from '@/shared/schema';
import logoVm from '@/assets/logo-vibedrinks.gif';

// Continuous alternation: orders panel for a while, then ONE ad, then orders
// again, then the NEXT ad — never ads-only, never stuck in standby.
// Time the orders panel stays on screen between ads.
const PANEL_BREAK_MS = 20_000;
// Time each fullscreen ad stays on screen.
const AD_INTERVAL_MS = 12_000;

const ORIGIN_META: Record<string, { label: string; Icon: typeof Store }> = {
  counter: { label: 'BALCÃO', Icon: Store },
  totem: { label: 'TOTEM', Icon: Tablet },
  pickup: { label: 'RETIRADA', Icon: ShoppingBag },
};

function originMeta(type: OrderType) {
  return ORIGIN_META[type] ?? { label: 'PEDIDO', Icon: ShoppingBag };
}

// ── "Ding dong" doorbell-style chime (Web Audio) ──
let pagerAudioCtx: AudioContext | null = null;

function ensurePagerAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!pagerAudioCtx) {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return null;
    try { pagerAudioCtx = new Ctx(); } catch { return null; }
  }
  if (pagerAudioCtx.state === 'suspended') pagerAudioCtx.resume().catch(() => {});
  return pagerAudioCtx;
}

function playTone(ctx: AudioContext, freq: number, startAt: number, durationSec: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec + 0.05);
}

// Classic "ding-dong": high note then lower note, played twice for attention.
function playDingDong(volume = 0.9) {
  const ctx = ensurePagerAudio();
  if (!ctx || (ctx.state as string) !== 'running') return;
  const t = ctx.currentTime + 0.03;
  playTone(ctx, 659.25, t, 0.55, volume);
  playTone(ctx, 523.25, t + 0.55, 0.9, volume);
  playTone(ctx, 659.25, t + 1.7, 0.55, volume);
  playTone(ctx, 523.25, t + 2.25, 0.9, volume);
}

// Adaptive grid: more orders => more columns => smaller cards, so the whole
// queue always fits on the TV with no scrolling. We never size below a 4-slot
// layout, so a single order looks the same size as when there are four.
function colsCountFor(count: number): number {
  const n = Math.max(count, 4);
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  if (n <= 16) return 4;
  if (n <= 25) return 5;
  return 6;
}

// Fluid sizing: shrink name/number as the grid gets crowded.
function sizingFor(count: number) {
  const n = Math.max(count, 4);
  if (n <= 4) return { name: 'text-[clamp(1.8rem,3.4vw,4rem)]', num: 'text-3xl', pad: 'p-5 gap-3', badge: 'text-[clamp(1.1rem,1.9vw,1.8rem)]', badgeIcon: 'w-6 h-6' };
  if (n <= 9) return { name: 'text-[clamp(1.4rem,2.4vw,2.8rem)]', num: 'text-2xl', pad: 'p-4 gap-2', badge: 'text-[clamp(1rem,1.6vw,1.5rem)]', badgeIcon: 'w-5 h-5' };
  if (n <= 16) return { name: 'text-[clamp(1rem,1.7vw,2rem)]', num: 'text-xl', pad: 'p-3 gap-1.5', badge: 'text-[clamp(0.85rem,1.3vw,1.2rem)]', badgeIcon: 'w-5 h-5' };
  if (n <= 25) return { name: 'text-[clamp(0.85rem,1.3vw,1.5rem)]', num: 'text-lg', pad: 'p-2.5 gap-1', badge: 'text-[clamp(0.75rem,1.1vw,1rem)]', badgeIcon: 'w-4 h-4' };
  return { name: 'text-[clamp(0.7rem,1vw,1.2rem)]', num: 'text-base', pad: 'p-2 gap-0.5', badge: 'text-[clamp(0.65rem,0.9vw,0.9rem)]', badgeIcon: 'w-3.5 h-3.5' };
}

// Number of grid slots used to lay out the queue (min 4 to keep cards compact).
function slotCountFor(count: number): number {
  return Math.max(count, 4);
}

function OrderCard({
  order,
  sizing,
}: {
  order: PagerOrder;
  sizing: ReturnType<typeof sizingFor>;
}) {
  const { label, Icon } = originMeta(order.orderType);
  const ready = order.status === 'ready';
  const preparing = order.status === 'preparing';

  // Three visual stages with SOLID colors (no transparency) and no heavy
  // effects/animations, so the Android TV browser stays smooth at high FPS.
  //  - placed (accepted): amber  -> "pedido realizado"
  //  - preparing:         blue   -> "em preparação"
  //  - ready:             green  -> "pronto"
  const cardClasses = ready
    ? 'bg-green-600 border-green-300 text-white'
    : preparing
      ? 'bg-blue-600 border-blue-300 text-white'
      : 'bg-amber-500 border-amber-200 text-white';

  const badgeClasses = ready
    ? 'bg-white text-green-700'
    : preparing
      ? 'bg-white text-blue-700'
      : 'bg-white text-amber-700';

  const badgeLabel = ready ? 'PRONTO' : preparing ? 'EM PREPARO' : label;

  return (
    <div
      className={[
        'rounded-2xl border-2 flex flex-col justify-center min-h-0 min-w-0 overflow-hidden',
        sizing.pad,
        cardClasses,
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={[
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-black uppercase tracking-wide',
            sizing.badge,
            badgeClasses,
          ].join(' ')}
        >
          <Icon className={sizing.badgeIcon} /> {badgeLabel}
        </span>
        <span className={`${sizing.num} font-black text-white/80`}>#{order.shortNumber}</span>
      </div>
      <p className={`${sizing.name} font-black uppercase leading-none text-white break-words mt-1`}>
        {order.customerName}
      </p>
    </div>
  );
}


export default function Pager() {
  const { data: orders = [] } = usePagerOrders();
  const { data: ads = [] } = usePagerAds(true);
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const knownReadyRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // ── Ad / orders alternation ──
  const [showAds, setShowAds] = useState(false);
  const [adIndex, setAdIndex] = useState(0);

  const ready = useMemo(
    () => orders.filter((o) => o.status === 'ready'),
    [orders],
  );

  // Single adaptive grid: ready orders first (highlighted green), then in-prep.
  const all = useMemo(() => {
    const preparing = orders.filter((o) => o.status === 'accepted' || o.status === 'preparing');
    return [...ready, ...preparing];
  }, [orders, ready]);

  const slots = slotCountFor(all.length);
  const cols = colsCountFor(all.length);
  const rows = Math.max(1, Math.ceil(slots / cols));
  const sizing = sizingFor(all.length);


  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Play "ding dong" whenever a NEW order enters the ready list.
  useEffect(() => {
    const currentReadyIds = ready.map((o) => o.id);
    if (!initializedRef.current) {
      knownReadyRef.current = new Set(currentReadyIds);
      initializedRef.current = true;
      return;
    }
    const hasNew = currentReadyIds.some((id) => !knownReadyRef.current.has(id));
    knownReadyRef.current = new Set(currentReadyIds);
    if (hasNew && soundOn) playDingDong(0.9);
  }, [ready, soundOn]);

  const enableSound = () => {
    ensurePagerAudio();
    playDingDong(0.9);
    setSoundOn(true);
  };

  const enterFullscreen = useCallback(() => {
    const el = document.documentElement as any;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) req.call(el).catch(() => {});
  }, []);

  // Continuous alternation between the orders panel and a single ad:
  //   ORDERS (PANEL_BREAK_MS) -> AD#1 (AD_INTERVAL_MS) -> ORDERS -> AD#2 -> ...
  // This runs on a timer that is INDEPENDENT of order changes, so the panel
  // always reappears on schedule and the TV never gets stuck in standby.
  // Uses a chained setTimeout (not a fast interval) to stay light on the
  // low-end Android TV browser.
  useEffect(() => {
    if (ads.length === 0) { setShowAds(false); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const showPanel = () => {
      if (cancelled) return;
      setShowAds(false);
      timer = setTimeout(showAd, PANEL_BREAK_MS);
    };

    const showAd = () => {
      if (cancelled) return;
      setAdIndex((i) => (i + 1) % ads.length);
      setShowAds(true);
      timer = setTimeout(showPanel, AD_INTERVAL_MS);
    };

    // Always start on the orders panel.
    showPanel();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ads.length]);


  const clock = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="h-[100dvh] w-screen bg-background text-foreground flex flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 px-6 py-3 flex-shrink-0 bg-gradient-to-r from-[#5B21B6] to-[#7C3AED] text-white shadow-lg">
        <div className="flex items-center gap-4 min-w-0">
          <img
            src={logoVm}
            alt="Vibe Drinks"
            width={64}
            height={64}
            className="h-14 w-14 object-contain drop-shadow"
          />
          <div className="leading-tight min-w-0">
            <h1 className="text-3xl xl:text-4xl font-black uppercase tracking-tight truncate">
              VIBE DRINKS
            </h1>
            <p className="text-base font-semibold uppercase text-white/80 tracking-wide">
              Painel de Retirada no Balcão
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-3xl font-black tabular-nums hidden md:block">{clock}</span>
          <button
            onClick={soundOn ? () => setSoundOn(false) : enableSound}
            className={[
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-bold uppercase transition-colors',
              soundOn
                ? 'bg-white/15 text-white'
                : 'bg-white text-[#5B21B6] animate-pulse',
            ].join(' ')}
          >
            {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            {soundOn ? 'Som ativo' : 'Ativar som'}
          </button>
          <button
            onClick={enterFullscreen}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-bold uppercase bg-white/15 text-white transition-colors hover:bg-white/25"
            title="Modo tela cheia (kiosk)"
          >
            <Maximize className="w-5 h-5" />
            <span className="hidden lg:inline">Tela cheia</span>
          </button>
        </div>
      </header>

      {/* Fullscreen advertising carousel (idle takeover). Only the active image
          is mounted (plus a hidden preload of the next one) and we animate
          opacity only — no transforms — to stay smooth on low-FPS Smart TVs. */}
      <div
        className={[
          'fixed inset-0 z-50 bg-black transition-opacity duration-700',
          showAds && ads.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        {showAds && ads[adIndex] && (
          <img
            key={ads[adIndex].id}
            src={ensureImageUrl(ads[adIndex].imageUrl)}
            alt={ads[adIndex].title ?? 'Propaganda'}
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover animate-fade-in"
            style={{ willChange: 'opacity' }}
          />
        )}
        {/* Preload the next ad off-screen so the swap is instant. */}
        {showAds && ads.length > 1 && (
          <img
            src={ensureImageUrl(ads[(adIndex + 1) % ads.length].imageUrl)}
            alt=""
            aria-hidden="true"
            decoding="async"
            className="absolute h-px w-px opacity-0 pointer-events-none"
          />
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-4">
        {all.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <p className="text-3xl text-muted-foreground/60 text-center">
              Aguardando pedidos
            </p>
          </div>
        ) : (
          <div
            className="grid gap-3 flex-1 min-h-0 w-full overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {all.map((o) => (
              <OrderCard key={o.id} order={o} sizing={sizing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
