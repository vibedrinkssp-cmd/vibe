import { useState } from 'react';
import { Wine } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/lib/cart';
import { SmartImage } from '@/components/SmartImage';
import { W_CARD } from '@/lib/image-url';
import type { Product } from '@/shared/schema';
import { isInfiniteStockProduct } from '@/shared/schema';
import { ProductDetailDrawer } from './ProductDetailDrawer';
import { getBestProductPromotion, useActivePromotions } from '@/lib/weekly-promotions';

interface ProductCardProps {
  product: Product;
  categoryName?: string;
}

export function ProductCard({ product, categoryName }: ProductCardProps) {
  const { items } = useCart();
  const activePromotions = useActivePromotions();
  const [showDetail, setShowDetail] = useState(false);
  const cartItem = items.find(item => item.productId === product.id);
  const quantity = cartItem?.quantity ?? 0;
  const promo = getBestProductPromotion(product, activePromotions);

  const formatPrice = (price: string | number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(price));
  };

  const isPreparedProduct = isInfiniteStockProduct(product, categoryName);
  const isOutOfStock = !isPreparedProduct && product.stock <= 0;

  return (
    <>
      <Card 
        className="group h-full w-full max-w-full min-w-0 flex flex-col overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-xl shadow-md hover:shadow-primary/15"
        data-testid={`card-product-${product.id}`}
        onClick={() => setShowDetail(true)}
      >
        <div className="aspect-[3/1] relative overflow-hidden bg-gradient-to-br from-secondary/60 to-secondary/40">
          {product.imageUrl ? (
            <SmartImage
              path={product.imageUrl}
              widths={W_CARD}
              sizes="(max-width: 640px) 45vw, 240px"
              alt={product.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/8 via-primary/5 to-accent/8">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/15 flex items-center justify-center mb-1 border border-primary/15">
                <Wine className="w-5 h-5 text-primary/60" />
              </div>
              <span className="text-xs font-semibold text-primary/50 text-center px-2 line-clamp-2">
                {product.name}
              </span>
            </div>
          )}
          
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center px-2 text-center">
              <Badge variant="secondary" className="text-xs px-2 py-1 bg-black/60 border border-white/20 text-white">
                Esgotado
              </Badge>
              <span className="text-[10px] text-white/80 mt-1">Reposição em andamento</span>
            </div>
          )}

          {!isOutOfStock && promo && (
            <Badge className="absolute left-1 top-1 border-none bg-emerald-500 text-white text-[10px] font-extrabold shadow-md">
              🎁 PROMO
            </Badge>
          )}
        </div>

        <div className="flex flex-col flex-1 p-1.5 sm:p-2 gap-0.5">
          <div className="flex-1">
            <h3 
              className="font-bold text-sm sm:text-base mb-0.5 line-clamp-2 leading-tight text-card-foreground"
              data-testid={`text-product-name-${product.id}`}
            >
              {product.name}
            </h3>
            
            {product.description && (
              <p className="text-muted-foreground/80 text-[11px] sm:text-xs line-clamp-1 leading-relaxed">
                {product.description}
              </p>
            )}
          </div>

          <div className="mt-auto min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span 
                className="text-lg sm:text-xl font-bold text-primary truncate min-w-0"
                data-testid={`text-product-price-${product.id}`}
              >
                {formatPrice(product.salePrice)}
              </span>
              {isOutOfStock ? (
                <Badge variant="secondary" className="text-[10px] opacity-60 flex-shrink-0">Esgotado</Badge>
              ) : quantity > 0 ? (
                <Badge className="bg-primary text-primary-foreground font-bold px-2 py-0.5 text-xs border-none flex-shrink-0">
                  {quantity}x
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <ProductDetailDrawer
        product={product}
        categoryName={categoryName}
        open={showDetail}
        onOpenChange={setShowDetail}
      />
    </>
  );
}
