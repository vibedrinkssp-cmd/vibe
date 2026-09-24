import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Wallet, TrendingUp, TrendingDown, AlertTriangle, Clock,
  DollarSign, CreditCard, Smartphone, ArrowDownCircle, ArrowUpCircle, 
  ShoppingCart, Package, Truck, BarChart3, Receipt, Eye, EyeOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCurrency } from '@/pages/admin/shared';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SessionSummary {
  session_id: string | null;
  session_status: string;
  opened_at: string | null;
  opened_by: string | null;
  opening_balance: number;
  cash_sales: number;
  pix_sales: number;
  card_debit_sales: number;
  card_credit_sales: number;
  total_sales: number;
  total_sangrias: number;
  cash_supplies: number;
  saques: number;
  depositos: number;
  fees: number;
  expected_cash: number;
  delivery_fees: number;
  product_cost: number;
  gross_profit: number;
  total_orders: number;
  counter_orders: number;
  delivery_orders: number;
}

interface ClosureData {
  id: string;
  period_start: string | null;
  period_end: string | null;
  closed_at: string | null;
  closed_by: string | null;
  opening_balance: number;
  cash_supplies: number;
  total_sales: number;
  total_cash: number;
  total_pix: number;
  total_card_credit: number;
  total_card_debit: number;
  total_sangrias: number;
  total_orders: number;
  counter_orders_count: number;
  delivery_orders_count: number;
  total_delivery_fees: number;
  expected_cash: number;
  actual_cash: number;
  cash_difference: number;
  gross_profit: number;
  net_profit: number;
  total_product_cost: number;
}

function MetricRow({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground flex items-center gap-1.5">
        <Icon className={cn("h-3 w-3", color || "text-muted-foreground")} /> {label}
      </span>
      <span className={cn("font-mono font-medium", color)}>{value}</span>
    </div>
  );
}

