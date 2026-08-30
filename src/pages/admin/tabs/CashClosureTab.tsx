// Cash Closure Tab Component - Fechamento de Caixa com Lucro Real
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  DollarSign, 
  Download, 
  CreditCard,
  Banknote,
  Smartphone,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  CalendarDays,
  Package,
  Truck,
  Percent
} from 'lucide-react';
import { format, startOfDay, endOfDay, subHours, startOfToday, startOfYesterday, endOfYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCurrency } from '../shared';
import { cn } from '@/lib/utils';

interface CashClosure {
  id: string;
  closed_at: string | null;
  shift_type: string | null;
  opening_balance: number | null;
  expected_cash: number | null;
  actual_cash: number | null;
  cash_difference: number | null;
  total_sales: number | null;
  total_pix: number | null;
  total_card_credit: number | null;
  total_card_debit: number | null;
  total_cash: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  total_sangrias: number | null;
  total_orders: number | null;
  notes: string | null;
  closed_by: string | null;
  period_start: string | null;
  period_end: string | null;
  // New fields
  cash_supplies?: number | null;
  total_delivery_fees?: number | null;
  total_product_cost?: number | null;
  real_gross_profit?: number | null;
  counter_orders_count?: number | null;
  delivery_orders_count?: number | null;
}

interface OrderForClosure {
  id: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  order_type: string;
  delivery_fee: number | null;
}

interface SangriaForClosure {
  id: string;
  amount: number;
  type: string;
  created_at: string;
}

interface RealProfitData {
  total_revenue: number;
  total_product_cost: number;
  gross_profit: number;
  total_delivery_fees: number;
  counter_orders_count: number;
  delivery_orders_count: number;
  total_orders_count: number;
}

type QuickPeriod = 'today' | 'yesterday' | 'last12h' | 'custom';

