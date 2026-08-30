import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Banknote, QrCode, Loader2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import { PixQRCodeModal } from '@/components/PixQRCodeModal';

type PaymentOption = 'cash' | 'pix' | 'card_credit' | 'card_debit';

interface ChangePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  motoboyId: string;
  currentPaymentMethod: string;
  orderTotal: number;
  orderShortId: string;
  onChanged: (newMethod: string) => void;
}

const PAYMENT_OPTIONS: { value: PaymentOption; label: string; icon: typeof CreditCard; color: string }[] = [
  { value: 'cash', label: 'Dinheiro', icon: Banknote, color: 'bg-green-600 hover:bg-green-700' },
  { value: 'pix', label: 'PIX', icon: QrCode, color: 'bg-cyan-600 hover:bg-cyan-700' },
  { value: 'card_credit', label: 'Crédito', icon: CreditCard, color: 'bg-purple-600 hover:bg-purple-700' },
  { value: 'card_debit', label: 'Débito', icon: CreditCard, color: 'bg-blue-600 hover:bg-blue-700' },
];

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'PIX',
  card_credit: 'Crédito',
  card_debit: 'Débito',
  credit_card: 'Crédito',
  debit_card: 'Débito',
  card_pos: 'Cartão POS',
};

export function ChangePaymentModal({
  open,
  onOpenChange,
  orderId,
  motoboyId,
  currentPaymentMethod,
  orderTotal,
  orderShortId,
  onChanged,
}: ChangePaymentModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);

  const handleSelectPayment = async (method: PaymentOption) => {
    if (method === currentPaymentMethod) {
      toast({ title: 'Já é a forma de pagamento atual' });
      return;
    }

    if (method === 'pix') {
      // Open PIX QR code modal on motoboy's phone
      setShowPixModal(true);
      return;
    }

    // For cash, credit, debit — just update the DB
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('change_order_payment_motoboy', {
        p_motoboy_id: motoboyId,
        p_order_id: orderId,
        p_payment_method: method as any,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });

      const label = PAYMENT_LABELS[method] || method;
      toast({ title: `✅ Pagamento alterado para ${label}` });
      onChanged(method);
      onOpenChange(false);
    } catch (err) {
      console.error('[ChangePayment] error:', err);
      toast({ title: 'Erro ao alterar pagamento', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePixApproved = async (mpPaymentId?: string) => {
    // PIX was paid — update the order
    try {
      const { error } = await supabase.rpc('change_order_payment_motoboy', {
        p_motoboy_id: motoboyId,
        p_order_id: orderId,
        p_payment_method: 'pix' as any,
      });
      if (error) throw error;

      // Also mark payment as confirmed with the MP payment ID
      await supabase
        .from('orders')
        .update({
          payment_confirmed: true,
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: 'motoboy_pix',
          mp_payment_id: mpPaymentId || null,
        })
        .eq('id', orderId);

      queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });

      toast({ title: '✅ PIX confirmado!' });
      onChanged('pix');
      onOpenChange(false);
    } catch (err) {
      console.error('[ChangePayment] PIX confirm error:', err);
      toast({ title: 'Erro ao confirmar PIX', variant: 'destructive' });
    }
  };

  return (
    <>
      <Dialog open={open && !showPixModal} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Alterar Pagamento — #{orderShortId}
            </DialogTitle>
            <DialogDescription>
              Selecione a nova forma de pagamento do cliente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Current method */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <span className="text-sm text-muted-foreground">Atual:</span>
              <Badge variant="outline" className="font-medium">
                {PAYMENT_LABELS[currentPaymentMethod] || currentPaymentMethod}
              </Badge>
            </div>

            {/* Value */}
            <div className="text-center">
              <span className="text-sm text-muted-foreground">Valor: </span>
              <span className="text-lg font-bold text-foreground">
                R$ {orderTotal.toFixed(2)}
              </span>
            </div>

            {/* Payment options */}
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map(({ value, label, icon: Icon, color }) => {
                const isCurrent = value === currentPaymentMethod;
                return (
                  <Button
                    key={value}
                    className={`flex-col h-20 gap-1 text-white ${isCurrent ? 'opacity-40 cursor-not-allowed' : color}`}
                    disabled={isSubmitting || isCurrent}
                    onClick={() => handleSelectPayment(value)}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Icon className="h-6 w-6" />
                    )}
                    <span className="text-sm font-semibold">{label}</span>
                    {isCurrent && <span className="text-[10px]">atual</span>}
                  </Button>
                );
              })}
            </div>

            {/* Info about what happens next */}
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg space-y-1">
              <p className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> <strong>PIX:</strong> QR Code na tela para cobrar</p>
              <p className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> <strong>Cartão:</strong> Cobre na maquininha + foto</p>
              <p className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> <strong>Dinheiro:</strong> Receba e finalize</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIX QR Code Modal */}
      <PixQRCodeModal
        open={showPixModal}
        onOpenChange={(v) => {
          setShowPixModal(v);
          if (!v) {
            // If PIX modal closed without payment, re-show change modal
          }
        }}
        amount={orderTotal}
        description={`Pedido #${orderShortId} - Pagamento na entrega`}
        orderId={orderId}
        onPaymentApproved={handlePixApproved}
        onPaymentCancelled={() => setShowPixModal(false)}
        onPaymentExpired={() => setShowPixModal(false)}
        isDelivery={true}
      />
    </>
  );
}
