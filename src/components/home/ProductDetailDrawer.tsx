import { useState } from 'react';
import { Plus, Minus, ShoppingBag, X, Package, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { useCart } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { SmartImage } from '@/components/SmartImage';
import { W_DRAWER } from '@/lib/image-url';
import type { Product } from '@/shared/schema';
import { isInfiniteStockProduct } from '@/shared/schema';
import { BeerQuantityModal } from './BeerQuantityModal';
import { CERVEJAS_CATEGORY_ID } from '@/lib/beer-discount';

interface ProductDetailDrawerProps {
  product: Product | null;
  categoryName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductDetailDrawer({ 
  product, 
  categoryName, 
  open, 
  onOpenChange 
}: ProductDetailDrawerProps) {
  const { items, addItem, updateQuantity } = useCart();
  const { toast } = useToast();
  const [showBeerModal, setShowBeerModal] = useState(false);
  
  if (!product) return null;

  const isBeerProduct = product.categoryId === CERVEJAS_CATEGORY_ID;

  const cartItem = items.find(item => item.productId === product.id);
  const quantity = cartItem?.quantity ?? 0;

  const formatPrice = (price: string | number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(price));
  };

  const isPreparedProduct = isInfiniteStockProduct(product, categoryName);
  const isOutOfStock = !isPreparedProduct && product.stock <= 0;

  const handleAddItem = () => {
    if (isBeerProduct) {
      setShowBeerModal(true);
      return;
    }
    if (!isPreparedProduct) {
      if (product.stock <= 0 || quantity >= product.stock) {
        toast({
          title: 'Esgotado',
          description: 'Reposição em andamento.',
          variant: 'destructive',
        });
        return;
      }
    }
    addItem(product);
  };

  const handleDecrease = () => {
    updateQuantity(product.id, quantity - 1);
  };

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] bg-background border-t border-primary/20">
        {/* Handle bar */}
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted my-3" />
        
        <div className="flex flex-col max-h-[calc(90vh-60px)]">
          {/* Product Image — compact, never forces scroll */}
          <div className="relative w-full h-40 sm:h-48 flex-shrink-0 bg-gradient-to-br from-secondary/80 to-secondary overflow-hidden">
            {product.imageUrl ? (
              <SmartImage
                path={product.imageUrl}
                widths={W_DRAWER}
                sizes="(max-width: 640px) 100vw, 512px"
                alt={product.name}
                className="w-full h-full object-contain p-2"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                <span className="text-9xl font-serif text-primary/40">
                  {product.name.charAt(0)}
                </span>
              </div>
            )}
            
            {/* Close button */}
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70"
              >
                <X className="h-5 w-5" />
              </Button>
            </DrawerClose>

            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-2">
              {isOutOfStock && (
                <Badge variant="secondary" className="bg-black/70 text-white border-none px-3 py-1">
                  Esgotado
                </Badge>
              )}
              {quantity > 0 && (
                <Badge className="bg-primary text-primary-foreground font-bold px-3 py-1 border-none">
                  {quantity}x no carrinho
                </Badge>
              )}
            </div>
          </div>

          {/* Scrollable info area */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-5 py-3 space-y-3">
              <DrawerHeader className="p-0">
                <DrawerTitle className="text-xl font-bold text-foreground text-left">
                  {product.name}
                </DrawerTitle>
              </DrawerHeader>

              {/* Price */}
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                  {formatPrice(product.salePrice)}
                </span>
              </div>

              {/* Description */}
              {product.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {product.description}
                </p>
              )}

              {/* Category badge */}
              {categoryName && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 border border-primary/10 w-fit">
                  <Package className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">{categoryName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Button — always visible at bottom */}
          <div className="flex-shrink-0 px-5 py-3 bg-background border-t border-primary/10">
            {isOutOfStock ? (
              <Button variant="secondary" size="lg" disabled className="w-full h-14 text-lg opacity-50">
                <ShoppingBag className="h-5 w-5 mr-2" />
                Indisponível
              </Button>
            ) : quantity > 0 ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-secondary/50 rounded-xl p-1 border border-primary/20">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-12 w-12 rounded-lg ${quantity === 1 ? 'text-destructive hover:bg-destructive/20' : 'text-primary hover:bg-primary/20'}`}
                    onClick={handleDecrease}
                  >
                    {quantity === 1 ? <Trash2 className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
                  </Button>
                  <span className="w-12 text-center font-bold text-xl text-foreground">
                    {quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 rounded-lg text-primary hover:bg-primary/20"
                    onClick={handleAddItem}
                    disabled={!isPreparedProduct && quantity >= product.stock}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
                <Button
                  className="flex-1 h-14 text-lg bg-gradient-to-r from-primary to-purple-600 text-white font-semibold hover:from-primary/90 hover:to-purple-500"
                  onClick={() => onOpenChange(false)}
                >
                  <ShoppingBag className="h-5 w-5 mr-2" />
                  Ver Carrinho
                </Button>
              </div>
            ) : (
              <Button
                className="w-full h-16 text-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold hover:from-primary/90 hover:to-purple-500 transition-all duration-300"
                onClick={handleAddItem}
              >
                <Plus className="h-6 w-6 mr-2" />
                Adicionar ao Carrinho
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>

    <BeerQuantityModal
      product={product}
      open={showBeerModal}
      onOpenChange={setShowBeerModal}
    />
    </>
  );
}
