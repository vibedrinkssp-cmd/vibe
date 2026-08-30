// Modal simples para criar/renovar cupom de um cliente específico
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, Percent, DollarSign, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { useAuth } from '@/lib/auth';

export interface SimpleCouponInitial {
  userCouponId: string;
  code: string;
  discountType: 'percent' | 'fixed_amount';
  value: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  /** Quando presente, modal renova o cupom existente (botão muda). */
  initial?: SimpleCouponInitial | null;
  onSuccess?: () => void;
}

export function SimpleCouponModal({ open, onOpenChange, customerId, customerName, initial, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isRenew = !!initial;

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed_amount'>('percent');
  const [valueStr, setValueStr] = useState('');

  useEffect(() => {
    if (open) {
      setCode(initial?.code || '');
      setDiscountType(initial?.discountType || 'percent');
      setValueStr(initial?.value ? String(initial.value) : '');
    }
  }, [open, initial]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Admin não autenticado');
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) throw new Error('Digite o nome do cupom');
      const num = Number(valueStr.replace(',', '.'));
      if (!num || num <= 0) throw new Error('Informe um valor válido');
      if (discountType === 'percent' && num > 100) throw new Error('Percentual deve ser entre 1 e 100');

      if (isRenew && initial) {
        const { error } = await supabase.rpc('renew_user_coupon_admin', {
          p_admin_user_id: user.id,
          p_user_coupon_id: initial.userCouponId,
          p_code: cleanCode,
          p_discount_type: discountType,
          p_discount_value: num,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('create_simple_coupon_admin', {
          p_admin_user_id: user.id,
          p_target_user_id: customerId,
          p_code: cleanCode,
          p_discount_type: discountType,
          p_discount_value: num,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['user-coupons'] });
      queryClient.invalidateQueries({ queryKey: ['all-coupons-admin'] });
      toast({ title: isRenew ? 'Cupom renovado!' : 'Cupom criado e liberado!' });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: 'Erro ao salvar cupom', description: e.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRenew ? <RefreshCw className="w-5 h-5 text-primary" /> : <Sparkles className="w-5 h-5 text-amber-500" />}
            {isRenew ? 'Renovar cupom' : 'Criar cupom'} — {customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">NOME DO CUPOM</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EX: AMIGO10"
              className="mt-1 font-mono uppercase tracking-wider text-lg"
              autoFocus
              maxLength={32}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Sempre em CAIXA ALTA. Uso único pelo cliente.</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">TIPO DE DESCONTO</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={discountType === 'fixed_amount' ? 'default' : 'outline'}
                className="h-14 flex-col gap-0.5"
                onClick={() => setDiscountType('fixed_amount')}
              >
                <DollarSign className="w-5 h-5" />
                <span className="text-xs">Reais (R$)</span>
              </Button>
              <Button
                type="button"
                variant={discountType === 'percent' ? 'default' : 'outline'}
                className="h-14 flex-col gap-0.5"
                onClick={() => setDiscountType('percent')}
              >
                <Percent className="w-5 h-5" />
                <span className="text-xs">Percentual</span>
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              {discountType === 'percent' ? 'PERCENTUAL (1 a 100)' : 'VALOR EM REAIS'}
            </Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                {discountType === 'percent' ? '%' : 'R$'}
              </span>
              <Input
                type="number"
                inputMode="decimal"
                step={discountType === 'percent' ? 1 : 0.01}
                min={0}
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
                placeholder={discountType === 'percent' ? '10' : '5,00'}
                className="pl-10 text-lg font-bold"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            <Ticket className="w-4 h-4" />
            {saveMutation.isPending ? 'Salvando...' : (isRenew ? 'Renovar cupom' : 'Criar cupom')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
