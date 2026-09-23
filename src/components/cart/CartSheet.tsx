import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, ShoppingBag, Gift, Image as ImageIcon, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ensureImageUrl } from '@/lib/supabase';
import { hasRealEnergetico } from '@/lib/copao-recipe';
import { returnManyBottleDoses } from '@/lib/deduct-bottle-doses';

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const { items, combos, customDrinks, customDrinksTotal, subtotal, comboDiscount, beerDiscount, beerDiscountPercent, promotionDiscount, promotionMatches, total, updateQuantity, removeItem, removeCombo, removeCustomDrink, clearCart, itemCount } = useCart();
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const handleCheckout = () => {
    onOpenChange(false);
    // Only allow customers to proceed to checkout directly
    // Staff roles (admin, pdv, kitchen, motoboy) must log in as customer first
    if (isAuthenticated && role === 'customer') {
      navigate('/checkout');
    } else {
      navigate('/login?redirect=/checkout');
    }
  };

  // Esvaziar o carrinho aqui é desistência do cliente (diferente do clearCart
  // pós-compra no Checkout) — precisa estornar as doses já debitadas ao montar
  // os drinks, senão o controle de garrafa fica descontado sem venda nenhuma.
  const handleClearCart = () => {
    if (customDrinks.length > 0) void returnManyBottleDoses(customDrinks);
    clearCart();
  };

  const regularItems = items.filter(item => !item.isComboItem);
  const comboItems = items.filter(item => item.isComboItem);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-muted/90 backdrop-blur-2xl border-l border-border/70 shadow-2xl flex flex-col w-full sm:max-w-md p-0" data-testid="sheet-cart">
        <SheetHeader className="px-6 py-5 border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground shadow-sm flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5" />
                </div>
              <div>
                <span className="font-serif text-xl text-foreground">Carrinho</span>
                {itemCount > 0 && (
                  <p className="text-sm text-muted-foreground font-normal">
                    {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                  </p>
                )}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 && customDrinks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-24 h-24 rounded-full bg-secondary/50 flex items-center justify-center mb-6"
            >
              <ShoppingBag className="h-12 w-12 text-muted-foreground" />
            </motion.div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Seu carrinho esta vazio</h3>
            <p className="text-muted-foreground mb-6 text-sm">
              Adicione produtos deliciosos para comecar
            </p>
            <Button 
              variant="outline" 
              className="border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => onOpenChange(false)}
            >
              Ver produtos
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {combos.map((combo) => (
                  <motion.div
                    key={combo.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 bg-card/95 rounded-xl border border-border/70 shadow-sm"
                    data-testid={`cart-combo-${combo.id}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="secondary" className="gap-2 rounded-full border-primary/20 bg-primary/10 text-primary">
                        <Gift className="h-4 w-4" />
                        Combo 5% OFF
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCombo(combo.id)}
                        data-testid={`button-remove-combo-${combo.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-foreground">
                        <span>1x {combo.destilado.name}</span>
                        <span>{formatPrice(Number(combo.destilado.salePrice))}</span>
                      </div>
                      <div className="flex justify-between text-foreground">
                        <span>{combo.energeticoQuantity}x {combo.energetico.name}</span>
                        <span>{formatPrice(Number(combo.energetico.salePrice) * combo.energeticoQuantity)}</span>
                      </div>
                      {combo.gelos.map((gelo, idx) => (
                        <div key={idx} className="flex justify-between text-foreground">
                          <span>{gelo.quantity}x {gelo.product.name}</span>
                          <span>{formatPrice(Number(gelo.product.salePrice) * gelo.quantity)}</span>
                        </div>
                      ))}
                      <div className="border-t border-primary/20 pt-2 mt-2">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal:</span>
                          <span className="line-through">{formatPrice(combo.originalTotal)}</span>
                        </div>
                        <div className="flex justify-between text-primary font-semibold">
                          <span>Com desconto:</span>
                          <span>{formatPrice(combo.discountedTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {/* Custom Drinks — receita detalhada para o cliente e cozinha */}
                {customDrinks.map((drink) => {
                  const qty = Math.max(1, drink.quantity || 1);
                  const hasRecipe = (drink.doses && drink.doses.length > 0) || hasRealEnergetico(drink) || drink.gelo || (drink.fruits && drink.fruits.length > 0);
                  const shouldShowNoMixer = (drink.doses?.length ?? 0) > 0 && /copão|copao|batida|drink personalizado/i.test(drink.name || '') && !hasRealEnergetico(drink);
                  return (
                    <div
                      key={drink.id}
                      className="p-3 bg-card/95 rounded-xl border-2 border-purple-500/40 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 text-white flex flex-col items-center justify-center font-extrabold leading-none">
                            <span className="text-lg">{qty}x</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <Badge variant="secondary" className="gap-1 rounded-full border-primary/20 bg-primary/10 text-primary text-[10px] py-0 h-4">
                              <span className="leading-none">🍸</span>DRINK MONTADO
                            </Badge>
                            <p className="font-extrabold text-foreground text-sm leading-tight mt-1 uppercase line-clamp-2">{drink.name}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => removeCustomDrink(drink.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {hasRecipe && (
                        <div className="rounded-lg bg-muted/40 border border-border/60 p-2 space-y-1 mb-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">📋 Receita de cada copo:</p>
                          {drink.doses?.map((d, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-base">🍶</span>
                              <span className="font-bold text-amber-600 tabular-nums">{d.doseCount}x</span>
                              <span className="font-semibold uppercase truncate">{d.doseCount > 1 ? 'DOSES' : 'DOSE'} {d.bottleName}</span>
                            </div>
                          ))}
                          {hasRealEnergetico(drink) && drink.energetico && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-base">⚡</span>
                              <span className="font-semibold uppercase truncate">{drink.energetico.productName}</span>
                            </div>
                          )}
                          {shouldShowNoMixer && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-base">🚫</span>
                              <span className="font-semibold uppercase truncate">NÃO ADICIONAR MISTURA</span>
                            </div>
                          )}
                          {drink.gelo && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-base">🧊</span>
                              <span className="font-semibold uppercase truncate">{drink.gelo.name}</span>
                            </div>
                          )}
                          {drink.fruits && drink.fruits.length > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-base">🍓</span>
                              <span className="font-semibold uppercase truncate">{drink.fruits.map(f => f.name).join(', ')}</span>
                            </div>
                          )}
                          {qty > 1 && (
                            <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/40">
                              ✨ Serão preparados {qty} copos com a MESMA receita acima
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-end justify-between gap-2">
                        <div className="text-[10px] text-muted-foreground leading-tight">
                          {qty > 1 ? (
                            <>R$ {drink.totalPrice.toFixed(2)} <span className="opacity-70">cada</span></>
                          ) : (
                            <span className="opacity-70">1 copo</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground leading-none">TOTAL</p>
                          <p className="font-extrabold text-primary text-base leading-tight">{formatPrice(drink.totalPrice * qty)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <AnimatePresence>
                  {regularItems.map((item) => (
                    <motion.div
                      key={item.productId}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex gap-4 p-4 bg-card/95 rounded-xl border border-border/70 shadow-sm hover:border-primary/30 transition-colors"
                      data-testid={`cart-item-${item.productId}`}
                    >
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-background/70 border border-border/50 flex-shrink-0">
                        {item.product.imageUrl ? (
                          <img
                            src={ensureImageUrl(item.product.imageUrl)}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'https://placehold.co/400x400?text=Sem+Imagem';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-primary/50">
                            <ImageIcon className="h-8 w-8" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-foreground text-sm line-clamp-2 flex-1">
                            {item.product.name}
                          </h4>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                            onClick={() => removeItem(item.productId)}
                            data-testid={`button-cart-remove-${item.productId}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <p className="text-primary font-semibold mt-1">
                          {formatPrice(Number(item.product.salePrice))}
                        </p>

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-1 bg-muted/70 rounded-lg p-1 border border-border/50">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary hover:bg-primary/20"
                              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                              data-testid={`button-cart-decrease-${item.productId}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-foreground font-medium text-sm">
                              {item.quantity}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary hover:bg-primary/20"
                              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                              data-testid={`button-cart-increase-${item.productId}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="text-foreground font-bold">
                            {formatPrice(Number(item.product.salePrice) * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>

            <div className="border-t border-border/60 bg-card/90 p-6 space-y-4" style={{ paddingBottom: 'max(24px, calc(16px + env(safe-area-inset-bottom, 0px)))' }}>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{formatPrice(subtotal)}</span>
                </div>
                {customDrinksTotal > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-foreground flex items-center gap-1">
                      🍸 Drinks Personalizados
                    </span>
                    <span className="text-foreground">{formatPrice(customDrinksTotal)}</span>
                  </div>
                )}
                {comboDiscount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-primary flex items-center gap-1">
                      <Gift className="h-4 w-4" />
                      Desconto Combo
                    </span>
                    <span className="text-primary font-medium">- {formatPrice(comboDiscount)}</span>
                  </div>
                )}
                {beerDiscount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-green-500 flex items-center gap-1">
                      🍺 Desconto Cerveja ({beerDiscountPercent}%)
                    </span>
                    <span className="text-green-500 font-medium">- {formatPrice(beerDiscount)}</span>
                  </div>
                )}
                {promotionDiscount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-emerald-500 flex items-center gap-1 min-w-0">
                      <Tag className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        Promoção Semanal{promotionMatches[0]?.match?.promo?.name ? `: ${promotionMatches[0].match.promo.name}` : ''}
                      </span>
                    </span>
                    <span className="text-emerald-500 font-medium shrink-0">- {formatPrice(promotionDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-primary/10">
                  <span className="text-muted-foreground">Subtotal do carrinho</span>
                  <span className="font-bold text-2xl text-foreground">
                    {formatPrice(total)}
                  </span>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                ⓘ Frete será calculado e somado na finalização do pedido
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="border-border text-foreground hover:bg-muted/60 hover:text-foreground min-h-[48px]"
                  onClick={handleClearCart}
                  data-testid="button-clear-cart"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  className="flex-1 h-12 min-h-[48px] font-bold text-base"
                  onClick={handleCheckout}
                  data-testid="button-checkout"
                >
                  Finalizar Pedido
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
