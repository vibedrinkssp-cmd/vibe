import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { format, startOfDay, subDays, addDays, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bike, CalendarIcon, DollarSign, TrendingUp, Printer, Filter, Clock, MapPin, User, CreditCard, Package, Ruler, CheckCircle2, Banknote, AlertTriangle, Globe, Eye, EyeOff, FileText, Wallet, XCircle, Send, Plus, Trash2, History } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { isExternalOrder, getPlatformLabel } from '@/lib/external-platforms';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAdminMotoboys, useAdminOrders, useAdminUsers, useAdminOrderItems, useAdminAddresses } from '../use-admin-data';
import { formatCurrency, formatDate } from '../shared';
import type { Order, Motoboy, Address } from '../shared';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';


const PAYMENT_LABELS: Record<string, string> = {
  cash: '💵 Dinheiro',
  pix: '📱 PIX',
  card_pos: '💳 Maquininha',
  card_credit: '💳 Crédito',
  card_debit: '💳 Débito',
  platform: '🌐 Pago pela Plataforma',
};

// Pedidos que exigem baixa de recebimento (motoboy levou ou recebeu pelo restaurante)
const RECEIVABLE_METHODS = new Set(['cash', 'pix', 'card_pos', 'card_credit', 'card_debit']);

// PIX online (Mercado Pago) já vem pago — exige mp_payment_id (prova do webhook MP).
// payment_confirmed sozinho NÃO basta, pois pode ter sido marcado por backfill ou
// confirmação manual de PIX da maquininha local (nesse caso o motoboy ainda recebeu fisicamente).
function isPaidOnline(o: Order): boolean {
  if (o.paymentMethod !== 'pix') return false;
  if (isExternalOrder(o)) return false; // externos tratados à parte
  return !!o.mpPaymentId; // somente PIX com prova de pagamento online via Mercado Pago
}

