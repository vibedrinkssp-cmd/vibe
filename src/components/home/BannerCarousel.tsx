import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Banner } from '@/shared/schema';
import { SmartImage } from '@/components/SmartImage';
import { W_BANNER } from '@/lib/image-url';

interface BannerCarouselProps {
  banners: Banner[];
}

export function BannerCarousel({ banners }: BannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const activeBanners = banners.filter(b => b.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Clamp index if banners change
  useEffect(() => {
    if (activeBanners.length > 0 && currentIndex >= activeBanners.length) {
      setCurrentIndex(0);
    }
  }, [activeBanners.length, currentIndex]);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % activeBanners.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [activeBanners.length]);

  // Initial peek: briefly show next banner and snap back
  const [peekOffset, setPeekOffset] = useState(0);
  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const t1 = setTimeout(() => setPeekOffset(12), 600);
    const t2 = setTimeout(() => setPeekOffset(0), 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const goToPrev = () => {
    setCurrentIndex(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const goToNext = () => {
    setCurrentIndex(prev => (prev + 1) % activeBanners.length);
  };

  return (
    <section className="py-8 px-4" data-testid="section-banners">
      <div className="max-w-7xl mx-auto">
        <div className="relative rounded-2xl overflow-hidden">
          <div 
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(calc(-${currentIndex * 100}% - ${peekOffset}px))` }}
          >
            {activeBanners.map((banner, idx) => (
              <div
                key={banner.id}
                className="min-w-full relative aspect-[4/1]"
                data-testid={`banner-${banner.id}`}
              >
                <SmartImage
                  path={banner.imageUrl}
                  widths={W_BANNER}
                  sizes="100vw"
                  priority={idx === 0}
                  resize="contain"
                  alt={banner.title}
                  className="w-full h-full object-contain rounded-2xl"
                  fallbackSrc="https://placehold.co/1200x300?text=Erro+no+Banner"
                />
              </div>
            ))}
          </div>
        </div>

        {activeBanners.length > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={goToPrev}
              data-testid="button-banner-prev"
              aria-label="Banner anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-2">
              {activeBanners.map((_, index) => (
                <button
                  key={index}
                  className={`h-2.5 rounded-full transition-all ${
                    index === currentIndex ? 'w-6 bg-primary' : 'w-2.5 bg-muted-foreground/30'
                  }`}
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`Ir para banner ${index + 1}`}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={goToNext}
              data-testid="button-banner-next"
              aria-label="Próximo banner"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
