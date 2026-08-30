import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, eachDayOfInterval, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, BarChart3,
  PieChart as PieChartIcon, RefreshCw, Lock, Eye, EyeOff,
  Calendar, Download, ArrowUpRight, ArrowDownRight, Percent,
  Package, Truck, CreditCard, Banknote, Smartphone, Users,
  Target, Activity, Zap, Shield, FileSpreadsheet, Filter,
  ChevronDown, ChevronUp, AlertTriangle, Clock, Star,
  Settings, Database, FileDown
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
  ComposedChart, Area, AreaChart, RadialBarChart, RadialBar
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client-safe';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ReportsTab = lazy(() => import('./admin/tabs/ReportsTab').then(m => ({ default: m.ReportsTab })));
const SettingsTab = lazy(() => import('./admin/tabs/SettingsTab').then(m => ({ default: m.SettingsTab })));
const BackupDataTab = lazy(() => import('./admin/tabs/BackupDataTab').then(m => ({ default: m.BackupDataTab })));
const ImportProductsTab = lazy(() => import('./admin/tabs/ImportProductsTab'));
const PredictiveProjectionsTab = lazy(() => import('./admin/PredictiveProjectionsTab').then(m => ({ default: m.PredictiveProjectionsTab })));
const RoiTab = lazy(() => import('./admin/RoiTab').then(m => ({ default: m.RoiTab })));

const MANAGER_SESSION_KEY = '__manager_auth';
const MANAGER_SESSION_EXPIRY_KEY = '__manager_auth_exp';
const MANAGER_SESSION_DURATION = 8 * 60 * 60 * 1000;

function isManagerSessionValid(): boolean {
  if (typeof window === 'undefined') return false;
  const flag = localStorage.getItem(MANAGER_SESSION_KEY);
  const expiry = localStorage.getItem(MANAGER_SESSION_EXPIRY_KEY);
  if (flag !== '1' || !expiry) return false;
  return Date.now() < Number(expiry);
}

function setManagerSession() {
  localStorage.setItem(MANAGER_SESSION_KEY, '1');
  localStorage.setItem(MANAGER_SESSION_EXPIRY_KEY, String(Date.now() + MANAGER_SESSION_DURATION));
}

function clearManagerSession() {
  localStorage.removeItem(MANAGER_SESSION_KEY);
  localStorage.removeItem(MANAGER_SESSION_EXPIRY_KEY);
  localStorage.removeItem('__manager_session_token');
}

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDateForInput = (date: Date) => format(date, 'yyyy-MM-dd');

const COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', card_credit: 'Crédito', card_debit: 'Débito', card_pos: 'Maquininha'
};

const SANGRIA_LABELS: Record<string, string> = {
  sangria: 'Sangria', despesa: 'Despesa', transferencia: 'Transferência',
  pagamento: 'Pagamento', ajuste: 'Ajuste', outros: 'Outros',
  compra_produtos: 'Compra Produtos', combustivel: 'Combustível'
};