export function HeaderCashMonitor() {
  const [revealed, setRevealed] = useState(false);

  // Auto-hide after 30s
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(false), 30000);
    return () => clearTimeout(t);
  }, [revealed]);

  const mask = (v: string) => (revealed ? v : 'R$ ••••••');
  const fmt = (n: number) => mask(formatCurrency(n));

  const requestReveal = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setRevealed((r) => !r);
  };

  const { data: summary } = useQuery({
    queryKey: ['header-session-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_session_summary');
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      return result as SessionSummary;
    },
    refetchInterval: 30000,
    retry: 0,
  });

  const { data: lastClosure } = useQuery({
    queryKey: ['header-last-closure'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_cash_closures');
      if (error) throw error;
      return (data && data.length > 0) ? data[0] as ClosureData : null;
    },
    refetchInterval: 120000,
    retry: 0,
  });

  const isOpen = summary?.session_status === 'open';
  const expectedCash = summary?.expected_cash || 0;
  const totalSales = summary?.total_sales || 0;
  const totalOrders = summary?.total_orders || 0;
  const isNegative = expectedCash < 0;

  // Closed state — show last closure summary
  if (!isOpen) {
    return (
      <>
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all cursor-pointer">
            <Wallet className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-medium text-amber-400">Caixa Fechado</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="px-4 py-3 bg-gradient-to-r from-amber-500/10 to-transparent border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-bold">Último Fechamento</span>
              </div>
              <button
                onClick={requestReveal}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted text-[10px]"
                title={revealed ? 'Ocultar valores' : 'Mostrar valores'}
              >
                {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {revealed ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {lastClosure?.closed_at && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Fechado {format(new Date(lastClosure.closed_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                {lastClosure.closed_by && ` por ${lastClosure.closed_by}`}
              </div>
            )}
            {lastClosure?.period_start && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Período: {format(new Date(lastClosure.period_start), "dd/MM HH:mm", { locale: ptBR })}
                {lastClosure.period_end && ` → ${format(new Date(lastClosure.period_end), "HH:mm", { locale: ptBR })}`}
              </div>
            )}
          </div>

          {lastClosure ? (
            <>
              {/* Totals grid */}
              <div className="mx-3 mt-3 grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-muted/40 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Vendas</p>
                  <p className="text-sm font-bold font-mono text-primary">{fmt(lastClosure.total_sales || 0)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/40 text-center">
                  <p className="text-[10px] text-muted-foreground">Lucro Bruto</p>
                  <p className="text-sm font-bold font-mono text-emerald-500">{fmt(lastClosure.gross_profit || 0)}</p>
                </div>
              </div>

              <div className="mx-3 mt-2 p-2 rounded-lg bg-muted/40 grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Pedidos</p>
                  <p className="text-xs font-bold font-mono">{lastClosure.total_orders || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Caixa</p>
                  <p className="text-xs font-bold font-mono">{lastClosure.counter_orders_count || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Delivery</p>
                  <p className="text-xs font-bold font-mono">{lastClosure.delivery_orders_count || 0}</p>
                </div>
              </div>

              <Separator className="my-2" />

              <div className="px-4 pb-3 space-y-1.5 text-xs">
                <MetricRow icon={DollarSign} label="Abertura" value={fmt(lastClosure.opening_balance || 0)} />
                <MetricRow icon={TrendingUp} label="Dinheiro" value={revealed ? `+${formatCurrency(lastClosure.total_cash || 0)}` : 'R$ ••••••'} color="text-green-500" />
                <MetricRow icon={Smartphone} label="PIX" value={fmt(lastClosure.total_pix || 0)} color="text-indigo-400" />
                <MetricRow icon={CreditCard} label="Crédito" value={fmt(lastClosure.total_card_credit || 0)} color="text-blue-400" />
                <MetricRow icon={CreditCard} label="Débito" value={fmt(lastClosure.total_card_debit || 0)} color="text-sky-400" />
                {(lastClosure.cash_supplies || 0) > 0 && (
                  <MetricRow icon={ArrowUpCircle} label="Suprimentos" value={revealed ? `+${formatCurrency(lastClosure.cash_supplies)}` : 'R$ ••••••'} color="text-blue-500" />
                )}
                {(lastClosure.total_sangrias || 0) > 0 && (
                  <MetricRow icon={TrendingDown} label="Sangrias" value={revealed ? `-${formatCurrency(lastClosure.total_sangrias)}` : 'R$ ••••••'} color="text-red-500" />
                )}
                {(lastClosure.total_delivery_fees || 0) > 0 && (
                  <MetricRow icon={Truck} label="Tx. Entrega" value={fmt(lastClosure.total_delivery_fees)} color="text-orange-400" />
                )}
                
                <Separator className="my-1" />
                
                <MetricRow icon={Wallet} label="Esperado Caixa" value={fmt(lastClosure.expected_cash || 0)} color="text-primary" />
                <MetricRow icon={Receipt} label="Contado" value={fmt(lastClosure.actual_cash || 0)} />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <BarChart3 className={cn("h-3 w-3", (lastClosure.cash_difference || 0) < 0 ? "text-red-500" : "text-green-500")} /> Diferença
                  </span>
                  <span className={cn("font-mono font-bold", (lastClosure.cash_difference || 0) < 0 ? "text-red-500" : (lastClosure.cash_difference || 0) > 0 ? "text-green-500" : "")}>
                    {fmt(lastClosure.cash_difference || 0)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground">Nenhum fechamento registrado.</div>
          )}
        </PopoverContent>
      </Popover>
      </>
    );
  }

  // Open state — live monitor
  return (
    <>
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer",
            "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
            isNegative
              ? "bg-gradient-to-r from-red-500/15 to-red-500/5 border-red-500/30"
              : "bg-gradient-to-r from-green-500/15 to-green-500/5 border-green-500/30"
          )}
        >
          <div className={cn("p-1 rounded-md", isNegative ? "bg-red-500/20" : "bg-green-500/20")}>
            <Wallet className={cn("h-3.5 w-3.5", isNegative ? "text-red-400" : "text-green-400")} />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-[9px] text-white/80 font-medium">CAIXA</span>
            <span className={cn("text-sm font-bold font-mono tabular-nums", isNegative ? "text-red-400" : "text-green-400")}>
              {fmt(expectedCash)}
            </span>
          </div>
          {totalOrders > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-green-500 text-white border-0">
              {totalOrders}
            </Badge>
          )}
          {isNegative && revealed && <AlertTriangle className="h-3 w-3 text-red-400 animate-pulse" />}
          <span
            role="button"
            tabIndex={0}
            onClick={requestReveal}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') requestReveal(e as any); }}
            className="ml-1 p-1 rounded-md hover:bg-white/10 transition-colors"
            title={revealed ? 'Ocultar valores' : 'Mostrar valores'}
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5 text-white/90" /> : <Eye className="h-3.5 w-3.5 text-white/90" />}
          </span>
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Ao vivo" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">Monitor de Caixa</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-muted-foreground">Ao vivo</span>
            </div>
          </div>
          {summary?.opened_at && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              Aberto {format(new Date(summary.opened_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              {summary.opened_by && ` por ${summary.opened_by}`}
            </div>
          )}
        </div>

        {/* Main balance */}
        <div className={cn(
          "mx-3 mt-3 p-3 rounded-lg text-center",
          isNegative ? "bg-red-500/10 border border-red-500/20" : "bg-green-500/10 border border-green-500/20"
        )}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dinheiro Esperado em Espécie</p>
          <p className={cn("text-2xl font-bold font-mono mt-0.5", isNegative ? "text-red-400" : "text-green-400")}>
            {fmt(expectedCash)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Abertura + Suprimentos + Vendas Dinheiro − Sangrias − Saques</p>
        </div>

        {/* Totals grid */}
        <div className="mx-3 mt-2 grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-[10px] text-muted-foreground">Total Vendas</p>
            <p className="text-sm font-bold font-mono text-primary">{fmt(totalSales)}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40 text-center">
            <p className="text-[10px] text-muted-foreground">Lucro Bruto</p>
            <p className="text-sm font-bold font-mono text-emerald-500">{fmt(summary?.gross_profit || 0)}</p>
          </div>
        </div>

        {/* Orders breakdown */}
        <div className="mx-3 mt-2 p-2 rounded-lg bg-muted/40 grid grid-cols-3 gap-1 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Pedidos</p>
            <p className="text-xs font-bold font-mono">{totalOrders}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Caixa</p>
            <p className="text-xs font-bold font-mono">{summary?.counter_orders || 0}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Delivery</p>
            <p className="text-xs font-bold font-mono">{summary?.delivery_orders || 0}</p>
          </div>
        </div>

        <Separator className="my-2" />

        {/* Detailed breakdown */}
        <div className="px-4 pb-3 space-y-1.5 text-xs">
          <div className="flex justify-end mb-1">
            <button
              onClick={requestReveal}
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted text-[10px]"
              title={revealed ? 'Ocultar valores' : 'Mostrar valores'}
            >
              {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {revealed ? 'Ocultar' : 'Mostrar valores'}
            </button>
          </div>
          <MetricRow icon={DollarSign} label="Abertura" value={fmt(summary?.opening_balance || 0)} />
          <MetricRow icon={TrendingUp} label="Vendas Dinheiro" value={revealed ? `+${formatCurrency(summary?.cash_sales || 0)}` : 'R$ ••••••'} color="text-green-500" />
          <MetricRow icon={Smartphone} label="PIX" value={fmt(summary?.pix_sales || 0)} color="text-indigo-400" />
          <MetricRow icon={CreditCard} label="Cartão Crédito" value={fmt(summary?.card_credit_sales || 0)} color="text-blue-400" />
          <MetricRow icon={CreditCard} label="Cartão Débito" value={fmt(summary?.card_debit_sales || 0)} color="text-sky-400" />

          {(summary?.cash_supplies || 0) > 0 && (
            <MetricRow icon={ArrowUpCircle} label="Suprimentos" value={revealed ? `+${formatCurrency(summary.cash_supplies)}` : 'R$ ••••••'} color="text-blue-500" />
          )}

          {(summary?.total_sangrias || 0) > 0 && (
            <MetricRow icon={TrendingDown} label="Sangrias" value={revealed ? `-${formatCurrency(summary.total_sangrias)}` : 'R$ ••••••'} color="text-red-500" />
          )}

          {(summary?.saques || 0) > 0 && (
            <MetricRow icon={ArrowDownCircle} label="Saques" value={revealed ? `-${formatCurrency(summary.saques)}` : 'R$ ••••••'} color="text-red-400" />
          )}

          {(summary?.delivery_fees || 0) > 0 && (
            <MetricRow icon={Truck} label="Tx. Entrega" value={fmt(summary.delivery_fees)} color="text-orange-400" />
          )}
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
}
