import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Minus, Trash2, Package, Check, DollarSign, ArrowLeftRight, Store, BookOpen, Wine, Beer, Lock, Cigarette, PlusCircle, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Product, CustomDrink } from '@/shared/schema';
import type { PdvBeerDiscountResult } from '@/lib/beer-discount';

interface CartItem {
  product: Product;
  quantity: number;
}

interface NotesAndDiscountInputsProps {
  notes: string;
  manualDiscount: string;
  manualSurcharge: string;
  onNoteChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDiscountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSurchargeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface PosCouponLite {
  id: string;
  code: string;
  discount_percent: number;
}

interface CartContentProps {
  cart: CartItem[];
  customDrinks?: CustomDrink[];
  customDrinksTotal?: number;
  notes: string;
  manualDiscount: string;
  manualSurcharge: string;
  discountValue: number;
  surchargeValue: number;
  subtotal: number;
  total: number;
  beerDiscount?: PdvBeerDiscountResult;
  promotionDiscount?: number;
  promotionLabel?: string;
  appliedCoupon?: PosCouponLite | null;
  couponDiscount?: number;
  onApplyCoupon?: (code: string) => Promise<boolean>;
  onRemoveCoupon?: () => void;
  onNoteChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDiscountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSurchargeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFromCart: (productId: string) => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveCustomDrink?: (drinkId: string) => void;
  onFinalizeSale: () => void;
  onSaqDepClick?: () => void;
  onPlatformClick?: () => void;
  onCadernetaClick?: () => void;
  onCigaretteClick?: () => void;
}

function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num);
}

export const NotesAndDiscountInputs = memo(({
  notes,
  manualDiscount,
  manualSurcharge,
  onNoteChange,
  onDiscountChange,
  onSurchargeChange,
}: NotesAndDiscountInputsProps) => {
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pendingValue, setPendingValue] = useState('');
  const { toast } = useToast();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleDiscountAttempt = useCallback((value: number) => {
    const strValue = String(value);
    // Se já está desbloqueado, propaga livremente o valor enquanto digita
    if (isUnlocked) {
      const syntheticEvent = { target: { value: strValue } } as React.ChangeEvent<HTMLInputElement>;
      onDiscountChange(syntheticEvent);
      return;
    }
    // Bloqueado: apenas armazena o valor pendente — abre PIN após pausa de 800ms
    setPendingValue(strValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value > 0) {
      debounceRef.current = setTimeout(() => {
        setPinDialogOpen(true);
      }, 800);
    }
  }, [isUnlocked, onDiscountChange]);

  const handleVerifyPin = useCallback(async (pinValue: string) => {
    if (pinValue.length !== 4) return;
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-discount-pin', {
        body: { pin: pinValue },
      });
      if (error || !data?.success) {
        toast({ title: 'PIN incorreto', variant: 'destructive' });
        setPin('');
        return;
      }
      setIsUnlocked(true);
      setPinDialogOpen(false);
      setPin('');
      toast({ title: 'Desconto autorizado!' });
      const syntheticEvent = { target: { value: pendingValue } } as React.ChangeEvent<HTMLInputElement>;
      onDiscountChange(syntheticEvent);
    } catch {
      toast({ title: 'Erro ao verificar PIN', variant: 'destructive' });
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  }, [pendingValue, onDiscountChange, toast]);

  const handleClearDiscount = useCallback(() => {
    setIsUnlocked(false);
    const syntheticEvent = { target: { value: '' } } as React.ChangeEvent<HTMLInputElement>;
    onDiscountChange(syntheticEvent);
  }, [onDiscountChange]);

  return (
    <>
      <Input
        placeholder="Observações..."
        value={notes}
        onChange={onNoteChange}
        enterKeyHint="done"
        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
        className="bg-secondary border-primary/30 text-sm"
        data-testid="input-notes"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1">
          {isUnlocked ? (
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleClearDiscount}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <CurrencyInput
            value={manualDiscount}
            onChange={handleDiscountAttempt}
            placeholder="Desconto"
            className="flex-1 min-w-0"
            data-testid="input-discount"
          />
        </div>
        <div className="flex items-center gap-1">
          <PlusCircle className="h-4 w-4 text-orange-400 flex-shrink-0" />
          <CurrencyInput
            value={manualSurcharge}
            onChange={(numericValue) => {
              const syntheticEvent = { target: { value: String(numericValue) } } as React.ChangeEvent<HTMLInputElement>;
              onSurchargeChange(syntheticEvent);
            }}
            placeholder="Acréscimo"
            className="flex-1 min-w-0"
            data-testid="input-surcharge"
          />
        </div>
      </div>

      <Dialog open={pinDialogOpen} onOpenChange={(open) => { setPinDialogOpen(open); if (!open) { setPin(''); } }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">PIN de Desconto</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-muted-foreground text-center">
              Digite o PIN de 4 dígitos para autorizar o desconto de {formatCurrency(parseFloat(pendingValue) || 0)}
            </p>
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={(value) => {
                setPin(value);
                if (value.length === 4) {
                  handleVerifyPin(value);
                }
              }}
              disabled={isVerifying}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
            {isVerifying && <p className="text-xs text-muted-foreground">Verificando...</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

NotesAndDiscountInputs.displayName = 'NotesAndDiscountInputs';

interface CouponInputProps {
  appliedCoupon?: PosCouponLite | null;
  couponDiscount: number;
  onApplyCoupon: (code: string) => Promise<boolean>;
  onRemoveCoupon?: () => void;
}

const CouponInput = memo(({ appliedCoupon, couponDiscount, onApplyCoupon, onRemoveCoupon }: CouponInputProps) => {
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);

  const handleApply = useCallback(async () => {
    if (!code.trim() || applying) return;
    setApplying(true);
    try {
      const ok = await onApplyCoupon(code.trim());
      if (ok) setCode('');
    } finally {
      setApplying(false);
    }
  }, [code, applying, onApplyCoupon]);

  if (appliedCoupon) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Ticket className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="font-mono font-bold text-xs text-emerald-600 truncate">{appliedCoupon.code}</span>
          <span className="text-[10px] text-emerald-600/80">({appliedCoupon.discount_percent}% • -{formatCurrency(couponDiscount)})</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onRemoveCoupon}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Ticket className="h-4 w-4 text-primary flex-shrink-0" />
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Cupom"
        enterKeyHint="done"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleApply(); } }}
        className="flex-1 min-w-0 h-8 text-sm font-mono uppercase"
        data-testid="input-coupon"
      />
      <Button size="sm" className="h-8 shrink-0" disabled={!code.trim() || applying} onClick={() => void handleApply()}>
        {applying ? '...' : 'Aplicar'}
      </Button>
    </div>
  );
});

