import { useState, useMemo, useCallback } from 'react';
import { Banknote, CreditCard, Wallet, ArrowLeft, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import type { PaymentMethod } from '@/shared/schema';

export interface RectifySplit {
  method: PaymentMethod;
  amount: number;
  label: string;
}

interface RectifyPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  orderId: string;
  onConfirm: (splits: RectifySplit[], notes: string) => void;
  isPending?: boolean;
}

const METHODS: { id: PaymentMethod; label: string; icon: any }[] = [
  { id: 'cash', label: 'Dinheiro', icon: Banknote },
  { id: 'card_debit', label: 'Débito', icon: Wallet },
  { id: 'card_credit', label: 'Crédito', icon: CreditCard },
];

interface SplitEntry {
  id: string;
  method: PaymentMethod;
  amount: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function getMethodInfo(id: string) {
  return METHODS.find(m => m.id === id);
}

let entryCounter = 0;
function nextId() {
  return `rect_${++entryCounter}`;
}

export function RectifyPaymentModal({
  open,
  onOpenChange,
  total,
  orderId,
  onConfirm,
  isPending,
}: RectifyPaymentModalProps) {
  const [entries, setEntries] = useState<SplitEntry[]>([]);

  const resetState = useCallback(() => {
    setEntries([]);
  }, []);

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const addEntry = (methodId: PaymentMethod) => {
    setEntries(prev => [...prev, { id: nextId(), method: methodId, amount: '' }]);
  };

  const removeEntry = (entryId: string) => {
    setEntries(prev => prev.filter(e => e.id !== entryId));
  };

  const updateAmount = (entryId: string, value: string) => {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, amount: value } : e));
  };

  const fillRemaining = (entryId: string) => {
    const otherTotal = entries
      .filter(e => e.id !== entryId)
      .reduce((s, e) => s + (parseFloat(e.amount || '0') || 0), 0);
    const rem = Math.max(0, total - otherTotal);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, amount: rem.toFixed(2) } : e));
  };

  const totalAllocated = useMemo(() => {
    return entries.reduce((s, e) => s + (parseFloat(e.amount || '0') || 0), 0);
  }, [entries]);

  const remaining = total - totalAllocated;
  const isBalanced = Math.abs(remaining) < 0.02;
  const hasExcess = remaining < -0.02;
  const canConfirm = isBalanced || hasExcess; // permite excedente, bloqueia só se faltar

  const handleConfirm = () => {
    const splits: RectifySplit[] = entries.map(e => ({
      method: e.method,
      amount: parseFloat(e.amount || '0') || 0,
      label: getMethodInfo(e.method)?.label || e.method,
    }));
    const noteLines = splits.map(s => `${s.label}: ${formatCurrency(s.amount)}`);
    let notes = `⚡ Retificação: ${noteLines.join(' + ')}`;
    if (hasExcess) {
      notes += ` | 💰 ENTRADA EXCEDENTE: ${formatCurrency(Math.abs(remaining))}`;
    }
    onConfirm(splits, notes);
    resetState();
  };

  const shortId = orderId.slice(-6).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md mx-2 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <RefreshCw className="h-5 w-5 text-amber-500" />
            Retificar Pagamento #{shortId}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Redistribua o valor entre as formas de pagamento efetivamente usadas pelo cliente.
          PIX não está disponível pois já é confirmado antes da venda.
        </p>

        <div className="text-center py-2 bg-secondary rounded-lg mb-3">
          <p className="text-muted-foreground text-xs">Total do Pedido</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(total)}</p>
        </div>

        {/* Add payment method buttons */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Adicione as formas de pagamento:
          </p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(m => (
              <Button
                key={m.id}
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 text-xs"
                onClick={() => addEntry(m.id)}
              >
                <Plus className="h-3 w-3" />
                <m.icon className="h-3.5 w-3.5" />
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Payment entries */}
        {entries.length > 0 && (
          <div className="space-y-3 mt-2">
            {entries.map((entry) => {
              const info = getMethodInfo(entry.method);
              const Icon = info?.icon || Banknote;
              return (
                <div key={entry.id} className="space-y-1 p-3 rounded-lg border border-border bg-secondary/30">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-primary" />
                      {info?.label || entry.method}
                    </Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6 px-2 text-primary"
                        onClick={() => fillRemaining(entry.id)}
                      >
                        Restante
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeEntry(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <CurrencyInput
                    value={entry.amount}
                    onChange={(v) => updateAmount(entry.id, String(v))}
                    placeholder="0,00"
                    className="bg-background border-primary/30"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Balance indicator */}
        {entries.length >= 1 && (
          <div className={`text-center p-2 rounded-lg ${
            isBalanced ? 'bg-emerald-500/10 text-emerald-500'
            : hasExcess ? 'bg-amber-500/10 text-amber-500'
            : 'bg-destructive/10 text-destructive'
          }`}>
            {isBalanced ? (
              <p className="text-sm font-medium">✅ Valores conferem!</p>
            ) : remaining > 0 ? (
              <p className="text-sm font-medium">
                Faltam {formatCurrency(remaining)} para completar
              </p>
            ) : (
              <>
                <p className="text-sm font-bold">
                  💰 Excedente de {formatCurrency(Math.abs(remaining))}
                </p>
                <p className="text-[11px] mt-0.5 opacity-90">
                  Será registrado como entrada extra no caixa e marcado no pedido.
                </p>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-amber-600 hover:bg-amber-700"
            disabled={entries.length < 1 || !canConfirm || isPending}
            onClick={handleConfirm}
          >
            {isPending ? 'Processando...' : '⚡ Retificar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
