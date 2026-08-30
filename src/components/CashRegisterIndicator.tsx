// Cash Register Real-time Indicator Component
import { useState, useEffect, forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Wallet, 
  AlertCircle,
  RefreshCw,
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Smartphone
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCurrency } from '@/pages/admin/shared';
import { cn } from '@/lib/utils';
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
  saques_pix?: number;
  saques_card_credit?: number;
  saques_card_debit?: number;
  saques_vr?: number;
  expected_cash: number;
  delivery_fees: number;
  product_cost: number;
  gross_profit: number;
  total_orders: number;
  counter_orders: number;
  delivery_orders: number;
}

export const CashRegisterIndicator = forwardRef<HTMLDivElement>((_, ref) => {
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('cashRegister_expanded');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('cashRegister_expanded', String(isExpanded));
  }, [isExpanded]);

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ['cash-register-indicator-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_session_summary');
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      return result as SessionSummary;
    },
    refetchInterval: 30000,
    retry: 0,
  });

  const isSessionOpen = summary?.session_status === 'open';
  const expectedCash = summary?.expected_cash || 0;
  const hasNegativeBalance = expectedCash < 0;

  if (isLoading) {
    return (
      <Card ref={ref} className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 flex items-center justify-center">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!isSessionOpen) {
    return (
      <Card ref={ref} className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Wallet className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status do Caixa</p>
                <p className="font-medium text-amber-500">Caixa Fechado</p>
              </div>
            </div>
            <Badge variant="outline" className="border-amber-500/50 text-amber-500">
              Fechado
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Vá para a aba <strong>Caixa</strong> para abrir uma nova sessão
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card ref={ref} className={cn(
      "border-primary/20 bg-gradient-to-br from-primary/5 to-transparent",
      hasNegativeBalance && "border-red-500/30 from-red-500/5"
    )}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              Caixa em Tempo Real
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className={cn(
                "font-mono font-bold text-lg",
                hasNegativeBalance ? "text-red-500" : "text-primary"
              )}>
                {formatCurrency(expectedCash)}
              </span>
              <Badge variant="outline" className="border-green-500/50 text-green-500">
                Aberto
              </Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
                <RefreshCw className="w-3 h-3" />
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          {summary?.opened_at && (
            <p className="text-xs text-muted-foreground">
              Aberto em {format(new Date(summary.opened_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              {summary.opened_by && ` por ${summary.opened_by}`}
            </p>
          )}
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            <div className={cn(
              "p-3 rounded-lg text-center",
              hasNegativeBalance ? "bg-red-500/10" : "bg-primary/10"
            )}>
              <p className="text-xs text-muted-foreground mb-1">Dinheiro em Espécie</p>
              <p className={cn(
                "text-3xl font-bold font-mono",
                hasNegativeBalance ? "text-red-500" : "text-primary"
              )}>
                {formatCurrency(expectedCash)}
              </p>
              {hasNegativeBalance && (
                <div className="flex items-center justify-center gap-1 mt-1 text-red-500">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-xs">Saldo negativo</span>
                </div>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Abertura</p>
                  <p className="font-medium">{formatCurrency(summary?.opening_balance || 0)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Vendas (Dinheiro)</p>
                  <p className="font-medium text-green-500">+{formatCurrency(summary?.cash_sales || 0)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-400" />
                <div>
                  <p className="text-xs text-muted-foreground">PIX</p>
                  <p className="font-medium text-indigo-400">{formatCurrency(summary?.pix_sales || 0)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-400" />
                <div>
                  <p className="text-xs text-muted-foreground">Cartões</p>
                  <p className="font-medium text-blue-400">{formatCurrency((summary?.card_debit_sales || 0) + (summary?.card_credit_sales || 0))}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <ArrowDownCircle className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Sangrias</p>
                  <p className="font-medium text-red-500">-{formatCurrency(summary?.total_sangrias || 0)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Suprimentos</p>
                  <p className="font-medium text-blue-500">+{formatCurrency(summary?.cash_supplies || 0)}</p>
                </div>
              </div>
            </div>

            {(summary?.saques || 0) > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowDownCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-muted-foreground">Saques (saiu do caixa)</span>
                  </div>
                  <span className="font-medium text-red-400">-{formatCurrency(summary?.saques || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-muted-foreground">Taxas de saque (50%)</span>
                  </div>
                  <span className="font-medium text-amber-400">+{formatCurrency(summary?.fees || 0)}</span>
                </div>
                {/* Breakdown por método */}
                {((summary?.saques_pix || 0) + (summary?.saques_card_credit || 0) + (summary?.saques_card_debit || 0) + (summary?.saques_vr || 0)) > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] pl-2">
                    {(summary?.saques_pix || 0) > 0 && (
                      <div className="flex justify-between bg-indigo-500/10 px-2 py-1 rounded">
                        <span>💠 PIX</span><span className="font-mono text-indigo-300">{formatCurrency(summary!.saques_pix!)}</span>
                      </div>
                    )}
                    {(summary?.saques_card_credit || 0) > 0 && (
                      <div className="flex justify-between bg-blue-500/10 px-2 py-1 rounded">
                        <span>💳 Crédito</span><span className="font-mono text-blue-300">{formatCurrency(summary!.saques_card_credit!)}</span>
                      </div>
                    )}
                    {(summary?.saques_card_debit || 0) > 0 && (
                      <div className="flex justify-between bg-cyan-500/10 px-2 py-1 rounded">
                        <span>💳 Débito</span><span className="font-mono text-cyan-300">{formatCurrency(summary!.saques_card_debit!)}</span>
                      </div>
                    )}
                    {(summary?.saques_vr || 0) > 0 && (
                      <div className="flex justify-between bg-amber-500/10 px-2 py-1 rounded">
                        <span>🍽️ VR</span><span className="font-mono text-amber-300">{formatCurrency(summary!.saques_vr!)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Orders breakdown */}
            <div className="p-2 rounded bg-muted/50 text-xs text-muted-foreground grid grid-cols-3 text-center">
              <span>Total: {summary?.total_orders || 0}</span>
              <span>Balcão: {summary?.counter_orders || 0}</span>
              <span>Delivery: {summary?.delivery_orders || 0}</span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
});

CashRegisterIndicator.displayName = 'CashRegisterIndicator';
