import { useRef } from 'react';
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
            : 'bg-white/70 border border-primary/20 text-foreground'
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
    </div>
  );
}
