import { useRef } from 'react';
import { Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';

interface SpecialDrinkType {
  id: string;
  label: string;
  image: string;
  gradient: string;
}

const DEFAULT_IMAGES: Record<string, string> = {
  batida: '/assets/drinks/batida.webp',
  caipirinha: '/assets/drinks/caipirinha.webp',
  'caipi-ice': '/assets/drinks/caipi-ice.webp',
  dose: '/assets/drinks/dose.webp',
  'drink-43': '/assets/drinks/drink-43.webp',
  copao: '/assets/drinks/copao.webp',
};

interface SpecialDrinksCarouselProps {
  onSelectType?: (typeId: string) => void;
}

export function SpecialDrinksCarousel({ onSelectType }: SpecialDrinksCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: drinkTypes = [] } = useQuery({
    queryKey: ['special-drink-configs-carousel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('special_drink_configs')
        .select('slug, label, image_url, gradient, is_enabled, sort_order')
        .eq('is_enabled', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []).map((d) => ({
        id: d.slug,
        label: d.label,
        image: d.image_url && d.image_url.startsWith('http')
          ? d.image_url
          : (d.image_url || DEFAULT_IMAGES[d.slug] || '/assets/drinks/batida.webp'),
        gradient: d.gradient || 'from-purple-500 to-violet-600',
      })) as SpecialDrinkType[];
    },
    staleTime: 1000 * 60 * 5,
  });

  if (drinkTypes.length === 0) return null;

  return (
    <div className="px-3" data-testid="special-drinks-carousel">
      <div className="flex items-center gap-2 mb-2 px-1 justify-center">
        <Flame className="h-4 w-4 text-orange-500" />
        <span className="text-xs font-bold text-foreground/80 uppercase tracking-wider">
          Monte seu Drink
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory md:justify-center"
      >
        {drinkTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => onSelectType?.(type.id)}
            className="relative flex-shrink-0 snap-start group flex flex-col items-center gap-1"
            data-testid={`special-drink-${type.id}`}
          >
            <div className="relative">
              <div className="w-[68px] h-[68px] rounded-2xl overflow-hidden shadow-lg border-2 border-primary/40 ring-1 ring-primary/30 transition-transform duration-200 active:scale-95 group-hover:scale-105 group-hover:shadow-xl relative brightness-110">
                <img
                  src={type.image}
                  alt={type.label}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_IMAGES[type.id] || '/assets/drinks/batida.webp';
                  }}
                />
              </div>
              {/* Fire indicator */}
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shadow-md">
                <Flame className="h-3 w-3 text-white" />
              </div>
            </div>
            <span className="pointer-events-none px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[8px] font-extrabold uppercase tracking-wide shadow">
              Toque
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
