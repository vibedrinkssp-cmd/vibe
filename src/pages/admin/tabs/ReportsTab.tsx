// Reports Tab Component - Relatórios Consolidados com Lucro Real
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Download, 
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  BarChart3,
  PieChart as PieChartIcon,
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
  CandlestickChart as CandlestickIcon,
  Package,
  Truck,
  ChevronLeft,
  ChevronRight,
  List,
  UserCheck,
  Trophy,
  Medal
} from 'lucide-react';
import { format, eachDayOfInterval, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
  ComposedChart
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCurrency, CHART_COLORS, PAYMENT_METHOD_LABELS, FINANCIAL_CHART_COLORS, StatusBadge, ORDER_TYPE_LABELS } from '../shared';
import { SANGRIA_TYPES } from './SangriasTab';
import { cn } from '@/lib/utils';
import { CandlestickChart, generateCandlestickData } from '@/components/charts/CandlestickChart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


type SangriaType = keyof typeof SANGRIA_TYPES;

const ORDERS_PER_PAGE = 10;

// Helper to format date for input
const formatDateForInput = (date: Date) => format(date, 'yyyy-MM-dd');

// Helper to parse date from input (creates date at start of day in local timezone)
const parseDateFromInput = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

interface RealProfitData {
  total_revenue: number;
  total_product_cost: number;
  gross_profit: number;
  total_delivery_fees: number;
  counter_orders_count: number;
  delivery_orders_count: number;
  total_orders_count: number;
}

