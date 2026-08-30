import { useState } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { Search, LayoutList, Grid2X2, LayoutGrid, Wine, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProductCard } from './ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import type { Product, Category } from '@/shared/schema';
import { isPreparedCategoryName, isInfiniteStockProduct } from '@/shared/schema';

type GridColumns = 1 | 2 | 4;

interface ProductGridProps {
  products: Product[];
  categories?: Category[];
  isLoading?: boolean;
  selectedCategory: string | null;
}

export function ProductGrid({ products, categories = [], isLoading, selectedCategory }: ProductGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [gridColumns, setGridColumns] = useState<GridColumns>(2);

  const getGridClasses = () => {
    switch (gridColumns) {
      case 1:
        return 'grid-cols-1 max-w-2xl mx-auto';
      case 2:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      case 4:
        return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
    }
  };

  const filteredProducts = products.filter(product => {
    if (!product.isActive) return false;

    // Hide zero-stock physical products; keep made-to-order drinks infinite.
    // Salgados/lanches are physical stock so they disappear when out of stock.
    const category = categories.find(c => c.id === product.categoryId);
    if (!isInfiniteStockProduct(product, category?.name) && product.stock <= 0) return false;
    
    const matchesCategory = !selectedCategory || product.categoryId === selectedCategory;
    const matchesSearch = !searchQuery || 
      searchIncludes(product.name, searchQuery) ||
      (product.description ? searchIncludes(product.description, searchQuery) : false) ||
      (category?.name ? searchIncludes(category.name, searchQuery) : false);
    
    return matchesCategory && matchesSearch;
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  return (
    <section id="products-section" className="py-12 px-4" data-testid="section-products">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <h2 className="font-serif text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary via-amber-400 to-primary bg-clip-text text-transparent">
              Produtos
            </h2>
            <span className="text-muted-foreground text-sm">
              ({filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'itens'})
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 border border-primary/10">
              <Button
                size="icon"
                variant={gridColumns === 1 ? 'default' : 'ghost'}
                onClick={() => setGridColumns(1)}
                className="h-8 w-8"
                data-testid="button-grid-1"
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={gridColumns === 2 ? 'default' : 'ghost'}
                onClick={() => setGridColumns(2)}
                className="h-8 w-8"
                data-testid="button-grid-2"
              >
                <Grid2X2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={gridColumns === 4 ? 'default' : 'ghost'}
                onClick={() => setGridColumns(4)}
                className="h-8 w-8"
                data-testid="button-grid-4"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60" />
              <Input
                type="search"
                placeholder="Buscar produtos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50 border-primary/20 focus:border-primary text-white placeholder:text-muted-foreground h-10"
                data-testid="input-search-products"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className={`grid ${getGridClasses()} gap-6`}>
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div 
                key={i} 
                className="bg-card/50 rounded-xl overflow-hidden border border-primary/10"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="aspect-square skeleton-premium" />
                <div className="p-4 space-y-3">
                  <div className="h-5 w-3/4 rounded skeleton-premium" />
                  <div className="h-4 w-1/2 rounded skeleton-premium" />
                  <div className="flex justify-between gap-2">
                    <div className="h-7 w-24 rounded skeleton-premium" />
                    <div className="h-10 w-28 rounded skeleton-premium" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <motion.div 
            className="text-center py-20"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Wine className="h-12 w-12 text-primary/50" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Nenhum produto encontrado
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {searchQuery 
                ? `Nao encontramos resultados para "${searchQuery}". Tente outro termo.`
                : 'Nenhum produto disponivel nesta categoria no momento.'
              }
            </p>
            {searchQuery && (
              <Button
                variant="outline"
                className="mt-6 border-primary/30 text-primary"
                onClick={() => setSearchQuery('')}
              >
                Limpar busca
              </Button>
            )}
          </motion.div>
        ) : (
          <motion.div 
            className={`grid ${getGridClasses()} gap-6`}
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {filteredProducts.map((product) => {
              const category = categories.find(c => c.id === product.categoryId);
              return (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  categoryName={category?.name}
                />
              );
            })}
          </motion.div>
        )}
      </div>
    </section>
  );
}
