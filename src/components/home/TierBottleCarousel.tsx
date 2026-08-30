import { useMemo, useState, useEffect } from 'react';
import { Check, Plus, Minus, Wine, X } from 'lucide-react';

/** Strip volume info (1L, 750ML, 700ML etc.) from bottle names for customer-facing display */
function stripVolume(name: string): string {
  return name
    .replace(/\s*\d+\s*(ML|L)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface AvailableBottleWithTier {
  bottle_id: string;
  product_id: string;
  product_name: string;
  dose_price: number;
  tier?: string | null;
  image_url?: string | null;
}

export interface SelectedBottleEntry {
  bottle: AvailableBottleWithTier;
  doses: number;
}

const TIER_CONFIG = {
  essencial: {
    label: 'Essencial',
    stars: 1,
    badgeBg: 'bg-amber-500',
    badgeBgInactive: 'bg-amber-100',
    textInactive: 'text-amber-700',
    ringColor: 'ring-amber-400',
    dotActive: 'bg-amber-400',
    checkBg: 'bg-amber-500',
  },
  premium: {
    label: 'Premium',
    stars: 2,
    badgeBg: 'bg-cyan-500',
    badgeBgInactive: 'bg-cyan-100',
    textInactive: 'text-cyan-700',
    ringColor: 'ring-cyan-400',
    dotActive: 'bg-cyan-400',
    checkBg: 'bg-cyan-500',
  },
  luxo: {
    label: 'Luxo',
    stars: 3,
    badgeBg: 'bg-fuchsia-500',
    badgeBgInactive: 'bg-fuchsia-100',
    textInactive: 'text-fuchsia-700',
    ringColor: 'ring-fuchsia-400',
    dotActive: 'bg-fuchsia-400',
    checkBg: 'bg-fuchsia-500',
  },
} as const;

type TierKey = keyof typeof TIER_CONFIG;

interface TierBottleCarouselProps {
  bottles: AvailableBottleWithTier[];
  selectedBottles: SelectedBottleEntry[];
  onToggle: (bottle: AvailableBottleWithTier) => void;
  onUpdateDoses: (bottleId: string, delta: number) => void;
  emptyMessage?: string;
  subtitle?: string;
  compact?: boolean;
}

export function TierBottleCarousel({
  bottles,
  selectedBottles,
  onToggle,
  onUpdateDoses,
  emptyMessage = 'Nenhum destilado disponível',
}: TierBottleCarouselProps) {
  const tierMap = useMemo(() => {
    const e: AvailableBottleWithTier[] = [];
    const p: AvailableBottleWithTier[] = [];
    const l: AvailableBottleWithTier[] = [];
    for (const b of bottles) {
      if (b.tier === 'premium') p.push(b);
      else if (b.tier === 'luxo') l.push(b);
      else e.push(b);
    }
    return { essencial: e, premium: p, luxo: l };
  }, [bottles]);

  const availableTiers = useMemo(() => {
    const t: TierKey[] = [];
    if (tierMap.essencial.length > 0) t.push('essencial');
    if (tierMap.premium.length > 0) t.push('premium');
    if (tierMap.luxo.length > 0) t.push('luxo');
    return t;
  }, [tierMap]);

  const [activeTier, setActiveTier] = useState<TierKey>('essencial');

  useEffect(() => {
    if (availableTiers.length > 0 && !availableTiers.includes(activeTier)) {
      setActiveTier(availableTiers[0]);
    }
  }, [availableTiers, activeTier]);

  const currentBottles = tierMap[activeTier] || [];
  const config = TIER_CONFIG[activeTier];

  const countByTier = (tier: TierKey) => {
    const tierBottles = tierMap[tier];
    return selectedBottles.filter(sb => tierBottles.some(b => b.bottle_id === sb.bottle.bottle_id)).length;
  };

  if (bottles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Wine className="h-14 w-14 text-muted-foreground/20 mb-4" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Tier tab bar ── */}
      <div className="flex items-center justify-center gap-2 px-4 mb-2">
        {availableTiers.map((tier) => {
          const tc = TIER_CONFIG[tier];
          const isActive = activeTier === tier;
          const count = countByTier(tier);
          return (
            <button
              key={tier}
              onClick={() => setActiveTier(tier)}
              className="relative flex-1 max-w-[120px]"
            >
              <div
                className={`flex items-center justify-center gap-1 py-2 px-3 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                  isActive
                    ? `${tc.badgeBg} text-white`
                    : `${tc.badgeBgInactive} ${tc.textInactive}`
                }`}
              >
                {Array.from({ length: tc.stars }).map((_, i) => (
                  <span key={i} className="text-[8px] leading-none">★</span>
                ))}
                <span className="ml-0.5">{tc.label}</span>
              </div>
              {count > 0 && (
                <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full ${tc.checkBg} flex items-center justify-center`}>
                  <span className="text-[9px] font-bold text-white">{count}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── List of bottles ── */}
      <div className="flex flex-col gap-1.5 px-4 py-1 overflow-y-auto" style={{ maxHeight: '50vh' }}>
        {currentBottles.map((bottle) => {
          const sel = selectedBottles.find(sb => sb.bottle.bottle_id === bottle.bottle_id);
          const isSelected = !!sel;

          return (
            <div
              key={bottle.bottle_id}
              className={`flex items-center gap-3 p-2 rounded-xl border-2 transition-colors ${
                isSelected ? `border-purple-500 bg-purple-500/5` : 'border-border'
              }`}
            >
              {/* Small photo */}
              <button
                onClick={() => onToggle(bottle)}
                className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-muted flex items-center justify-center"
              >
                {bottle.image_url ? (
                  <img src={bottle.image_url} alt={bottle.product_name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Wine className="h-5 w-5 text-muted-foreground/30" />
                )}
              </button>

              {/* Name */}
              <button
                onClick={() => onToggle(bottle)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
                  {stripVolume(bottle.product_name)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  R$ {bottle.dose_price.toFixed(2)} /dose
                </p>
              </button>

              {/* Select / Dose stepper */}
              {isSelected && sel ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => sel.doses <= 1 ? onToggle(bottle) : onUpdateDoses(bottle.bottle_id, -1)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center active:scale-90 ${
                      sel.doses <= 1 ? 'bg-destructive/15' : 'bg-muted'
                    }`}
                  >
                    {sel.doses <= 1 ? (
                      <X className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-foreground" />
                    )}
                  </button>
                  <span className="text-sm font-bold text-foreground tabular-nums w-4 text-center">{sel.doses}</span>
                  <button
                    onClick={() => onUpdateDoses(bottle.bottle_id, 1)}
                    className="w-7 h-7 rounded-full bg-muted flex items-center justify-center active:scale-90"
                  >
                    <Plus className="h-3.5 w-3.5 text-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onToggle(bottle)}
                  className={`w-8 h-8 rounded-full border-2 border-border flex items-center justify-center shrink-0`}
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { TIER_CONFIG };
export type { TierKey };
