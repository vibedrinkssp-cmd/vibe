import { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BookOpen, Loader2, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client-safe';
import { registerCadernetaLegacyEntry } from '@/lib/caderneta';
import { CadernetaCustomerPicker } from './CadernetaCustomerPicker';
import { prepareCadernetaOrder } from './caderneta-order-utils';
import { parseLooseCigarettePackId, stripLooseCigaretteMarker } from './loose-cigarette-utils';
import { parseNumeric } from '@/lib/format-utils';
import type { Product, CustomDrink } from '@/shared/schema';

interface CartItem {
  product: Product;
  quantity: number;
}

interface CadernetaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  customDrinks?: CustomDrink[];
  total: number;
  onSuccess: () => void;
}

type Mode = 'sale' | 'legacy';

interface LegacyForm {
  description: string;
  amount: string;
  date: string;
}

const EMPTY_LEGACY: LegacyForm = { description: '', amount: '', date: '' };

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** Data (yyyy-mm-dd) -> ISO ao meio-dia local, para não cair no dia anterior por fuso. */
function legacyDateToIso(date: string): string | null {
  return date ? new Date(`${date}T12:00:00`).toISOString() : null;
}

export function CadernetaModal({ open, onOpenChange, cart, customDrinks = [], total, onSuccess }: CadernetaModalProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('sale');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [legacy, setLegacy] = useState<LegacyForm>(EMPTY_LEGACY);

  const preparedOrder = useMemo(
    () => prepareCadernetaOrder({ cart, customDrinks, total }),
    [cart, customDrinks, total]
  );
  const hasItems = preparedOrder.items.length > 0;
  const legacyAmount = parseFloat(legacy.amount.replace(',', '.'));

  useEffect(() => {
    if (open) {
      setCustomer(null);
      setLegacy(EMPTY_LEGACY);
      setMode(hasItems ? 'sale' : 'legacy');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const finishSuccess = (title: string) => {
    queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
    queryClient.invalidateQueries({ queryKey: ['caderneta-customers-pdv'] });
    toast({ title });
    onOpenChange(false);
    onSuccess();
  };

  const reportError = (title: string, error: unknown) => {
    toast({
      title,
      description: error instanceof Error ? error.message : 'Falha inesperada ao registrar o fiado.',
      variant: 'destructive',
    });
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // ATOMIC: all items in a single transaction (rollback if any fails)
      const looseCigConsumptions: Array<{ packId: string; quantity: number }> = [];
      const itemsPayload = preparedOrder.items.map(item => {
        const packId = parseLooseCigarettePackId(item.productName);
        if (packId) looseCigConsumptions.push({ packId, quantity: item.quantity });
        const cleanName = packId ? stripLooseCigaretteMarker(item.productName) : item.productName;
        return {
          product_id: packId ? null : (item.productId || null),
          product_name: cleanName,
          quantity: item.quantity,
          unit_price: parseNumeric(item.unitPrice),
          total_price: parseNumeric(item.totalPrice),
          notes: item.notes || null,
        };
      });
      const { error } = await supabase.rpc('create_caderneta_entries_batch', {
        p_customer_id: customer?.id,
        p_items: itemsPayload,
        p_salesperson: null,
      } as any);
      if (error) throw new Error(error.message);

      // Decrement open_packs for each loose cigarette item (no order_id in caderneta flow)
      for (const lc of looseCigConsumptions) {
        try {
          const { error: rpcErr } = await supabase.rpc('sell_loose_cigarette', {
            p_pack_id: lc.packId,
            p_quantity: lc.quantity,
          });
          if (rpcErr) console.error('[Caderneta] sell_loose_cigarette failed', lc, rpcErr);
        } catch (err) {
          console.error('[Caderneta] sell_loose_cigarette exception', lc, err);
        }
      }
    },
    onSuccess: () => finishSuccess('📒 Lançamento na caderneta registrado!'),
    onError: (error: unknown) => reportError('Erro ao registrar na caderneta', error),
  });

  // Fiado antigo: só registra a dívida, não vincula produto nem baixa estoque
  const legacyMutation = useMutation({
    mutationFn: () => registerCadernetaLegacyEntry(null, {
      customerId: customer!.id,
      description: legacy.description.trim(),
      totalAmount: legacyAmount,
      entryDate: legacyDateToIso(legacy.date),
    }),
    onSuccess: () => finishSuccess('📒 Fiado antigo registrado (estoque não alterado)'),
    onError: (error: unknown) => reportError('Erro ao registrar fiado antigo', error),
  });

  const isLegacy = mode === 'legacy';
  const isPending = confirmMutation.isPending || legacyMutation.isPending;
  const legacyValid = legacy.description.trim().length > 0 && Number.isFinite(legacyAmount) && legacyAmount > 0;
  const canConfirm = !!customer && !isPending && (isLegacy ? legacyValid : hasItems);

  const handleConfirm = () => {
    if (!customer) {
      toast({ title: 'Selecione ou cadastre um cliente', variant: 'destructive' });
      return;
    }
    if (isLegacy && !legacyValid) {
      toast({ title: 'Informe a descrição e o valor do fiado', variant: 'destructive' });
      return;
    }
    if (isLegacy) legacyMutation.mutate();
    else confirmMutation.mutate();
  };

  const modeButton = (value: Mode, label: string) => (
    <Button
      type="button"
      size="sm"
      variant={mode === value ? 'default' : 'ghost'}
      className="flex-1"
      onClick={() => setMode(value)}
      data-testid={`caderneta-mode-${value}`}
    >
      {label}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md mx-2 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-violet-400" />
            Caderneta (Fiado)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {modeButton('sale', 'Venda atual')}
            {modeButton('legacy', 'Fiado antigo')}
          </div>

          {isLegacy ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Para fiados já anotados no caderno. Registra só o valor devido e <strong>não altera o estoque</strong>.
              </p>
              <Input
                placeholder="Descrição (ex.: Fiado do caderno)"
                value={legacy.description}
                onChange={e => setLegacy({ ...legacy, description: e.target.value })}
                maxLength={240}
                data-testid="input-legacy-description"
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Valor (R$)"
                  inputMode="decimal"
                  value={legacy.amount}
                  onChange={e => setLegacy({ ...legacy, amount: e.target.value })}
                  data-testid="input-legacy-amount"
                />
                <Input
                  type="date"
                  value={legacy.date}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setLegacy({ ...legacy, date: e.target.value })}
                  title="Data em que o fiado foi pego (opcional)"
                  data-testid="input-legacy-date"
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-3 bg-secondary rounded-lg">
              <p className="text-muted-foreground text-xs">Total a lançar</p>
              <p className="text-3xl font-bold text-violet-400">{formatCurrency(preparedOrder.summary.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{preparedOrder.summary.totalItems} item(s)</p>
              {preparedOrder.summary.discount > 0 && (
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <p>Subtotal original: {formatCurrency(preparedOrder.summary.subtotal)}</p>
                  <p>Desconto aplicado: {formatCurrency(preparedOrder.summary.discount)}</p>
                </div>
              )}
            </div>
          )}

          <CadernetaCustomerPicker open={open} selectedId={customer?.id ?? ''} onSelect={setCustomer} />

          {!isLegacy && hasItems && (
            <div className="max-h-32 overflow-auto border rounded-lg p-2 space-y-1">
              {preparedOrder.items.map((item, index) => (
                <div key={`${item.productId ?? 'custom'}-${index}`} className="space-y-1 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
                  <div className="flex justify-between text-xs gap-2">
                    <span className="flex-1 break-words">{item.quantity}x {item.productName}</span>
                    <span className="font-medium ml-2 whitespace-nowrap">{formatCurrency(item.totalPrice)}</span>
                  </div>
                  {item.notes && (
                    <p className="text-[11px] text-muted-foreground whitespace-pre-line break-words">{item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full py-5 bg-violet-600 hover:bg-violet-700"
            disabled={!canConfirm}
            onClick={handleConfirm}
            data-testid="button-caderneta-confirm"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : isLegacy ? (
              <History className="h-4 w-4 mr-2" />
            ) : (
              <BookOpen className="h-4 w-4 mr-2" />
            )}
            {isPending ? 'Registrando...' : `${isLegacy ? 'Registrar fiado antigo para' : 'Lançar para'} ${customer?.name || '...'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
