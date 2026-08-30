// Simple modal to manage coupons for a specific customer
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Ticket, Check, X, Percent, Gift, Wine, Target, 
  Loader2, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { useAuth } from '@/lib/auth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  coupon_type: string;
  max_discount_value: number | null;
  expires_at: string | null;
  is_active: boolean;
}

interface UserCoupon {
  id: string;
  coupon_id: string;
  is_used: boolean | null;
}

interface CustomerCouponsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  allCoupons: Coupon[];
  customerCoupons: UserCoupon[];
  onSuccess: () => void;
}

const COUPON_TYPE_CONFIG = {
  percent: { icon: Percent, color: 'bg-amber-500', label: 'Desconto %' },
  full_discount: { icon: Gift, color: 'bg-green-500', label: 'Desconto Total' },
  caipirinha_dobro: { icon: Wine, color: 'bg-orange-500', label: '2x1' },
  product_specific: { icon: Target, color: 'bg-blue-500', label: 'Produto' },
};

export function CustomerCouponsModal({
  open,
  onOpenChange,
  customerId,
  customerName,
  allCoupons,
  customerCoupons,
  onSuccess,
}: CustomerCouponsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [loadingCouponId, setLoadingCouponId] = useState<string | null>(null);

  // Check if customer has a specific coupon
  const getCustomerCoupon = (couponId: string) => {
    return customerCoupons.find(uc => uc.coupon_id === couponId);
  };

  // Assign coupon to customer
  const assignMutation = useMutation({
    mutationFn: async (couponId: string) => {
      if (!user?.id) throw new Error('Admin não autenticado');
      const { error } = await supabase.rpc('assign_coupon_to_user_admin', {
        p_admin_user_id: user.id,
        p_target_user_id: customerId,
        p_coupon_id: couponId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-coupons'] });
      toast({ title: 'Cupom habilitado!' });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao habilitar cupom', 
        description: error.message?.includes('duplicate') ? 'Cliente já possui este cupom' : error.message,
        variant: 'destructive' 
      });
    },
    onSettled: () => setLoadingCouponId(null),
  });

  // Remove coupon from customer using admin RPC
  const removeMutation = useMutation({
    mutationFn: async (userCouponId: string) => {
      if (!user?.id) throw new Error('Admin não autenticado');
      const { error } = await supabase.rpc('delete_user_coupon_admin', { 
        p_admin_user_id: user.id,
        p_user_coupon_id: userCouponId 
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      toast({ title: 'Cupom desabilitado!' });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao desabilitar cupom', 
        description: error.message || 'Tente novamente',
        variant: 'destructive' 
      });
    },
    onSettled: () => setLoadingCouponId(null),
  });

  const handleToggle = (coupon: Coupon) => {
    const existingCoupon = getCustomerCoupon(coupon.id);
    setLoadingCouponId(coupon.id);
    
    if (existingCoupon) {
      // Already has the coupon - remove it (only if not used)
      if (existingCoupon.is_used) {
        toast({ title: 'Cupom já utilizado', description: 'Não é possível remover cupons já usados', variant: 'destructive' });
        setLoadingCouponId(null);
        return;
      }
      removeMutation.mutate(existingCoupon.id);
    } else {
      // Doesn't have - assign it
      assignMutation.mutate(coupon.id);
    }
  };

  const getTypeConfig = (type: string) => {
    return COUPON_TYPE_CONFIG[type as keyof typeof COUPON_TYPE_CONFIG] || COUPON_TYPE_CONFIG.percent;
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Filter active coupons only
  const activeCoupons = allCoupons.filter(c => c.is_active && !isExpired(c.expires_at));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-500" />
            Cupons - {customerName}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">
          Habilite ou desabilite os cupons disponíveis para este cliente.
        </p>

        <ScrollArea className="max-h-[60vh] pr-2">
          {activeCoupons.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum cupom disponível. Crie cupons na aba "Cupons".
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {activeCoupons.map(coupon => {
                const existingCoupon = getCustomerCoupon(coupon.id);
                const isAssigned = !!existingCoupon;
                const isUsed = existingCoupon?.is_used ?? false;
                const isLoading = loadingCouponId === coupon.id;
                const typeConfig = getTypeConfig(coupon.coupon_type);
                const TypeIcon = typeConfig.icon;

                return (
                  <Card 
                    key={coupon.id}
                    className={`transition-all ${isAssigned ? 'ring-1 ring-primary/50 bg-primary/5' : ''} ${isUsed ? 'opacity-60' : ''}`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {/* Icon */}
                        <div className={`p-2 rounded-lg ${typeConfig.color} shrink-0`}>
                          <TypeIcon className="w-4 h-4 text-white" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="font-mono text-xs">
                              {coupon.code}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {coupon.discount_percent}% OFF
                            </Badge>
                            {coupon.max_discount_value && (
                              <span className="text-xs text-muted-foreground">
                                (máx R$ {Number(coupon.max_discount_value).toFixed(0)})
                              </span>
                            )}
                          </div>
                          {coupon.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {coupon.description}
                            </p>
                          )}
                          {coupon.expires_at && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Calendar className="w-3 h-3" />
                              Válido até {format(new Date(coupon.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          )}
                          {isUsed && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              <Check className="w-3 h-3 mr-1" />
                              Já utilizado
                            </Badge>
                          )}
                        </div>

                        {/* Toggle */}
                        <div className="shrink-0 flex items-center gap-2">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          ) : isUsed ? (
                            <Check className="w-5 h-5 text-green-500" />
                          ) : (
                            <Switch
                              checked={isAssigned}
                              onCheckedChange={() => handleToggle(coupon)}
                              disabled={isLoading}
                            />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