export function CashClosureTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  
  // Closure form state - simplified
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [cashSupplies, setCashSupplies] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  const [closedBy, setClosedBy] = useState('');

  // Calculate period dates based on quick selection
  const { periodStart, periodEnd } = useMemo(() => {
    const now = new Date();
    
    switch (quickPeriod) {
      case 'today':
        return { periodStart: startOfToday(), periodEnd: now };
      case 'yesterday':
        return { periodStart: startOfYesterday(), periodEnd: endOfYesterday() };
      case 'last12h':
        return { periodStart: subHours(now, 12), periodEnd: now };
      case 'custom':
        return {
          periodStart: customStart ? new Date(customStart) : subHours(now, 12),
          periodEnd: customEnd ? new Date(customEnd) : now
        };
      default:
        return { periodStart: startOfToday(), periodEnd: now };
    }
  }, [quickPeriod, customStart, customEnd]);

  // Fetch closures history using RPC to bypass RLS
  const { data: closures = [], isLoading } = useQuery({
    queryKey: ['cash-closures'],
    queryFn: async () => {
      // Use RPC function to bypass RLS
      const { data, error } = await supabase.rpc('get_all_cash_closures');

      if (error) {
        console.error('[CashClosure] Error fetching closures:', error);
        throw error;
      }
      return (data || []) as CashClosure[];
    },
  });

  // Fetch orders for current period - use RPC to bypass RLS
  const { data: periodOrders = [], isLoading: isLoadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['orders-for-closure', periodStart.toISOString(), periodEnd.toISOString()],
    queryFn: async () => {
      console.log('[CashClosure] Fetching orders between:', periodStart.toISOString(), 'and', periodEnd.toISOString());
      
      // Use RPC function that brings order + customer/address consistently
      const { data, error } = await supabase.rpc('get_admin_orders_complete');

      if (error) {
        console.error('[CashClosure] Error fetching orders:', error);
        throw error;
      }
      
      // Filter in JS by period and status
      const filtered = (data || []).filter(order => {
        if (order.status === 'pending' || order.status === 'cancelled') return false;
        if (!order.created_at) return false;
        
        const orderDate = new Date(order.created_at);
        return orderDate >= periodStart && orderDate <= periodEnd;
      });
      
      console.log('[CashClosure] Total orders:', data?.length, '| Filtered:', filtered.length);
      return filtered as OrderForClosure[];
    },
    enabled: isClosureModalOpen,
  });

  // Fetch sangrias for current period
  const { data: periodSangrias = [] } = useQuery({
    queryKey: ['sangrias-for-closure', periodStart.toISOString(), periodEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sangrias')
        .select('id, amount, type, created_at')
        .is('closure_id', null);

      if (error) throw error;
      
      // Filter in JS
      return (data || []).filter(s => {
        if (!s.created_at) return false;
        const sDate = new Date(s.created_at);
        return sDate >= periodStart && sDate <= periodEnd;
      }) as SangriaForClosure[];
    },
    enabled: isClosureModalOpen,
  });

  // Fetch real profit from RPC
  const { data: realProfitData } = useQuery({
    queryKey: ['real-profit-closure', periodStart.toISOString(), periodEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calculate_real_profit', {
        p_start: periodStart.toISOString(),
        p_end: periodEnd.toISOString()
      });

      if (error) {
        console.error('[CashClosure] Error calculating real profit:', error);
        return null;
      }

      const result = Array.isArray(data) ? data[0] : data;
      return result as RealProfitData | null;
    },
    enabled: isClosureModalOpen,
  });

  // Calculate period totals with REAL profit
  const periodTotals = useMemo(() => {
    const totals = {
      totalSales: 0,
      totalPix: 0,
      totalCardCredit: 0,
      totalCardDebit: 0,
      totalCash: 0,
      totalDeliveryFees: 0,
      totalOrders: periodOrders.length,
      counterOrders: 0,
      deliveryOrders: 0,
      totalSangrias: 0,
      totalProductCost: realProfitData?.total_product_cost || 0,
      grossProfit: realProfitData?.gross_profit || 0,
    };

    periodOrders.forEach(order => {
      const amount = Number(order.total);
      totals.totalSales += amount;
      totals.totalDeliveryFees += Number(order.delivery_fee || 0);
      
      if (order.order_type === 'counter') totals.counterOrders++;
      if (order.order_type === 'delivery') totals.deliveryOrders++;
      
      switch (order.payment_method) {
        case 'pix':
        case 'pix_pos':
          totals.totalPix += amount;
          break;
        case 'card_credit':
          totals.totalCardCredit += amount;
          break;
        case 'card_debit':
        case 'card_pos':
          totals.totalCardDebit += amount;
          break;
        case 'cash':
          totals.totalCash += amount;
          break;
      }
    });

    periodSangrias.forEach(sangria => {
      totals.totalSangrias += Number(sangria.amount);
    });

    // Fallback if RPC data not available
    if (!realProfitData) {
      totals.totalProductCost = totals.totalSales * 0.6;
      totals.grossProfit = totals.totalSales * 0.4;
    }

    return totals;
  }, [periodOrders, periodSangrias, realProfitData]);

  // Cash calculations
  const openingBalanceNumber = parseFloat(openingBalance.replace(',', '.')) || 0;
  const cashSuppliesNumber = parseFloat(cashSupplies.replace(',', '.')) || 0;
  const expectedCash = openingBalanceNumber + periodTotals.totalCash - periodTotals.totalSangrias + cashSuppliesNumber;
  const actualCashNumber = parseFloat(actualCash.replace(',', '.')) || 0;
  const cashDifference = actualCashNumber - expectedCash;
  const netProfit = periodTotals.grossProfit - periodTotals.totalSangrias;
  
  // Profit margin
  const profitMarginPercent = periodTotals.totalSales > 0 
    ? ((periodTotals.grossProfit / periodTotals.totalSales) * 100).toFixed(1)
    : '0';

  // Create closure mutation using RPC
  const createClosure = useMutation({
    mutationFn: async () => {
      if (!closedBy.trim()) throw new Error('Informe o responsável pelo fechamento');

      // Use RPC function to bypass RLS
      const { data: closureId, error: closureError } = await supabase.rpc('create_cash_closure', {
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
        p_shift_type: quickPeriod,
        p_opening_balance: openingBalanceNumber,
        p_expected_cash: expectedCash,
        p_actual_cash: actualCashNumber,
        p_cash_difference: cashDifference,
        p_total_sales: periodTotals.totalSales,
        p_total_pix: periodTotals.totalPix,
        p_total_card_credit: periodTotals.totalCardCredit,
        p_total_card_debit: periodTotals.totalCardDebit,
        p_total_cash: periodTotals.totalCash,
        p_gross_profit: periodTotals.grossProfit,
        p_net_profit: netProfit,
        p_total_sangrias: periodTotals.totalSangrias,
        p_total_orders: periodTotals.totalOrders,
        p_notes: closureNotes || undefined,
        p_closed_by: closedBy,
        p_total_delivery_fees: periodTotals.totalDeliveryFees,
        p_total_product_cost: periodTotals.totalProductCost,
        p_real_gross_profit: periodTotals.grossProfit,
        p_cash_supplies: cashSuppliesNumber,
        p_counter_orders_count: periodTotals.counterOrders,
        p_delivery_orders_count: periodTotals.deliveryOrders,
      });

      if (closureError) throw closureError;

      // Link sangrias to this closure
      if (periodSangrias.length > 0 && closureId) {
        const sangriaIds = periodSangrias.map(s => s.id);
        await supabase
          .from('sangrias')
          .update({ closure_id: closureId })
          .in('id', sangriaIds);
      }

      return closureId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-closures'] });
      queryClient.invalidateQueries({ queryKey: ['sangrias'] });
      toast({ title: 'Fechamento de caixa realizado com sucesso!' });
      resetForm();
      setIsClosureModalOpen(false);
    },
    onError: (error: any) => {
      console.error('[CashClosure] Error creating closure:', error);
      const errorMessage = error?.message || error?.details || 'Erro desconhecido ao fechar caixa';
      toast({ title: 'Erro ao fechar caixa', description: errorMessage, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setQuickPeriod('today');
    setCustomStart('');
    setCustomEnd('');
    setActualCash('');
    setOpeningBalance('');
    setCashSupplies('');
    setClosureNotes('');
    setClosedBy('');
  };

  const openModal = () => {
    // Set default custom dates when opening modal
    const now = new Date();
    setCustomStart(format(startOfToday(), "yyyy-MM-dd'T'HH:mm"));
    setCustomEnd(format(now, "yyyy-MM-dd'T'HH:mm"));
    setIsClosureModalOpen(true);
  };

  // Export PDF
  const handleExportClosurePDF = (closure: CashClosure) => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Fechamento de Caixa', 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Data: ${closure.closed_at ? format(new Date(closure.closed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'N/A'}`, 14, 32);
    doc.text(`Responsável: ${closure.closed_by || 'N/A'}`, 14, 38);
    if (closure.period_start && closure.period_end) {
      doc.text(`Período: ${format(new Date(closure.period_start), 'dd/MM HH:mm')} - ${format(new Date(closure.period_end), 'dd/MM HH:mm')}`, 14, 44);
    }

    const salesData = [
      ['Total de Vendas', formatCurrency(closure.total_sales || 0)],
      ['Total de Pedidos', String(closure.total_orders || 0)],
      [`  - Balcão`, String(closure.counter_orders_count || 0)],
      [`  - Delivery`, String(closure.delivery_orders_count || 0)],
      ['', ''],
      ['Formas de Pagamento', ''],
      ['Dinheiro', formatCurrency(closure.total_cash || 0)],
      ['PIX', formatCurrency(closure.total_pix || 0)],
      ['Cartão Crédito', formatCurrency(closure.total_card_credit || 0)],
      ['Cartão Débito', formatCurrency(closure.total_card_debit || 0)],
      ['', ''],
      ['Análise de Custos', ''],
      ['Custo dos Produtos', formatCurrency(closure.total_product_cost || 0)],
      ['Taxa de Entrega Cobrada', formatCurrency(closure.total_delivery_fees || 0)],
      ['', ''],
      ['Conferência de Caixa', ''],
      ['Saldo de Abertura', formatCurrency(closure.opening_balance || 0)],
      ['Suprimentos', formatCurrency(closure.cash_supplies || 0)],
      ['Dinheiro Esperado', formatCurrency(closure.expected_cash || 0)],
      ['Dinheiro Conferido', formatCurrency(closure.actual_cash || 0)],
      ['Diferença', formatCurrency(closure.cash_difference || 0)],
      ['', ''],
      ['Resultados', ''],
      ['Lucro Bruto Real', formatCurrency(closure.real_gross_profit || closure.gross_profit || 0)],
      ['Total Sangrias', formatCurrency(closure.total_sangrias || 0)],
      ['Lucro Líquido', formatCurrency(closure.net_profit || 0)],
    ];

    autoTable(doc, {
      startY: 52,
      body: salesData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    });

    if (closure.notes) {
      const finalY = (doc as any).lastAutoTable.finalY || 150;
      doc.text('Observações:', 14, finalY + 10);
      doc.setFontSize(9);
      doc.text(closure.notes, 14, finalY + 18);
    }

    doc.save(`fechamento-${closure.closed_at ? format(new Date(closure.closed_at), 'yyyy-MM-dd-HHmm') : 'sem-data'}.pdf`);
    toast({ title: 'PDF exportado!' });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl md:text-3xl text-primary">Fechamento</h2>
          <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">Consolide vendas com lucro real</p>
        </div>
        <Button onClick={openModal} size="sm" className="gap-1 text-xs">
          <CheckCircle2 className="w-4 h-4" />
          Novo
        </Button>
      </div>

      {/* Closures History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Fechamentos</CardTitle>
          <CardDescription>Últimos 20 fechamentos realizados</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : closures.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum fechamento encontrado</p>
              <p className="text-sm">Clique em "Novo Fechamento" para começar</p>
            </div>
          ) : (
            <div className="space-y-4">
              {closures.map((closure) => (
                <div key={closure.id} className="p-3 md:p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {closure.closed_at 
                            ? format(new Date(closure.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : 'Data não disponível'
                          }
                        </span>
                        {closure.closed_by && (
                          <Badge variant="outline" className="text-xs truncate max-w-[100px]">{closure.closed_by}</Badge>
                        )}
                      </div>
                      {closure.period_start && closure.period_end && (
                        <p className="text-xs text-muted-foreground truncate">
                          Período: {format(new Date(closure.period_start), 'dd/MM HH:mm')} - {format(new Date(closure.period_end), 'dd/MM HH:mm')}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleExportClosurePDF(closure)} className="flex-shrink-0 h-8 text-xs">
                      <Download className="w-3 h-3 mr-1" />
                      PDF
                    </Button>
                  </div>

                  <Separator className="my-3" />

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 text-xs md:text-sm">
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs truncate">Vendas</p>
                      <p className="font-bold text-primary text-sm md:text-base truncate">{formatCurrency(closure.total_sales || 0)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs truncate">Pedidos</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        <p className="font-bold text-sm md:text-base">{closure.total_orders || 0}</p>
                        {(closure.counter_orders_count || closure.delivery_orders_count) && (
                          <div className="text-xs text-muted-foreground hidden sm:flex gap-1">
                            <span className="flex items-center gap-0.5"><Package className="w-3 h-3" />{closure.counter_orders_count || 0}</span>
                            <span className="flex items-center gap-0.5"><Truck className="w-3 h-3" />{closure.delivery_orders_count || 0}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 hidden sm:block">
                      <p className="text-muted-foreground text-xs truncate">Dinheiro</p>
                      <p className="font-bold truncate">{formatCurrency(closure.total_cash || 0)}</p>
                    </div>
                    <div className="min-w-0 hidden lg:block">
                      <p className="text-muted-foreground text-xs truncate">PIX</p>
                      <p className="font-bold truncate">{formatCurrency(closure.total_pix || 0)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-xs truncate">Lucro Líq.</p>
                      <p className={cn("font-bold text-sm md:text-base truncate", (closure.net_profit || 0) >= 0 ? "text-primary" : "text-red-400")}>
                        {formatCurrency(closure.net_profit || 0)}
                      </p>
                    </div>
                  </div>

                  {closure.cash_difference !== null && closure.cash_difference !== 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <AlertCircle className={cn("w-4 h-4 flex-shrink-0", closure.cash_difference > 0 ? "text-green-400" : "text-red-400")} />
                      <span className={cn("text-xs truncate", closure.cash_difference > 0 ? "text-green-400" : "text-red-400")}>
                        {closure.cash_difference > 0 ? 'Sobra' : 'Falta'} de {formatCurrency(Math.abs(closure.cash_difference))}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Simplified Closure Modal */}
      <Dialog open={isClosureModalOpen} onOpenChange={setIsClosureModalOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Novo Fechamento de Caixa</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Selecione o período e confira os valores antes de confirmar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-5 py-2">
              {/* Quick Period Selection */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-sm sm:text-base font-semibold">1. Período</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Button
                    type="button"
                    variant={quickPeriod === 'today' ? 'default' : 'outline'}
                    onClick={() => setQuickPeriod('today')}
                    className="h-10 text-xs sm:text-sm"
                  >
                    Hoje
                  </Button>
                  <Button
                    type="button"
                    variant={quickPeriod === 'yesterday' ? 'default' : 'outline'}
                    onClick={() => setQuickPeriod('yesterday')}
                    className="h-10 text-xs sm:text-sm"
                  >
                    Ontem
                  </Button>
                  <Button
                    type="button"
                    variant={quickPeriod === 'last12h' ? 'default' : 'outline'}
                    onClick={() => setQuickPeriod('last12h')}
                    className="h-10 text-xs sm:text-sm"
                  >
                    12h
                  </Button>
                  <Button
                    type="button"
                    variant={quickPeriod === 'custom' ? 'default' : 'outline'}
                    onClick={() => setQuickPeriod('custom')}
                    className="h-10 text-xs sm:text-sm"
                  >
                    Custom
                  </Button>
                </div>

                {/* Custom date inputs */}
                {quickPeriod === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3 bg-muted/50 rounded-lg">
                    <div className="space-y-1">
                      <Label className="text-xs">Início</Label>
                      <Input
                        type="datetime-local"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fim</Label>
                      <Input
                        type="datetime-local"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* Period display */}
                <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg truncate">
                  <span className="font-medium">Período:</span>{' '}
                  {format(periodStart, "dd/MM HH:mm", { locale: ptBR })} - {format(periodEnd, "dd/MM HH:mm", { locale: ptBR })}
                </div>
              </div>

              <Separator />

              {/* Sales Summary with Real Profit */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-sm sm:text-base font-semibold">2. Resumo do Período</Label>
                {isLoadingOrders ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <Card className="bg-primary/10 border-primary/20">
                        <CardContent className="p-2 sm:p-3">
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="text-xs truncate">Faturamento</span>
                          </div>
                          <p className="text-base sm:text-lg font-bold text-primary truncate">{formatCurrency(periodTotals.totalSales)}</p>
                          <div className="flex gap-1 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-0.5"><Package className="w-3 h-3" />{periodTotals.counterOrders}</span>
                            <span className="flex items-center gap-0.5"><Truck className="w-3 h-3" />{periodTotals.deliveryOrders}</span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-red-500/10 border-red-500/20">
                        <CardContent className="p-2 sm:p-3">
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="text-xs truncate">Custo</span>
                          </div>
                          <p className="text-base sm:text-lg font-bold text-red-400 truncate">-{formatCurrency(periodTotals.totalProductCost)}</p>
                          <p className="text-xs text-muted-foreground truncate">{realProfitData ? 'Real' : '~60%'}</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-green-500/10 border-green-500/20">
                        <CardContent className="p-2 sm:p-3">
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="text-xs truncate">Lucro Bruto</span>
                          </div>
                          <p className="text-base sm:text-lg font-bold text-green-400 truncate">{formatCurrency(periodTotals.grossProfit)}</p>
                          <Badge variant="outline" className="text-xs mt-1">
                            <Percent className="w-2 h-2 mr-0.5" />
                            {profitMarginPercent}%
                          </Badge>
                        </CardContent>
                      </Card>

                      <Card className="bg-orange-500/10 border-orange-500/20">
                        <CardContent className="p-2 sm:p-3">
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="text-xs truncate">Sangrias</span>
                          </div>
                          <p className="text-base sm:text-lg font-bold text-orange-400 truncate">-{formatCurrency(periodTotals.totalSangrias)}</p>
                          <p className="text-xs text-muted-foreground">{periodSangrias.length} reg.</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Payment breakdown */}
                    <div className="grid grid-cols-4 gap-1 sm:gap-2 mt-2">
                      <Card>
                        <CardContent className="p-1.5 sm:p-2 text-center">
                          <Banknote className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground truncate">Din.</p>
                          <p className="font-bold text-xs sm:text-sm truncate">{formatCurrency(periodTotals.totalCash)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-1.5 sm:p-2 text-center">
                          <Smartphone className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground truncate">PIX</p>
                          <p className="font-bold text-xs sm:text-sm truncate">{formatCurrency(periodTotals.totalPix)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-1.5 sm:p-2 text-center">
                          <CreditCard className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground truncate">Créd.</p>
                          <p className="font-bold text-xs sm:text-sm truncate">{formatCurrency(periodTotals.totalCardCredit)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-1.5 sm:p-2 text-center">
                          <CreditCard className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground truncate">Déb.</p>
                          <p className="font-bold text-xs sm:text-sm truncate">{formatCurrency(periodTotals.totalCardDebit)}</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Net Profit Summary */}
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-2 sm:p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">Lucro Líquido</p>
                          <p className={cn("text-lg sm:text-xl font-bold truncate", netProfit >= 0 ? "text-primary" : "text-red-400")}>
                            {formatCurrency(netProfit)}
                          </p>
                        </div>
                        <Badge className={`flex-shrink-0 text-xs ${netProfit >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {netProfit >= 0 ? '+' : '-'}
                        </Badge>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              <Separator />

              {/* Cash Conference - Enhanced */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-sm sm:text-base font-semibold">3. Conferência</Label>
                
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Abertura (R$)</Label>
                    <Input
                      type="text"
                      placeholder="0,00"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs">Suprimentos</Label>
                    <Input
                      type="text"
                      placeholder="0,00"
                      value={cashSupplies}
                      onChange={(e) => setCashSupplies(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Contado (R$)</Label>
                    <Input
                      type="text"
                      placeholder="0,00"
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Expected cash calculation - simplified for mobile */}
                <div className="p-2 sm:p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs font-medium">Cálculo Esperado:</p>
                  <div className="grid grid-cols-5 gap-1 text-xs overflow-hidden">
                    <div className="text-center p-1 sm:p-1.5 bg-background rounded min-w-0">
                      <p className="text-muted-foreground truncate">Abert.</p>
                      <p className="font-medium truncate">{formatCurrency(openingBalanceNumber)}</p>
                    </div>
                    <div className="text-center p-1 sm:p-1.5 bg-green-500/10 rounded min-w-0">
                      <p className="text-muted-foreground truncate">+Vend.</p>
                      <p className="font-medium text-green-500 truncate">{formatCurrency(periodTotals.totalCash)}</p>
                    </div>
                    <div className="text-center p-1 sm:p-1.5 bg-red-500/10 rounded min-w-0">
                      <p className="text-muted-foreground truncate">-Sang.</p>
                      <p className="font-medium text-red-500 truncate">{formatCurrency(periodTotals.totalSangrias)}</p>
                    </div>
                    <div className="text-center p-1 sm:p-1.5 bg-blue-500/10 rounded min-w-0">
                      <p className="text-muted-foreground truncate">+Sup.</p>
                      <p className="font-medium text-blue-500 truncate">{formatCurrency(cashSuppliesNumber)}</p>
                    </div>
                    <div className="text-center p-1 sm:p-1.5 bg-primary/10 rounded min-w-0">
                      <p className="text-muted-foreground truncate">=Esp.</p>
                      <p className="font-bold text-primary truncate">{formatCurrency(expectedCash)}</p>
                    </div>
                  </div>
                </div>

                {actualCash && (
                  <div className={cn(
                    "p-2 sm:p-3 rounded-lg flex items-center gap-2",
                    cashDifference === 0 ? "bg-green-500/20 border border-green-500/30" : 
                    cashDifference > 0 ? "bg-blue-500/20 border border-blue-500/30" : 
                    "bg-red-500/20 border border-red-500/30"
                  )}>
                    {cashDifference === 0 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : cashDifference > 0 ? (
                      <TrendingUp className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400 flex-shrink-0" />
                    )}
                    <p className="font-medium text-sm truncate">
                      {cashDifference === 0 
                        ? 'Caixa OK!' 
                        : cashDifference > 0 
                          ? `Sobra: ${formatCurrency(cashDifference)}`
                          : `Falta: ${formatCurrency(Math.abs(cashDifference))}`
                      }
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Responsible */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-sm sm:text-base font-semibold">4. Finalizar</Label>
                <div className="space-y-2 sm:space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Responsável *</Label>
                    <Input
                      placeholder="Nome"
                      value={closedBy}
                      onChange={(e) => setClosedBy(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Obs. (opcional)</Label>
                    <Textarea
                      placeholder="Anotações..."
                      value={closureNotes}
                      onChange={(e) => setClosureNotes(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 mt-4 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setIsClosureModalOpen(false)} 
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => createClosure.mutate()} 
              disabled={createClosure.isPending || !closedBy.trim() || periodTotals.totalOrders === 0}
              className="w-full sm:w-auto gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {createClosure.isPending ? 'Salvando...' : `Confirmar Fechamento (${periodTotals.totalOrders} pedidos)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
