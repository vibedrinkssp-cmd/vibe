import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { SmartImage } from '@/components/SmartImage';
import { W_CARD } from '@/lib/image-url';
import { Hand } from 'lucide-react';

interface FeatureBanner {
  id: string;
  title: string;
  onClick: () => void;
}

interface FeatureBannerCarouselProps {
  onComboOpen: () => void;
  onSpecialDrinksOpen?: () => void;
}

const DEFAULT_IMAGES: Record<string, string> = {
  'special-drinks': 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=200&fit=crop&q=60',
  'combo': 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=200&fit=crop&q=60',
};

export function FeatureBannerCarousel({
  onComboOpen,
  onSpecialDrinksOpen
}: FeatureBannerCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: customImages = {}, isLoading: imagesLoading } = useQuery({
    queryKey: ['feature-banner-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banners')
        .select('title, image_url')
        .eq('is_active', true);
      
      if (error) return {};
      
      return (data || []).reduce((acc, item) => {
        acc[item.title] = item.image_url;
        return acc;
      }, {} as Record<string, string>);
    },
    staleTime: 1000 * 60 * 5,
  });

  const getImagePath = (bannerId: string): string => {
    return customImages[bannerId] || DEFAULT_IMAGES[bannerId] || '';
  };

  const scrollToNext = useCallback(() => {
    if (!scrollRef.current || isUserInteracting) return;
    
    const container = scrollRef.current;
    if (container.scrollWidth <= container.clientWidth + 10) return;
    
    const cardWidth = 160 + 12;
    const maxScroll = container.scrollWidth - container.clientWidth;
    
    if (container.scrollLeft >= maxScroll - 10) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      container.scrollBy({ left: cardWidth, behavior: 'smooth' });
    }
  }, [isUserInteracting]);

  // Initial "peek" nudge to hint scrollability
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth + 10) return;
    const t = setTimeout(() => {
      container.scrollTo({ left: 40, behavior: 'smooth' });
      setTimeout(() => container.scrollTo({ left: 0, behavior: 'smooth' }), 400);
    }, 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const interval = setInterval(scrollToNext, 4000);
    return () => clearInterval(interval);
  }, [scrollToNext]);

  const handleInteractionStart = () => {
    setIsUserInteracting(true);
    if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
  };

  const handleInteractionEnd = () => {
    interactionTimeoutRef.current = setTimeout(() => {
      setIsUserInteracting(false);
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    };
  }, []);

  const features: FeatureBanner[] = [
    { id: 'special-drinks', title: 'Drinks Especiais', onClick: () => onSpecialDrinksOpen?.() },
    { id: 'combo', title: 'Monte Seu Combo', onClick: onComboOpen },
  ];

  if (imagesLoading) {
    return (
      <div className="relative px-3" data-testid="feature-banner-carousel">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide md:justify-center">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[200px] h-[120px] rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-3" data-testid="feature-banner-carousel">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory md:justify-center"
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
        onMouseDown={handleInteractionStart}
        onMouseUp={handleInteractionEnd}
        onMouseLeave={handleInteractionEnd}
      >
        {features.map((feature) => {
          const imagePath = getImagePath(feature.id);
          if (!imagePath) return null;

          return (
            <button
              key={feature.id}
              onClick={feature.onClick}
              aria-label={feature.title}
              className="group flex-shrink-0 w-[200px] relative snap-start active:scale-95 transition-transform duration-150 bg-transparent p-0 border-0 rounded-2xl ring-1 ring-primary/30 active:ring-2 active:ring-primary"
              data-testid={`feature-banner-${feature.id}`}
              type="button"
            >
              <SmartImage
                path={imagePath}
                widths={W_CARD}
                sizes="200px"
                resize="contain"
                alt=""
                aria-hidden="true"
                className="w-full h-auto block rounded-2xl"
              />
              {/* "Toque para pedir" affordance badge */}
              <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/95 text-primary-foreground text-[10px] font-extrabold uppercase tracking-wide shadow-lg backdrop-blur-sm whitespace-nowrap">
                <Hand className="h-3 w-3" />
                TOQUE PARA PEDIR
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
