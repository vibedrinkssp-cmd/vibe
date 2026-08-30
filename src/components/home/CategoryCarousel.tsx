import { useRef } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Category } from '@/shared/schema';
import { TRENDING_CATEGORY_ID } from '@/pages/Home';
import { getCategoryIcon } from '@/lib/category-icons';

interface CategoryCarouselProps {
  categories: (Category & { salesCount?: number })[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  showTrending?: boolean;
}

export function CategoryCarousel({ categories, selectedCategory, onSelectCategory, showTrending = false }: CategoryCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const activeCategories = [...categories]
    .filter(c => c.isActive)
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const scrollAmount = 200;
    const maxScroll = container.scrollWidth - container.clientWidth;
    
    if (direction === 'right') {
      if (container.scrollLeft >= maxScroll - 10) {
        container.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    } else {
      if (container.scrollLeft <= 10) {
        container.scrollTo({ left: maxScroll, behavior: 'smooth' });
      } else {
        container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      }
    }
  };

  if (activeCategories.length === 0) return null;

  const CategoryButton = ({ 
    isSelected, 
    onClick, 
    iconId, 
    label, 
    variant = 'default',
    testId
  }: { 
    isSelected: boolean; 
    onClick: () => void; 
    iconId: string | null | undefined; 
    label: string;
    variant?: 'default' | 'trending';
    testId: string;
  }) => {
    const IconComponent = getCategoryIcon(iconId);
    const baseColors = variant === 'trending' 
      ? {
          selected: 'from-orange-500/30 to-red-500/20 border-orange-500',
          unselected: 'from-secondary/60 to-secondary/40 border-orange-500/30 hover:border-orange-500/60',
          textColor: isSelected ? 'text-orange-400' : 'text-white/80',
          iconColor: isSelected ? 'text-orange-400' : 'text-orange-400/70',
        }
      : {
          selected: 'from-primary/30 to-amber-500/20 border-primary',
          unselected: 'from-secondary/60 to-secondary/40 border-primary/20 hover:border-primary/50',
          textColor: isSelected ? 'text-primary' : 'text-white/80',
          iconColor: isSelected ? 'text-primary' : 'text-primary/60',
        };

    return (
      <button
        onClick={onClick}
        className={`flex flex-col items-center gap-3 min-w-[110px] p-4 rounded-2xl transition-all duration-200 bg-gradient-to-b border-2 active:scale-95 ${
          isSelected ? baseColors.selected : baseColors.unselected
        }`}
        data-testid={testId}
      >
        <IconComponent className={`h-7 w-7 ${baseColors.iconColor}`} />
        <span className={`text-sm font-medium text-center transition-colors duration-200 ${baseColors.textColor}`}>
          {label.toUpperCase()}
        </span>
      </button>
    );
  };

  return (
    <section className="py-8 px-4" data-testid="section-categories">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary via-amber-400 to-primary bg-clip-text text-transparent">
            Categorias
          </h2>
          
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => scroll('left')}
              data-testid="button-category-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => scroll('right')}
              data-testid="button-category-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide py-2 px-1 -mx-1"
            data-testid="carousel-categories"
          >
            <CategoryButton
              isSelected={selectedCategory === null}
              onClick={() => onSelectCategory(null)}
              iconId="glass-water"
              label="Todos"
              testId="button-category-all"
            />

            {showTrending && (
              <button
                onClick={() => onSelectCategory(TRENDING_CATEGORY_ID)}
                className={`relative flex flex-col items-center gap-3 min-w-[120px] p-4 rounded-2xl transition-all duration-200 active:scale-95 overflow-visible ${
                  selectedCategory === TRENDING_CATEGORY_ID
                    ? 'bg-gradient-to-b from-amber-500/40 to-yellow-600/30 border-2 border-amber-400 shadow-lg shadow-amber-500/20'
                    : 'bg-gradient-to-b from-amber-500/20 to-yellow-600/10 border-2 border-amber-500/40 hover:border-amber-400/70'
                }`}
                data-testid="button-category-trending"
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                  selectedCategory === TRENDING_CATEGORY_ID 
                    ? 'bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500' 
                    : 'bg-gradient-to-br from-amber-500/30 to-yellow-500/20 border border-amber-400/50'
                }`}>
                  <TrendingUp className={`h-6 w-6 ${selectedCategory === TRENDING_CATEGORY_ID ? 'text-black' : 'text-amber-400'}`} />
                </div>
                <span className={`text-sm font-bold text-center ${
                  selectedCategory === TRENDING_CATEGORY_ID ? 'text-amber-300' : 'text-amber-400/90'
                }`}>
                  Em Alta
                </span>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-br from-amber-300 to-yellow-500 rounded-full" />
              </button>
            )}

            {activeCategories.map((category) => (
              <CategoryButton
                key={category.id}
                isSelected={selectedCategory === category.id}
                onClick={() => onSelectCategory(category.id)}
                iconId={category.iconUrl}
                label={category.name}
                testId={`button-category-${category.id}`}
              />
            ))}
          </div>

          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
        </div>
      </div>
    </section>
  );
}
