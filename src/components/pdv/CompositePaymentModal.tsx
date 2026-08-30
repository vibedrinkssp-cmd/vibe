import { useState, useMemo, useCallback } from 'react';
import { Banknote, CreditCard, QrCode, ArrowLeft, Layers, Plus, Trash2, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import type { PaymentMethod } from '@/shared/schema';

export interface PaymentSplit {
  method: PaymentMethod | 'caderneta';
  amount: number;
  label?: string;
}

interface CompositePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  onConfirm: (splits: PaymentSplit[], notes: string) => void;
  isPending?: boolean;
}

const METHODS: { id: PaymentMethod | 'caderneta'; label: string; icon: any }[] = [
  { id: 'cash', label: 'Dinheiro', icon: Banknote },
  { id: 'pix', label: 'PIX', icon: QrCode },
  { id: 'card_debit', label: 'Débito', icon: CreditCard },
  { id: 'card_credit', label: 'Crédito', icon: CreditCard },
  { id: 'caderneta', label: 'Caderneta (Fiado)', icon: BookOpen },
];

interface SplitEntry {
  id: string;
  method: PaymentMethod | 'caderneta';
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
  return `entry_${++entryCounter}`;
}

export function CompositePaymentModal({
  open,
  onOpenChange,
  total,
  onConfirm,
  isPending,
}: CompositePaymentModalProps) {
  const [entries, setEntries] = useState<SplitEntry[]>([]);

  const resetState = useCallback(() => {
    setEntries([]);
  }, []);

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const addEntry = (methodId: PaymentMethod | 'caderneta') => {
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

  const handleConfirm = () => {
    const splits: PaymentSplit[] = entries.map(e => ({
      method: e.method,
      amount: parseFloat(e.amount || '0') || 0,
      label: getMethodInfo(e.method)?.label || e.method,
    }));
    const noteLines = splits.map(s => `${s.label}: ${formatCurrency(s.amount)}`);
    const notes = `Pagamento Composto: ${noteLines.join(' + ')}`;
    onConfirm(splits, notes);
    resetState();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md mx-2 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Layers className="h-5 w-5 text-primary" />
            Pagamento Composto
          </DialogTitle>
        </DialogHeader>

        <div className="text-center py-2 bg-secondary rounded-lg mb-3">
          <p className="text-muted-foreground text-xs">Total a Pagar</p>
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
            {entries.map((entry, idx) => {
              const info = getMethodInfo(entry.method);
              const Icon = info?.icon || Banknote;
              return (
                <div key={entry.id} className="space-y-1 p-3 rounded-lg border border-border bg-secondary/30">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-primary" />
                      {info?.label || entry.method}
                      {entries.filter(e => e.method === entry.method).length > 1 && (
                        <span className="text-xs text-muted-foreground">
                          #{entries.filter(e => e.method === entry.method).indexOf(entry) + 1}
                        </span>
                      )}
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
        {entries.length >= 2 && (
          <div className={`text-center p-2 rounded-lg ${isBalanced ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
            {isBalanced ? (
              <p className="text-sm font-medium">✅ Valores conferem!</p>
            ) : remaining > 0 ? (
              <p className="text-sm font-medium">
                Faltam {formatCurrency(remaining)} para completar
              </p>
            ) : (
              <p className="text-sm font-medium">
                Excesso de {formatCurrency(Math.abs(remaining))}
              </p>
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
            className="flex-1"
            disabled={entries.length < 2 || !isBalanced || isPending}
            onClick={handleConfirm}
          >
            {isPending ? 'Processando...' : 'Confirmar'}
          </Button>
        </div>

        {entries.length < 2 && entries.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Adicione pelo menos 2 formas de pagamento
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