export function ReportsTab() {
  const { toast } = useToast();
  
  // Use simple date strings for inputs (no timezone issues)
  const today = new Date();
  const [startDateStr, setStartDateStr] = useState(formatDateForInput(today));
  const [endDateStr, setEndDateStr] = useState(formatDateForInput(today));
  
  // Pagination state for orders list
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch ALL orders first (no date filter at query level - filter in JS)
  const { data: allOrders = [], isLoading: isLoadingOrders, refetch: refetchOrders, error: ordersError } = useQuery({
    queryKey: ['all-orders-for-reports'],
    queryFn: async () => {
      console.log('[Reports] Fetching all orders...');
      
      // Use RPC function that brings order + customer/address consistently
      const { data, error } = await supabase.rpc('get_admin_orders_complete');

      if (error) {
        console.error('[Reports] Error fetching orders:', error);
        // Fallback to direct query
        const { data: directData, error: directError } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (directError) throw directError;
        console.log('[Reports] Fetched orders (direct):', directData?.length);
        return directData || [];
      }
      
      console.log('[Reports] Fetched orders:', data?.length, 'total');
      return data || [];
    },
  });

  // Fetch ALL sangrias
  const { data: allSangrias = [], isLoading: isLoadingSangrias } = useQuery({
    queryKey: ['all-sangrias-for-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sangrias')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch real profit calculation from RPC
  const { data: realProfitData, refetch: refetchProfit } = useQuery({
    queryKey: ['real-profit', startDateStr, endDateStr],
    queryFn: async () => {
      const startDate = parseDateFromInput(startDateStr);
      const endDate = parseDateFromInput(endDateStr);
      endDate.setHours(23, 59, 59, 999);
      
      const { data, error } = await supabase.rpc('calculate_real_profit', {
        p_start: startDate.toISOString(),
        p_end: endDate.toISOString()
      });

      if (error) {
        console.error('[Reports] Error calculating real profit:', error);
        return null;
      }

      // RPC returns an array
      const result = Array.isArray(data) ? data[0] : data;
      return result as RealProfitData | null;
    },
  });

  // Filter orders by date range (in JS, avoiding timezone issues)
  const orders = useMemo(() => {
    const startDate = parseDateFromInput(startDateStr);
    const endDate = parseDateFromInput(endDateStr);
    
    // Set end of day for endDate
    endDate.setHours(23, 59, 59, 999);
    
    console.log('[Reports] Filtering orders between:', startDate.toISOString(), 'and', endDate.toISOString());
    
    const filtered = allOrders.filter(order => {
      // Skip pending and cancelled
      if (order.status === 'pending' || order.status === 'cancelled') return false;
      
      if (!order.created_at) return false;
      
      const orderDate = new Date(order.created_at);
      return orderDate >= startDate && orderDate <= endDate;
    });
    
    console.log('[Reports] Filtered orders:', filtered.length);
    
    return filtered;
  }, [allOrders, startDateStr, endDateStr]);

  // Reset pagination when date filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [startDateStr, endDateStr]);


  // Filter sangrias by date range
  const sangrias = useMemo(() => {
    const startDate = parseDateFromInput(startDateStr);
    const endDate = parseDateFromInput(endDateStr);
    endDate.setHours(23, 59, 59, 999);
    
    return allSangrias.filter(s => {
      if (!s.created_at) return false;
      const sDate = new Date(s.created_at);
      return sDate >= startDate && sDate <= endDate;
    });
  }, [allSangrias, startDateStr, endDateStr]);

  // Calculate totals with REAL profit
  const totals = useMemo(() => {
    const result = {
      totalSales: 0,
      totalOrders: orders.length,
      totalPix: 0,
      totalCash: 0,
      totalCardCredit: 0,
      totalCardDebit: 0,
      totalSangrias: 0,
      totalDeliveryFees: 0,
      // Use real profit from RPC when available
      totalProductCost: realProfitData?.total_product_cost || 0,
      grossProfit: realProfitData?.gross_profit || 0,
      netProfit: 0,
      averageTicket: 0,
      counterOrders: 0,
      deliveryOrders: 0,
    };

    orders.forEach(order => {
      const amount = Number(order.total);
      result.totalSales += amount;
      result.totalDeliveryFees += Number(order.delivery_fee || 0);
      
      if (order.order_type === 'counter') result.counterOrders++;
      if (order.order_type === 'delivery') result.deliveryOrders++;
      
      switch (order.payment_method) {
        case 'pix':
        case 'pix_pos':
          result.totalPix += amount;
          break;
        case 'cash':
          result.totalCash += amount;
          break;
        case 'card_credit':
          result.totalCardCredit += amount;
          break;
        case 'card_debit':
        case 'card_pos':
          result.totalCardDebit += amount;
          break;
      }
    });

    sangrias.forEach(s => {
      result.totalSangrias += Number(s.amount);
    });

    // If RPC data is not available, fallback to estimate based on 40% average margin
    if (!realProfitData) {
      result.totalProductCost = result.totalSales * 0.6;
      result.grossProfit = result.totalSales * 0.4;
    }

    result.netProfit = result.grossProfit - result.totalSangrias;
    result.averageTicket = result.totalOrders > 0 ? result.totalSales / result.totalOrders : 0;

    return result;
  }, [orders, sangrias, realProfitData]);

  // Candlestick data for sales
  const salesCandlestickData = useMemo(() => {
    return generateCandlestickData(orders, (date) => format(date, 'dd/MM'));
  }, [orders]);

  // Sales by day chart data
  const salesByDayData = useMemo(() => {
    const startDate = parseDateFromInput(startDateStr);
    const endDate = parseDateFromInput(endDateStr);
    
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const salesByDay: Record<string, { counter: number; delivery: number }> = {};
    
    days.forEach(day => {
      salesByDay[format(day, 'dd/MM')] = { counter: 0, delivery: 0 };
    });

    orders.forEach(order => {
      if (!order.created_at) return;
      const day = format(new Date(order.created_at), 'dd/MM');
      if (salesByDay[day]) {
        if (order.order_type === 'counter') {
          salesByDay[day].counter += Number(order.total);
        } else {
          salesByDay[day].delivery += Number(order.total);
        }
      }
    });

    return Object.entries(salesByDay).map(([date, totals]) => ({ 
      date, 
      'Balcão': totals.counter,
      'Delivery': totals.delivery,
      total: totals.counter + totals.delivery 
    }));
  }, [orders, startDateStr, endDateStr]);

  // Payment methods chart data
  const paymentMethodsData = useMemo(() => {
    const methods: Record<string, number> = {};
    
    orders.forEach(order => {
      const method = order.payment_method || 'unknown';
      methods[method] = (methods[method] || 0) + Number(order.total);
    });

    return Object.entries(methods).map(([key, value]) => ({
      name: PAYMENT_METHOD_LABELS[key as keyof typeof PAYMENT_METHOD_LABELS] || key,
      value,
    }));
  }, [orders]);

  // Sangrias by type chart data
  const sangriasByTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    
    sangrias.forEach(s => {
      types[s.type] = (types[s.type] || 0) + Number(s.amount);
    });

    return Object.entries(types).map(([key, value]) => ({
      name: SANGRIA_TYPES[key as SangriaType]?.label || key,
      value,
    }));
  }, [sangrias]);

  // Profit comparison data with REAL values
  const profitComparisonData = useMemo(() => {
    const startDate = parseDateFromInput(startDateStr);
    const endDate = parseDateFromInput(endDateStr);
    
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const dataByDay: Record<string, { revenue: number; cost: number; sangrias: number }> = {};
    
    days.forEach(day => {
      const key = format(day, 'dd/MM');
      dataByDay[key] = { revenue: 0, cost: 0, sangrias: 0 };
    });

    // Estimate daily cost based on overall margin
    const overallMargin = realProfitData ? (realProfitData.gross_profit / (realProfitData.total_revenue || 1)) : 0.4;

    orders.forEach(order => {
      if (!order.created_at) return;
      const day = format(new Date(order.created_at), 'dd/MM');
      if (dataByDay[day]) {
        const orderTotal = Number(order.total);
        dataByDay[day].revenue += orderTotal;
        dataByDay[day].cost += orderTotal * (1 - overallMargin);
      }
    });

    sangrias.forEach(s => {
      if (!s.created_at) return;
      const day = format(new Date(s.created_at), 'dd/MM');
      if (dataByDay[day]) {
        dataByDay[day].sangrias += Number(s.amount);
      }
    });

    return Object.entries(dataByDay).map(([date, data]) => ({
      date,
      'Faturamento': data.revenue,
      'Custo': data.cost,
      'Lucro Bruto': data.revenue - data.cost,
      'Sangrias': data.sangrias,
      'Lucro Líquido': data.revenue - data.cost - data.sangrias,
    }));
  }, [orders, sangrias, startDateStr, endDateStr, realProfitData]);

  // Export consolidated PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatorio Consolidado', 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Período: ${startDateStr} a ${endDateStr}`, 14, 32);

    // Summary section
    doc.setFontSize(12);
    doc.text('Resumo Geral', 14, 44);

    const summaryData = [
      ['Total de Vendas', formatCurrency(totals.totalSales)],
      ['Total de Pedidos', String(totals.totalOrders)],
      [`  - Balcão`, String(totals.counterOrders)],
      [`  - Delivery`, String(totals.deliveryOrders)],
      ['Ticket Médio', formatCurrency(totals.averageTicket)],
      ['', ''],
      ['Formas de Pagamento', ''],
      ['Dinheiro', formatCurrency(totals.totalCash)],
      ['PIX', formatCurrency(totals.totalPix)],
      ['Cartão Crédito', formatCurrency(totals.totalCardCredit)],
      ['Cartão Débito', formatCurrency(totals.totalCardDebit)],
      ['', ''],
      ['Análise de Custos (REAL)', ''],
      ['Custo dos Produtos', formatCurrency(totals.totalProductCost)],
      ['Taxa de Entrega', formatCurrency(totals.totalDeliveryFees)],
      ['', ''],
      ['Resultados', ''],
      ['Lucro Bruto Real', formatCurrency(totals.grossProfit)],
      ['Total Sangrias', formatCurrency(totals.totalSangrias)],
      ['Lucro Líquido', formatCurrency(totals.netProfit)],
    ];

    autoTable(doc, {
      startY: 50,
      body: summaryData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    });

    // Sales by day
    const finalY = (doc as any).lastAutoTable.finalY || 130;
    doc.text('Vendas por Dia', 14, finalY + 10);

    const salesTableData = salesByDayData.map(d => [d.date, formatCurrency(d.total)]);
    autoTable(doc, {
      startY: finalY + 16,
      head: [['Data', 'Total']],
      body: salesTableData,
    });

    // Sangrias details
    if (sangrias.length > 0) {
      doc.addPage();
      doc.setFontSize(12);
      doc.text('Detalhamento de Sangrias', 14, 22);

      const sangriasTableData = sangrias
        .filter(s => s.created_at)
        .map(s => [
          format(new Date(s.created_at!), 'dd/MM HH:mm'),
          (s as any).type ? SANGRIA_TYPES[(s as any).type as SangriaType]?.label || (s as any).type : 'Outros',
          (s as any).responsible || 'N/A',
          formatCurrency(s.amount),
        ]);

      autoTable(doc, {
        startY: 28,
        head: [['Data', 'Tipo', 'Responsável', 'Valor']],
        body: sangriasTableData,
      });
    }

    doc.save(`relatorio-${startDateStr}-${endDateStr}.pdf`);
    toast({ title: 'PDF exportado!' });
  };

  // Export CSV
  const handleExportCSV = () => {
    let csv = 'Data,Pedido,Tipo,Total,Pagamento\n';
    
    orders.filter(o => o.created_at).forEach(order => {
      csv += `${format(new Date(order.created_at!), 'dd/MM/yyyy HH:mm')},${order.id.slice(-8)},${order.order_type},${Number(order.total).toFixed(2)},${order.payment_method}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vendas-${startDateStr}-${endDateStr}.csv`;
    link.click();
    toast({ title: 'CSV exportado!' });
  };

  const handleRefresh = () => {
    refetchOrders();
    refetchProfit();
  };

  // Profit margin percentage
  const profitMarginPercent = totals.totalSales > 0 
    ? ((totals.grossProfit / totals.totalSales) * 100).toFixed(1) 
    : '0';

  // Show loading state
  if (isLoadingOrders) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">Carregando dados...</span>
      </div>
    );
  }

  // Show error state
  if (ordersError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-destructive">Erro ao carregar dados: {String(ordersError)}</p>
        <Button onClick={() => refetchOrders()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="font-serif text-2xl md:text-3xl text-primary">Relatórios</h2>
        <div className="flex gap-2">
          <Button onClick={handleExportCSV} variant="outline" size="sm" className="text-xs" disabled={orders.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            CSV
          </Button>
          <Button onClick={handleExportPDF} variant="outline" size="sm" className="text-xs" disabled={orders.length === 0}>
            <Download className="w-4 h-4 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Date Filters - Simplified */}
      <Card className="p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant={orders.length > 0 ? "default" : "secondary"} className="text-xs">
            {allOrders.length} total
          </Badge>
          <Badge variant={orders.length > 0 ? "default" : "outline"} className="text-xs">
            {orders.length} período
          </Badge>
          {orders.length > 0 && (
            <>
              <Badge variant="outline" className="gap-1 text-xs hidden sm:flex">
                <Package className="w-3 h-3" />
                {totals.counterOrders}
              </Badge>
              <Badge variant="outline" className="gap-1 text-xs hidden sm:flex">
                <Truck className="w-3 h-3" />
                {totals.deliveryOrders}
              </Badge>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="ml-auto text-xs">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3 mt-3">
          <div className="space-y-1">
            <Label className="text-xs">Início</Label>
            <Input
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              className="w-full sm:w-36 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim</Label>
            <Input
              type="date"
              value={endDateStr}
              onChange={(e) => setEndDateStr(e.target.value)}
              className="w-full sm:w-36 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant="secondary" 
              size="sm"
              className="text-xs"
              onClick={() => { 
                const today = new Date();
                setStartDateStr(formatDateForInput(today));
                setEndDateStr(formatDateForInput(today));
              }}
            >
              Hoje
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-xs"
              onClick={() => { 
                const today = new Date();
                const weekAgo = new Date(today);
                weekAgo.setDate(today.getDate() - 7);
                setStartDateStr(formatDateForInput(weekAgo));
                setEndDateStr(formatDateForInput(today));
              }}
            >
              7d
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-xs"
              onClick={() => { 
                const today = new Date();
                const monthAgo = new Date(today);
                monthAgo.setDate(today.getDate() - 30);
                setStartDateStr(formatDateForInput(monthAgo));
                setEndDateStr(formatDateForInput(today));
              }}
            >
              30d
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards - Enhanced with animations */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/10">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento</CardTitle>
            <DollarSign className="w-4 h-4 text-primary transition-transform duration-300 group-hover:scale-110" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totals.totalSales)}</p>
            <div className="flex gap-2 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {totals.counterOrders}
              </span>
              <span className="flex items-center gap-1">
                <Truck className="w-3 h-3" />
                {totals.deliveryOrders}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-red-500/10">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Custo Produtos</CardTitle>
            <TrendingDown className="w-4 h-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-400">-{formatCurrency(totals.totalProductCost)}</p>
            <p className="text-xs text-muted-foreground">
              {realProfitData ? 'Custo real' : 'Estimativa ~60%'}
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-green-500/10">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lucro Bruto</CardTitle>
            <TrendingUp className="w-4 h-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-400">{formatCurrency(totals.grossProfit)}</p>
            <Badge variant="outline" className="text-xs mt-1">
              Margem {profitMarginPercent}%
            </Badge>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-orange-500/10">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sangrias</CardTitle>
            <TrendingDown className="w-4 h-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-400">-{formatCurrency(totals.totalSangrias)}</p>
            <p className="text-xs text-muted-foreground">{sangrias.length} registros</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/20">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lucro Líquido</CardTitle>
            <DollarSign className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", totals.netProfit >= 0 ? "text-primary" : "text-red-400")}>
              {formatCurrency(totals.netProfit)}
            </p>
            <p className="text-xs text-muted-foreground">
              Lucro - Sangrias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="candlestick" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="candlestick" className="gap-1 text-xs sm:text-sm px-2 sm:px-3">
            <CandlestickIcon className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Velas</span>
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1 text-xs sm:text-sm px-2 sm:px-3">
            <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Vendas</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1 text-xs sm:text-sm px-2 sm:px-3">
            <PieChartIcon className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Pagamentos</span>
          </TabsTrigger>
          <TabsTrigger value="profit" className="gap-1 text-xs sm:text-sm px-2 sm:px-3">
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Lucro</span>
          </TabsTrigger>
          <TabsTrigger value="sangrias" className="gap-1 text-xs sm:text-sm px-2 sm:px-3">
            <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Sangrias</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="candlestick" className="animate-fade-in">
          <Card className="transition-all duration-300 hover:shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CandlestickIcon className="w-5 h-5 text-primary" />
                Gráfico de Velas - Vendas Diárias
              </CardTitle>
              <CardDescription>
                Abertura (1º pedido), Fechamento (último pedido), Máxima e Mínima do dia
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CandlestickChart data={salesCandlestickData} height={400} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="animate-fade-in">
          <Card className="transition-all duration-300 hover:shadow-xl">
            <CardHeader>
              <CardTitle>Vendas por Dia e Tipo</CardTitle>
              <CardDescription>Comparativo entre vendas balcão e delivery</CardDescription>
            </CardHeader>
            <CardContent>
              {salesByDayData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={salesByDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value) => `R$${value}`} />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), '']}
                      contentStyle={{ 
                        background: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        color: 'hsl(var(--foreground))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="Balcão" 
                      stackId="a" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 0, 0, 0]}
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Bar 
                      dataKey="Delivery" 
                      stackId="a" 
                      fill="hsl(142, 76%, 36%)" 
                      radius={[4, 4, 0, 0]}
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  Nenhum dado para exibir
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="animate-fade-in">
          <Card className="transition-all duration-300 hover:shadow-xl">
            <CardHeader>
              <CardTitle>Formas de Pagamento</CardTitle>
              <CardDescription>Distribuição por método de pagamento</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {paymentMethodsData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={paymentMethodsData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          animationDuration={800}
                          animationEasing="ease-out"
                        >
                          {paymentMethodsData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [formatCurrency(value), 'Total']}
                          contentStyle={{ 
                            background: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            color: 'hsl(var(--foreground))',
                            borderRadius: '8px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                          itemStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-4">
                      {paymentMethodsData.map((item, index) => (
                        <div 
                          key={item.name} 
                          className="flex items-center justify-between p-2 rounded-lg transition-all duration-200 hover:bg-muted/50 hover:scale-[1.02]"
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full transition-transform duration-200 hover:scale-125" 
                              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} 
                            />
                            <span>{item.name}</span>
                          </div>
                          <span className="font-bold">{formatCurrency(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhum dado para exibir
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit" className="animate-fade-in">
          <Card className="transition-all duration-300 hover:shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Análise Financeira Completa
              </CardTitle>
              <CardDescription>Todas as métricas com cores distintas para visualização perfeita</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Legenda visual */}
              <div className="flex flex-wrap gap-4 mb-6 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 rounded" style={{ backgroundColor: FINANCIAL_CHART_COLORS.faturamento }} />
                  <span className="text-sm font-medium">Faturamento</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 rounded" style={{ backgroundColor: FINANCIAL_CHART_COLORS.custo }} />
                  <span className="text-sm font-medium">Custo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 rounded" style={{ backgroundColor: FINANCIAL_CHART_COLORS.lucroBruto }} />
                  <span className="text-sm font-medium">Lucro Bruto</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 rounded" style={{ backgroundColor: FINANCIAL_CHART_COLORS.sangrias }} />
                  <span className="text-sm font-medium">Sangrias</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: FINANCIAL_CHART_COLORS.lucroLiquido }} />
                  <span className="text-sm font-bold">Lucro Líquido</span>
                </div>
              </div>
              
              {profitComparisonData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={profitComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickFormatter={(value) => `R$${value}`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [formatCurrency(value), name]}
                      contentStyle={{ 
                        background: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        color: 'hsl(var(--foreground))',
                        borderRadius: '12px',
                        boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
                        padding: '12px 16px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold', marginBottom: '8px' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value) => <span className="text-xs font-medium">{value}</span>}
                    />
                    
                    {/* Faturamento - Azul vibrante */}
                    <Line 
                      type="monotone" 
                      dataKey="Faturamento" 
                      stroke={FINANCIAL_CHART_COLORS.faturamento}
                      strokeWidth={4}
                      dot={{ r: 6, fill: FINANCIAL_CHART_COLORS.faturamento, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 10, strokeWidth: 3, stroke: '#fff' }}
                      animationDuration={800}
                    />
                    
                    {/* Custo - Vermelho tracejado */}
                    <Line 
                      type="monotone" 
                      dataKey="Custo" 
                      stroke={FINANCIAL_CHART_COLORS.custo}
                      strokeWidth={4}
                      strokeDasharray="10 5"
                      dot={{ r: 6, fill: FINANCIAL_CHART_COLORS.custo, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 10, strokeWidth: 3, stroke: '#fff' }}
                      animationDuration={1000}
                    />
                    
                    {/* Lucro Bruto - Verde */}
                    <Line 
                      type="monotone" 
                      dataKey="Lucro Bruto" 
                      stroke={FINANCIAL_CHART_COLORS.lucroBruto}
                      strokeWidth={4}
                      dot={{ r: 6, fill: FINANCIAL_CHART_COLORS.lucroBruto, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 10, strokeWidth: 3, stroke: '#fff' }}
                      animationDuration={1200}
                    />
                    
                    {/* Sangrias - Laranja tracejado */}
                    <Line 
                      type="monotone" 
                      dataKey="Sangrias" 
                      stroke={FINANCIAL_CHART_COLORS.sangrias}
                      strokeWidth={3}
                      strokeDasharray="6 3"
                      dot={{ r: 5, fill: FINANCIAL_CHART_COLORS.sangrias, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 8, strokeWidth: 2, stroke: '#fff' }}
                      animationDuration={1400}
                    />
                    
                    {/* Lucro Líquido - Roxo (destaque principal) */}
                    <Line 
                      type="monotone" 
                      dataKey="Lucro Líquido" 
                      stroke={FINANCIAL_CHART_COLORS.lucroLiquido}
                      strokeWidth={5}
                      dot={{ r: 7, fill: FINANCIAL_CHART_COLORS.lucroLiquido, strokeWidth: 3, stroke: '#fff' }}
                      activeDot={{ r: 12, strokeWidth: 4, stroke: '#fff' }}
                      animationDuration={1600}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  Nenhum dado para exibir
                </div>
              )}
              
              {/* Mini resumo abaixo do gráfico */}
              {profitComparisonData.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t">
                  <div className="text-center p-2 rounded-lg" style={{ backgroundColor: `${FINANCIAL_CHART_COLORS.faturamento}20` }}>
                    <p className="text-xs text-muted-foreground">Faturamento</p>
                    <p className="font-bold text-sm" style={{ color: FINANCIAL_CHART_COLORS.faturamento }}>
                      {formatCurrency(totals.totalSales)}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg" style={{ backgroundColor: `${FINANCIAL_CHART_COLORS.custo}20` }}>
                    <p className="text-xs text-muted-foreground">Custo</p>
                    <p className="font-bold text-sm" style={{ color: FINANCIAL_CHART_COLORS.custo }}>
                      {formatCurrency(totals.totalProductCost)}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg" style={{ backgroundColor: `${FINANCIAL_CHART_COLORS.lucroBruto}20` }}>
                    <p className="text-xs text-muted-foreground">L. Bruto</p>
                    <p className="font-bold text-sm" style={{ color: FINANCIAL_CHART_COLORS.lucroBruto }}>
                      {formatCurrency(totals.grossProfit)}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg" style={{ backgroundColor: `${FINANCIAL_CHART_COLORS.sangrias}20` }}>
                    <p className="text-xs text-muted-foreground">Sangrias</p>
                    <p className="font-bold text-sm" style={{ color: FINANCIAL_CHART_COLORS.sangrias }}>
                      {formatCurrency(totals.totalSangrias)}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg" style={{ backgroundColor: `${FINANCIAL_CHART_COLORS.lucroLiquido}30` }}>
                    <p className="text-xs text-muted-foreground">Líquido</p>
                    <p className="font-bold text-sm" style={{ color: FINANCIAL_CHART_COLORS.lucroLiquido }}>
                      {formatCurrency(totals.netProfit)}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sangrias" className="animate-fade-in">
          <Card className="transition-all duration-300 hover:shadow-xl">
            <CardHeader>
              <CardTitle>Sangrias por Tipo</CardTitle>
              <CardDescription>Distribuição das sangrias por categoria</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {sangriasByTypeData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={sangriasByTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                          animationDuration={800}
                          animationEasing="ease-out"
                        >
                          {sangriasByTypeData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [formatCurrency(value), 'Total']}
                          contentStyle={{ 
                            background: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            color: 'hsl(var(--foreground))',
                            borderRadius: '8px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                          itemStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-4">
                      {sangriasByTypeData.map((item, index) => (
                        <div 
                          key={item.name} 
                          className="flex items-center justify-between p-2 rounded-lg transition-all duration-200 hover:bg-muted/50 hover:scale-[1.02]"
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full transition-transform duration-200 hover:scale-125" 
                              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} 
                            />
                            <span>{item.name}</span>
                          </div>
                          <span className="font-bold text-red-400">-{formatCurrency(item.value)}</span>
                        </div>
                      ))}
                      <div className="pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Total</span>
                          <span className="font-bold text-red-400">-{formatCurrency(totals.totalSangrias)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 h-[300px] flex items-center justify-center text-muted-foreground">
                    Nenhuma sangria no período
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Paginated Orders List */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <List className="w-5 h-5 text-primary" />
            Pedidos do Período
          </CardTitle>
          <CardDescription>
            {orders.length} pedidos entre {format(parseDateFromInput(startDateStr), 'dd/MM/yyyy')} e {format(parseDateFromInput(endDateStr), 'dd/MM/yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length > 0 ? (
            <>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[100px]">Data</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders
                      .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
                      .slice((currentPage - 1) * ORDERS_PER_PAGE, currentPage * ORDERS_PER_PAGE)
                      .map((order) => (
                        <TableRow key={order.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs text-muted-foreground">
                            {order.created_at ? format(new Date(order.created_at), 'dd/MM HH:mm') : '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            #{order.id.slice(-6).toUpperCase()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {ORDER_TYPE_LABELS[order.order_type as keyof typeof ORDER_TYPE_LABELS] || order.order_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {order.customer_name || 'Cliente'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={order.status as any} />
                          </TableCell>
                          <TableCell className="text-xs">
                            {PAYMENT_METHOD_LABELS[order.payment_method as keyof typeof PAYMENT_METHOD_LABELS] || order.payment_method}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(order.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Mostrando {Math.min((currentPage - 1) * ORDERS_PER_PAGE + 1, orders.length)} - {Math.min(currentPage * ORDERS_PER_PAGE, orders.length)} de {orders.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Anterior
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, Math.ceil(orders.length / ORDERS_PER_PAGE)) }, (_, i) => {
                      const totalPages = Math.ceil(orders.length / ORDERS_PER_PAGE);
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "ghost"}
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(orders.length / ORDERS_PER_PAGE), p + 1))}
                    disabled={currentPage >= Math.ceil(orders.length / ORDERS_PER_PAGE)}
                  >
                    Próximo
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Summary footer */}
              <div className="flex flex-wrap gap-4 mt-4 p-3 bg-muted/30 rounded-lg">
                <div className="text-sm">
                  <span className="text-muted-foreground">Total vendas:</span>
                  <span className="font-bold text-primary ml-2">{formatCurrency(totals.totalSales)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Ticket médio:</span>
                  <span className="font-bold ml-2">{formatCurrency(totals.averageTicket)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Balcão:</span>
                  <span className="font-bold ml-2">{totals.counterOrders}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Delivery:</span>
                  <span className="font-bold ml-2">{totals.deliveryOrders}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              Nenhum pedido encontrado no período selecionado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
