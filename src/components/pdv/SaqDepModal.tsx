import { useState, useEffect } from 'react';
import { ArrowUpFromLine, Loader2, CheckCircle2, QrCode } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import { PixQRCodeModal } from '@/components/PixQRCodeModal';
import { cashClosedToast } from '@/lib/cash-session-error';

interface SaqDepModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PaymentMethod = 'pix' | 'card_credit' | 'card_debit' | 'vr';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: '💠 PIX' },
  { value: 'card_credit', label: '💳 Crédito' },
  { value: 'card_debit', label: '💳 Débito' },
  { value: 'vr', label: '🍽️ VR' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

export function SaqDepModal({ open, onOpenChange }: SaqDepModalProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState('');
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixReferenceId, setPixReferenceId] = useState('');

  const { data: cashBalance } = useQuery({
    queryKey: ['cash-balance-saqdep'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_cash_balance');
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setAmount(0);
      setPaymentMethod('pix');
      setNotes('');
      setShowPixModal(false);
    }
  }, [open]);

  const fee = amount * 0.5;
  const total = amount + fee;

  const isCashOpen = cashBalance?.session_status === 'open';
  const isValidAmount = amount >= 5 && amount % 5 === 0;
  const hasEnoughCash = (cashBalance?.current_balance || 0) >= amount;
  const canSubmit = isCashOpen && isValidAmount && hasEnoughCash;

  const registerTransaction = async () => {
    const { error } = await supabase.rpc('create_cash_transaction', {
      p_type: 'saque',
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_responsible: 'PDV',
      p_notes: notes || null,
    } as any);
    if (error) throw error;
  };

  const invalidateAndClose = () => {
    queryClient.invalidateQueries({ queryKey: ['cash-balance'] });
    queryClient.invalidateQueries({ queryKey: ['cash-balance-saqdep'] });
    queryClient.invalidateQueries({ queryKey: ['cash-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['saq-dep-summary'] });
    queryClient.invalidateQueries({ queryKey: ['cash_register_sessions'] });
    queryClient.invalidateQueries({ queryKey: ['session_summary'] });
    queryClient.invalidateQueries({ queryKey: ['session-summary'] });
    onOpenChange(false);
  };

  const createTransactionMutation = useMutation({
    mutationFn: registerTransaction,
    onSuccess: () => {
      toast({
        title: 'Saque realizado!',
        description: `${formatCurrency(amount)} + taxa ${formatCurrency(fee)} = ${formatCurrency(total)}`
      });
      invalidateAndClose();
    },
    onError: (error: Error) => {
      toast(cashClosedToast(error, 'Erro na operação'));
    },
  });

  const handleConfirm = () => {
    if (paymentMethod === 'pix') {
      // Gera UUID e abre o modal apenas APÓS o state ter sido aplicado,
      // evitando race onde o PixQRCodeModal lê pixReferenceId vazio.
      const refId = crypto.randomUUID();
      setPixReferenceId(refId);
      // Use microtask para garantir que o state já foi enfileirado antes de abrir
      queueMicrotask(() => setShowPixModal(true));
    } else {
      createTransactionMutation.mutate();
    }
  };

  const handlePixApproved = () => {
    setShowPixModal(false);
    createTransactionMutation.mutate();
  };

  const handlePixCancelled = () => {
    setShowPixModal(false);
  };

  return (
    <>
      <PixQRCodeModal
        open={showPixModal}
        onOpenChange={setShowPixModal}
        amount={total}
        description={`Saque ${formatCurrency(amount)} + taxa ${formatCurrency(fee)}`}
        referenceId={pixReferenceId}
        onPaymentApproved={handlePixApproved}
        onPaymentCancelled={handlePixCancelled}
      />

      <Dialog open={open && !showPixModal} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-5 w-5 text-red-500" />
              Saque
            </DialogTitle>
            <DialogDescription>
              Cliente paga digital, leva dinheiro físico. Taxa: 50% (R$ 5 a cada R$ 10)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Explanation */}
            <div className="bg-secondary/50 p-3 rounded-lg text-sm">
              <p>
                Cliente paga via <span className="text-blue-400">PIX/Cartão/VR</span> e recebe <span className="text-green-400">dinheiro físico</span> do caixa.
              </p>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label>Valor do saque (dinheiro que o cliente leva)</Label>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                step={5}
                min={5}
                placeholder="Ex: 10, 20, 50..."
                className="text-lg"
              />
              {amount > 0 && !isValidAmount && (
                <p className="text-xs text-destructive">
                  Valor deve ser múltiplo de R$ 5 (mínimo R$ 5)
                </p>
              )}
            </div>

            {/* Summary */}
            {amount > 0 && (
              <div className="bg-card border rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Saque (sai do caixa):</span>
                  <span className="text-red-400">- {formatCurrency(amount)}</span>
                </div>
                <div className="flex justify-between text-sm text-amber-400">
                  <span>Taxa (50%):</span>
                  <span>+ {formatCurrency(fee)}</span>
                </div>
                <div className="flex justify-between font-bold text-primary border-t pt-1">
                  <span>Cliente paga (digital):</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            {/* Payment method */}
            <div className="space-y-2">
              <Label>Forma de pagamento do cliente</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((pm) => (
                  <Button
                    key={pm.value}
                    type="button"
                    variant={paymentMethod === pm.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPaymentMethod(pm.value)}
                    className={paymentMethod === pm.value ? 'ring-2 ring-primary' : ''}
                  >
                    {pm.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Cash session status */}
            {!isCashOpen && (
              <div className="text-sm p-3 rounded bg-destructive/10 text-destructive border border-destructive/30 font-medium">
                ⚠️ Caixa fechado. Realize a abertura de caixa antes de operar saques.
              </div>
            )}

            {/* Cash balance */}
            {cashBalance && isCashOpen && (
              <div className={`text-sm p-2 rounded ${hasEnoughCash ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                Saldo disponível no caixa: {formatCurrency(cashBalance.current_balance || 0)}
                {!hasEnoughCash && amount > 0 && <span className="block font-bold">Saldo insuficiente!</span>}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Nome do cliente..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!canSubmit || createTransactionMutation.isPending}
                onClick={handleConfirm}
              >
                {createTransactionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {paymentMethod === 'pix' ? (
                  <>
                    <QrCode className="h-4 w-4 mr-2" />
                    Gerar QR Code
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirmar Saque
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