CouponInput.displayName = 'CouponInput';

export const CartContent = memo(({
  cart,
  customDrinks = [],
  customDrinksTotal = 0,
  notes,
  manualDiscount,
  manualSurcharge,
  discountValue,
  surchargeValue,
  subtotal,
  total,
  beerDiscount,
  promotionDiscount = 0,
  promotionLabel,
  appliedCoupon,
  couponDiscount = 0,
  onApplyCoupon,
  onRemoveCoupon,
  onNoteChange,
  onDiscountChange,
  onSurchargeChange,
  onRemoveFromCart,
  onUpdateQuantity,
  onRemoveCustomDrink,
  onFinalizeSale,
  onSaqDepClick,
  onPlatformClick,
  onCadernetaClick,
  onCigaretteClick,
}: CartContentProps) => {
  const hasItems = cart.length > 0 || customDrinks.length > 0;
  const actionButtonsCount = [onCadernetaClick, onSaqDepClick, onCigaretteClick].filter(Boolean).length;
  const gridColsClass = actionButtonsCount >= 3 ? 'grid-cols-3' : actionButtonsCount === 2 ? 'grid-cols-2' : 'grid-cols-1';


  return (
    <div className="flex flex-col h-full">
      {/* Action buttons, totals and inputs at the top */}
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <NotesAndDiscountInputs
          notes={notes}
          manualDiscount={manualDiscount}
          manualSurcharge={manualSurcharge}
          onNoteChange={onNoteChange}
          onDiscountChange={onDiscountChange}
          onSurchargeChange={onSurchargeChange}
        />

        {onApplyCoupon && (
          <CouponInput
            appliedCoupon={appliedCoupon}
            couponDiscount={couponDiscount}
            onApplyCoupon={onApplyCoupon}
            onRemoveCoupon={onRemoveCoupon}
          />
        )}



        <div className="flex justify-between text-sm">
          <span>Subtotal:</span>
          <span className="font-bold">{formatCurrency(subtotal)}</span>
        </div>

        {customDrinksTotal > 0 && (
          <div className="flex justify-between text-sm text-primary">
            <span>Drinks:</span>
            <span className="font-bold">+{formatCurrency(customDrinksTotal)}</span>
          </div>
        )}

        {beerDiscount && beerDiscount.totalDiscount > 0 && (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
              <Beer className="h-3 w-3" />
              <span>Desc. Cerveja:</span>
            </div>
            {beerDiscount.lines.map(l => (
              <div key={l.productId} className="flex justify-between text-xs text-emerald-500 pl-4">
                <span className="truncate max-w-[60%]">{l.qty}x {l.productName} ({l.percent}%)</span>
                <span>-{formatCurrency(l.discount)}</span>
              </div>
            ))}
          </div>
        )}

        {surchargeValue > 0 && (
          <div className="flex justify-between text-orange-400 text-sm">
            <span>Acréscimo:</span>
            <span>+{formatCurrency(surchargeValue)}</span>
          </div>
        )}

        {promotionDiscount > 0 && (
          <div className="flex justify-between text-emerald-500 text-sm">
            <span className="truncate max-w-[65%]">🎁 {promotionLabel || 'Promoção Semanal'}:</span>
            <span>-{formatCurrency(promotionDiscount)}</span>
          </div>
        )}

        {discountValue > 0 && (
          <div className="flex justify-between text-emerald-500 text-sm">
            <span>Desconto Total:</span>
            <span>-{formatCurrency(discountValue)}</span>
          </div>
        )}

        <div className="flex justify-between text-lg font-bold text-primary">
          <span>Total:</span>
          <span>{formatCurrency(total)}</span>
        </div>

        <Button
          className="w-full py-4"
          disabled={!hasItems}
          onClick={onFinalizeSale}
          data-testid="button-finalize-sale"
        >
          <Check className="h-4 w-4 mr-2" />
          Finalizar Venda
        </Button>

        {actionButtonsCount > 0 && (
          <div className={`grid ${gridColsClass} gap-2`}>
            {onCadernetaClick && (
              <button
                type="button"
                onClick={onCadernetaClick}
                disabled={!hasItems}
                data-testid="button-caderneta"
                className="h-14 rounded-lg bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white flex flex-col items-center justify-center gap-0.5 shadow-md shadow-violet-900/40 transition"
              >
                <BookOpen className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase leading-none">Fiado</span>
              </button>
            )}
            {onCigaretteClick && (
              <button
                type="button"
                onClick={onCigaretteClick}
                data-testid="button-loose-cigarettes"
                className="h-14 rounded-lg bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black flex flex-col items-center justify-center gap-0.5 shadow-md shadow-yellow-900/40 transition"
              >
                <Cigarette className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase leading-none">Cig. Solto</span>
              </button>
            )}
            {onSaqDepClick && (
              <button
                type="button"
                onClick={onSaqDepClick}
                data-testid="button-saq-dep"
                className="h-14 rounded-lg bg-amber-600 hover:bg-amber-500 active:scale-95 text-white flex flex-col items-center justify-center gap-0.5 shadow-md shadow-amber-900/40 transition"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase leading-none">SAQ</span>
              </button>
            )}
          </div>
        )}

      </div>

      {/* Cart items list - scrollable. Tapping here also dismisses the mobile keyboard
          without closing the Sheet, so the operator can keep adding products. */}
      <div
        className="flex-1 overflow-auto p-3"
        onPointerDown={() => {
          const el = document.activeElement as HTMLElement | null;
          if (el && typeof el.blur === 'function' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
            el.blur();
          }
        }}
      >
        {!hasItems ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-center">
            <div>
              <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Carrinho vazio</p>
              <p className="text-xs">Toque em um produto</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Produtos regulares */}
            {cart.map((item) => (
              <div key={item.product.id} className="bg-secondary rounded-lg p-2" data-testid={`cart-item-${item.product.id}`}>
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-xs flex-1 line-clamp-1">{item.product.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => onRemoveFromCart(item.product.id)}
                    data-testid={`button-remove-${item.product.id}`}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onUpdateQuantity(item.product.id, -1)}
                      data-testid={`button-decrease-${item.product.id}`}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="font-medium w-6 text-center text-sm">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onUpdateQuantity(item.product.id, 1)}
                      data-testid={`button-increase-${item.product.id}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="font-bold text-primary text-sm">
                    {formatCurrency(Number(item.product.salePrice) * item.quantity)}
                  </span>
                </div>
              </div>
            ))}

            {/* Custom drinks */}
            {customDrinks.length > 0 && (
              <>
                {cart.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Wine className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Drinks Montados</span>
                  </div>
                )}
                {customDrinks.map((drink) => {
                  const displayName = drink.name.startsWith('[LOOSE_CIG:')
                    ? drink.name.slice(drink.name.indexOf(']') + 1).trim()
                    : drink.name;
                  const safeUnit = Number(drink.totalPrice) || 0;
                  const safeQty = Math.max(1, Number(drink.quantity) || 1);
                  const lineTotal = safeUnit * safeQty;
                  return (
                  <div key={drink.id} className="bg-primary/5 border border-primary/20 rounded-lg p-2" data-testid={`cart-custom-${drink.id}`} data-unit-price={safeUnit} data-qty={safeQty}>
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-xs line-clamp-1">{displayName}</span>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{drink.description}</p>
                      </div>
                      {onRemoveCustomDrink && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          onClick={() => onRemoveCustomDrink(drink.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">
                        {safeQty}x {formatCurrency(safeUnit)}
                      </span>
                      <span className="font-bold text-primary text-sm">
                        {formatCurrency(lineTotal)}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

CartContent.displayName = 'CartContent';
