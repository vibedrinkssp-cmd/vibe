import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { FixedHeader } from '@/components/layout/FixedHeader';
import { FixedBottomBar } from '@/components/layout/FixedBottomBar';
import { ChevronDown } from 'lucide-react';
import { FeatureBannerCarousel } from '@/components/home/FeatureBannerCarousel';
import { CompactCategoryCarousel } from '@/components/home/CompactCategoryCarousel';
import { ProductFiltersBar } from '@/components/home/ProductFiltersBar';
import { ScrollableProductGrid } from '@/components/home/ScrollableProductGrid';
import { SpecialDrinksCarousel } from '@/components/home/SpecialDrinksCarousel';
import { CartSheet } from '@/components/cart/CartSheet';
import { ComboModal } from '@/components/home/ComboModal';
import { SpecialDrinksModal } from '@/components/home/SpecialDrinksModal';
import { PremiumDrinksModal } from '@/components/home/PremiumDrinksModal';
import { CaipirinhaModal } from '@/components/home/CaipirinhaModal';
import { CopaoModal } from '@/components/home/CopaoModal';
import { CaipiIceModal } from '@/components/home/CaipiIceModal';
import { TutorialModal } from '@/components/home/TutorialModal';
import { useSettingsRealtime, useProductsRealtime } from '@/hooks/use-realtime-sync';
import { useProducts, useCategories } from '@/hooks/use-supabase-data';
import { usePublicStoreInfo } from '@/hooks/use-public-data';
import { Store } from 'lucide-react';

const CustomDrinkModal = lazy(() =>
  import('@/components/home/CustomDrinkModal').then((m) => ({ default: m.CustomDrinkModal }))
);

export const TRENDING_CATEGORY_ID = '__trending__';

type GridColumns = 1 | 2 | 3;
type SortOrder = 'az' | 'za' | null;