export function MotoboyClosureTab() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // Data final do intervalo (undefined = dia único). Permite janelas de vários dias.
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [selectedMotoboyId, setSelectedMotoboyId] = useState<string>('all');
  const [expandedMotoboyId, setExpandedMotoboyId] = useState<string | null>(null);
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  // Confirmações persistidas: motoboyId -> true (confirmação agregada legada)
  const [cashConfirmed, setCashConfirmed] = useState<Record<string, boolean>>({});
  // Baixa por pedido: orderId -> { confirmedAt, confirmedBy }
  const [orderConfirmed, setOrderConfirmed] = useState<Record<string, { confirmedAt: string; confirmedBy: string | null }>>({});
  const { toast } = useToast();

  // Comprovantes de pagamento enviados pelos motoboys
  const [proofImageUrl, setProofImageUrl] = useState<string | null>(null);
  const [proofDialogOpen, setProofDialogOpen] = useState(false);
  const { data: paymentProofs = [] } = useQuery({
    queryKey: ['payment-proofs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payment_confirmations')
        .select('order_id, image_url')
        .not('image_url', 'is', null);
      return data || [];
    },
  });
  const proofsByOrderId = useMemo(
    () => new Map(paymentProofs.filter(p => p.image_url).map(p => [p.order_id, p.image_url!])),
    [paymentProofs],
  );
  const handleViewProof = async (orderId: string) => {
    const value = proofsByOrderId.get(orderId);
    if (!value) return;
    let url = value;
    if (!value.startsWith('http')) {
      const { data } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(value, 60 * 60);
      url = data?.signedUrl || value;
    }
    setProofImageUrl(url);
    setProofDialogOpen(true);
  };

  const { data: motoboys = [] } = useAdminMotoboys();
  const { data: allOrders = [] } = useAdminOrders();
  const { data: allUsers = [] } = useAdminUsers();
  const { data: allAddresses = [] } = useAdminAddresses();
  const qc = useQueryClient();

  // ===== Ordens de Pagamento de Motoboy =====
  const { data: paymentOrders = [], refetch: refetchPaymentOrders } = useQuery({
    queryKey: ['motoboy-payment-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_motoboy_payment_orders', {
        p_motoboy_id: null, p_status: null, p_start: null, p_end: null,
      } as any);
      if (error) { console.error('[MPO] list error', error.message); throw error; }
      return (data as any[]) || [];
    },
    refetchInterval: 30000,
  });
  const pendingPaymentOrders = useMemo(
    () => paymentOrders.filter((o: any) => o.status === 'pending'),
    [paymentOrders]
  );

  type MpoModalState = {
    motoboyId: string;
    motoboyName: string;
    mode: 'period' | 'accumulated';
    deliveryFees: string;
    orderIds: string[];
    extraAmount: string;
    extraNote: string;
    extraIds: string[];
    paymentMethod: 'cash' | 'pix';
    pixFullName: string;
    pixKey: string;
    pixKeyType: string;
    submitting: boolean;
    loadingAcc: boolean;
  };
  const [mpoModal, setMpoModal] = useState<MpoModalState | null>(null);

  // ===== Taxas Manuais de Corrida =====
  type ManualExtra = {
    id: string;
    motoboy_id: string;
    description: string;
    amount: number;
    created_by: string | null;
    paid: boolean;
    payment_order_id: string | null;
    paid_at: string | null;
    created_at: string;
  };
  const { data: manualExtras = [], refetch: refetchExtras } = useQuery<ManualExtra[]>({
    queryKey: ['motoboy-manual-extras'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_motoboy_manual_extras', {
        p_motoboy_id: null, p_start: null, p_end: null, p_only_unpaid: false,
      } as any);
      if (error) { console.error('[MME] list', error.message); throw error; }
      return (data as ManualExtra[]) || [];
    },
    refetchInterval: 30000,
  });
  const unpaidExtrasByMotoboy = useMemo(() => {
    const map = new Map<string, ManualExtra[]>();
    for (const e of manualExtras) {
      if (e.paid) continue;
      const arr = map.get(e.motoboy_id) || [];
      arr.push(e);
      map.set(e.motoboy_id, arr);
    }
    return map;
  }, [manualExtras]);

  const [extraModal, setExtraModal] = useState<{
    motoboyId: string; motoboyName: string; description: string; amount: string; submitting: boolean;
  } | null>(null);

  const submitManualExtra = useCallback(async () => {
    if (!extraModal) return;
    const desc = extraModal.description.trim();
    const amt = Number((extraModal.amount || '').replace(/\./g, '').replace(',', '.'));
    if (!desc) { toast({ title: 'Descreva o motivo', variant: 'destructive' }); return; }
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: 'Valor inválido', variant: 'destructive' }); return; }
    setExtraModal(m => m ? { ...m, submitting: true } : m);
    const { error } = await supabase.rpc('add_motoboy_manual_extra', {
      p_motoboy_id: extraModal.motoboyId,
      p_description: desc,
      p_amount: amt,
      p_created_by: 'Admin',
    } as any);
    if (error) {
      toast({ title: 'Erro ao lançar corrida', description: error.message, variant: 'destructive' });
      setExtraModal(m => m ? { ...m, submitting: false } : m);
      return;
    }
    toast({ title: '✅ Corrida lançada', description: `${desc} — ${formatCurrency(amt)}` });
    setExtraModal(null);
    refetchExtras();
  }, [extraModal, toast, refetchExtras]);

  const deleteManualExtra = useCallback(async (id: string) => {
    if (!confirm('Excluir esta corrida lançada?')) return;
    const { error } = await supabase.rpc('delete_motoboy_manual_extra', { p_id: id } as any);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: '🗑️ Corrida removida' });
    refetchExtras();
  }, [toast, refetchExtras]);

  const openPaymentOrderModal = useCallback((stat: {
    motoboy: Motoboy; orders: Order[]; totalFees: number;
  }) => {
    const unpaid = unpaidExtrasByMotoboy.get(stat.motoboy.id) || [];
    const extraSum = unpaid.reduce((s, e) => s + Number(e.amount || 0), 0);
    const extraNote = unpaid.length
      ? unpaid.map(e => `${format(new Date(e.created_at), 'dd/MM HH:mm')} ${e.description} (${formatCurrency(Number(e.amount))})`).join(' | ')
      : '';
    setMpoModal({
      motoboyId: stat.motoboy.id,
      motoboyName: stat.motoboy.name,
      mode: 'period',
      deliveryFees: stat.totalFees.toFixed(2).replace('.', ','),
      orderIds: stat.orders.map(o => o.id),
      extraAmount: extraSum > 0 ? extraSum.toFixed(2).replace('.', ',') : '',
      extraNote,
      extraIds: unpaid.map(e => e.id),
      paymentMethod: 'pix',
      pixFullName: stat.motoboy.name,
      pixKey: '',
      pixKeyType: 'cpf',
      submitting: false,
      loadingAcc: false,
    });
  }, [unpaidExtrasByMotoboy]);

  const switchMpoMode = useCallback(async (mode: 'period' | 'accumulated', stat: {
    motoboy: Motoboy; orders: Order[]; totalFees: number;
  }) => {
    if (mode === 'period') {
      setMpoModal(m => m ? {
        ...m, mode,
        deliveryFees: stat.totalFees.toFixed(2).replace('.', ','),
        orderIds: stat.orders.map(o => o.id),
      } : m);
      return;
    }
    // accumulated: fetch all delivered orders for this motoboy minus already-paid
    setMpoModal(m => m ? { ...m, mode, loadingAcc: true } : m);
    const { data: paidRows } = await supabase.rpc('list_motoboy_paid_order_ids', {
      p_motoboy_id: stat.motoboy.id,
    } as any);
    const paidSet = new Set(((paidRows as any[]) || []).map(r => r.order_id));
    const acc = allOrders.filter(o =>
      o.status === 'delivered' && o.motoboyId === stat.motoboy.id && !paidSet.has(o.id)
    );
    const feeSum = acc.reduce((s, o) => s + Number(o.deliveryFee || 0), 0);
    setMpoModal(m => m ? {
      ...m,
      deliveryFees: feeSum.toFixed(2).replace('.', ','),
      orderIds: acc.map(o => o.id),
      loadingAcc: false,
    } : m);
  }, [allOrders]);

  const parseBR = (v: string) => Number((v || '').replace(/\./g, '').replace(',', '.'));

  const dateRangeRef = useRef<{ from: Date; to: Date }>({ from: new Date(), to: new Date() });
  const submitPaymentOrder = useCallback(async () => {
    if (!mpoModal) return;
    const fees = parseBR(mpoModal.deliveryFees);
    const extra = parseBR(mpoModal.extraAmount) || 0;
    if (!Number.isFinite(fees) || fees < 0) {
      toast({ title: 'Valor de taxas inválido', variant: 'destructive' }); return;
    }
    if (fees + extra <= 0) {
      toast({ title: 'Valor total deve ser maior que zero', variant: 'destructive' }); return;
    }
    if (mpoModal.paymentMethod === 'pix') {
      if (!mpoModal.pixFullName.trim() || !mpoModal.pixKey.trim()) {
        toast({ title: 'Informe nome completo e chave PIX do motoboy', variant: 'destructive' }); return;
      }
    }
    setMpoModal(m => m ? { ...m, submitting: true } : m);
    const dr = dateRangeRef.current;
    const { error } = await supabase.rpc('create_motoboy_payment_order', {
      p_motoboy_id: mpoModal.motoboyId,
      p_delivery_fees: fees,
      p_extra_amount: extra,
      p_extra_note: mpoModal.extraNote || null,
      p_payment_method: mpoModal.paymentMethod,
      p_order_ids: mpoModal.orderIds,
      p_period_start: mpoModal.mode === 'period' ? dr.from.toISOString() : null,
      p_period_end: mpoModal.mode === 'period' ? dr.to.toISOString() : null,
      p_pix_full_name: mpoModal.paymentMethod === 'pix' ? mpoModal.pixFullName.trim() : null,
      p_pix_key: mpoModal.paymentMethod === 'pix' ? mpoModal.pixKey.trim() : null,
      p_pix_key_type: mpoModal.paymentMethod === 'pix' ? mpoModal.pixKeyType : null,
      p_created_by: 'Admin',
      p_notes: null,
    } as any);
    if (error) {
      toast({ title: 'Erro ao gerar ordem', description: error.message, variant: 'destructive' });
      setMpoModal(m => m ? { ...m, submitting: false } : m);
      return;
    }
    // Mark linked manual extras as paid
    if (mpoModal.extraIds && mpoModal.extraIds.length > 0) {
      const { data: latest } = await supabase
        .from('motoboy_payment_orders')
        .select('id')
        .eq('motoboy_id', mpoModal.motoboyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      await supabase.rpc('mark_motoboy_extras_paid', {
        p_ids: mpoModal.extraIds,
        p_payment_order_id: latest?.id || null,
      } as any);
      refetchExtras();
    }
    toast({
      title: mpoModal.paymentMethod === 'cash'
        ? '✅ Ordem paga em dinheiro — sangria registrada no caixa'
        : '✅ Ordem PIX registrada — pendente de pagamento',
    });
    setMpoModal(null);
    refetchPaymentOrders();
    qc.invalidateQueries({ queryKey: ['admin', 'sangrias'] });
  }, [mpoModal, toast, refetchPaymentOrders, refetchExtras, qc]);

  const handlePayPaymentOrder = useCallback(async (orderId: string) => {
    if (!confirm('Marcar esta ordem como PAGA?')) return;
    const { error } = await supabase.rpc('pay_motoboy_payment_order', {
      p_order_id: orderId, p_paid_by: 'Admin',
    } as any);
    if (error) { toast({ title: 'Erro ao pagar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: '✅ Pagamento registrado' });
    refetchPaymentOrders();
  }, [toast, refetchPaymentOrders]);

  const handleCancelPaymentOrder = useCallback(async (orderId: string) => {
    const reason = prompt('Motivo do cancelamento?') || '';
    if (reason === null) return;
    const { error } = await supabase.rpc('cancel_motoboy_payment_order', {
      p_order_id: orderId, p_reason: reason || null,
    } as any);
    if (error) { toast({ title: 'Erro ao cancelar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: '↩️ Ordem cancelada' });
    refetchPaymentOrders();
    qc.invalidateQueries({ queryKey: ['admin', 'sangrias'] });
  }, [toast, refetchPaymentOrders, qc]);

  const startMin = useMemo(() => {
    const [h, m] = startTime.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }, [startTime]);
  const endMin = useMemo(() => {
    const [h, m] = endTime.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }, [endTime]);
  const crossMidnight = endMin <= startMin;

  const startDay = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const endDay = useMemo(() => startOfDay(endDate || selectedDate), [endDate, selectedDate]);
  const isMultiDay = endDay.getTime() > startDay.getTime();

  // Intervalo contínuo (usado para RPCs de confirmação, display e impressão)
  const dateRange = useMemo(() => {
    const from = addMinutes(startDay, startMin);
    let to = addMinutes(endDay, endMin);
    if (crossMidnight) {
      to = addMinutes(addDays(endDay, 1), endMin);
    }
    return { from, to };
  }, [startDay, endDay, startMin, endMin, crossMidnight]);
  useEffect(() => { dateRangeRef.current = dateRange; }, [dateRange]);

  const deliveredOrders = useMemo(() => {
    return allOrders.filter(o => {
      if (o.status !== 'delivered' || !o.motoboyId || !o.deliveredAt) return false;
      const d = new Date(o.deliveredAt);
      if (isMultiDay) {
        // Vários dias: aplica a janela de horário (período) em CADA dia do intervalo
        const day = startOfDay(d).getTime();
        if (day < startDay.getTime() || day > endDay.getTime()) return false;
        const mins = d.getHours() * 60 + d.getMinutes();
        return crossMidnight ? (mins >= startMin || mins <= endMin) : (mins >= startMin && mins <= endMin);
      }
      return d >= dateRange.from && d <= dateRange.to;
    });
  }, [allOrders, dateRange, isMultiDay, startDay, endDay, startMin, endMin, crossMidnight]);


  const deliveredOrderIds = deliveredOrders.map(o => o.id);
  const { data: orderItems = [] } = useAdminOrderItems(deliveredOrderIds);

  const motoboyStats = useMemo(() => {
    const filtered = selectedMotoboyId === 'all'
      ? motoboys
      : motoboys.filter(m => m.id === selectedMotoboyId);

    const statsMap = new Map<string, {
      motoboy: Motoboy;
      orders: Order[];
      totalFees: number;
      count: number;
      cashFromDeliveries: number;
      cashOrderCount: number;
      receivableCount: number;
      receivedCount: number;
      pendingCashAmount: number;
      paymentBreakdown: Record<string, { count: number; totalOrder: number; totalFee: number }>;
    }>();

    for (const motoboy of filtered) {
      const orders = deliveredOrders.filter(o => o.motoboyId === motoboy.id);
      if (orders.length === 0) continue;

      const totalFees = orders.reduce((sum, o) => sum + Number(o.deliveryFee || 0), 0);
      let cashFromDeliveries = 0;
      let cashOrderCount = 0;
      let receivableCount = 0;
      let receivedCount = 0;
      let pendingCashAmount = 0;
      const paymentBreakdown: Record<string, { count: number; totalOrder: number; totalFee: number }> = {};

      for (const o of orders) {
        const method = o.paymentMethod || 'cash';
        const external = isExternalOrder(o);

        const externalPaidByApp = external && method !== 'cash';
        const displayMethod = externalPaidByApp ? 'platform' : method;

        if (!paymentBreakdown[displayMethod]) {
          paymentBreakdown[displayMethod] = { count: 0, totalOrder: 0, totalFee: 0 };
        }
        paymentBreakdown[displayMethod].count++;
        paymentBreakdown[displayMethod].totalOrder += Number(o.total || 0);
        paymentBreakdown[displayMethod].totalFee += Number(o.deliveryFee || 0);

        if (method === 'cash') {
          cashFromDeliveries += Number(o.total || 0);
          cashOrderCount++;
        }

        // Conta pedidos com baixa pendente (exclui plataforma via app e PIX online já pago)
        if (!externalPaidByApp && !isPaidOnline(o) && RECEIVABLE_METHODS.has(method)) {
          receivableCount++;
          if (orderConfirmed[o.id]) {
            receivedCount++;
          } else if (method === 'cash') {
            pendingCashAmount += Number(o.total || 0);
          }
        }
      }

      statsMap.set(motoboy.id, {
        motoboy, orders, totalFees, count: orders.length,
        cashFromDeliveries, cashOrderCount,
        receivableCount, receivedCount, pendingCashAmount,
        paymentBreakdown,
      });
    }

    return Array.from(statsMap.values()).sort((a, b) => b.totalFees - a.totalFees);
  }, [motoboys, deliveredOrders, selectedMotoboyId, orderConfirmed]);

  const grandTotal = motoboyStats.reduce((sum, s) => sum + s.totalFees, 0);
  const grandCount = motoboyStats.reduce((sum, s) => sum + s.count, 0);
  const grandCash = motoboyStats.reduce((sum, s) => sum + s.cashFromDeliveries, 0);
  const grandPendingCash = motoboyStats.reduce((sum, s) => sum + s.pendingCashAmount, 0);

  const setPreset = (days: number) => {
    setSelectedDate(subDays(new Date(), days));
    setEndDate(undefined);
    setStartTime('00:00');
    setEndTime('23:59');
  };

  // Presets de período aplicam a janela de horário mantendo o dia único de hoje
  const setPeriodPreset = (start: string, end: string) => {
    setSelectedDate(new Date());
    setEndDate(undefined);
    setStartTime(start);
    setEndTime(end);
  };

  // Reforço: tenta extrair nome real do cliente, evitando "Cliente" genérico
  const getCustomerName = (order: Order): string => {
    if (order.customerName && !/^client(e)?$/i.test(order.customerName.trim())) {
      return order.customerName;
    }
    const user = allUsers.find(u => u.id === order.userId);
    if (user?.name) return user.name;
    // Fallback: tenta extrair de notes (iFood/plataforma)
    const notes = order.notes || '';
    const m = notes.match(/cliente[:\s]+([^\n]+)/i) || notes.match(/nome[:\s]+([^\n]+)/i);
    if (m?.[1]) return m[1].trim().slice(0, 60);
    return order.customerName || 'Cliente';
  };

  const getAddress = (order: Order): Address | undefined => {
    if ((order as any).address) return (order as any).address;
    if (!order.addressId) return undefined;
    return allAddresses.find(a => a.id === order.addressId);
  };

  // Endereço como string — se não tiver structured, tenta extrair do notes
  const getAddressText = (order: Order): string => {
    const addr = getAddress(order);
    if (addr) {
      const parts = [
        `${addr.street}, ${addr.number}`,
        addr.complement,
        addr.neighborhood,
        addr.city,
      ].filter(Boolean);
      return parts.join(' — ');
    }
    const notes = order.notes || '';
    const m = notes.match(/endere[çc]o[:\s]+([^\n]+(?:\n[^\n]+)?)/i);
    if (m?.[1]) return m[1].trim().replace(/\n/g, ' ').slice(0, 120);
    return '-';
  };

  const getOrderItems = (orderId: string) => {
    return orderItems.filter(item => item.orderId === orderId);
  };

  // Carrega confirmações (agregadas E por pedido) para o intervalo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('list_motoboy_cash_confirmations', {
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
        p_order_ids: deliveredOrderIds.length > 0 ? deliveredOrderIds : null,
      } as never);
      if (cancelled || error) return;
      const aggMap: Record<string, boolean> = {};
      const ordMap: Record<string, { confirmedAt: string; confirmedBy: string | null }> = {};
      for (const row of (data as any[]) || []) {
        if (row.order_id) {
          ordMap[row.order_id] = { confirmedAt: row.confirmed_at, confirmedBy: row.confirmed_by };
        } else if (row.motoboy_id) {
          aggMap[row.motoboy_id] = true;
        }
      }
      setCashConfirmed(aggMap);
      setOrderConfirmed(ordMap);
    })();
    return () => { cancelled = true; };
  }, [dateRange.from, dateRange.to, deliveredOrderIds.join(',')]);

  // Modal de confirmação de pagamento por pedido (pergunta máquina POS x dinheiro)
  const [cashConfirmModal, setCashConfirmModal] = useState<{
    order: Order;
    motoboyId: string;
    step: 'method' | 'amount';
    platformLabel: string;
    inputValue: string;
  } | null>(null);

  // Commit da baixa. asCash=true => entra no caixa físico de dinheiro.
  const commitOrderConfirmation = useCallback(async (
    order: Order,
    motoboyId: string,
    asCash: boolean,
    amountReceived: number,
  ) => {
    const orderTotal = Number(order.total || 0);
    const method = asCash ? 'cash' : (order.paymentMethod || 'card_pos');
    const shortId = order.id.slice(-6);

    await supabase.rpc('delete_motoboy_order_confirmation', { p_order_id: order.id } as never);

    const amount = asCash ? amountReceived : orderTotal;
    const diff = asCash ? orderTotal - amountReceived : 0;
    const { error } = await supabase.rpc('record_motoboy_order_confirmation', {
      p_motoboy_id: motoboyId,
      p_order_id: order.id,
      p_amount: amount,
      p_payment_method: method,
      p_confirmed_by: 'Admin',
      p_notes: asCash
        ? (diff !== 0
            ? `Baixa em DINHEIRO de #${shortId} — recebido ${formatCurrency(amountReceived)} de ${formatCurrency(orderTotal)} (dif. ${formatCurrency(diff)})`
            : `Baixa em DINHEIRO de #${shortId}`)
        : `Baixa em MÁQUINA POS de #${shortId} (${PAYMENT_LABELS[method] || method})`,
    } as never);
    if (error) {
      toast({ title: 'Erro ao confirmar', description: error.message, variant: 'destructive' });
      return;
    }

    const { error: rpcErr } = await supabase.rpc('confirm_delivery_payment', {
      p_order_id: order.id,
      p_responsible: 'Admin',
      p_as_cash: asCash,
      p_amount: asCash ? amountReceived : null,
    } as never);
    if (rpcErr) {
      console.warn('[MotoboyClosure] confirm_delivery_payment falhou:', rpcErr.message);
      toast({ title: 'Erro ao registrar no caixa', description: rpcErr.message, variant: 'destructive' });
      return;
    }

    setOrderConfirmed(prev => ({
      ...prev,
      [order.id]: { confirmedAt: new Date().toISOString(), confirmedBy: 'Admin' },
    }));
    toast({
      title: asCash
        ? `✅ Pedido #${shortId} — ${formatCurrency(amountReceived)} entrou no caixa de dinheiro`
        : `✅ Pedido #${shortId} conferido (pago na máquina POS)`,
      description: asCash && diff !== 0
        ? `Total do pedido: ${formatCurrency(orderTotal)} · diferença: ${formatCurrency(diff)}`
        : undefined,
    });
  }, [toast]);

  // Baixa individual por pedido
  const handleConfirmOrder = useCallback(async (order: Order, motoboyId: string) => {
    const isConfirmed = !!orderConfirmed[order.id];
    const orderTotal = Number(order.total || 0);

    if (isConfirmed) {
      const { error } = await supabase.rpc('delete_motoboy_order_confirmation', {
        p_order_id: order.id,
      } as never);
      if (error) {
        toast({ title: 'Erro ao reverter baixa', description: error.message, variant: 'destructive' });
        return;
      }
      await supabase.rpc('unconfirm_delivery_payment', { p_order_id: order.id } as never);
      setOrderConfirmed(prev => { const n = { ...prev }; delete n[order.id]; return n; });
      toast({ title: `↩️ Baixa do pedido #${order.id.slice(-6)} revertida` });
      return;
    }

    // Abre modal perguntando: máquina POS ou dinheiro?
    const platLabel = isExternalOrder(order)
      ? (getPlatformLabel(order.salesperson || '') || 'PLATAFORMA')
      : '';
    setCashConfirmModal({
      order,
      motoboyId,
      step: 'method',
      platformLabel: platLabel,
      inputValue: orderTotal.toFixed(2).replace('.', ','),
    });
  }, [orderConfirmed, toast]);



  const handleConfirmCash = useCallback(async (motoboyId: string, motoboyName: string, amount: number) => {
    const isCurrentlyConfirmed = !!cashConfirmed[motoboyId];
    if (isCurrentlyConfirmed) {
      const { error } = await supabase.rpc('delete_motoboy_general_confirmation', {
        p_motoboy_id: motoboyId,
        p_from: dateRange.from.toISOString(),
        p_to: dateRange.to.toISOString(),
      } as never);
      if (error) {
        toast({ title: 'Erro ao reverter', description: error.message, variant: 'destructive' });
        return;
      }
      setCashConfirmed(prev => { const n = { ...prev }; delete n[motoboyId]; return n; });
      toast({ title: `↩️ Confirmação geral de ${motoboyName} revertida` });
    } else {
      const { error } = await supabase.rpc('record_motoboy_general_confirmation', {
        p_motoboy_id: motoboyId,
        p_amount: amount,
        p_confirmed_by: 'Admin',
      } as never);
      if (error) {
        toast({ title: 'Erro ao confirmar', description: error.message, variant: 'destructive' });
        return;
      }
      setCashConfirmed(prev => ({ ...prev, [motoboyId]: true }));
      toast({ title: `✅ Conferência geral de ${motoboyName} registrada!` });
    }
  }, [cashConfirmed, dateRange.from, dateRange.to, toast]);

  const handlePrint = (stat: typeof motoboyStats[0]) => {
    const win = window.open('', '_blank');
    if (!win) return;
    const confirmed = cashConfirmed[stat.motoboy.id];
    const rows = stat.orders.map(o => {
      const customer = getCustomerName(o);
      const addrText = getAddressText(o);
      const items = getOrderItems(o.id);
      const itemsSummary = items.map(i => `${i.quantity}x ${i.productName}`).join(', ');
      const deliveredTime = o.deliveredAt ? format(new Date(o.deliveredAt), 'HH:mm') : '--:--';
      const external = isExternalOrder(o);
      const isCash = o.paymentMethod === 'cash';
      const externalPaidByApp = external && !isCash;
      const paymentDisplay = external
        ? (isCash ? `${getPlatformLabel(o.salesperson || '')} - Dinheiro` : `${getPlatformLabel(o.salesperson || '')} (via app)`)
        : (PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod).replace(/[^\w\s]/g, '');
      const isReceivable = !externalPaidByApp && !isPaidOnline(o) && RECEIVABLE_METHODS.has(o.paymentMethod || 'cash');
      const paidOnline = isPaidOnline(o);
      const baixa = !isReceivable
        ? (paidOnline ? '✅ PAGO ONLINE' : externalPaidByApp ? '✅ PAGO PLATAFORMA' : '— N/A —')
        : (orderConfirmed[o.id] ? '✅ RECEBIDO' : '⏳ PENDENTE');
      const baixaColor = !isReceivable
        ? (paidOnline || externalPaidByApp ? '#2563eb' : '#9ca3af')
        : (orderConfirmed[o.id] ? '#16a34a' : '#b45309');

      return `<tr${isCash ? ' style="background:#fefce8"' : externalPaidByApp ? ' style="background:#eff6ff"' : ''}>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:11px">#${o.id.slice(-6)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px"><strong>${customer}</strong></td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;max-width:220px">${addrText}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;max-width:180px">${itemsSummary || '-'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${deliveredTime}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;${isCash ? 'font-weight:bold;color:#b45309' : externalPaidByApp ? 'color:#2563eb' : ''}">${paymentDisplay}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:12px">${formatCurrency(o.total)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;font-weight:bold;color:#16a34a">${formatCurrency(o.deliveryFee || 0)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:11px;font-weight:bold;color:${baixaColor}">${baixa}</td>
      </tr>`;
    }).join('');

    const timeRange = isMultiDay
      ? `${format(startDay, 'dd/MM/yyyy')} a ${format(endDay, 'dd/MM/yyyy')} — ${startTime} às ${endTime} por dia`
      : `${startTime} às ${endTime}`;

    const breakdownRows = Object.entries(stat.paymentBreakdown).map(([method, data]) => {
      return `<tr>
        <td style="padding:4px 8px;font-size:13px">${(PAYMENT_LABELS[method] || method).replace(/[^\w\s]/g, '')}</td>
        <td style="padding:4px 8px;text-align:center;font-size:13px">${data.count}</td>
        <td style="padding:4px 8px;text-align:right;font-size:13px">${formatCurrency(data.totalOrder)}</td>
        <td style="padding:4px 8px;text-align:right;font-size:13px">${formatCurrency(data.totalFee)}</td>
      </tr>`;
    }).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>Fechamento ${stat.motoboy.name}</title></head><body style="font-family:sans-serif;padding:24px;max-width:900px;margin:auto">
      <h2 style="margin-bottom:4px">📋 Relatório de Fechamento</h2>
      <p style="color:#666;margin-top:0;font-size:14px"><strong>${stat.motoboy.name}</strong> — ${isMultiDay ? timeRange : `${format(dateRange.from, 'dd/MM/yyyy')} (${timeRange})`}</p>
      <p style="color:#666;font-size:13px;margin:4px 0">
        <strong>Baixas:</strong> ${stat.receivedCount}/${stat.receivableCount} pedidos recebidos
        ${stat.pendingCashAmount > 0 ? ` — <span style="color:#b45309;font-weight:bold">${formatCurrency(stat.pendingCashAmount)} pendente em dinheiro</span>` : ''}
      </p>

      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Pedido</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Cliente</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Endereço</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Itens</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Hora</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Pgto</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#6b7280">Valor</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#6b7280">Taxa</th>
          <th style="padding:8px;text-align:center;font-size:10px;text-transform:uppercase;color:#6b7280">Baixa</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h3 style="margin-top:24px;margin-bottom:8px">💰 Resumo por Forma de Pagamento</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Método</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280">Qtd</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Valor Pedidos</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Taxas</th>
        </tr></thead>
        <tbody>${breakdownRows}</tbody>
      </table>

      ${stat.cashFromDeliveries > 0 ? `
        <div style="margin-top:16px;padding:14px;background:#fef3c7;border:2px solid #f59e0b;border-radius:10px">
          <strong style="font-size:15px;color:#92400e">⚠️ Dinheiro Físico em Posse do Motoboy:</strong>
          <span style="font-size:20px;font-weight:bold;color:#b45309;margin-left:12px">${formatCurrency(stat.cashFromDeliveries)}</span>
          <span style="font-size:12px;color:#92400e;margin-left:8px">(${stat.cashOrderCount} pedido${stat.cashOrderCount > 1 ? 's' : ''} em dinheiro)</span>
          <div style="margin-top:8px;font-size:12px;color:#78350f">
            ${confirmed ? '✅ CONFERÊNCIA GERAL REGISTRADA' : (stat.pendingCashAmount === 0 ? '✅ TODAS AS BAIXAS INDIVIDUAIS REALIZADAS' : `⏳ ${formatCurrency(stat.pendingCashAmount)} ainda pendente`)}
          </div>
        </div>
      ` : ''}

      <div style="margin-top:20px;padding:16px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong style="font-size:15px">Total de Entregas:</strong> <span style="font-size:15px">${stat.count}</span></div>
          <div><strong style="font-size:18px;color:#16a34a">${formatCurrency(stat.totalFees)}</strong></div>
        </div>
      </div>

      <div style="margin-top:32px;padding-top:16px;border-top:1px dashed #999">
        <div style="display:flex;justify-content:space-between;gap:40px">
          <div style="flex:1;text-align:center">
            <div style="border-top:1px solid #333;padding-top:6px;margin-top:50px">Motoboy</div>
          </div>
          <div style="flex:1;text-align:center">
            <div style="border-top:1px solid #333;padding-top:6px;margin-top:50px">Responsável (Admin)</div>
          </div>
        </div>
      </div>
    </body></html>`);
    win.document.close();
    win.print();
  };

  const handlePrintAll = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const timeRange = isMultiDay
      ? `${format(startDay, 'dd/MM/yyyy')} a ${format(endDay, 'dd/MM/yyyy')} — ${startTime} às ${endTime} por dia`
      : `${startTime} às ${endTime}`;

    const sections = motoboyStats.map(stat => {
      const confirmed = cashConfirmed[stat.motoboy.id];
      const rows = stat.orders.map(o => {
        const customer = getCustomerName(o);
        const addrText = getAddressText(o);
        const deliveredTime = o.deliveredAt ? format(new Date(o.deliveredAt), 'HH:mm') : '--:--';
        const external = isExternalOrder(o);
        const isCash = o.paymentMethod === 'cash';
        const externalPaidByApp = external && !isCash;
        const paymentDisplay = external
          ? (isCash ? `${getPlatformLabel(o.salesperson || '')} - Dinheiro` : `${getPlatformLabel(o.salesperson || '')} (via app)`)
          : (PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod).replace(/[^\w\s]/g, '');
        const isReceivable = !externalPaidByApp && !isPaidOnline(o) && RECEIVABLE_METHODS.has(o.paymentMethod || 'cash');
        const baixa = !isReceivable ? '✅' : (orderConfirmed[o.id] ? '✅' : '⏳');
        return `<tr${isCash ? ' style="background:#fefce8"' : externalPaidByApp ? ' style="background:#eff6ff"' : ''}>
          <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:10px">#${o.id.slice(-6)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-size:11px">${customer}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-size:10px;max-width:200px">${addrText}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-size:11px;${isCash ? 'font-weight:bold;color:#b45309' : externalPaidByApp ? 'color:#2563eb' : ''}">${paymentDisplay}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-size:11px">${deliveredTime}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:11px">${formatCurrency(o.total)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:12px;font-weight:bold">${formatCurrency(o.deliveryFee || 0)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:14px">${baixa}</td>
        </tr>`;
      }).join('');

      return `<div style="margin-bottom:28px">
        <h3 style="margin-bottom:4px">🏍️ ${stat.motoboy.name} — <span style="font-size:13px;color:#666">Baixas: ${stat.receivedCount}/${stat.receivableCount}</span></h3>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:6px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Pedido</th>
            <th style="padding:6px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Cliente</th>
            <th style="padding:6px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Endereço</th>
            <th style="padding:6px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Pgto</th>
            <th style="padding:6px;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280">Hora</th>
            <th style="padding:6px;text-align:right;font-size:10px;text-transform:uppercase;color:#6b7280">Valor</th>
            <th style="padding:6px;text-align:right;font-size:10px;text-transform:uppercase;color:#6b7280">Taxa</th>
            <th style="padding:6px;text-align:center;font-size:10px;text-transform:uppercase;color:#6b7280">Baixa</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${stat.cashFromDeliveries > 0 ? `
          <div style="margin-top:6px;padding:8px;background:#fef3c7;border-radius:6px;font-size:12px;color:#92400e">
            💵 Dinheiro físico: <strong>${formatCurrency(stat.cashFromDeliveries)}</strong>
            — ${confirmed || stat.pendingCashAmount === 0 ? '✅ Recebido' : `⏳ ${formatCurrency(stat.pendingCashAmount)} pendente`}
          </div>
        ` : ''}
        <div style="text-align:right;margin-top:6px;font-weight:bold;color:#16a34a">${stat.count} entregas — ${formatCurrency(stat.totalFees)}</div>
      </div>`;
    }).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>Fechamento Geral</title></head><body style="font-family:sans-serif;padding:24px;max-width:900px;margin:auto">
      <h2>📋 Relatório Geral — Fechamento Boys</h2>
      <p style="color:#666;font-size:14px">${isMultiDay ? timeRange : `${format(dateRange.from, 'dd/MM/yyyy')} (${timeRange})`}</p>
      ${sections}
      <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:10px;border:2px solid #bbf7d0;text-align:center">
        <strong style="font-size:18px">Total Geral: ${grandCount} entregas — <span style="color:#16a34a">${formatCurrency(grandTotal)}</span></strong>
        ${grandCash > 0 ? `<div style="margin-top:8px;font-size:14px;color:#b45309">💵 Total em dinheiro físico: <strong>${formatCurrency(grandCash)}</strong>${grandPendingCash > 0 ? ` — <span style="color:#dc2626">⏳ ${formatCurrency(grandPendingCash)} pendente</span>` : ' — ✅ Tudo baixado'}</div>` : ''}
      </div>
    </body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-3xl text-primary">Fechamento Boys</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {grandPendingCash > 0 && (
            <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              ⏳ {formatCurrency(grandPendingCash)} pendente
            </Badge>
          )}
          {grandCash > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
              <Banknote className="h-3.5 w-3.5" />
              💵 {formatCurrency(grandCash)} em espécie
            </Badge>
          )}
          <Badge className="bg-primary/20 text-primary border-primary/30">
            {grandCount} entregas — {formatCurrency(grandTotal)}
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Motoboy</Label>
              <Select value={selectedMotoboyId} onValueChange={setSelectedMotoboyId}>
                <SelectTrigger className="w-[180px] h-9 text-xs">
                  <Filter className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder="Todos motoboys" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos motoboys</SelectItem>
                  {motoboys.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Data / Intervalo</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 text-xs h-9">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {isMultiDay
                      ? `${format(selectedDate, 'dd/MM/yy', { locale: ptBR })} → ${format(endDate!, 'dd/MM/yy', { locale: ptBR })}`
                      : format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: selectedDate, to: endDate }}
                    onSelect={(range) => {
                      if (range?.from) setSelectedDate(range.from);
                      // to === from significa dia único → limpa endDate
                      setEndDate(range?.to && range.to.getTime() !== range.from?.getTime() ? range.to : undefined);
                    }}
                    numberOfMonths={2}
                    locale={ptBR}
                    className={cn('p-3 pointer-events-auto')}
                  />
                  {isMultiDay && (
                    <div className="p-2 border-t">
                      <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setEndDate(undefined)}>
                        Limpar intervalo (dia único)
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>


            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Hora Início</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 w-[120px] text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Hora Fim</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 w-[120px] text-xs" />
            </div>

            <Button
              variant={showOnlyPending ? 'default' : 'outline'}
              size="sm"
              className="gap-2 text-xs h-9"
              onClick={() => setShowOnlyPending(v => !v)}
            >
              {showOnlyPending ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showOnlyPending ? 'Ver todos' : 'Só pendentes'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="text-xs h-7" onClick={() => setPreset(0)}>Hoje</Button>
            <Button variant="secondary" size="sm" className="text-xs h-7" onClick={() => setPreset(1)}>Ontem</Button>
            <Button variant="secondary" size="sm" className="text-xs h-7" onClick={() => setPreset(7)}>7 dias atrás</Button>
            <Button variant="secondary" size="sm" className="text-xs h-7" onClick={() => setPeriodPreset('06:00', '14:00')}>Manhã</Button>
            <Button variant="secondary" size="sm" className="text-xs h-7" onClick={() => setPeriodPreset('14:00', '22:00')}>Tarde</Button>
            <Button variant="secondary" size="sm" className="text-xs h-7" onClick={() => setPeriodPreset('22:00', '23:59')}>Noite</Button>
            <Button variant="secondary" size="sm" className="text-xs h-7 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300" onClick={() => setPeriodPreset('18:00', '00:00')}>🌙 Turno Noite (18h→00h)</Button>
            <Button variant="secondary" size="sm" className="text-xs h-7 border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300" onClick={() => setPeriodPreset('00:00', '06:00')}>🌌 Madrugada (00h→06h)</Button>
            <Button variant="secondary" size="sm" className="text-xs h-7 border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300" onClick={() => setPeriodPreset('18:00', '06:00')}>🦉 Plantão (18h→06h)</Button>
          </div>

          <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {isMultiDay ? (
                <>
                  Intervalo: <strong className="text-foreground">{format(startDay, 'dd/MM/yyyy')}</strong>
                  {' → '}
                  <strong className="text-foreground">{format(endDay, 'dd/MM/yyyy')}</strong>
                  {' '}({startTime}–{endTime} por dia)
                </>
              ) : (
                <>
                  Período: <strong className="text-foreground">{format(dateRange.from, 'dd/MM/yyyy HH:mm')}</strong>
                  {' → '}
                  <strong className="text-foreground">{format(dateRange.to, 'dd/MM/yyyy HH:mm')}</strong>
                </>
              )}
            </span>
          </div>

        </CardContent>
      </Card>

      {/* Ordens de pagamento pendentes */}
      {pendingPaymentOrders.length > 0 && (
        <Card className="border-purple-500/40 bg-purple-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="font-semibold text-purple-300 flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Ordens de Pagamento Pendentes ({pendingPaymentOrders.length})
              </p>
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40">
                Total: {formatCurrency(pendingPaymentOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0))}
              </Badge>
            </div>
            <div className="space-y-2">
              {pendingPaymentOrders.map((po: any) => (
                <div key={po.id} className="p-3 rounded-lg border border-purple-500/30 bg-background/50 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{po.motoboy_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(po.created_at), 'dd/MM/yyyy HH:mm')} · Taxas {formatCurrency(Number(po.delivery_fees_total || 0))}
                        {Number(po.extra_amount || 0) > 0 ? ` · Extra ${formatCurrency(Number(po.extra_amount))}` : ''}
                      </p>
                    </div>
                    <span className="text-xl font-bold text-emerald-400">{formatCurrency(Number(po.total_amount || 0))}</span>
                  </div>
                  <div className="rounded-md bg-secondary/40 p-2 text-xs space-y-0.5">
                    <div><span className="text-muted-foreground">Nome:</span> <strong className="text-foreground">{po.pix_full_name || '-'}</strong></div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">PIX ({po.pix_key_type || '-'}):</span>
                      <code className="text-primary font-mono select-all break-all">{po.pix_key || '-'}</code>
                      {po.pix_key && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                          onClick={() => { navigator.clipboard.writeText(po.pix_key); toast({ title: 'Chave copiada' }); }}
                        >Copiar</Button>
                      )}
                    </div>
                    {po.extra_note && <div className="text-muted-foreground">Obs: {po.extra_note}</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handlePayPaymentOrder(po.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como pago
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => handleCancelPaymentOrder(po.id)}>
                      <XCircle className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards */}
      {motoboyStats.length === 0 ? (
        <Card className="border-dashed border-2 border-muted-foreground/30">
          <CardContent className="py-12 text-center">
            <Bike className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Nenhuma entrega concluída no período selecionado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {motoboyStats.map((stat) => {
            const isExpanded = expandedMotoboyId === stat.motoboy.id;
            const confirmed = cashConfirmed[stat.motoboy.id];
            const allReceived = stat.receivableCount > 0 && stat.receivedCount === stat.receivableCount;

            return (
              <Card key={stat.motoboy.id} className="border-primary/20 overflow-hidden">
                <CardContent className="p-0">
                  <button
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors"
                    onClick={() => setExpandedMotoboyId(isExpanded ? null : stat.motoboy.id)}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Bike className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{stat.motoboy.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span>{stat.count} entrega{stat.count > 1 ? 's' : ''}</span>
                        {stat.receivableCount > 0 && (
                          <Badge variant="outline" className={cn(
                            "text-[10px] h-4 gap-0.5",
                            allReceived ? "border-emerald-500/50 text-emerald-400" : "border-amber-500/50 text-amber-400"
                          )}>
                            {allReceived ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
                            {stat.receivedCount}/{stat.receivableCount} baixados
                          </Badge>
                        )}
                        {stat.cashFromDeliveries > 0 && (
                          <Badge variant="outline" className={cn(
                            "text-[10px] h-4 gap-0.5",
                            confirmed || stat.pendingCashAmount === 0 ? "border-emerald-500/50 text-emerald-400" : "border-amber-500/50 text-amber-400"
                          )}>
                            <Banknote className="h-2.5 w-2.5" />
                            💵 {formatCurrency(stat.cashFromDeliveries)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-emerald-400">{formatCurrency(stat.totalFees)}</p>
                      <p className="text-[10px] text-muted-foreground">taxas acumuladas</p>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                      {/* Summary stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="rounded-lg bg-secondary/50 p-3 text-center">
                          <TrendingUp className="h-4 w-4 mx-auto text-primary mb-1" />
                          <p className="text-lg font-bold text-foreground">{stat.count}</p>
                          <p className="text-[10px] text-muted-foreground">Entregas</p>
                        </div>
                        <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                          <DollarSign className="h-4 w-4 mx-auto text-emerald-400 mb-1" />
                          <p className="text-lg font-bold text-emerald-400">{formatCurrency(stat.totalFees)}</p>
                          <p className="text-[10px] text-emerald-300/70">Total Taxas</p>
                        </div>
                        <div className="rounded-lg bg-secondary/50 p-3 text-center">
                          <DollarSign className="h-4 w-4 mx-auto text-primary mb-1" />
                          <p className="text-lg font-bold text-foreground">{formatCurrency(stat.count > 0 ? stat.totalFees / stat.count : 0)}</p>
                          <p className="text-[10px] text-muted-foreground">Média/Entrega</p>
                        </div>
                        <div className={cn("rounded-lg p-3 text-center", stat.cashFromDeliveries > 0 ? "bg-amber-500/10" : "bg-secondary/50")}>
                          <Banknote className={cn("h-4 w-4 mx-auto mb-1", stat.cashFromDeliveries > 0 ? "text-amber-400" : "text-muted-foreground")} />
                          <p className={cn("text-lg font-bold", stat.cashFromDeliveries > 0 ? "text-amber-400" : "text-foreground")}>{formatCurrency(stat.cashFromDeliveries)}</p>
                          <p className="text-[10px] text-muted-foreground">Dinheiro Físico</p>
                        </div>
                      </div>

                      {/* Payment breakdown */}
                      <div className="rounded-lg border border-border/50 overflow-hidden">
                        <div className="bg-secondary/30 px-3 py-2">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <CreditCard className="h-3.5 w-3.5" />
                            Detalhamento por Forma de Pagamento
                          </p>
                        </div>
                        <div className="divide-y divide-border/30">
                          {Object.entries(stat.paymentBreakdown).map(([method, data]) => (
                            <div key={method} className={cn(
                              "flex items-center justify-between px-3 py-2 text-xs",
                              method === 'cash' && "bg-amber-500/5",
                              method === 'platform' && "bg-blue-500/5"
                            )}>
                              <div className="flex items-center gap-2">
                                <span className={cn("font-medium", method === 'cash' && "text-amber-400", method === 'platform' && "text-blue-400")}>
                                  {PAYMENT_LABELS[method] || method}
                                </span>
                                <Badge variant="outline" className="text-[10px] h-4">{data.count}x</Badge>
                              </div>
                              <div className="flex items-center gap-4 text-right">
                                <span className="text-muted-foreground">Pedidos: {formatCurrency(data.totalOrder)}</span>
                                <span className="font-bold text-emerald-400">Taxa: {formatCurrency(data.totalFee)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Cash confirmation banner (agregado — atalho) */}
                      {stat.cashFromDeliveries > 0 && (
                        <div className={cn(
                          "rounded-lg border-2 p-4 transition-colors",
                          allReceived || confirmed
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-amber-500/50 bg-amber-500/10"
                        )}>
                          <div className="flex items-start gap-3">
                            {allReceived || confirmed ? (
                              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={cn("font-semibold text-sm", allReceived || confirmed ? "text-emerald-300" : "text-amber-300")}>
                                {allReceived
                                  ? '✅ Todas as baixas individuais realizadas'
                                  : confirmed
                                    ? 'Conferência geral registrada (legado)'
                                    : `${formatCurrency(stat.pendingCashAmount)} ainda pendente de baixa`}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {stat.cashOrderCount} pedido{stat.cashOrderCount > 1 ? 's' : ''} em dinheiro
                                {' — '}
                                <strong className={cn("text-base", allReceived || confirmed ? "text-emerald-400" : "text-amber-400")}>
                                  {formatCurrency(stat.cashFromDeliveries)}
                                </strong>
                                {' '}— faça a baixa de cada pedido abaixo, ou marque a conferência geral.
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <Checkbox
                              id={`cash-confirm-${stat.motoboy.id}`}
                              checked={confirmed || false}
                              onCheckedChange={() => handleConfirmCash(stat.motoboy.id, stat.motoboy.name, stat.cashFromDeliveries)}
                              className={cn(
                                "h-5 w-5",
                                confirmed ? "border-emerald-500 data-[state=checked]:bg-emerald-500" : "border-amber-500"
                              )}
                            />
                            <label
                              htmlFor={`cash-confirm-${stat.motoboy.id}`}
                              className="text-xs font-medium cursor-pointer select-none text-foreground"
                            >
                              Conferência geral — recebi {formatCurrency(stat.cashFromDeliveries)} de {stat.motoboy.name}
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Detailed order list — com baixa individual */}
                      <div className="max-h-[60vh] overflow-y-auto space-y-2">
                        {stat.orders
                          .filter(o => {
                            if (!showOnlyPending) return true;
                            const method = o.paymentMethod || 'cash';
                            const external = isExternalOrder(o);
                            const externalPaidByApp = external && method !== 'cash';
                            const isReceivable = !externalPaidByApp && !isPaidOnline(o) && RECEIVABLE_METHODS.has(method);
                            return isReceivable && !orderConfirmed[o.id];
                          })
                          .sort((a, b) => new Date(b.deliveredAt!).getTime() - new Date(a.deliveredAt!).getTime())
                          .map(order => {
                            const address = getAddress(order);
                            const customer = getCustomerName(order);
                            const items = getOrderItems(order.id);
                            const deliveredTime = order.deliveredAt ? format(new Date(order.deliveredAt), 'HH:mm') : '--:--';
                            const createdTime = order.createdAt ? format(new Date(order.createdAt), 'HH:mm') : '--:--';
                            const fee = Number(order.deliveryFee || 0);
                            const distance = order.deliveryDistance ? Number(order.deliveryDistance).toFixed(1) : null;
                            const external = isExternalOrder(order);
                            const isCash = order.paymentMethod === 'cash';
                            const externalPaidByApp = external && !isCash;
                            const paidOnline = isPaidOnline(order);
                            const isReceivable = !externalPaidByApp && !paidOnline && RECEIVABLE_METHODS.has(order.paymentMethod || 'cash');
                            const isReceived = !!orderConfirmed[order.id];
                            const paymentDisplay = external
                              ? (isCash ? `🌐 ${getPlatformLabel(order.salesperson || '')} 💵 Dinheiro` : `🌐 ${getPlatformLabel(order.salesperson || '')}`)
                              : (PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod);

                            return (
                              <div key={order.id} className={cn(
                                "p-3 rounded-lg border space-y-2",
                                isReceived ? "bg-emerald-500/5 border-emerald-500/30"
                                  : paidOnline ? "bg-blue-500/5 border-blue-500/20"
                                  : isCash ? "bg-amber-500/5 border-amber-500/20"
                                  : externalPaidByApp ? "bg-blue-500/5 border-blue-500/20"
                                  : "bg-muted/30 border-border/50"
                              )}>
                                {/* Header row */}
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(-6)}</span>
                                    <Badge variant="outline" className={cn(
                                      "text-[10px] h-5",
                                      isCash && "border-amber-500/50 text-amber-400",
                                      externalPaidByApp && "border-blue-500/50 text-blue-400"
                                    )}>
                                      {paymentDisplay}
                                    </Badge>
                                    {isCash && (
                                      <Badge className="text-[10px] h-5 bg-amber-500/20 text-amber-400 border-amber-500/30">
                                        <Banknote className="h-2.5 w-2.5 mr-0.5" />
                                        {formatCurrency(order.total)}
                                      </Badge>
                                    )}
                                    {externalPaidByApp && (
                                      <Badge className="text-[10px] h-5 bg-blue-500/20 text-blue-400 border-blue-500/30">
                                        <Globe className="h-2.5 w-2.5 mr-0.5" />
                                        Pgto via app
                                      </Badge>
                                    )}
                                    {paidOnline && (
                                      <Badge className="text-[10px] h-5 bg-blue-500/20 text-blue-400 border-blue-500/30">
                                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                        PIX Online — Pago
                                      </Badge>
                                    )}
                                    {isReceived && (
                                      <Badge className="text-[10px] h-5 bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
                                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                        Baixado
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-sm font-bold text-emerald-400">+{formatCurrency(fee)}</span>
                                </div>

                                {/* Customer + Address */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-sm">
                                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-medium text-foreground truncate">{customer}</span>
                                  </div>
                                  {address ? (
                                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                      <span>
                                        {address.street}, {address.number}
                                        {address.complement ? ` (${address.complement})` : ''}
                                        {' — '}{address.neighborhood}
                                        {address.city ? ` — ${address.city}` : ''}
                                      </span>
                                    </div>
                                  ) : getAddressText(order) !== '-' ? (
                                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                      <span>{getAddressText(order)}</span>
                                    </div>
                                  ) : null}
                                </div>

                                {/* Items */}
                                {items.length > 0 && (
                                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <Package className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span className="line-clamp-2">
                                      {items.map(i => `${i.quantity}x ${i.productName}`).join(' • ')}
                                    </span>
                                  </div>
                                )}

                                {/* Time + Distance row */}
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{createdTime} → {deliveredTime}</span>
                                  </div>
                                  {distance && (
                                    <div className="flex items-center gap-1">
                                      <Ruler className="h-3 w-3" />
                                      <span>{distance} km</span>
                                    </div>
                                  )}
                                  {Number(order.total) > 0 && (
                                    <div className="flex items-center gap-1">
                                      <CreditCard className="h-3 w-3" />
                                      <span>Pedido: {formatCurrency(order.total)}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Comprovante enviado pelo motoboy */}
                                {proofsByOrderId.has(order.id) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full gap-1.5 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                                    onClick={() => handleViewProof(order.id)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    Ver comprovante do motoboy
                                  </Button>
                                )}

                                {isReceivable && (
                                  <div className={cn(
                                    "flex items-center gap-2 rounded-md px-2 py-1.5 border-t pt-2 mt-1",
                                    isReceived ? "border-emerald-500/30" : "border-amber-500/30"
                                  )}>
                                    <Checkbox
                                      id={`order-confirm-${order.id}`}
                                      checked={isReceived}
                                      onCheckedChange={() => handleConfirmOrder(order, stat.motoboy.id)}
                                      className={cn(
                                        "h-5 w-5",
                                        isReceived
                                          ? "border-emerald-500 data-[state=checked]:bg-emerald-500"
                                          : "border-amber-500"
                                      )}
                                    />
                                    <label
                                      htmlFor={`order-confirm-${order.id}`}
                                      className={cn(
                                        "text-xs font-semibold cursor-pointer select-none flex-1",
                                        isReceived ? "text-emerald-400" : "text-amber-400"
                                      )}
                                    >
                                      {isReceived
                                        ? `✅ Recebimento confirmado — ${formatCurrency(order.total)}`
                                        : `⏳ Confirmar recebimento de ${formatCurrency(order.total)} (${PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod})`}
                                    </label>
                                    {isReceived && orderConfirmed[order.id]?.confirmedAt && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {format(new Date(orderConfirmed[order.id].confirmedAt), 'HH:mm')}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>

                      {/* Corridas manuais lançadas para este motoboy */}
                      {(() => {
                        const motoExtras = manualExtras.filter(e => e.motoboy_id === stat.motoboy.id);
                        const unpaid = motoExtras.filter(e => !e.paid);
                        const unpaidSum = unpaid.reduce((s, e) => s + Number(e.amount || 0), 0);
                        return (
                          <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
                            <div className="bg-purple-500/10 px-3 py-2 flex items-center justify-between">
                              <p className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                                <History className="h-3.5 w-3.5" />
                                Corridas / Taxas Manuais
                                {unpaid.length > 0 && (
                                  <Badge className="text-[10px] h-4 bg-purple-500/30 text-purple-200 border-purple-500/40">
                                    {unpaid.length} pendente(s) · {formatCurrency(unpaidSum)}
                                  </Badge>
                                )}
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
                                onClick={() => setExtraModal({
                                  motoboyId: stat.motoboy.id,
                                  motoboyName: stat.motoboy.name,
                                  description: '',
                                  amount: '',
                                  submitting: false,
                                })}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Acrescer Corrida
                              </Button>
                            </div>
                            {motoExtras.length > 0 && (
                              <div className="divide-y divide-purple-500/10 max-h-56 overflow-y-auto">
                                {motoExtras.map(e => (
                                  <div key={e.id} className={cn(
                                    "flex items-start gap-2 px-3 py-2 text-xs",
                                    e.paid ? "opacity-60" : ""
                                  )}>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-[10px] text-muted-foreground">
                                          {format(new Date(e.created_at), 'dd/MM HH:mm')}
                                        </span>
                                        {e.paid ? (
                                          <Badge className="text-[9px] h-4 bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                            paga
                                          </Badge>
                                        ) : (
                                          <Badge className="text-[9px] h-4 bg-amber-500/20 text-amber-300 border-amber-500/30">
                                            pendente
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-foreground leading-snug break-words">{e.description}</p>
                                    </div>
                                    <span className="font-bold text-purple-300 shrink-0">
                                      +{formatCurrency(Number(e.amount))}
                                    </span>
                                    {!e.paid && (
                                      <button
                                        onClick={() => deleteManualExtra(e.id)}
                                        className="text-red-400 hover:text-red-300 shrink-0 p-1"
                                        title="Excluir"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Total row */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <span className="text-sm font-semibold text-foreground">Total do período</span>
                        <span className="text-base font-bold text-emerald-400">
                          {formatCurrency(stat.totalFees + (unpaidExtrasByMotoboy.get(stat.motoboy.id) || []).reduce((s, e) => s + Number(e.amount || 0), 0))}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => openPaymentOrderModal(stat)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Gerar Ordem de Pagamento
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: confirmar pagamento do pedido (máquina POS x dinheiro) */}
      <Dialog open={!!cashConfirmModal} onOpenChange={(open) => { if (!open) setCashConfirmModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {cashConfirmModal?.step === 'amount' ? '💰 Valor recebido em dinheiro' : '✅ Confirmar pagamento'}
            </DialogTitle>
            <DialogDescription>
              {cashConfirmModal && (
                <>
                  {cashConfirmModal.platformLabel && (
                    <><span className="font-semibold text-foreground">{cashConfirmModal.platformLabel}</span> · </>
                  )}
                  Pedido #{cashConfirmModal.order.id.slice(-6)} · {formatCurrency(Number(cashConfirmModal.order.total || 0))}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Passo 1: como foi pago? */}
          {cashConfirmModal?.step === 'method' && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-center font-medium">
                Este pagamento foi realizado em <strong>máquina (POS)</strong> ou em <strong>dinheiro</strong>?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => {
                    const m = cashConfirmModal;
                    setCashConfirmModal(null);
                    commitOrderConfirmation(m.order, m.motoboyId, false, Number(m.order.total || 0));
                  }}
                  className="flex-col h-24 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <CreditCard className="h-7 w-7" />
                  <span className="font-semibold">Máquina POS</span>
                </Button>
                <Button
                  onClick={() => setCashConfirmModal(m => m ? { ...m, step: 'amount' } : null)}
                  className="flex-col h-24 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Banknote className="h-7 w-7" />
                  <span className="font-semibold">Dinheiro</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center leading-snug">
                🏧 Máquina: apenas confere (não entra no caixa de dinheiro). 💵 Dinheiro: você digita o valor que entra no caixa físico.
              </p>
            </div>
          )}

          {/* Passo 2: valor em dinheiro */}
          {cashConfirmModal?.step === 'amount' && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted-foreground">Total do pedido:</span>
                  <span className="font-bold text-foreground">{formatCurrency(Number(cashConfirmModal.order.total || 0))}</span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 leading-snug">
                  Digite o valor <strong>recebido em dinheiro do motoboy</strong>. Ele entrará no caixa físico.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cash-received-input" className="text-sm font-semibold">
                  Valor recebido (R$)
                </Label>
                <Input
                  id="cash-received-input"
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={cashConfirmModal.inputValue}
                  onChange={(e) => setCashConfirmModal(m => m ? { ...m, inputValue: e.target.value } : null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const parsed = Number(cashConfirmModal.inputValue.replace(/\./g, '').replace(',', '.'));
                      if (Number.isFinite(parsed) && parsed >= 0) {
                        const m = cashConfirmModal;
                        setCashConfirmModal(null);
                        commitOrderConfirmation(m.order, m.motoboyId, true, parsed);
                      }
                    }
                  }}
                  className="text-lg font-bold text-center h-12"
                  placeholder="0,00"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {cashConfirmModal?.step === 'amount' ? (
              <>
                <Button variant="outline" onClick={() => setCashConfirmModal(m => m ? { ...m, step: 'method' } : null)}>
                  Voltar
                </Button>
                <Button
                  onClick={() => {
                    if (!cashConfirmModal) return;
                    const parsed = Number(cashConfirmModal.inputValue.replace(/\./g, '').replace(',', '.'));
                    if (!Number.isFinite(parsed) || parsed < 0) {
                      toast({ title: 'Valor inválido', description: 'Digite um número válido (ex.: 26,00).', variant: 'destructive' });
                      return;
                    }
                    const m = cashConfirmModal;
                    setCashConfirmModal(null);
                    commitOrderConfirmation(m.order, m.motoboyId, true, parsed);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ✅ Confirmar entrada no caixa
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setCashConfirmModal(null)}>
                Cancelar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Modal: gerar ordem de pagamento do motoboy */}
      <Dialog open={!!mpoModal} onOpenChange={(open) => { if (!open) setMpoModal(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-400" />
              Ordem de Pagamento — {mpoModal?.motoboyName}
            </DialogTitle>
            <DialogDescription>
              Gere uma ordem para quitar as taxas de entrega e valores extras do motoboy.
            </DialogDescription>
          </DialogHeader>

          {mpoModal && (() => {
            const fees = parseBR(mpoModal.deliveryFees) || 0;
            const extra = parseBR(mpoModal.extraAmount) || 0;
            const total = fees + extra;
            const stat = motoboyStats.find(s => s.motoboy.id === mpoModal.motoboyId);
            return (
              <div className="space-y-4 py-1">
                {/* Escopo */}
                <div>
                  <Label className="text-xs text-muted-foreground">Escopo</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <Button
                      type="button"
                      variant={mpoModal.mode === 'period' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => stat && switchMpoMode('period', stat)}
                    >
                      Período do filtro
                    </Button>
                    <Button
                      type="button"
                      variant={mpoModal.mode === 'accumulated' ? 'default' : 'outline'}
                      size="sm"
                      disabled={!stat || mpoModal.loadingAcc}
                      onClick={() => stat && switchMpoMode('accumulated', stat)}
                    >
                      {mpoModal.loadingAcc ? 'Carregando...' : 'Acumulado (não pagos)'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {mpoModal.orderIds.length} pedido(s) inclusos
                  </p>
                </div>

                {/* Valores */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Taxas (R$)</Label>
                    <Input
                      inputMode="decimal"
                      value={mpoModal.deliveryFees}
                      onChange={(e) => setMpoModal(m => m ? { ...m, deliveryFees: e.target.value } : m)}
                      className="text-center font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor extra (R$)</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={mpoModal.extraAmount}
                      onChange={(e) => setMpoModal(m => m ? { ...m, extraAmount: e.target.value } : m)}
                      className="text-center"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Observação do extra (opcional)</Label>
                  <Input
                    placeholder="Ex: diária, ajuda de custo, ..."
                    value={mpoModal.extraNote}
                    onChange={(e) => setMpoModal(m => m ? { ...m, extraNote: e.target.value } : m)}
                  />
                </div>

                <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-500/10 p-3 text-center">
                  <p className="text-xs text-emerald-300">TOTAL A PAGAR</p>
                  <p className="text-3xl font-bold text-emerald-400">{formatCurrency(total)}</p>
                </div>

                {/* Método */}
                <div>
                  <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <Button
                      type="button"
                      variant={mpoModal.paymentMethod === 'cash' ? 'default' : 'outline'}
                      className={mpoModal.paymentMethod === 'cash' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
                      onClick={() => setMpoModal(m => m ? { ...m, paymentMethod: 'cash' } : m)}
                    >
                      <Banknote className="h-4 w-4 mr-1.5" /> Dinheiro (caixa)
                    </Button>
                    <Button
                      type="button"
                      variant={mpoModal.paymentMethod === 'pix' ? 'default' : 'outline'}
                      className={mpoModal.paymentMethod === 'pix' ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                      onClick={() => setMpoModal(m => m ? { ...m, paymentMethod: 'pix' } : m)}
                    >
                      <Send className="h-4 w-4 mr-1.5" /> PIX (ordem)
                    </Button>
                  </div>
                  {mpoModal.paymentMethod === 'cash' && (
                    <p className="text-[11px] text-amber-400 mt-2 leading-snug">
                      ⚠️ Ao confirmar, será feita uma <strong>sangria automática</strong> de {formatCurrency(total)} do caixa aberto.
                    </p>
                  )}
                </div>

                {/* Dados PIX */}
                {mpoModal.paymentMethod === 'pix' && (
                  <div className="space-y-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                    <p className="text-xs font-semibold text-purple-300">Dados informados pelo motoboy</p>
                    <div className="space-y-1">
                      <Label className="text-xs">Nome completo</Label>
                      <Input
                        value={mpoModal.pixFullName}
                        onChange={(e) => setMpoModal(m => m ? { ...m, pixFullName: e.target.value } : m)}
                      />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Chave PIX</Label>
                        <Input
                          value={mpoModal.pixKey}
                          onChange={(e) => setMpoModal(m => m ? { ...m, pixKey: e.target.value } : m)}
                          placeholder="CPF, telefone, email ou aleatória"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tipo</Label>
                        <Select
                          value={mpoModal.pixKeyType}
                          onValueChange={(v) => setMpoModal(m => m ? { ...m, pixKeyType: v } : m)}
                        >
                          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cpf">CPF</SelectItem>
                            <SelectItem value="cnpj">CNPJ</SelectItem>
                            <SelectItem value="phone">Telefone</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="random">Aleatória</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMpoModal(null)} disabled={mpoModal?.submitting}>
              Cancelar
            </Button>
            <Button
              onClick={submitPaymentOrder}
              disabled={!mpoModal || mpoModal.submitting}
              className={mpoModal?.paymentMethod === 'cash'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'}
            >
              {mpoModal?.submitting ? 'Salvando...' : mpoModal?.paymentMethod === 'cash' ? '💵 Pagar do caixa (sangria)' : '📱 Gerar ordem PIX'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Acrescer corrida manual */}
      <Dialog open={!!extraModal} onOpenChange={(open) => { if (!open) setExtraModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-purple-400" />
              Acrescer Corrida — {extraModal?.motoboyName}
            </DialogTitle>
            <DialogDescription>
              Lance uma taxa avulsa (corrida extra, ajuda de custo, etc). Será somada ao fechamento do motoboy no período.
            </DialogDescription>
          </DialogHeader>
          {extraModal && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Textarea
                  autoFocus
                  rows={3}
                  placeholder="Ex: Buscou cigarros na distribuidora do patrão do Campo dos Alemães"
                  value={extraModal.description}
                  onChange={(e) => setExtraModal(m => m ? { ...m, description: e.target.value } : m)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="12,00"
                  value={extraModal.amount}
                  onChange={(e) => setExtraModal(m => m ? { ...m, amount: e.target.value } : m)}
                  className="text-center text-lg font-bold"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                🕒 A hora do lançamento será registrada automaticamente e o valor entrará na próxima ordem de pagamento.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExtraModal(null)} disabled={extraModal?.submitting}>
              Cancelar
            </Button>
            <Button
              onClick={submitManualExtra}
              disabled={!extraModal || extraModal.submitting}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {extraModal?.submitting ? 'Salvando...' : '✅ Lançar corrida'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visualizador do comprovante enviado pelo motoboy */}
      <Dialog open={proofDialogOpen} onOpenChange={setProofDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Comprovante de Pagamento
            </DialogTitle>
          </DialogHeader>
          {proofImageUrl && (
            <img
              src={proofImageUrl}
              alt="Comprovante de pagamento"
              className="w-full rounded-lg object-contain max-h-[70vh] bg-black"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
