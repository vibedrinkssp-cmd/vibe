import { useState, useEffect } from "react";
import { Lock, DollarSign, TrendingUp, TrendingDown, Smartphone, CreditCard, Truck, ArrowUpCircle, Package, ShoppingCart, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "../../shared";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expectedCash: number;
  cashSales: number;
  cashPending?: number;
  pixSales: number;
  cardCreditSales: number;
  cardDebitSales: number;
  totalSales: number;
  sangrias: number;
  openingBalance: number;
  cashSupplies: number;
  deliveryFees: number;
  grossProfit: number;
  totalOrders: number;
  counterOrders: number;
  deliveryOrders: number;
  totalSaques?: number;
  saqueFees?: number;
  onConfirm: (actualCash: number) => void;
  isPending?: boolean;
};

function Row({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className={cn("h-3 w-3", color || "text-muted-foreground")} /> {label}
      </span>
      <span className={cn("font-mono font-medium text-xs", color)}>{value}</span>
    </div>
  );
}

export function CloseCashDialog({
  open, onOpenChange, expectedCash, cashSales, cashPending = 0, pixSales, cardCreditSales, cardDebitSales,
  totalSales, sangrias, openingBalance, cashSupplies, deliveryFees, grossProfit,
  totalOrders, counterOrders, deliveryOrders, totalSaques = 0, saqueFees = 0,
  onConfirm, isPending
}: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [actualCashInput, setActualCashInput] = useState("");
  const actualCashNum = Number(actualCashInput.replace(",", ".")) || 0;
  const cashDifference = actualCashNum - expectedCash;
  const hasCashCount = actualCashInput.trim() !== "";
  const canConfirm = confirmText.trim().toUpperCase() === "FECHAR" && hasCashCount;

  // Reset campos ao abrir/fechar
  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setActualCashInput("");
    } else {
      // Pré-preenche com o esperado para agilizar quando bater certo
      setActualCashInput(expectedCash.toFixed(2));
    }
  }, [open, expectedCash]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-destructive" />
            Fechar Caixa
          </DialogTitle>
          <DialogDescription>
            Confira todos os dados financeiros antes de confirmar o fechamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Main expected cash */}
          <div className="rounded-lg border-2 border-primary p-4 bg-primary/5 text-center">
            <p className="text-xs text-muted-foreground">Dinheiro Esperado no Caixa</p>
            <p className="text-2xl font-mono font-bold text-primary">{formatCurrency(expectedCash)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Abertura + Suprimentos + Vendas Dinheiro − Sangrias
            </p>
          </div>

          {cashPending > 0.01 && (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-xs text-amber-200">
                <strong>{formatCurrency(cashPending)}</strong> em dinheiro de delivery (incl. iFood/plataformas) ainda <strong>não foi conferido com o motoboy</strong> e por isso NÃO está incluído no esperado. Confirme a entrada no fechamento do motoboy antes de fechar o caixa.
              </AlertDescription>
            </Alert>
          )}

          {/* Total sales & profit */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-3 bg-muted/40 text-center">
              <p className="text-[10px] text-muted-foreground">Total Vendas</p>
              <p className="text-lg font-mono font-bold text-primary">{formatCurrency(totalSales)}</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/40 text-center">
              <p className="text-[10px] text-muted-foreground">Lucro Bruto</p>
              <p className="text-lg font-mono font-bold text-emerald-500">{formatCurrency(grossProfit)}</p>
            </div>
          </div>

          {/* Orders breakdown */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border p-2 bg-muted/40 text-center">
              <p className="text-[10px] text-muted-foreground">Pedidos</p>
              <p className="text-sm font-mono font-bold">{totalOrders}</p>
            </div>
            <div className="rounded-lg border p-2 bg-muted/40 text-center">
              <p className="text-[10px] text-muted-foreground">Balcão</p>
              <p className="text-sm font-mono font-bold">{counterOrders}</p>
            </div>
            <div className="rounded-lg border p-2 bg-muted/40 text-center">
              <p className="text-[10px] text-muted-foreground">Delivery</p>
              <p className="text-sm font-mono font-bold">{deliveryOrders}</p>
            </div>
          </div>

          <Separator />

          {/* Financial breakdown */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Detalhamento Financeiro</p>
            <Row icon={DollarSign} label="Valor de Abertura" value={formatCurrency(openingBalance)} />
            {cashSupplies > 0 && (
              <Row icon={ArrowUpCircle} label="Suprimentos" value={`+${formatCurrency(cashSupplies)}`} color="text-blue-500" />
            )}
            
            <Separator className="my-1" />
            
            <Row icon={TrendingUp} label="Vendas Dinheiro" value={`+${formatCurrency(cashSales)}`} color="text-green-500" />
            <Row icon={Smartphone} label="Vendas PIX" value={formatCurrency(pixSales)} color="text-indigo-400" />
            <Row icon={CreditCard} label="Cartão Crédito" value={formatCurrency(cardCreditSales)} color="text-blue-400" />
            <Row icon={CreditCard} label="Cartão Débito" value={formatCurrency(cardDebitSales)} color="text-sky-400" />
            
            {deliveryFees > 0 && (
              <Row icon={Truck} label="Taxas de Entrega" value={formatCurrency(deliveryFees)} color="text-orange-400" />
            )}

            {sangrias > 0 && (
              <>
                <Separator className="my-1" />
                <Row icon={TrendingDown} label="Sangrias (Retiradas)" value={`-${formatCurrency(sangrias)}`} color="text-red-500" />
              </>
            )}

            {totalSaques > 0 && (
              <>
                <Separator className="my-1" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Saques</p>
                <Row icon={TrendingDown} label="Total Saques (saiu do caixa)" value={`-${formatCurrency(totalSaques)}`} color="text-orange-500" />
                {saqueFees > 0 && (
                  <Row icon={TrendingUp} label="Lucro com Taxas (digital)" value={`+${formatCurrency(saqueFees)}`} color="text-emerald-500" />
                )}
              </>
            )}
          </div>

          {/* Contagem física do caixa */}
          <div className="rounded-lg border-2 border-amber-500/40 p-3 bg-amber-500/5 space-y-2">
            <Label htmlFor="actual-cash" className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              💵 Contagem Física do Caixa (R$)
            </Label>
            <Input
              id="actual-cash"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={actualCashInput}
              onChange={(e) => setActualCashInput(e.target.value)}
              placeholder="0.00"
              className="font-mono text-lg text-right"
              autoComplete="off"
            />
            {hasCashCount && (
              <div className={cn(
                "text-xs font-mono flex justify-between items-center px-1",
                cashDifference === 0 ? "text-muted-foreground" :
                cashDifference > 0 ? "text-emerald-600 dark:text-emerald-400" :
                "text-red-600 dark:text-red-400"
              )}>
                <span>Diferença:</span>
                <span className="font-bold">
                  {cashDifference > 0 ? "+" : ""}{formatCurrency(cashDifference)}
                  {cashDifference > 0 ? " (sobra)" : cashDifference < 0 ? " (falta)" : " (exato)"}
                </span>
              </div>
            )}
          </div>

          {/* Confirmação digitada — proteção contra clique acidental */}
          <Alert variant="destructive" className="mt-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="text-xs font-medium">
                Você está fechando o caixa com <strong>{totalOrders} pedidos</strong> e <strong>{formatCurrency(totalSales)}</strong> em vendas.
                Esta ação não poderá ser desfeita facilmente.
              </p>
              <Label htmlFor="confirm-close" className="text-xs">
                Digite <strong>FECHAR</strong> para confirmar:
              </Label>
              <Input
                id="confirm-close"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="FECHAR"
                className="font-mono uppercase"
                autoComplete="off"
              />
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(actualCashNum)}
            disabled={isPending || !canConfirm}
          >
            {isPending ? "Fechando..." : "Confirmar Fechamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
