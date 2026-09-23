import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Category } from '@/shared/schema';
import { getCategoryIcon } from '@/lib/category-icons';

interface CompactCategoryCarouselProps {
  categories: (Category & { salesCount?: number })[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  showTrending?: boolean;
}

export function CompactCategoryCarousel({ 
  categories, 
  selectedCategory, 
  onSelectCategory, 
}: CompactCategoryCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    // Mouse wheel (vertical) scrolls the row sideways on desktop
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, [updateScrollState, categories.length]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  
  const activeCategories = [...categories]
    .filter(c => c.isActive)
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));

  if (activeCategories.length === 0) return null;

  const CategorySquare = ({ 
    isSelected, 
    onClick, 
    iconId, 
    label,
    testId
  }: { 
    isSelected: boolean; 
    onClick: () => void; 
    iconId: string | null | undefined; 
    label: string;
    testId: string;
  }) => {
    const IconComponent = getCategoryIcon(iconId);
    return (
      <button
        onClick={onClick}
        title={label}
        className={`relative flex flex-col items-center justify-center gap-1 min-w-[72px] w-[72px] h-[72px] rounded-2xl transition-colors duration-200 flex-shrink-0 overflow-hidden ${
          isSelected
            ? 'bg-primary text-primary-foreground shadow-md border border-primary/50'
            : 'bg-card border border-primary/20 text-foreground shadow-sm'
        }`}
        data-testid={testId}
      >
        <IconComponent className={`h-6 w-6 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
        <span className={`text-[9px] font-bold leading-[1.15] text-center w-full px-0.5 line-clamp-2 break-words uppercase ${
          isSelected ? 'text-white' : 'text-foreground/90'
        }`}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <div className="relative px-3" data-testid="compact-category-carousel">
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-2.5 overflow-x-auto scrollbar-hide py-2 overscroll-x-contain"
        data-testid="carousel-categories-compact"
      >
        {activeCategories.map((category) => (
          <CategorySquare
            key={category.id}
            isSelected={selectedCategory === category.id}
            onClick={() => onSelectCategory(category.id)}
            iconId={category.iconUrl}
            label={category.name}
            testId={`button-category-${category.id}`}
          />
        ))}
      </div>
      {canScroll.left && (
        <button
          onClick={() => scrollByPage(-1)}
          aria-label="Ver categorias anteriores"
          className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          data-testid="button-categories-prev"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canScroll.right && (
        <button
          onClick={() => scrollByPage(1)}
          aria-label="Ver mais categorias"
          className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          data-testid="button-categories-next"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