export default function Financeiro() {
  const { login: authLogin } = useAuth();
  const [authenticated, setAuthenticated] = useState(() => isManagerSessionValid());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const today = new Date();
  const [startDateStr, setStartDateStr] = useState(formatDateForInput(startOfMonth(today)));
  const [endDateStr, setEndDateStr] = useState(formatDateForInput(today));
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (!isManagerSessionValid()) {
      clearManagerSession();
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length !== 8) return;

    setLoginLoading(true);
    setError('');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-manager-password', {
        body: { password, context: 'financeiro' }
      });

      if (fnError) {
        setError(data?.error || fnError.message || 'Erro ao verificar senha');
        return;
      }

      if (!data?.success) {
        setError(data?.error || 'Senha incorreta');
        return;
      }

      if (!data.user || !data.sessionToken || !data.accessToken || !data.refreshToken) {
        setError('Falha ao iniciar sessão administrativa');
        return;
      }

      await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });

      authLogin(
        { id: data.user.id, name: data.user.name, whatsapp: data.user.whatsapp, role: 'admin' },
        'admin',
        data.sessionToken
      );

      localStorage.setItem('__manager_session_token', data.sessionToken);
      setManagerSession();
      setAuthenticated(true);
      setPassword('');
    } catch (loginError) {
      console.error('[Financeiro] Login error:', loginError);
      setError('Erro de conexão');
    } finally {
      setLoginLoading(false);
    }
  };

  // Fetch all orders
  const { data: allOrders = [], isLoading: loadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['financeiro-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_orders_complete');
      if (error) {
        const { data: d2, error: e2 } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (e2) throw e2;
        return d2 || [];
      }
      return data || [];
    },
    enabled: authenticated,
  });

  // Fetch all order items
  const orderIds = useMemo(() => allOrders.map(o => o.id), [allOrders]);
  const { data: allOrderItems = [] } = useQuery({
    queryKey: ['financeiro-order-items', orderIds.length],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase.rpc('get_all_order_items', { p_order_ids: orderIds });
      if (error) return [];
      return data || [];
    },
    enabled: authenticated && orderIds.length > 0,
  });

  // Fetch sangrias
  const { data: allSangrias = [] } = useQuery({
    queryKey: ['financeiro-sangrias'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sangrias').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authenticated,
  });

  // Fetch products
  const { data: allProducts = [] } = useQuery({
    queryKey: ['financeiro-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data || [];
    },
    enabled: authenticated,
  });

  // Fetch cash closures
  const { data: allClosures = [] } = useQuery({
    queryKey: ['financeiro-closures'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_cash_closures');
      if (error) return [];
      return data || [];
    },
    enabled: authenticated,
  });

  // Fetch platform sales
  const { data: allPlatformSales = [] } = useQuery({
    queryKey: ['financeiro-platform-sales'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_platform_sales', {});
      if (error) return [];
      return data || [];
    },
    enabled: authenticated,
  });

  // Fetch caderneta entries
  const { data: allCaderneta = [] } = useQuery({
    queryKey: ['financeiro-caderneta'],
    queryFn: async () => {
      const { data, error } = await supabase.from('caderneta_entries').select('*');
      if (error) return [];
      return data || [];
    },
    enabled: authenticated,
  });

  // Fetch cash transactions (saques)
  const { data: allCashTransactions = [] } = useQuery({
    queryKey: ['financeiro-cash-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cash_transactions').select('*');
      if (error) return [];
      return data || [];
    },
    enabled: authenticated,
  });

  // Real profit RPC
  const { data: realProfitData } = useQuery({
    queryKey: ['financeiro-real-profit', startDateStr, endDateStr],
    queryFn: async () => {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      end.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.rpc('calculate_real_profit', {
        p_start: start.toISOString(), p_end: end.toISOString()
      });
      if (error) return null;
      return Array.isArray(data) ? data[0] : data;
    },
    enabled: authenticated,
  });

  // Date-filtered data
  const orders = useMemo(() => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    return allOrders.filter(o => {
      if (!o.created_at || o.status === 'cancelled') return false;
      const d = new Date(o.created_at);
      if (d < start || d > end) return false;
      if (paymentFilter !== 'all' && o.payment_method !== paymentFilter) return false;
      if (orderTypeFilter !== 'all' && o.order_type !== orderTypeFilter) return false;
      return true;
    });
  }, [allOrders, startDateStr, endDateStr, paymentFilter, orderTypeFilter]);

  const sangrias = useMemo(() => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    return allSangrias.filter(s => {
      if (!s.created_at) return false;
      const d = new Date(s.created_at);
      return d >= start && d <= end;
    });
  }, [allSangrias, startDateStr, endDateStr]);

  const platformSales = useMemo(() => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    return allPlatformSales.filter(s => {
      if (!s.created_at) return false;
      const d = new Date(s.created_at);
      return d >= start && d <= end;
    });
  }, [allPlatformSales, startDateStr, endDateStr]);

  const cadernetaFiltered = useMemo(() => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    return allCaderneta.filter(c => {
      if (!c.created_at) return false;
      const d = new Date(c.created_at);
      return d >= start && d <= end;
    });
  }, [allCaderneta, startDateStr, endDateStr]);

  // Order items for this period
  const periodOrderIds = useMemo(() => new Set(orders.map(o => o.id)), [orders]);
  const periodItems = useMemo(() => allOrderItems.filter(i => periodOrderIds.has(i.order_id)), [allOrderItems, periodOrderIds]);

  // ========== METRICS ==========
  const metrics = useMemo(() => {
    const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
    const totalSubtotal = orders.reduce((s, o) => s + Number(o.subtotal), 0);
    const totalDeliveryFees = orders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
    const totalDiscount = orders.reduce((s, o) => s + Number(o.discount || 0), 0);
    const counterOrders = orders.filter(o => o.order_type === 'counter');
    const deliveryOrders = orders.filter(o => o.order_type === 'delivery');
    const totalCounter = counterOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalDelivery = deliveryOrders.reduce((s, o) => s + Number(o.total), 0);

    const byPayment: Record<string, number> = {};
    orders.forEach(o => {
      const m = o.payment_method || 'unknown';
      byPayment[m] = (byPayment[m] || 0) + Number(o.total);
    });

    const totalSangrias = sangrias.reduce((s, sg) => s + Number(sg.amount), 0);
    const despesas = sangrias.filter(s => s.type === 'despesa').reduce((s, sg) => s + Number(sg.amount), 0);

    // Saques (lidos da tabela cash_transactions, no período)
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    const periodCashTx = (allCashTransactions || []).filter((t: any) => {
      if (!t.created_at || t.type !== 'saque') return false;
      const d = new Date(t.created_at);
      return d >= start && d <= end;
    });
    const saques = periodCashTx.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const saqueFees = periodCashTx.reduce((s: number, t: any) => s + Number(t.fee || 0), 0);
    const saqueCount = periodCashTx.length;

    const productCost = realProfitData?.total_product_cost || totalSales * 0.6;
    // Lucro com vendas + lucro com taxas de saque
    const grossProfit = (realProfitData?.gross_profit || totalSales * 0.4) + saqueFees;
    const netProfit = grossProfit - totalSangrias;
    const marginPercent = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
    const avgTicket = orders.length > 0 ? totalSales / orders.length : 0;
    const avgTicketCounter = counterOrders.length > 0 ? totalCounter / counterOrders.length : 0;
    const avgTicketDelivery = deliveryOrders.length > 0 ? totalDelivery / deliveryOrders.length : 0;

    // Platform sales
    const totalPlatform = platformSales.reduce((s, p) => s + Number(p.total_price), 0);

    // Caderneta
    const cadernetaTotal = cadernetaFiltered.reduce((s, c) => s + Number(c.total_price), 0);
    const cadernetaPaid = cadernetaFiltered.filter(c => c.is_paid).reduce((s, c) => s + Number(c.total_price), 0);
    const cadernetaPending = cadernetaTotal - cadernetaPaid;

    // Days in period
    const daysInPeriod = differenceInDays(new Date(endDateStr), new Date(startDateStr)) + 1;
    const avgDailySales = daysInPeriod > 0 ? totalSales / daysInPeriod : 0;
    const avgDailyOrders = daysInPeriod > 0 ? orders.length / daysInPeriod : 0;

    // Hourly distribution
    const byHour: number[] = Array(24).fill(0);
    const ordersByHour: number[] = Array(24).fill(0);
    orders.forEach(o => {
      if (o.created_at) {
        const h = new Date(o.created_at).getHours();
        byHour[h] += Number(o.total);
        ordersByHour[h]++;
      }
    });
    const peakHour = byHour.indexOf(Math.max(...byHour));

    // Top products
    const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
    periodItems.forEach(item => {
      const key = item.product_name;
      if (!productSales[key]) productSales[key] = { name: key, qty: 0, revenue: 0 };
      productSales[key].qty += item.quantity;
      productSales[key].revenue += Number(item.total_price);
    });
    const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 15);

    // Day of week distribution
    const byDow: Record<string, { sales: number; count: number }> = {};
    const dowNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    dowNames.forEach(d => { byDow[d] = { sales: 0, count: 0 }; });
    orders.forEach(o => {
      if (o.created_at) {
        const dow = dowNames[new Date(o.created_at).getDay()];
        byDow[dow].sales += Number(o.total);
        byDow[dow].count++;
      }
    });

    return {
      totalSales, totalSubtotal, totalDeliveryFees, totalDiscount,
      counterOrders: counterOrders.length, deliveryOrders: deliveryOrders.length,
      totalCounter, totalDelivery, byPayment,
      totalSangrias, saques, saqueFees, saqueCount, despesas,
      productCost, grossProfit, netProfit, marginPercent,
      avgTicket, avgTicketCounter, avgTicketDelivery,
      totalPlatform, cadernetaTotal, cadernetaPaid, cadernetaPending,
      daysInPeriod, avgDailySales, avgDailyOrders, peakHour,
      topProducts, byHour, ordersByHour, byDow, totalOrders: orders.length,
    };
  }, [orders, sangrias, platformSales, cadernetaFiltered, periodItems, realProfitData, startDateStr, endDateStr, allCashTransactions]);

  // ========== CHART DATA ==========
  const dailyData = useMemo(() => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const days = eachDayOfInterval({ start, end });
    const overallMargin = metrics.totalSales > 0 ? metrics.grossProfit / metrics.totalSales : 0.4;

    return days.map(day => {
      const key = format(day, 'dd/MM');
      const dayOrders = orders.filter(o => o.created_at && format(new Date(o.created_at), 'dd/MM') === key);
      const daySangrias = sangrias.filter(s => s.created_at && format(new Date(s.created_at), 'dd/MM') === key);
      const revenue = dayOrders.reduce((s, o) => s + Number(o.total), 0);
      const cost = revenue * (1 - overallMargin);
      const sangriaTotal = daySangrias.reduce((s, sg) => s + Number(sg.amount), 0);
      return {
        date: key, revenue, cost, gross: revenue - cost,
        sangrias: sangriaTotal, net: revenue - cost - sangriaTotal,
        orders: dayOrders.length,
        counter: dayOrders.filter(o => o.order_type === 'counter').reduce((s, o) => s + Number(o.total), 0),
        delivery: dayOrders.filter(o => o.order_type === 'delivery').reduce((s, o) => s + Number(o.total), 0),
      };
    });
  }, [orders, sangrias, startDateStr, endDateStr, metrics.grossProfit, metrics.totalSales]);

  // ========== GLOBAL PRODUCT RANKING (toda a base de dados, sem filtro de data) ==========
  const globalRanking = useMemo(() => {
    // Apenas pedidos não cancelados
    const validOrderIds = new Set(
      allOrders.filter((o: any) => o.status !== 'cancelled').map((o: any) => o.id)
    );

    // Normaliza itens montados (copão / combos / monte seu drink) para agrupar
    // no ranking — cada um tem um nome único (receita com doses/frutas), então
    // sem normalização nunca somam entre si.
    const normalizeName = (item: any): string => {
      const raw = (item.product_name || 'SEM NOME').trim();
      if (!item.is_wizard_item) return raw;
      // Primeira linha da receita (ex.: "🍷 COPÃO (1/2)") vira a categoria
      let head = raw.split('\n')[0].trim();
      head = head.replace(/\s*\(\d+\/\d+\)\s*$/, ''); // remove sufixo (1/2)
      head = head.replace(/^[^\p{L}\p{N}]+/u, '').trim(); // remove emoji inicial
      if (/cop[aã]o/i.test(head)) return 'COPÃO (MONTE SEU DRINK)';
      if (/combo/i.test(head)) return 'COMBO';
      if (/caipi/i.test(head)) return 'CAIPIRINHA';
      if (/batida/i.test(head)) return 'BATIDA';
      if (/drink/i.test(head)) return 'DRINK ESPECIAL';
      return (head || 'ITEM MONTADO').toUpperCase();
    };

    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    allOrderItems.forEach((item: any) => {
      if (!validOrderIds.has(item.order_id)) return;
      const key = normalizeName(item);
      if (!map[key]) map[key] = { name: key, qty: 0, revenue: 0 };
      map[key].qty += Number(item.quantity || 0);
      map[key].revenue += Number(item.total_price || 0);
    });

    const list = Object.values(map);
    const totalRevenue = list.reduce((s, p) => s + p.revenue, 0);
    const totalUnits = list.reduce((s, p) => s + p.qty, 0);

    const byRevenue = [...list]
      .sort((a, b) => b.revenue - a.revenue)
      .map((p, i) => ({
        ...p,
        rank: i + 1,
        revenuePct: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
        qtyPct: totalUnits > 0 ? (p.qty / totalUnits) * 100 : 0,
        avgPrice: p.qty > 0 ? p.revenue / p.qty : 0,
      }));

    const byQty = [...byRevenue].sort((a, b) => b.qty - a.qty);

    return {
      list: byRevenue,
      byQty,
      totalRevenue,
      totalUnits,
      productCount: list.length,
      ordersCount: validOrderIds.size,
    };
  }, [allOrders, allOrderItems]);

  const paymentChartData = useMemo(() =>
    Object.entries(metrics.byPayment).map(([k, v]) => ({
      name: PAYMENT_LABELS[k] || k, value: v
    })).filter(d => d.value > 0),
  [metrics.byPayment]);

  const hourlyData = useMemo(() =>
    metrics.byHour.map((val, h) => ({
      hour: `${h}h`, sales: val, orders: metrics.ordersByHour[h]
    })),
  [metrics.byHour, metrics.ordersByHour]);

  const dowData = useMemo(() =>
    Object.entries(metrics.byDow).map(([name, data]) => ({ name, ...data })),
  [metrics.byDow]);

  // Quick period filters
  const setQuickPeriod = (period: string) => {
    const t = new Date();
    switch (period) {
      case 'today': setStartDateStr(formatDateForInput(t)); setEndDateStr(formatDateForInput(t)); break;
      case 'yesterday': { const y = subDays(t, 1); setStartDateStr(formatDateForInput(y)); setEndDateStr(formatDateForInput(y)); break; }
      case 'week': setStartDateStr(formatDateForInput(startOfWeek(t, { weekStartsOn: 1 }))); setEndDateStr(formatDateForInput(t)); break;
      case 'month': setStartDateStr(formatDateForInput(startOfMonth(t))); setEndDateStr(formatDateForInput(t)); break;
      case '30d': setStartDateStr(formatDateForInput(subDays(t, 30))); setEndDateStr(formatDateForInput(t)); break;
      case '90d': setStartDateStr(formatDateForInput(subDays(t, 90))); setEndDateStr(formatDateForInput(t)); break;
    }
  };

  // Export PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('RELATORIO FINANCEIRO CONFIDENCIAL', 14, 20);
    doc.setFontSize(9);
    doc.text(`Periodo: ${startDateStr} a ${endDateStr} | Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);

    const rows = [
      ['Faturamento Total', formatCurrency(metrics.totalSales)],
      ['Total Pedidos', String(metrics.totalOrders)],
      ['Pedidos Balcao', `${metrics.counterOrders} (${formatCurrency(metrics.totalCounter)})`],
      ['Pedidos Delivery', `${metrics.deliveryOrders} (${formatCurrency(metrics.totalDelivery)})`],
      ['Ticket Medio', formatCurrency(metrics.avgTicket)],
      ['', ''],
      ['PAGAMENTOS', ''],
      ...Object.entries(metrics.byPayment).map(([k, v]) => [PAYMENT_LABELS[k] || k, formatCurrency(v)]),
      ['', ''],
      ['CUSTOS E LUCRO', ''],
      ['Custo Produtos', formatCurrency(metrics.productCost)],
      ['Lucro Bruto', formatCurrency(metrics.grossProfit)],
      ['Margem', `${metrics.marginPercent.toFixed(1)}%`],
      ['Total Sangrias', formatCurrency(metrics.totalSangrias)],
      ['Lucro Liquido', formatCurrency(metrics.netProfit)],
      ['', ''],
      ['MEDIAS DIARIAS', ''],
      ['Faturamento/dia', formatCurrency(metrics.avgDailySales)],
      ['Pedidos/dia', metrics.avgDailyOrders.toFixed(1)],
      ['Horario Pico', `${metrics.peakHour}h`],
    ];

    autoTable(doc, { startY: 34, body: rows, theme: 'striped', styles: { fontSize: 9 } });

    if (metrics.topProducts.length > 0) {
      const y = (doc as any).lastAutoTable.finalY + 10;
      doc.text('TOP PRODUTOS', 14, y);
      autoTable(doc, {
        startY: y + 4,
        head: [['Produto', 'Qtd', 'Receita']],
        body: metrics.topProducts.map(p => [p.name, String(p.qty), formatCurrency(p.revenue)]),
      });
    }

    doc.save(`financeiro-${startDateStr}-a-${endDateStr}.pdf`);
    toast({ title: 'PDF exportado com sucesso!' });
  };

  // ========== LOGIN SCREEN ==========
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Área Financeira</CardTitle>
            <CardDescription>Acesso restrito ao administrador</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fin-pass">Senha de acesso</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="fin-pass"
                    type={showPassword ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={8}
                    value={password}
                    onChange={e => { 
                      const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setPassword(val); 
                      setError(''); 
                    }}
                    placeholder="••••••••"
                    className="pl-10 pr-10 tracking-widest text-center text-lg"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={password.length !== 8 || loginLoading}>
                {loginLoading ? 'Verificando...' : 'Acessar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingOrders) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-lg">Carregando dados financeiros...</span>
      </div>
    );
  }

  // ========== MAIN DASHBOARD ==========
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Painel Financeiro</h1>
            <Badge variant="outline" className="text-xs">Confidencial</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { refetchOrders(); toast({ title: 'Dados atualizados!' }); }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportPDF}>
              <Download className="w-3.5 h-3.5 mr-1" /> PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAuthenticated(false)}>
              <Lock className="w-3.5 h-3.5 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Filters */}
        <Card className="border-primary/10">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex gap-1 flex-wrap">
                {[
                  { label: 'Hoje', val: 'today' }, { label: 'Ontem', val: 'yesterday' },
                  { label: 'Semana', val: 'week' }, { label: 'Mês', val: 'month' },
                  { label: '30 dias', val: '30d' }, { label: '90 dias', val: '90d' },
                ].map(p => (
                  <Button key={p.val} size="sm" variant="outline" onClick={() => setQuickPeriod(p.val)}
                    className="text-xs h-8">{p.label}</Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={startDateStr} onChange={e => setStartDateStr(e.target.value)} className="h-8 text-xs w-36" />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={endDateStr} onChange={e => setEndDateStr(e.target.value)} className="h-8 text-xs w-36" />
                </div>
              </div>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Pagamento</SelectItem>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="card_credit">Crédito</SelectItem>
                  <SelectItem value="card_debit">Débito</SelectItem>
                </SelectContent>
              </Select>
              <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo</SelectItem>
                  <SelectItem value="counter">Balcão</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Período: {metrics.daysInPeriod} dia(s) | {metrics.totalOrders} pedidos filtrados
            </p>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="text-xs">Visão Geral</TabsTrigger>
            <TabsTrigger value="revenue" className="text-xs">Faturamento</TabsTrigger>
            <TabsTrigger value="profit" className="text-xs">Lucro & Custos</TabsTrigger>
            <TabsTrigger value="payments" className="text-xs">Pagamentos</TabsTrigger>
            <TabsTrigger value="products" className="text-xs">Produtos</TabsTrigger>
            <TabsTrigger value="ranking" className="text-xs gap-1"><Star className="w-3 h-3" />Ranking Geral</TabsTrigger>
            <TabsTrigger value="patterns" className="text-xs">Padrões</TabsTrigger>
            <TabsTrigger value="sangrias" className="text-xs">Sangrias</TabsTrigger>
            <TabsTrigger value="speculation" className="text-xs">Projeções</TabsTrigger>
            <TabsTrigger value="roi" className="text-xs gap-1"><Target className="w-3 h-3" />ROI</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs gap-1"><BarChart3 className="w-3 h-3" />Relatórios</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs gap-1"><Settings className="w-3 h-3" />Configurações</TabsTrigger>
            <TabsTrigger value="import" className="text-xs gap-1"><FileDown className="w-3 h-3" />Importar CSV</TabsTrigger>
            <TabsTrigger value="backup" className="text-xs gap-1"><Database className="w-3 h-3" />BKP e Dados</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={DollarSign} label="Faturamento" value={formatCurrency(metrics.totalSales)}
                sub={`${metrics.totalOrders} pedidos`} color="text-green-400" />
              <MetricCard icon={TrendingUp} label="Lucro Bruto" value={formatCurrency(metrics.grossProfit)}
                sub={`Margem: ${metrics.marginPercent.toFixed(1)}%`} color="text-emerald-400" />
              <MetricCard icon={TrendingDown} label="Lucro Líquido" value={formatCurrency(metrics.netProfit)}
                sub={`Após ${formatCurrency(metrics.totalSangrias)} sangrias`}
                color={metrics.netProfit >= 0 ? 'text-green-400' : 'text-red-400'} />
              <MetricCard icon={Target} label="Ticket Médio" value={formatCurrency(metrics.avgTicket)}
                sub={`Balcão: ${formatCurrency(metrics.avgTicketCounter)}`} color="text-blue-400" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={ShoppingBag} label="Balcão" value={String(metrics.counterOrders)}
                sub={formatCurrency(metrics.totalCounter)} color="text-purple-400" />
              <MetricCard icon={Truck} label="Delivery" value={String(metrics.deliveryOrders)}
                sub={`Taxas: ${formatCurrency(metrics.totalDeliveryFees)}`} color="text-cyan-400" />
              <MetricCard icon={Activity} label="Média Diária" value={formatCurrency(metrics.avgDailySales)}
                sub={`${metrics.avgDailyOrders.toFixed(1)} pedidos/dia`} color="text-amber-400" />
              <MetricCard icon={Clock} label="Horário Pico" value={`${metrics.peakHour}h`}
                sub={`${formatCurrency(metrics.byHour[metrics.peakHour])} neste horário`} color="text-orange-400" />
            </div>

            {/* Revenue chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Faturamento Diário</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                      <Bar dataKey="counter" name="Balcão" fill="#8b5cf6" stackId="a" />
                      <Bar dataKey="delivery" name="Delivery" fill="#3b82f6" stackId="a" />
                      <Line dataKey="net" name="Lucro Líq." stroke="#22c55e" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* REVENUE */}
          <TabsContent value="revenue" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Receita por Canal</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <RevenueBar label="Balcão" value={metrics.totalCounter} total={metrics.totalSales} color="bg-purple-500" />
                    <RevenueBar label="Delivery" value={metrics.totalDelivery} total={metrics.totalSales} color="bg-blue-500" />
                    <RevenueBar label="Plataformas" value={metrics.totalPlatform} total={metrics.totalSales + metrics.totalPlatform} color="bg-amber-500" />
                    <Separator />
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Total Geral</span>
                      <span>{formatCurrency(metrics.totalSales + metrics.totalPlatform)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução de Receita</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Area type="monotone" dataKey="revenue" name="Receita" fill="#8b5cf6" fillOpacity={0.3} stroke="#8b5cf6" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Delivery fees analysis */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Descontos e Taxas</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{formatCurrency(metrics.totalDeliveryFees)}</p>
                    <p className="text-xs text-muted-foreground">Taxas de Entrega</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{formatCurrency(metrics.totalDiscount)}</p>
                    <p className="text-xs text-muted-foreground">Descontos Dados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-400">{formatCurrency(metrics.cadernetaTotal)}</p>
                    <p className="text-xs text-muted-foreground">Caderneta Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-400">{formatCurrency(metrics.cadernetaPending)}</p>
                    <p className="text-xs text-muted-foreground">Caderneta Pendente</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PROFIT & COSTS */}
          <TabsContent value="profit" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MetricCard icon={DollarSign} label="Receita" value={formatCurrency(metrics.totalSales)} color="text-blue-400" />
              <MetricCard icon={Package} label="Custo Produtos" value={formatCurrency(metrics.productCost)}
                sub={`${(metrics.totalSales > 0 ? (metrics.productCost / metrics.totalSales) * 100 : 0).toFixed(1)}% da receita`}
                color="text-red-400" />
              <MetricCard icon={TrendingUp} label="Lucro Bruto" value={formatCurrency(metrics.grossProfit)}
                sub={`Margem: ${metrics.marginPercent.toFixed(1)}%`} color="text-green-400" />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Composição Lucro/Custo Diário</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                      <Bar dataKey="revenue" name="Faturamento" fill="#3b82f6" />
                      <Bar dataKey="cost" name="Custo" fill="#ef4444" />
                      <Line dataKey="gross" name="Lucro Bruto" stroke="#22c55e" strokeWidth={2} />
                      <Line dataKey="net" name="Lucro Líquido" stroke="#f59e0b" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Profit summary */}
            <Card className="border-green-500/20">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo de Resultados</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Faturamento Bruto</span><span className="font-bold">{formatCurrency(metrics.totalSales)}</span></div>
                  <div className="flex justify-between text-red-400"><span>(-) Custo Produtos</span><span>{formatCurrency(metrics.productCost)}</span></div>
                  <Separator />
                  <div className="flex justify-between text-green-400 font-semibold"><span>= Lucro Bruto</span><span>{formatCurrency(metrics.grossProfit)}</span></div>
                  <div className="flex justify-between text-orange-400"><span>(-) Sangrias/Despesas</span><span>{formatCurrency(metrics.totalSangrias)}</span></div>
                  <Separator />
                  <div className={cn("flex justify-between font-bold text-lg", metrics.netProfit >= 0 ? 'text-green-400' : 'text-red-400')}>
                    <span>= Lucro Líquido</span><span>{formatCurrency(metrics.netProfit)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PAYMENTS */}
          <TabsContent value="payments" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Forma de Pagamento</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={paymentChartData} cx="50%" cy="50%" outerRadius={90} innerRadius={50}
                          dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                          {paymentChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Detalhamento</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(metrics.byPayment).sort((a, b) => b[1] - a[1]).map(([method, value]) => (
                      <div key={method} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {method === 'cash' && <Banknote className="w-4 h-4 text-green-400" />}
                          {method === 'pix' && <Smartphone className="w-4 h-4 text-cyan-400" />}
                          {(method === 'card_credit' || method === 'card_debit' || method === 'card_pos') && <CreditCard className="w-4 h-4 text-purple-400" />}
                          <span className="text-sm">{PAYMENT_LABELS[method] || method}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-sm">{formatCurrency(value)}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({metrics.totalSales > 0 ? ((value / metrics.totalSales) * 100).toFixed(1) : 0}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PRODUCTS */}
          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top 15 Produtos por Receita</CardTitle></CardHeader>
              <CardContent>
                {metrics.topProducts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum dado de itens disponível para o período.</p>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Produto</TableHead>
                          <TableHead className="text-xs text-right">Qtd</TableHead>
                          <TableHead className="text-xs text-right">Receita</TableHead>
                          <TableHead className="text-xs text-right">% Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.topProducts.map((p, i) => (
                          <TableRow key={p.name}>
                            <TableCell className="text-xs">
                              {i < 3 ? <Star className="w-3.5 h-3.5 text-amber-400 inline" /> : i + 1}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{p.name}</TableCell>
                            <TableCell className="text-xs text-right">{p.qty}</TableCell>
                            <TableCell className="text-xs text-right font-semibold">{formatCurrency(p.revenue)}</TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground">
                              {metrics.totalSales > 0 ? ((p.revenue / metrics.totalSales) * 100).toFixed(1) : 0}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Receita por Produto (Top 10)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.topProducts.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `R$${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="revenue" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ranking" className="space-y-4">
            {/* Resumo geral da base de dados */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Package className="w-3.5 h-3.5" /> Produtos vendidos
                  </div>
                  <p className="text-2xl font-bold">{globalRanking.productCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <ShoppingBag className="w-3.5 h-3.5" /> Unidades vendidas
                  </div>
                  <p className="text-2xl font-bold">{globalRanking.totalUnits.toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="w-3.5 h-3.5" /> Faturamento total
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(globalRanking.totalRevenue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <ShoppingBag className="w-3.5 h-3.5" /> Pedidos
                  </div>
                  <p className="text-2xl font-bold">{globalRanking.ordersCount.toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Database className="w-3 h-3" /> Análise de toda a base de dados (todos os pedidos não cancelados, sem filtro de data).
            </p>

            {/* Gráfico Top 15 por unidades */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top 15 Mais Vendidos (Unidades)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={globalRanking.byQty.slice(0, 15)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={140} />
                      <Tooltip formatter={(v: number, n: string) => n === 'qty' ? [`${v} un`, 'Qtd'] : [formatCurrency(v), 'Receita']} />
                      <Bar dataKey="qty" fill="#22c55e" name="qty" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gráfico Top 10 por faturamento */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 por Faturamento</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={globalRanking.list.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `R$${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={140} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="revenue" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tabela completa do ranking */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Ranking Completo de Produtos</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1"
                  onClick={() => {
                    const rows = globalRanking.list.map(p =>
                      [p.rank, `"${p.name.replace(/"/g, '""')}"`, p.qty, p.qtyPct.toFixed(2), p.revenue.toFixed(2), p.revenuePct.toFixed(2), p.avgPrice.toFixed(2)].join(',')
                    );
                    const csv = ['Rank,Produto,Unidades,% Unidades,Faturamento,% Faturamento,Preço Médio', ...rows].join('\n');
                    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ranking-produtos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <FileDown className="w-3 h-3" /> CSV
                </Button>
              </CardHeader>
              <CardContent>
                {globalRanking.list.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum dado de vendas disponível.</p>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Produto</TableHead>
                          <TableHead className="text-xs text-right">Unid.</TableHead>
                          <TableHead className="text-xs text-right">% Unid.</TableHead>
                          <TableHead className="text-xs text-right">Faturamento</TableHead>
                          <TableHead className="text-xs text-right">% Fat.</TableHead>
                          <TableHead className="text-xs text-right">Preço Médio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {globalRanking.list.map((p) => (
                          <TableRow key={p.name}>
                            <TableCell className="text-xs">
                              {p.rank <= 3 ? <Star className="w-3.5 h-3.5 text-amber-400 inline" /> : p.rank}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{p.name}</TableCell>
                            <TableCell className="text-xs text-right">{p.qty}</TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground">{p.qtyPct.toFixed(1)}%</TableCell>
                            <TableCell className="text-xs text-right font-semibold">{formatCurrency(p.revenue)}</TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground">{p.revenuePct.toFixed(1)}%</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(p.avgPrice)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PATTERNS */}
          <TabsContent value="patterns" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Vendas por Hora</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v: number, name: string) => name === 'sales' ? formatCurrency(v) : v} />
                        <Bar dataKey="sales" name="Vendas" fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Vendas por Dia da Semana</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dowData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Bar dataKey="sales" name="Vendas" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pedidos por Hora</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip />
                      <Line dataKey="orders" name="Pedidos" stroke="#f59e0b" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SANGRIAS */}
          <TabsContent value="sangrias" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={TrendingDown} label="Total Sangrias" value={formatCurrency(metrics.totalSangrias)} color="text-red-400" />
              <MetricCard icon={ArrowDownRight} label="Saques (saiu do caixa)" value={formatCurrency(metrics.saques)} color="text-orange-400" />
              <MetricCard icon={TrendingUp} label="Lucro Saques (taxa)" value={formatCurrency(metrics.saqueFees)} color="text-emerald-400" />
              <MetricCard icon={AlertTriangle} label="Despesas" value={formatCurrency(metrics.despesas)} color="text-amber-400" />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Sangrias por Tipo</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Responsável</TableHead>
                        <TableHead className="text-xs">Descrição</TableHead>
                        <TableHead className="text-xs text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sangrias.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs">{s.created_at ? format(new Date(s.created_at), 'dd/MM HH:mm') : '-'}</TableCell>
                          <TableCell className="text-xs"><Badge variant="outline" className="text-xs">{SANGRIA_LABELS[s.type] || s.type}</Badge></TableCell>
                          <TableCell className="text-xs">{s.responsible}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.description || '-'}</TableCell>
                          <TableCell className="text-xs text-right font-semibold text-red-400">{formatCurrency(Number(s.amount))}</TableCell>
                        </TableRow>
                      ))}
                      {sangrias.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-xs">Nenhuma sangria no período</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SPECULATION / PROJECTIONS */}
          <TabsContent value="speculation" className="space-y-4">
            <Suspense fallback={<TabSkeleton />}>
              <PredictiveProjectionsTab
                orders={orders as any}
                allOrdersUnfiltered={allOrders as any}
                metrics={metrics}
                formatCurrency={formatCurrency}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="roi" className="space-y-4">
            <Suspense fallback={<TabSkeleton />}>
              <RoiTab
                metrics={metrics}
                allProducts={allProducts}
                allOrderItems={allOrderItems}
                allOrders={allOrders}
                formatCurrency={formatCurrency}
              />
            </Suspense>
          </TabsContent>


          <TabsContent value="reports">
            <Suspense fallback={<TabSkeleton />}><ReportsTab /></Suspense>
          </TabsContent>
          <TabsContent value="settings">
            <Suspense fallback={<TabSkeleton />}><SettingsTab /></Suspense>
          </TabsContent>
          <TabsContent value="import">
            <Suspense fallback={<TabSkeleton />}><ImportProductsTab /></Suspense>
          </TabsContent>
          <TabsContent value="backup">
            <Suspense fallback={<TabSkeleton />}><BackupDataTab /></Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ========== SUB COMPONENTS ==========
function MetricCard({ icon: Icon, label, value, sub, color = 'text-primary' }: {
  icon: any; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className={cn("text-lg font-bold mt-0.5", color)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <Icon className={cn("w-5 h-5 flex-shrink-0", color)} />
        </div>
      </CardContent>
    </Card>
  );
}

function RevenueBar({ label, value, total, color }: { label: string; value: number; total: number; color: string; }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{formatCurrency(value)} <span className="text-xs text-muted-foreground">({pct.toFixed(1)}%)</span></span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function ProjectionCard({ title, revenue, profit, orders }: { title: string; revenue: number; profit: number; orders: number; }) {
  return (
    <Card className="border-dashed border-amber-500/20">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs font-semibold text-amber-400 mb-2">{title}</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Receita</span><span className="font-semibold">{formatCurrency(revenue)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Lucro Líq.</span><span className={cn("font-semibold", profit >= 0 ? 'text-green-400' : 'text-red-400')}>{formatCurrency(profit)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Pedidos</span><span>{orders}</span></div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightRow({ type, text }: { type: 'success' | 'warning' | 'info'; text: string; }) {
  const styles = {
    success: 'border-green-500/20 bg-green-500/5 text-green-300',
    warning: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    info: 'border-blue-500/20 bg-blue-500/5 text-blue-300',
  };
  const icons = { success: '✅', warning: '⚠️', info: 'ℹ️' };
  return (
    <div className={cn("p-2 rounded border text-xs", styles[type])}>
      {icons[type]} {text}
    </div>
  );
}
