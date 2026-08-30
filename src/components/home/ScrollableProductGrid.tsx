import { useMemo } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { Wine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductCard } from './ProductCard';
import type { Product, Category } from '@/shared/schema';
import { isInfiniteStockProduct } from '@/shared/schema';

type GridColumns = 1 | 2 | 3;

interface ScrollableProductGridProps {
  products: Product[];
  categories?: Category[];
  isLoading?: boolean;
  selectedCategory: string | null;
  searchQuery: string;
  gridColumns: GridColumns;
  onClearSearch: () => void;
}

export function ScrollableProductGrid({ 
  products, 
  categories = [], 
  isLoading, 
  selectedCategory,
  searchQuery,
  gridColumns,
  onClearSearch
}: ScrollableProductGridProps) {

  const getGridClasses = () => {
    switch (gridColumns) {
      case 1:
        return 'grid-cols-1 max-w-md mx-auto';
      case 2:
        return 'grid-cols-2';
      case 3:
        // On very narrow screens fall back to 2 cols to prevent card overflow
        return 'grid-cols-2 sm:grid-cols-3';
    }
  };

  const filteredProducts = useMemo(() => products.filter(product => {
    if (product.isActive === false) return false;

    // Hide physical products that are out of stock (salgados, salgadinhos, retail).
    // Made-to-order drinks (COPÃO, DOSES, etc.) stay visible even at stock 0.
    const category = categories.find(c => c.id === product.categoryId);
    if (!isInfiniteStockProduct(product, category?.name) && (product.stock ?? 0) <= 0) return false;

    const matchesCategory = !selectedCategory || product.categoryId === selectedCategory;
    if (!matchesSearch(product, searchQuery, categories)) return false;
    
    return matchesCategory;
  }), [products, selectedCategory, searchQuery, categories]);

  function matchesSearch(product: Product, query: string, cats: Category[]): boolean {
    if (!query) return true;
    if (searchIncludes(product.name, query)) return true;
    if (product.description && searchIncludes(product.description, query)) return true;
    // Search by category name
    const cat = cats.find(c => c.id === product.categoryId);
    if (cat?.name && searchIncludes(cat.name, query)) return true;
    return false;
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div 
        className="h-full overflow-y-auto scrollbar-purple px-4 pt-3"
        style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))' }}
        data-testid="scrollable-product-grid"
      >
      {isLoading ? (
        <div className={`grid ${getGridClasses()} gap-3 pt-0 pb-3`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div 
              key={i} 
              className="rounded-xl overflow-hidden border border-primary/10 bg-white/30"
            >
              <div className="aspect-square bg-gradient-to-br from-primary/5 to-primary/10 animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-primary/10 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-primary/10 animate-pulse" />
                <div className="flex justify-between gap-2">
                  <div className="h-6 w-20 rounded bg-primary/10 animate-pulse" />
                  <div className="h-8 w-24 rounded bg-primary/15 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-20 h-20 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Wine className="h-10 w-10 text-primary/50" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Nenhum produto encontrado
          </h3>
          <p className="text-muted-foreground text-center text-sm max-w-xs">
            {searchQuery 
              ? `Não encontramos "${searchQuery}". Tente outro termo.`
              : 'Nenhum produto disponível nesta categoria.'
            }
          </p>
          {searchQuery && (
            <Button
              variant="outline"
              className="mt-4 border-primary/30 text-primary"
              onClick={onClearSearch}
            >
              Limpar busca
            </Button>
          )}
        </div>
      ) : (
        <div className={`grid ${getGridClasses()} gap-4 pt-0 pb-4`}>
          {filteredProducts.map((product) => {
            const category = categories.find(c => c.id === product.categoryId);
            return (
              <div key={product.id} className="min-w-0">
              <ProductCard 
                  product={product} 
                  categoryName={category?.name}
                />
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