export default function Home() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [cartOpen, setCartOpen] = useState(false);
  const [comboModalOpen, setComboModalOpen] = useState(false);
  const [specialDrinksOpen, setSpecialDrinksOpen] = useState(false);
  const [premiumDrinksOpen, setPremiumDrinksOpen] = useState(false);
  const [customDrinkOpen, setCustomDrinkOpen] = useState(false);
  const [caipirinhaOpen, setCaipirinhaOpen] = useState(false);
  const [copaoOpen, setCopaoOpen] = useState(false);
  const [caipiIceOpen, setCaipiIceOpen] = useState(false);
  const [selectedDrinkType, setSelectedDrinkType] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [gridColumns, setGridColumns] = useState<GridColumns>(3);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const [isStuck, setIsStuck] = useState(false);
  const stickyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Detect when sticky bar is stuck (banners scrolled away)
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Scroll to categories when search is focused
  const handleSearchFocus = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Reset state to initial
  const handleHomeReset = useCallback(() => {
    setSelectedCategory(null);
    setSearchQuery('');
    setGridColumns(3);
    setSortOrder(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const privilegedRoles = ['admin', 'kitchen', 'pdv', 'motoboy'];
    if (role && privilegedRoles.includes(role)) {
      const redirectMap: Record<string, string> = {
        admin: '/admin',
        kitchen: '/cozinha',
        pdv: '/pdv',
        motoboy: '/motoboy',
      };
      navigate(redirectMap[role]);
    }
  }, [role, navigate]);

  // Realtime sync for products, categories, settings, banners
  useProductsRealtime();
  useSettingsRealtime();

  const { data: storeInfo } = usePublicStoreInfo();
  const isStoreClosed = storeInfo?.isOpen === false;

  const { data: productsData = [], isLoading: productsLoading } = useProducts({ activeOnly: true });
  const { data: rawCategoriesData = [] } = useCategories({ activeOnly: true });
  const products = Array.isArray(productsData) ? productsData : [];
  const rawCategories = Array.isArray(rawCategoriesData) ? rawCategoriesData : [];
  
  // Add salesCount to categories for component compatibility
  const categories = useMemo(() => 
    rawCategories.map(cat => ({ ...cat, salesCount: 0 })), 
    [rawCategories]
  );

  // Trending products - just get top 10 most recent active products for now
  const trendingProducts = products.slice(0, 10);
  const hasTrendingProducts = trendingProducts.length > 0;

  // Apply sorting
  const sortedProducts = useMemo(() => {
    const baseProducts = selectedCategory === TRENDING_CATEGORY_ID 
      ? trendingProducts 
      : products;
    
    if (!sortOrder) return baseProducts;
    
    return [...baseProducts].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (sortOrder === 'az') {
        return nameA.localeCompare(nameB, 'pt-BR');
      } else {
        return nameB.localeCompare(nameA, 'pt-BR');
      }
    });
  }, [products, trendingProducts, selectedCategory, sortOrder]);

  const effectiveCategory = selectedCategory === TRENDING_CATEGORY_ID 
    ? null 
    : selectedCategory;

  // TODO: Connect to real notification count from orders
  const notificationCount = 0;

  return (
    <div className="min-h-screen w-full relative bg-background">
      {/* Fixed Header */}
      <FixedHeader 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onTutorialOpen={() => setTutorialOpen(true)}
        notificationCount={notificationCount}
        onSearchFocus={handleSearchFocus}
      />

      {/* Scrollable Content - passes under fixed header and bottom bar */}
      <main className="pt-14 pb-24 safe-area-bottom">
        {isStoreClosed && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 flex items-center gap-2 justify-center text-sm font-medium">
            <Store className="h-4 w-4" />
            Loja fechada no momento — pedidos indisponíveis
          </div>
        )}
        {/* Feature Banner: Monte Seu Combo */}
        <div className="mt-2 md:mt-1">
          <FeatureBannerCarousel
            only="combo"
            onComboOpen={() => setComboModalOpen(true)}
            onSpecialDrinksOpen={() => setSpecialDrinksOpen(true)}
          />
        </div>

        {/* Special Drinks Carousel */}
        <div className="py-2">
          <SpecialDrinksCarousel onSelectType={(id) => {
            setSelectedDrinkType(id);
            if (id === 'caipirinha') {
              setCaipirinhaOpen(true);
            } else if (id === 'copao') {
              setCopaoOpen(true);
            } else if (id === 'caipi-ice') {
              setCaipiIceOpen(true);
            } else {
              setCustomDrinkOpen(true);
            }
          }} />
        </div>

        {/* Feature Banner: Drinks Especiais */}
        <div className="pb-2">
          <FeatureBannerCarousel
            only="special-drinks"
            onComboOpen={() => setComboModalOpen(true)}
            onSpecialDrinksOpen={() => setSpecialDrinksOpen(true)}
          />
        </div>

        {/* Sentinel for intersection observer */}
        <div ref={sentinelRef} aria-hidden="true" className="h-0 w-full" />

        {/* Sticky Categories - sticks below header when scrolling */}
        <div ref={stickyRef} className="sticky top-14 z-40 bg-background">
          <div className="py-1">
            <CompactCategoryCarousel 
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              showTrending={hasTrendingProducts}
            />
          </div>

          {/* Pulsing arrow to scroll back to top */}
          {isStuck && (
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="absolute left-1/2 -translate-x-1/2 -bottom-4 z-50 flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shadow-lg animate-bounce"
              aria-label="Voltar ao topo"
            >
              <ChevronDown className="h-5 w-5 rotate-180" />
            </button>
          )}

          {/* Golden line with filters */}
          <ProductFiltersBar
            gridColumns={gridColumns}
            onGridChange={setGridColumns}
            sortOrder={sortOrder}
            onSortChange={setSortOrder}
          />
        </div>

        {/* Products */}
        <ScrollableProductGrid 
          products={sortedProducts}
          categories={categories}
          isLoading={productsLoading}
          selectedCategory={effectiveCategory}
          searchQuery={searchQuery}
          gridColumns={gridColumns}
          onClearSearch={() => setSearchQuery('')}
        />
      </main>

      {/* Fixed Bottom Bar */}
      <FixedBottomBar 
        onCartOpen={() => setCartOpen(true)}
        onHomeReset={handleHomeReset}
      />

      {/* Modals */}
      {cartOpen && <CartSheet open={cartOpen} onOpenChange={setCartOpen} />}
      {comboModalOpen && <ComboModal open={comboModalOpen} onOpenChange={setComboModalOpen} />}
      {specialDrinksOpen && <SpecialDrinksModal open={specialDrinksOpen} onOpenChange={setSpecialDrinksOpen} />}
      {premiumDrinksOpen && <PremiumDrinksModal open={premiumDrinksOpen} onOpenChange={setPremiumDrinksOpen} />}
      {customDrinkOpen && (
        <Suspense fallback={null}>
          <CustomDrinkModal open={customDrinkOpen} onOpenChange={setCustomDrinkOpen} drinkType={selectedDrinkType} />
        </Suspense>
      )}
      {caipirinhaOpen && <CaipirinhaModal open={caipirinhaOpen} onOpenChange={setCaipirinhaOpen} />}
      {copaoOpen && <CopaoModal open={copaoOpen} onOpenChange={setCopaoOpen} />}
      {caipiIceOpen && <CaipiIceModal open={caipiIceOpen} onOpenChange={setCaipiIceOpen} />}
      {tutorialOpen && <TutorialModal open={tutorialOpen} onOpenChange={setTutorialOpen} />}
    </div>
  );
}
