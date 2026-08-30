import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "../../shared";
import type { CashRegisterRow } from "./useCashRegisterRows";

interface Props {
  row: CashRegisterRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function Line({ label, value, destructive, bold }: { label: string; value: string; destructive?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-mono ${destructive ? "text-destructive" : ""} ${bold ? "font-bold" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function CashSessionDetailsDialog({ row, open, onOpenChange }: Props) {
  if (!row) return null;

  const { session: s, metrics: m } = row;
  const isOpen = s.status === "open";

  const totalSales = m.cash + m.pix + m.card_credit + m.card_debit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Detalhes do Caixa
          </DialogTitle>
        </DialogHeader>

        {/* Período */}
        <div className="space-y-1">
          <h4 className="font-semibold text-sm">Período</h4>
          <Line label="Abertura" value={format(new Date(s.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} />
          {s.closed_at && (
            <Line label="Fechamento" value={format(new Date(s.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} />
          )}
          {s.opened_by && <Line label="Aberto por" value={s.opened_by} />}
          {s.closed_by && <Line label="Fechado por" value={s.closed_by} />}
          <Line label="Status" value={isOpen ? "ABERTO" : "FECHADO"} bold />
        </div>

        <Separator />

        {/* Vendas por método */}
        <div className="space-y-1">
          <h4 className="font-semibold text-sm">Vendas por Método</h4>
          <Line label="Dinheiro" value={formatCurrency(m.cash)} />
          <Line label="PIX" value={formatCurrency(m.pix)} />
          <Line label="Cartão Crédito" value={formatCurrency(m.card_credit)} />
          <Line label="Cartão Débito" value={formatCurrency(m.card_debit)} />
          <Separator className="my-1" />
          <Line label="Total Vendas" value={formatCurrency(totalSales)} bold />
        </div>

        <Separator />

        {/* Pedidos */}
        <div className="space-y-1">
          <h4 className="font-semibold text-sm">Pedidos</h4>
          <Line label="Total de Pedidos" value={String(m.orders_count)} />
          <Line label="Balcão" value={String(m.counter_orders)} />
          <Line label="Delivery" value={String(m.delivery_orders)} />
          <Line label="Taxas de Entrega" value={formatCurrency(m.delivery_fees)} />
        </div>

        <Separator />

        {/* Fluxo de Caixa */}
        <div className="space-y-1">
          <h4 className="font-semibold text-sm">Fluxo de Caixa</h4>
          <Line label="Saldo Inicial" value={formatCurrency(s.opening_balance)} />
          <Line label="Suprimentos" value={formatCurrency(m.cash_supplies)} />
          <Line label="Sangrias" value={m.sangrias > 0 ? `-${formatCurrency(m.sangrias)}` : formatCurrency(0)} destructive={m.sangrias > 0} />
          <Line label="Caixa Esperado" value={formatCurrency(m.expected_cash)} bold />
          {m.actual_cash !== null && (
            <>
              <Line label="Caixa Contado" value={formatCurrency(m.actual_cash)} />
              <Line
                label="Diferença"
                value={`${(m.difference || 0) >= 0 ? "+" : ""}${formatCurrency(m.difference || 0)}`}
                destructive={(m.difference || 0) < 0}
                bold
              />
            </>
          )}
        </div>

        {/* Saques */}
        {m.total_saques > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Saques</h4>
              <Line label="Total Saques (saiu do caixa)" value={`-${formatCurrency(m.total_saques)}`} destructive />
              {m.saque_fees > 0 && (
                <Line label="Lucro com Taxas (digital)" value={`+${formatCurrency(m.saque_fees)}`} bold />
              )}
            </div>
          </>
        )}

        <Separator />

        {/* Lucro */}
        <div className="space-y-1">
          <h4 className="font-semibold text-sm">Resultado</h4>
          <Line label="Lucro Bruto" value={formatCurrency(m.gross_profit)} bold />
        </div>
      </DialogContent>
    </Dialog>
  );
}
