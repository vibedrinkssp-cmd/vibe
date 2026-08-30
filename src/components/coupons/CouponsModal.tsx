import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUserCoupons } from '@/hooks/use-user-coupons';
import { useCart } from '@/lib/cart';
import { usePublicCategories } from '@/hooks/use-public-data';
import { getCouponTypeInfo, getCouponEligibilityMessage, canApplyCoupon, type UserCoupon } from '@/lib/coupon-utils';
import { Ticket, Loader2, Gift, Sparkles, Check, Wine, Target, Percent, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CouponsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCoupon?: (coupon: UserCoupon) => void;
  selectable?: boolean;
}

function getCouponIcon(couponType: string) {
  switch (couponType) {
    case 'full_discount':
      return <Gift className="h-4 w-4" />;
    case 'caipirinha_dobro':
      return <Wine className="h-4 w-4" />;
    case 'product_specific':
      return <Target className="h-4 w-4" />;
    default:
      return <Percent className="h-4 w-4" />;
  }
}

function getCouponTypeLabel(coupon: UserCoupon): string {
  switch (coupon.coupon_type) {
    case 'full_discount':
      return coupon.max_discount_value 
        ? `100% até R$ ${Number(coupon.max_discount_value).toFixed(0)}`
        : '100% OFF';
    case 'caipirinha_dobro':
      return '2ª Grátis';
    case 'product_specific':
      return `${coupon.discount_percent}% Produto`;
    default:
      return `${coupon.discount_percent}% OFF`;
  }
}

export function CouponsModal({ open, onOpenChange, onSelectCoupon, selectable = false }: CouponsModalProps) {
  const { availableCoupons, usedCoupons, isLoading, isAuthenticated } = useUserCoupons();
  const { items } = useCart();
  const { data: categories = [] } = usePublicCategories();
  
  const categoriesMap = categories.map(c => ({ id: c.id || '', name: c.name || '' }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 shadow-lg">
              <Ticket className="h-5 w-5 text-white" />
            </div>
            <span className="bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent">
              {selectable ? 'Aplicar Cupom' : 'Meus Cupons'}
            </span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(85vh-100px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : !isAuthenticated ? (
            <div className="text-center py-12 space-y-4">
              <Gift className="h-16 w-16 mx-auto text-muted-foreground/30" />
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Faça login para ver seus cupons
                </p>
              </div>
            </div>
          ) : availableCoupons.length === 0 && usedCoupons.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <div className="relative">
                <Gift className="h-16 w-16 mx-auto text-muted-foreground/30" />
                <Sparkles className="h-6 w-6 absolute top-0 right-1/3 text-amber-400 animate-pulse" />
              </div>
              <div className="space-y-2 px-4">
                <p className="font-medium text-foreground">
                  Nenhum cupom disponível no momento
                </p>
                <p className="text-sm text-muted-foreground">
                  Cupons são sorteados para clientes especiais. 
                  Em breve um cupom será disponibilizado para você!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-1">
              {/* Cupons disponíveis */}
              {availableCoupons.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-amber-500" />
                    Disponíveis ({availableCoupons.length})
                  </h3>
                  {availableCoupons.map((coupon) => {
                    const canApply = selectable && canApplyCoupon(coupon, items, 0, categoriesMap);
                    const eligibilityMsg = getCouponEligibilityMessage(coupon, items, categoriesMap);
                    const isNotApplicable = selectable && !canApply;
                    
                    return (
                      <Card 
                        key={coupon.id} 
                        className={`p-4 border-2 border-dashed transition-all ${
                          isNotApplicable 
                            ? 'border-muted bg-muted/30 opacity-60' 
                            : 'border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-yellow-500/10'
                        } ${selectable && canApply ? 'cursor-pointer hover:border-amber-500' : ''}`}
                        onClick={() => {
                          if (selectable && canApply && onSelectCoupon) {
                            onSelectCoupon(coupon);
                            onOpenChange(false);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge className="bg-amber-500 text-white font-mono text-sm flex items-center gap-1">
                                {getCouponIcon(coupon.coupon_type)}
                                {coupon.code}
                              </Badge>
                              <Badge variant="outline" className={isNotApplicable ? '' : 'text-amber-600 border-amber-500'}>
                                {getCouponTypeLabel(coupon)}
                              </Badge>
                            </div>
                            {coupon.description && (
                              <p className="text-sm text-muted-foreground">
                                {coupon.description}
                              </p>
                            )}
                            {selectable && (
                              <div className={`text-xs mt-2 flex items-center gap-1 ${canApply ? 'text-green-500' : 'text-amber-500'}`}>
                                {canApply ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <AlertCircle className="h-3 w-3" />
                                )}
                                {eligibilityMsg}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Recebido em {format(new Date(coupon.assigned_at), "dd 'de' MMM", { locale: ptBR })}
                            </p>
                          </div>
                          {selectable && canApply ? (
                            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">
                              Aplicar
                            </Button>
                          ) : (
                            <div className="shrink-0 text-right">
                              <span className={`text-2xl font-bold ${isNotApplicable ? 'text-muted-foreground' : 'text-amber-600'}`}>
                                {coupon.coupon_type === 'caipirinha_dobro'
                                  ? '2x1'
                                  : coupon.coupon_type === 'fixed_amount'
                                    ? `R$${Number(coupon.max_discount_value || 0).toFixed(0)}`
                                    : `${coupon.discount_percent}%`}
                              </span>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Cupons já utilizados */}
              {usedCoupons.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Já utilizados ({usedCoupons.length})
                  </h3>
                  {usedCoupons.map((coupon) => (
                    <Card 
                      key={coupon.id} 
                      className="p-3 opacity-60 bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm line-through text-muted-foreground">
                              {coupon.code}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              Usado
                            </Badge>
                          </div>
                          {coupon.used_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Utilizado em {format(new Date(coupon.used_at), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                        <span className="text-lg text-muted-foreground line-through">
                          {coupon.discount_percent}%
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
