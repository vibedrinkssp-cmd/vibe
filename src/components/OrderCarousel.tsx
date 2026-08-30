import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export interface OrderCarouselItem {
  id: string;
  /** Short label shown on the top indicator, e.g. "#AB12CD · JOÃO" */
  label: string;
  node: ReactNode;
}

interface OrderCarouselProps {
  title: string;
  icon?: ReactNode;
  accentColor: string; // hex for dots/badges
  items: OrderCarouselItem[];
  emptyLabel: string;
}

/**
 * Carrossel de pedidos página-a-página para smartphones (Cozinha/Logística).
 * - 1 pedido por página, com scroll-snap horizontal (swipe nativo).
 * - Setas ‹ › para ir para frente/trás.
 * - Dots embaixo para pular direto para um pedido.
 * - Indicador no topo com o título do pedido atual e posição (X / N).
 */
export function OrderCarousel({ title, icon, accentColor, items, emptyLabel }: OrderCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const count = items.length;

  // Mantém o índice válido quando a lista muda (pedido concluído, etc.)
  useEffect(() => {
    if (active > count - 1) setActive(Math.max(0, count - 1));
  }, [count, active]);

  const scrollToIndex = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(index, count - 1));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
    setActive(clamped);
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== active) setActive(index);
  };

  const current = items[Math.min(active, count - 1)];

  return (
    <div className="w-full min-w-0 max-w-full rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      {/* Cabeçalho da coluna + indicador do pedido atual */}
      <div
        className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-border/60"
        style={{ background: `${accentColor}1a` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <h2 className="text-sm font-bold text-foreground shrink-0">{title}</h2>
          <Badge
            className="text-[10px] border-0 shrink-0"
            style={{ background: `${accentColor}33`, color: accentColor }}
          >
            {count}
          </Badge>
        </div>
        {count > 0 && (
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[11px] font-semibold text-foreground truncate max-w-[140px]">
              {current?.label}
            </span>
            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
              {Math.min(active + 1, count)}/{count}
            </span>
          </div>
        )}
      </div>

      {count === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="relative">
          {/* Setas de navegação */}
          {count > 1 && (
            <>
              <button
                type="button"
                aria-label="Pedido anterior"
                onClick={() => scrollToIndex(active - 1)}
                disabled={active <= 0}
                className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-background/85 border border-border shadow flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-5 w-5 text-foreground" />
              </button>
              <button
                type="button"
                aria-label="Próximo pedido"
                onClick={() => scrollToIndex(active + 1)}
                disabled={active >= count - 1}
                className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-background/85 border border-border shadow flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronRight className="h-5 w-5 text-foreground" />
              </button>
            </>
          )}

          {/* Track scroll-snap */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className="w-full min-w-full max-w-full shrink-0 grow-0 basis-full snap-center p-3 overflow-x-hidden"
              >
                <div className="min-w-0 max-w-full">{item.node}</div>
              </div>
            ))}
          </div>

          {/* Dots */}
          {count > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 pb-3 pt-1">
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Ir para pedido ${i + 1}`}
                  onClick={() => scrollToIndex(i)}
                  className="h-2.5 rounded-full transition-all"
                  style={{
                    width: i === active ? 22 : 10,
                    background: i === active ? accentColor : 'hsl(var(--muted-foreground) / 0.35)',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Card vazio reutilizável (mantido para compat, não usado quando há OrderCarousel). */
export function EmptyOrdersCard({ label }: { label: string }) {
  return (
    <Card className="border-primary/20">
      <CardContent className="py-8 text-center text-muted-foreground">{label}</CardContent>
    </Card>
  );
}
