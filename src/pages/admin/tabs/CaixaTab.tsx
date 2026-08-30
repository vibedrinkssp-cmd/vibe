import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CashRegisterRow } from "./caixa/useCashRegisterRows";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye, Lock, Plus, RefreshCw, RotateCcw, Wallet, AlertCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client-safe";
import { formatCurrency } from "../shared";

import { CloseCashDialog } from "./caixa/CloseCashDialog";
import { OpenCashDialog } from "./caixa/OpenCashDialog";
import { useCashRegisterRows } from "./caixa/useCashRegisterRows";
import { CashSessionDetailsDialog } from "./caixa/CashSessionDetailsDialog";

export function CaixaTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { rows, openSession, sessionSummary, isLoading, refetch } = useCashRegisterRows();

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [detailsRow, setDetailsRow] = useState<CashRegisterRow | null>(null);

  const openMutation = useMutation({
    mutationFn: async (openingCash: number) => {
      const { data, error } = await supabase.rpc("open_cash_register", {
        p_opening_balance: openingCash,
        p_opened_by: "Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["cash_register_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["session_summary"] });
      await refetch();
      toast({ title: "Caixa aberto com sucesso!" });
      setOpenDialog(false);
    },
    onError: (e: any) => toast({ title: "Erro ao abrir caixa", description: e?.message || String(e), variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: async (actualCash: number) => {
      if (!openSession?.session.id || !sessionSummary) {
        throw new Error("Nenhuma sessão aberta");
      }

      const expectedCash = Number(sessionSummary.expected_cash) || 0;
      const actual = Number(actualCash) || 0;
      const difference = actual - expectedCash;

      // 1. Fechar a sessão
      const { error: closeError } = await supabase.rpc("close_cash_register", {
        p_session_id: openSession.session.id,
        p_closed_by: "Admin",
      });
      if (closeError) throw closeError;

      // 2. Criar registro de fechamento com contagem física real
      const { error: closureError } = await supabase.rpc("create_cash_closure", {
        p_period_start: sessionSummary.opened_at,
        p_period_end: new Date().toISOString(),
        p_shift_type: "regular",
        p_opening_balance: sessionSummary.opening_balance,
        p_expected_cash: expectedCash,
        p_actual_cash: actual,
        p_cash_difference: difference,
        p_total_sales: sessionSummary.total_sales,
        p_total_pix: sessionSummary.pix_sales,
        p_total_card_credit: sessionSummary.card_credit_sales,
        p_total_card_debit: sessionSummary.card_debit_sales,
        p_total_cash: sessionSummary.cash_sales,
        p_gross_profit: sessionSummary.gross_profit,
        p_net_profit: sessionSummary.gross_profit - sessionSummary.total_sangrias,
        p_total_sangrias: sessionSummary.total_sangrias,
        p_total_orders: sessionSummary.total_orders,
        p_closed_by: "Admin",
        p_total_delivery_fees: sessionSummary.delivery_fees,
        p_total_product_cost: sessionSummary.product_cost,
        p_real_gross_profit: sessionSummary.gross_profit,
        p_cash_supplies: sessionSummary.cash_supplies,
        p_counter_orders_count: sessionSummary.counter_orders,
        p_delivery_orders_count: sessionSummary.delivery_orders,
        p_session_id: openSession.session.id,
      });
      if (closureError) throw closureError;

      // 3. Atualizar current_balance com a contagem física real
      const { error: updateError } = await supabase
        .from("cash_register_sessions")
        .update({ current_balance: actual })
        .eq("id", openSession.session.id);

      if (updateError) throw updateError;

      // 4. Auditoria de divergência (se houver)
      if (Math.abs(difference) > 0.01) {
        await supabase.from("cash_register_audit").insert({
          session_id: openSession.session.id,
          action: "cash_difference_recorded",
          responsible: "Admin",
          notes: `Esperado: R$ ${expectedCash.toFixed(2)} | Contado: R$ ${actual.toFixed(2)} | Diferença: R$ ${difference.toFixed(2)}`,
        });
      }
    },
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries();
      toast({ title: "Caixa fechado com sucesso!" });
      setCloseDialog(false);
    },
    onError: (e: any) => toast({ title: "Erro ao fechar caixa", description: e?.message || String(e), variant: "destructive" }),
  });

  const expectedCash = useMemo(() => sessionSummary?.expected_cash || 0, [sessionSummary]);
  const cashPending = useMemo(() => Number((sessionSummary as any)?.cash_pending) || 0, [sessionSummary]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl text-primary">Caixa</h2>
          <p className="text-sm text-muted-foreground">
            Abertura cria uma linha; fechamento finaliza a mesma linha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {!openSession && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                if (!confirm("Reabrir o último caixa fechado? O fechamento associado será removido e os indicadores do dia voltam a aparecer.")) return;
                try {
                  const { data, error } = await supabase.rpc('reopen_last_session', { p_responsible: 'Admin' });
                  if (error) throw error;
                  toast({ title: "Caixa reaberto", description: "Indicadores restaurados." });
                  await refetch();
                  queryClient.invalidateQueries();
                } catch (e: any) {
                  toast({ title: "Erro ao reabrir", description: e?.message || "Falha desconhecida", variant: "destructive" });
                }
              }}
              title="Recuperar última sessão fechada por engano"
            >
              <RotateCcw className="w-4 h-4" />
              Reabrir último
            </Button>
          )}
          <Button
            className="gap-2"
            onClick={() => setOpenDialog(true)}
            disabled={!!openSession}
            title={openSession ? "Já existe um caixa aberto" : "Abrir caixa"}
          >
            <Plus className="w-4 h-4" />
            Abrir Caixa
          </Button>
        </div>
      </div>

      {openSession && cashPending > 0.01 && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-200 text-sm">
                💵 {formatCurrency(cashPending)} em DINHEIRO de delivery aguardando conferência do motoboy
              </p>
              <p className="text-xs text-amber-200/80 mt-1">
                Esses valores (incluindo iFood/plataformas em espécie) só serão somados ao caixa físico após a confirmação de RECEBIMENTO no fechamento do motoboy ou no card do pedido.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Histórico
          </CardTitle>
          <CardDescription>
            {openSession
              ? "Existe um caixa aberto agora — feche na própria linha."
              : "Nenhum caixa aberto no momento."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">Nenhum registro.</div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Abertura</TableHead>
                    <TableHead>Fechamento</TableHead>
                    <TableHead className="text-right">Valor Inicial</TableHead>
                    <TableHead className="text-right">Dinheiro</TableHead>
                    <TableHead className="text-right">Saques</TableHead>
                    <TableHead className="text-right">Lucro Saques</TableHead>
                    <TableHead className="text-right">Sangrias</TableHead>
                    <TableHead className="text-right">Esperado</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const isOpen = r.session.status === "open";
                    return (
                      <TableRow key={r.session.id} className={isOpen ? "bg-primary/5 border-primary/20" : undefined}>
                        <TableCell>
                          {isOpen ? (
                            <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                              ABERTO
                            </Badge>
                          ) : (
                            <Badge variant="secondary">FECHADO</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(r.session.opened_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {r.session.closed_at
                            ? format(new Date(r.session.closed_at), "dd/MM HH:mm", { locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(r.session.opening_balance)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(r.metrics.cash)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-destructive">
                          {r.metrics.total_saques > 0 ? `-${formatCurrency(r.metrics.total_saques)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-500">
                          {r.metrics.saque_fees > 0 ? `+${formatCurrency(r.metrics.saque_fees)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-destructive">
                          {r.metrics.sangrias > 0 ? `-${formatCurrency(r.metrics.sangrias)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(r.metrics.expected_cash)}
                        </TableCell>
                        <TableCell className="text-right">
                          {isOpen ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-2"
                              onClick={() => setCloseDialog(true)}
                            >
                              <Lock className="w-4 h-4" />
                              Fechar
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => setDetailsRow(r)}
                            >
                              <Eye className="w-4 h-4" />
                              Detalhes
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <OpenCashDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        onConfirm={(openingCash) => {
          if (openSession) {
            toast({ title: "Já existe um caixa aberto", variant: "destructive" });
            return;
          }
          openMutation.mutate(openingCash);
        }}
        isPending={openMutation.isPending}
      />

      <CloseCashDialog
        open={closeDialog}
        onOpenChange={setCloseDialog}
        expectedCash={expectedCash}
        cashSales={Number(sessionSummary?.cash_sales) || 0}
        cashPending={cashPending}
        pixSales={Number(sessionSummary?.pix_sales) || 0}
        cardCreditSales={Number(sessionSummary?.card_credit_sales) || 0}
        cardDebitSales={Number(sessionSummary?.card_debit_sales) || 0}
        totalSales={Number(sessionSummary?.total_sales) || 0}
        sangrias={Number(sessionSummary?.total_sangrias) || 0}
        openingBalance={Number(sessionSummary?.opening_balance) || 0}
        cashSupplies={Number(sessionSummary?.cash_supplies) || 0}
        deliveryFees={Number(sessionSummary?.delivery_fees) || 0}
        grossProfit={Number(sessionSummary?.gross_profit) || 0}
        totalOrders={Number(sessionSummary?.total_orders) || 0}
        counterOrders={Number(sessionSummary?.counter_orders) || 0}
        deliveryOrders={Number(sessionSummary?.delivery_orders) || 0}
        totalSaques={Number((sessionSummary as any)?.saques) || 0}
        saqueFees={Number((sessionSummary as any)?.fees) || 0}
        onConfirm={(actualCash) => closeMutation.mutate(actualCash)}
        isPending={closeMutation.isPending}
      />

      <CashSessionDetailsDialog
        row={detailsRow}
        open={!!detailsRow}
        onOpenChange={(v) => { if (!v) setDetailsRow(null); }}
      />
    </div>
  );
}
