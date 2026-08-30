import { useState } from "react";
import { Wallet, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client-safe";
import { formatCurrency } from "../../shared";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (openingCash: number) => void;
  isPending?: boolean;
};

export function OpenCashDialog({ open, onOpenChange, onConfirm, isPending }: Props) {
  const [value, setValue] = useState("");

  // Fetch last closure to get the minimum required opening balance
  const { data: lastClosure } = useQuery({
    queryKey: ['last-cash-closure'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_cash_closures');
      if (error) {
        console.error('Error fetching last closure:', error);
        return null;
      }
      // Get the most recent closure (sorted by closed_at desc)
      const sorted = (data || []).sort((a, b) => 
        new Date(b.closed_at || 0).getTime() - new Date(a.closed_at || 0).getTime()
      );
      return sorted[0] || null;
    },
    enabled: open,
  });

  const openingCash = Number((value || "").replace(",", ".")) || 0;
  const minRequired = lastClosure?.actual_cash || 0;
  const isInsufficient = value !== "" && openingCash < minRequired;
  const canOpen = value !== "" && openingCash >= minRequired;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Abrir Caixa
          </DialogTitle>
          <DialogDescription>
            Digite o valor contado em cédulas e moedas no caixa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {lastClosure && minRequired > 0 && (
            <div className="rounded-lg border p-3 bg-muted/40">
              <p className="text-xs text-muted-foreground">Último fechamento (mínimo esperado)</p>
              <p className="text-2xl font-mono font-bold">{formatCurrency(minRequired)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {lastClosure.closed_at ? new Date(lastClosure.closed_at).toLocaleString('pt-BR') : ''}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="openingCash">Dinheiro no caixa (R$)</Label>
            <Input
              id="openingCash"
              inputMode="decimal"
              placeholder="0,00"
              className="text-lg font-mono"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          {isInsufficient && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Valor Insuficiente</AlertTitle>
              <AlertDescription>
                O valor contado ({formatCurrency(openingCash)}) não pode ser menor que o último fechamento ({formatCurrency(minRequired)}).
                Verifique a contagem ou informe uma sangria antes de abrir o caixa.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm(openingCash);
              setValue("");
            }}
            disabled={isPending || !canOpen}
          >
            {isPending ? "Abrindo..." : "Abrir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
