import { Beer, Plus, Minus, Package, ShoppingBag, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCart } from '@/lib/cart';
import { ensureImageUrl } from '@/lib/supabase';
import { FARDO_SIZE, getBeerDiscountPercent, getSmallFardoDiscountPercent, isSmallFardoBeer, CERVEJAS_CATEGORY_ID } from '@/lib/beer-discount';
import type { Product } from '@/shared/schema';

interface BeerQuantityModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BeerQuantityModal({ product, open, onOpenChange }: BeerQuantityModalProps) {
  const { items, addItem, updateQuantity, removeItem } = useCart();

  const [fardos, setFardos] = useState(0);
  const [loose, setLoose] = useState(0);

  // Sync from cart when opening
  useEffect(() => {
    if (!open || !product) return;
    const cartItem = items.find(i => i.productId === product.id && !i.isComboItem);
    const qty = cartItem?.quantity ?? 0;
    const fs = isSmallFardoBeer(product.name) ? 8 : FARDO_SIZE;
    setFardos(Math.floor(qty / fs));
    setLoose(qty % fs);
  }, [open, product?.id]);

  if (!product) return null;

  const isSmall = isSmallFardoBeer(product.name);
  const fardoSize = isSmall ? 8 : FARDO_SIZE;
  const unitPrice = Number(product.salePrice);
  const totalUnits = fardos * fardoSize + loose;

  // For small-fardo beers, discount is per-product; for regular, aggregate all regular beers
  let discountPercent = 0;
  if (isSmall) {
    discountPercent = getSmallFardoDiscountPercent(totalUnits);
  } else {
    const otherRegularBeerUnits = items
      .filter(i => !i.isComboItem && i.product.categoryId === CERVEJAS_CATEGORY_ID && i.productId !== product.id && !isSmallFardoBeer(i.product.name))
      .reduce((sum, i) => sum + i.quantity, 0);
    discountPercent = getBeerDiscountPercent(otherRegularBeerUnits + totalUnits);
  }

  const originalTotal = totalUnits * unitPrice;
  const discountedTotal = originalTotal * (1 - discountPercent / 100);

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const applyToCart = (newFardos: number, newLoose: number) => {
    const newTotal = newFardos * fardoSize + newLoose;
    if (newTotal === 0) {
      removeItem(product.id);
    } else {
      const cartItem = items.find(i => i.productId === product.id && !i.isComboItem);
      if (cartItem) {
        updateQuantity(product.id, newTotal);
      } else {
        addItem(product, newTotal);
      }
    }
  };

  // --- Loose unit handlers ---
  const handleAddUnit = () => {
    let newLoose = loose + 1;
    let newFardos = fardos;
    if (newLoose >= fardoSize) {
      newFardos += 1;
      newLoose = 0;
    }
    setFardos(newFardos);
    setLoose(newLoose);
    applyToCart(newFardos, newLoose);
  };

  const handleRemoveUnit = () => {
    if (loose > 0) {
      const newLoose = loose - 1;
      setLoose(newLoose);
      applyToCart(fardos, newLoose);
    } else if (fardos > 0) {
      // Break a fardo into 11 loose
      const newFardos = fardos - 1;
      const newLoose = fardoSize - 1;
      setFardos(newFardos);
      setLoose(newLoose);
      applyToCart(newFardos, newLoose);
    }
  };

  // --- Fardo handlers ---
  const handleAddFardo = () => {
    const newFardos = fardos + 1;
    setFardos(newFardos);
    applyToCart(newFardos, loose);
  };

  const handleRemoveFardo = () => {
    if (fardos <= 0) return;
    const newFardos = fardos - 1;
    setFardos(newFardos);
    applyToCart(newFardos, loose);
  };

  const handleClear = () => {
    setFardos(0);
    setLoose(0);
    removeItem(product.id);
  };

  const discountInfo = isSmall
    ? { label: `${fardoSize}un = 15%`, active: totalUnits >= fardoSize }
    : { label: `${fardoSize}un = 20%`, active: discountPercent > 0 };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl p-0 overflow-hidden">
        {/* Header */}
        <div className="relative h-28 bg-gradient-to-br from-amber-100 to-yellow-50 flex items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <img src={ensureImageUrl(product.imageUrl)} alt={product.name} className="h-full w-full object-contain p-3" />
          ) : (
            <Beer className="h-14 w-14 text-amber-500/60" />
          )}
          {totalUnits > 0 && (
            <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground font-bold border-none">
              {totalUnits} un no carrinho
            </Badge>
          )}
        </div>

        <div className="px-5 pb-5 space-y-4">
          <DialogHeader className="p-0">
            <DialogTitle className="text-lg font-bold text-foreground text-left">
              {product.name}
            </DialogTitle>
            <p className="text-sm text-muted-foreground text-left">
              Preço unitário: {fmt(unitPrice)}
            </p>
          </DialogHeader>

          {/* Unidades avulsas */}
          <div className="bg-secondary/40 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unidades avulsas</p>
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full border-primary/30"
                onClick={handleRemoveUnit}
                disabled={totalUnits === 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-3xl font-bold text-foreground w-12 text-center">{loose}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full border-primary/30"
                onClick={handleAddUnit}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {loose > 0 && loose < fardoSize && (
              <p className="text-xs text-center text-muted-foreground">
                Faltam <strong className="text-primary">{fardoSize - loose}</strong> para completar 1 fardo
              </p>
            )}
          </div>

          {/* Fardos */}
          <div className="bg-green-500/10 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wider flex items-center gap-1">
              <Package className="h-3.5 w-3.5" /> Fardos ({fardoSize} un cada)
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full border-green-500/30"
                onClick={handleRemoveFardo}
                disabled={fardos === 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-3xl font-bold text-green-600 w-12 text-center">{fardos}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full border-green-500/30"
                onClick={handleAddFardo}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {fardos > 0 && (
              <p className="text-xs text-center text-green-600 font-medium">
                = {fardos * fardoSize} latinhas em fardos
              </p>
            )}
          </div>

          {/* Discount indicator */}
          <div className="flex gap-1 text-[10px] text-muted-foreground justify-center">
            <span
              className={`px-2 py-1 rounded-full border ${
                discountInfo.active
                  ? 'bg-green-500/20 text-green-400 border-green-500/30 font-bold'
                  : 'border-border/50'
              }`}
            >
              {discountInfo.label}
            </span>
          </div>

          {/* Totals */}
          {totalUnits > 0 && (
            <div className="border-t border-primary/10 pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Total: {totalUnits} latinhas
                  {fardos > 0 && loose > 0 && (
                    <span className="text-xs"> ({fardos}F + {loose}un)</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Valor</span>
                <div className="text-right">
                  {discountPercent > 0 ? (
                    <>
                      <span className="text-sm text-muted-foreground line-through mr-2">{fmt(originalTotal)}</span>
                      <span className="text-lg font-bold text-green-500">{fmt(discountedTotal)}</span>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-foreground">{fmt(originalTotal)}</span>
                  )}
                </div>
              </div>
              {discountPercent > 0 && (
                <p className="text-xs text-green-500 text-right font-semibold">
                  🎉 {discountPercent}% de desconto aplicado!
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {totalUnits > 0 && (
              <Button variant="outline" size="icon" className="border-destructive/30 text-destructive" onClick={handleClear}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1 border-primary/30"
              onClick={() => onOpenChange(false)}
            >
              <ShoppingBag className="h-4 w-4 mr-2" />
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
