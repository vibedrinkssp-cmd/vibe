import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { useProducts, useCategories } from '@/hooks/use-supabase-data';
import { useCartOptional } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { Wine, Loader2, Plus, Minus, ShoppingCart, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { isPreparedCategoryName, type CartItem } from '@/shared/schema';
import { motion } from 'framer-motion';
import { ensureImageUrl } from '@/lib/supabase';
import { supabase } from '@/integrations/supabase/client-safe';
import { useQueryClient } from '@tanstack/react-query';
import type { Product } from '@/shared/schema';

interface SpecialDrinksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem?: (product: Product) => void;
}

export function SpecialDrinksModal({ open, onOpenChange, onAddItem }: SpecialDrinksModalProps) {
  const cart = useCartOptional();
  const items: CartItem[] = cart?.items ?? [];
  const cartAddItem = cart?.addItem;
  const updateQuantity = cart?.updateQuantity;
  const addItemFn = onAddItem || cartAddItem;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const dragStartX = useRef(0);
  const dragStartTime = useRef(0);

  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();

  // Drinks Exclusivos = apenas categoria DRINKS ESPECIAIS (drinks da casa)
  const specialCategoryNames = ['DRINKS ESPECIAIS'];

  const specialCategories = categories.filter(c => 
    c.isActive && 
    specialCategoryNames.some(name => c.name.toLowerCase() === name.toLowerCase())
  );

  useEffect(() => {
    if (open && specialCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(specialCategories[0].id);
    }
  }, [open, specialCategories, selectedCategory]);

  useEffect(() => {
    if (!open) {
      setSelectedCategory(null);
      setCurrentIndex(0);
    }
  }, [open]);

  const specialDrinks = products.filter(p => {
    if (!p.isActive) return false;
    if (!selectedCategory) return false;
    return p.categoryId === selectedCategory;
  });

  useEffect(() => {
    setCurrentIndex(0);
  }, [selectedCategory]);

  useEffect(() => {
    if (!isAutoPlaying || specialDrinks.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % specialDrinks.length);
    }, 3500);

    return () => clearInterval(interval);
  }, [isAutoPlaying, specialDrinks.length, selectedCategory]);

  const formatPrice = (price: string | number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(price));
  };

  const getCartQuantity = (productId: string) => {
    const item = items.find(i => i.productId === productId);
    return item?.quantity ?? 0;
  };

  // Verifica se o produto é preparado (pelo produto ou pela categoria)
  const isProductPrepared = (product: Product) => {
    if (product.isPrepared) return true;
    const category = categories.find(c => c.id === product.categoryId);
    if (category) return isPreparedCategoryName(category.name);
    return false;
  };

  const handleAddToCart = async (product: Product) => {
    const isPrepared = isProductPrepared(product);
    
    if (!isPrepared) {
      const cartItem = items.find(i => i.productId === product.id);
      const currentQty = cartItem?.quantity ?? 0;
      
      if (product.stock <= 0 || currentQty >= product.stock) {
        toast({
          title: 'Estoque Insuficiente',
          description: `O produto ${product.name} está com estoque zerado ou você já adicionou a quantidade máxima disponível.`,
          variant: 'destructive',
        });
        return;
      }
    }
    
    // Deduzir doses e estoque de ingredientes via receita
    const { error: deductError } = await supabase.rpc('deduct_special_drink_stock', {
      p_product_id: product.id,
      p_quantity: 1,
    });
    if (deductError) {
      console.warn('Erro ao deduzir estoque da receita:', deductError.message);
    } else {
      queryClient.invalidateQueries({ queryKey: ['open-bottles'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    }

    addItemFn?.(product);
    toast({
      title: 'Adicionado ao carrinho',
      description: `${product.name} foi adicionado.`,
    });
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    dragStartX.current = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dragStartTime.current = Date.now();
  };

  const handleDragEnd = (e: React.MouseEvent | React.TouchEvent) => {
    const endX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX;
    const deltaX = dragStartX.current - endX;
    const deltaTime = Date.now() - dragStartTime.current;
    
    if (Math.abs(deltaX) > 30 && deltaTime < 500) {
      if (deltaX > 0) {
        setCurrentIndex(prev => (prev + 1) % specialDrinks.length);
      } else {
        setCurrentIndex(prev => prev === 0 ? specialDrinks.length - 1 : prev - 1);
      }
      setIsAutoPlaying(false);
    }
  };

  const isLoading = productsLoading || categoriesLoading;
  const currentDrink = specialDrinks[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-3 pb-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30 flex-shrink-0">
              <Wine className="h-4 w-4 text-white" />
            </div>
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent truncate">
              Drinks Especiais
            </span>
            <Sparkles className="h-4 w-4 text-pink-400 flex-shrink-0" />
          </DialogTitle>
          <DialogDescription className="sr-only">
            Explore os drinks especiais disponíveis e adicione os itens desejados ao carrinho.
          </DialogDescription>
        </DialogHeader>

        <div className="px-3 pb-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {specialCategories.map(category => (
                    <Button
                      key={category.id}
                      variant={selectedCategory === category.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectedCategory(category.id);
                        setIsAutoPlaying(true);
                      }}
                      className={`text-xs sm:text-sm ${selectedCategory === category.id ? 'bg-gradient-to-r from-purple-500 to-pink-500' : ''}`}
                      data-testid={`button-filter-${category.id}`}
                    >
                      {category.name}
                    </Button>
                  ))}
                </div>

                {specialDrinks.length === 0 ? (
                  <div className="text-center py-8 sm:py-12">
                    <Wine className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-sm sm:text-base">Nenhum drink especial disponível no momento.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentDrink && (
                      <div className="flex items-stretch gap-2">
                        {/* Botão grande esquerda */}
                        <button
                          onClick={() => {
                            setCurrentIndex(prev => prev === 0 ? specialDrinks.length - 1 : prev - 1);
                            setIsAutoPlaying(false);
                          }}
                          className="flex-shrink-0 w-12 rounded-xl bg-gradient-to-b from-purple-500 to-pink-500 text-white flex items-center justify-center active:scale-95 transition-transform shadow-lg"
                          aria-label="Drink anterior"
                          data-testid="button-prev-drink"
                        >
                          <ChevronLeft className="h-7 w-7" />
                        </button>

                        {/* Card do drink */}
                        <motion.div
                          key={currentDrink.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.25 }}
                          className="flex-1 min-w-0"
                        >
                          <Card 
                            className="overflow-hidden border-2 border-purple-500 shadow-lg shadow-purple-500/20 h-full"
                            data-testid={`card-special-drink-${currentDrink.id}`}
                          >
                            <div className="flex flex-col h-full">
                              <div className="relative w-full aspect-[3/2] overflow-hidden bg-gradient-to-br from-purple-900/20 to-pink-900/20">
                                {currentDrink.imageUrl ? (
                                  <img
                                    src={ensureImageUrl(currentDrink.imageUrl)}
                                    alt={currentDrink.name}
                                    className="w-full h-full object-contain"
                                    loading="lazy"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = 'https://placehold.co/400x400?text=Sem+Imagem';
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Wine className="h-16 w-16 text-purple-400/50" />
                                  </div>
                                )}
                                
                                {!isProductPrepared(currentDrink) && currentDrink.stock <= 0 && (
                                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                    <Badge variant="secondary" className="text-xs">Esgotado</Badge>
                                  </div>
                                )}

                                <Badge 
                                  className="absolute top-2 right-2 bg-gradient-to-r from-purple-500 to-pink-500 border-none text-xs py-0.5 px-2"
                                >
                                  Especial
                                </Badge>
                              </div>
                              
                              <div className="p-3 flex flex-col items-center text-center gap-1">
                                <h3 className="font-semibold text-sm line-clamp-2">
                                  {currentDrink.name}
                                </h3>
                                {currentDrink.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">
                                    {currentDrink.description}
                                  </p>
                                )}
                                <span className="font-bold text-lg text-purple-400">
                                  {formatPrice(currentDrink.salePrice)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {currentIndex + 1} de {specialDrinks.length}
                                </span>
                              </div>
                            </div>
                          </Card>
                        </motion.div>

                        {/* Botão grande direita */}
                        <button
                          onClick={() => {
                            setCurrentIndex(prev => (prev + 1) % specialDrinks.length);
                            setIsAutoPlaying(false);
                          }}
                          className="flex-shrink-0 w-12 rounded-xl bg-gradient-to-b from-purple-500 to-pink-500 text-white flex items-center justify-center active:scale-95 transition-transform shadow-lg"
                          aria-label="Próximo drink"
                          data-testid="button-next-drink"
                        >
                          <ChevronRight className="h-7 w-7" />
                        </button>
                      </div>
                    )}

                    {/* Botão Adicionar centralizado */}
                    {currentDrink && !(!isProductPrepared(currentDrink) && currentDrink.stock <= 0) && (
                      <div className="flex justify-center pt-1">
                        {getCartQuantity(currentDrink.id) === 0 ? (
                          <Button
                            onClick={() => handleAddToCart(currentDrink)}
                            className="bg-gradient-to-r from-purple-500 to-pink-500 text-base px-8 h-11 w-full max-w-xs"
                            data-testid={`button-add-${currentDrink.id}`}
                          >
                            <Plus className="h-5 w-5 mr-2" />
                            Adicionar ao Carrinho
                          </Button>
                        ) : (
                          <div className="flex items-center gap-3">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-10 w-10 rounded-full"
                              onClick={() => updateQuantity?.(currentDrink.id, getCartQuantity(currentDrink.id) - 1)}
                              data-testid={`button-decrease-${currentDrink.id}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-bold text-lg">
                              {getCartQuantity(currentDrink.id)}
                            </span>
                            <Button
                              size="icon"
                              className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                              onClick={() => handleAddToCart(currentDrink)}
                              data-testid={`button-increase-${currentDrink.id}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dots indicator */}
                    {specialDrinks.length > 1 && (
                      <div 
                        className="flex gap-1.5 justify-center py-1"
                        role="tablist"
                        aria-label="Navegacao do carrossel"
                      >
                        {specialDrinks.slice(0, 10).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentIndex(i)}
                            className={`rounded-full transition-all ${
                              i === currentIndex 
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 h-2 w-5' 
                                : 'bg-purple-500/30 h-2 w-2'
                            }`}
                            role="tab"
                            aria-selected={i === currentIndex}
                            aria-label={`Ir para drink ${i + 1}`}
                            data-testid={`button-dot-${i}`}
                          />
                        ))}
                        {specialDrinks.length > 10 && (
                          <span className="text-xs text-muted-foreground ml-1">+{specialDrinks.length - 10}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t pt-3 sm:pt-4 mt-2">
                  <Button 
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-sm sm:text-base" 
                    size="default"
                    onClick={() => onOpenChange(false)}
                    data-testid="button-close-special-drinks"
                  >
                    <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    Continuar Comprando
                  </Button>
                </div>
              </div>
            )}
          </div>
      </DialogContent>
    </Dialog>
  );
}
