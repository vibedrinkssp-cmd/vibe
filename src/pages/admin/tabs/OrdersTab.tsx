// Orders Tab Component with sub-tabs: VM Delivery, PDV, iFood
import { useState } from 'react';
import { normalizeSearch } from '@/lib/text-utils';
import { Check, X, Trash2, ChevronLeft, ChevronRight, Search, Wifi, WifiOff, CheckCircle2, Package, Store, Eye, RefreshCw, Edit2, PackageCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RectifyPaymentModal, type RectifySplit } from '@/components/RectifyPaymentModal';
import { EditOrderItemsModal } from '@/components/admin/EditOrderItemsModal';
import { IfoodStockSyncWizard } from '@/components/admin/IfoodStockSyncWizard';
import { OperationPinModal } from '@/components/auth/OperationPinModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAdminRealtime } from '@/hooks/use-realtime-sync';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExpandableOrderCard } from '@/components/ExpandableOrderCard';
import { SinistroButton } from '@/components/admin/SinistroButton';
import { isExternalOrder, getPlatformLabel, getPlatformColor } from '@/lib/external-platforms';
import { isUnconfirmedPixOrder } from '@/lib/status-utils';
import { 
  useAdminOrders, 
  useAdminOrderItems, 
  useAdminUsers, 
  useAdminMotoboys,
  useAdminAddresses,
  useUpdateOrderStatus,
  useDeleteOrder,
  useUpdateDeliveryFee,
  useConfirmTotemPayment,
  useAssignMotoboy,
} from '../use-admin-data';
import { ORDER_STATUS_LABELS, canEditOrder, type OrderWithDetails } from '../shared';
import { supabase } from '@/integrations/supabase/client-safe';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const ORDERS_PER_PAGE = 30;

import { OrderOriginFilters, type OriginFilterId } from '@/components/OrderOriginFilterIcons';

type SubTab = OriginFilterId;

export function OrdersTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [proofImageUrl, setProofImageUrl] = useState<string | null>(null);
  const [proofDialogOpen, setProofDialogOpen] = useState(false);
  const [rectifyOrder, setRectifyOrder] = useState<OrderWithDetails | null>(null);
  const [editOrder, setEditOrder] = useState<OrderWithDetails | null>(null);
  const [syncOrder, setSyncOrder] = useState<OrderWithDetails | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const editItemsMutation = useMutation({
    mutationFn: async ({ orderId, changes }: { orderId: string; changes: any[] }) => {
      const { data, error } = await supabase.rpc('edit_order_items', {
        p_order_id: orderId,
        p_changes: changes as any,
        p_admin: 'ADMIN',
      });
      if (error) throw error;
      return data as { success: boolean; old_total: number; new_total: number; items_changed: number };
    },
    onSuccess: (result) => {
      toast({
        title: '✏️ Pedido atualizado!',
        description: `${result.items_changed} alteração(ões). Novo total: R$ ${Number(result.new_total).toFixed(2)}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order-items'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setEditOrder(null);
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao editar pedido', description: err.message, variant: 'destructive' });
    },
  });

  const rectifyMutation = useMutation({
    mutationFn: async ({ orderId, splits, notes }: { orderId: string; splits: RectifySplit[]; notes: string }) => {
      const splitsJson = splits.map(s => ({ method: s.method, amount: s.amount, label: s.label }));
      const { data, error } = await supabase.rpc('rectify_order_payment', {
        p_order_id: orderId,
        p_splits: splitsJson as any,
        p_notes: notes,
      });
      if (error) throw error;
      return data as { success: boolean; excess?: number; total_paid?: number; order_total?: number };
    },
    onSuccess: (result) => {
      const excess = Number(result?.excess ?? 0);
      toast({
        title: '✅ Pagamento retificado!',
        description: excess > 0.01
          ? `💰 Excedente de R$ ${excess.toFixed(2)} registrado no caixa.`
          : 'Movimentações de caixa atualizadas.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['session-summary'] });
      setRectifyOrder(null);
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao retificar', description: err.message, variant: 'destructive' });
    },
  });

  // Recebimento físico de dinheiro do motoboy → soma no caixa
  const confirmCashMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('confirm_cash_received', {
        p_order_id: orderId,
        p_responsible: 'admin',
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; amount?: number };
      if (!result.success) throw new Error(result.error || 'Falha ao confirmar');
      return result;
    },
    onSuccess: (result) => {
      const amount = result.amount ?? 0;
      toast({
        title: '💜 Recebimento confirmado!',
        description: `R$ ${Number(amount).toFixed(2)} adicionado ao caixa físico.`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['session-summary'] });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao confirmar recebimento', description: err.message, variant: 'destructive' });
    },
  });

  useAdminRealtime({
    onConnected: () => setIsRealtimeConnected(true),
    onDisconnected: () => setIsRealtimeConnected(false),
  });

  const { data: orders = [], isLoading } = useAdminOrders({ refetchInterval: 15000 });
  const { data: users = [], isLoading: isLoadingUsers, isFetching: isFetchingUsers, error: usersError } = useAdminUsers();
  const { data: motoboysData = [] } = useAdminMotoboys();
  const assignMotoboyMutation = useAssignMotoboy();
  const { data: addresses = [], isLoading: isLoadingAddresses, isFetching: isFetchingAddresses, error: addressesError } = useAdminAddresses();

  // Aguarda primeira carga de usuários e endereços antes de montar os pedidos,
  // senão o card mostra "Cliente" sem nome/endereço por alguns segundos.
  const hasUsersLoaded = !isLoadingUsers && users.length >= 0 && !(isFetchingUsers && users.length === 0);
  const hasAddressesLoaded = !isLoadingAddresses && addresses.length >= 0 && !(isFetchingAddresses && addresses.length === 0);
  const customerDataReady = hasUsersLoaded && hasAddressesLoaded;
  
  const orderIds = orders.map(o => o.id);
  const { data: orderItems = [] } = useAdminOrderItems(orderIds);

  const updateStatusMutation = useUpdateOrderStatus();
  const deleteOrderMutation = useDeleteOrder();
  const editDeliveryFeeMutation = useUpdateDeliveryFee();
  const confirmPaymentMutation = useConfirmTotemPayment();

  // Query payment confirmations with images for proof viewer
  const { data: paymentProofs = [] } = useQuery({
    queryKey: ['payment-proofs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payment_confirmations')
        .select('order_id, image_url')
        .not('image_url', 'is', null);
      return data || [];
    },
    refetchInterval: 30000,
  });

  const proofsByOrderId = new Map(
    paymentProofs.filter(p => p.image_url).map(p => [p.order_id, p.image_url!])
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

  // Build all orders with details — só monta quando users/addresses já carregaram,
  // evitando exibir "Cliente" sem nome ou pedido sem endereço enquanto as queries pendem.
  const allOrdersWithDetails: OrderWithDetails[] = customerDataReady
    ? orders
        // PIX não confirmado NÃO é pedido real: fica oculto até o webhook confirmar.
        .filter(order => !isUnconfirmedPixOrder(order))
        .map(order => {
        const user = users.find(u => u.id === order.userId);
        const motoboy = order.motoboyId ? motoboysData.find(m => m.id === order.motoboyId) : undefined;
        const address = (order as any).address || (order.addressId ? addresses.find(a => a.id === order.addressId) : undefined);
        return {
          ...order,
          items: orderItems.filter(item => item.orderId === order.id),
          userName: (order as any).userName || user?.name || order.customerName || 'Cliente',
          userWhatsapp: (order as any).userWhatsapp || user?.whatsapp,
          motoboy,
          address,
        };
      })
    : [];

  // Filter by sub-tab origin
  const filterBySubTab = (order: OrderWithDetails): boolean => {
    const external = isExternalOrder(order);
    switch (activeSubTab) {
      case 'vm_delivery':
        return !external && (order.orderType === 'delivery' || order.orderType === 'pickup');
      case 'pdv':
        return !external && order.orderType === 'counter';
      case 'ifood':
        return order.salesperson?.toLowerCase() === 'ifood' && order.externalOrigin !== 'ifood_test';
      case '99food':
        return order.salesperson?.toLowerCase() === '99food';
      case 'ifood_test':
        return order.externalOrigin === 'ifood_test';
      default:
        return true;
    }
  };

  // Count pending per sub-tab for badges
  const pendingCounts = {
    all: allOrdersWithDetails.filter(o => o.status === 'pending').length,
    vm_delivery: allOrdersWithDetails.filter(o => !isExternalOrder(o) && (o.orderType === 'delivery' || o.orderType === 'pickup') && o.status === 'pending').length,
    pdv: allOrdersWithDetails.filter(o => !isExternalOrder(o) && o.orderType === 'counter' && o.status === 'pending').length,
    ifood: allOrdersWithDetails.filter(o => o.salesperson?.toLowerCase() === 'ifood' && o.externalOrigin !== 'ifood_test' && o.status === 'pending').length,
    '99food': allOrdersWithDetails.filter(o => o.salesperson?.toLowerCase() === '99food' && o.status === 'pending').length,
    ifood_test: allOrdersWithDetails.filter(o => o.externalOrigin === 'ifood_test' && o.status === 'pending').length,
  };

  const activeCounts = {
    all: allOrdersWithDetails.filter(o => !['delivered', 'cancelled'].includes(o.status)).length,
    vm_delivery: allOrdersWithDetails.filter(o => !isExternalOrder(o) && (o.orderType === 'delivery' || o.orderType === 'pickup') && !['delivered', 'cancelled'].includes(o.status)).length,
    pdv: allOrdersWithDetails.filter(o => !isExternalOrder(o) && o.orderType === 'counter' && !['delivered', 'cancelled'].includes(o.status)).length,
    ifood: allOrdersWithDetails.filter(o => o.salesperson?.toLowerCase() === 'ifood' && o.externalOrigin !== 'ifood_test' && !['delivered', 'cancelled'].includes(o.status)).length,
    '99food': allOrdersWithDetails.filter(o => o.salesperson?.toLowerCase() === '99food' && !['delivered', 'cancelled'].includes(o.status)).length,
    ifood_test: allOrdersWithDetails.filter(o => o.externalOrigin === 'ifood_test' && !['delivered', 'cancelled'].includes(o.status)).length,
  };

  // For platforms sub-tab, show all orders (allow annulling any)
  const subTabOrders = allOrdersWithDetails.filter(filterBySubTab);

  const filteredOrders = subTabOrders.filter(order => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesPayment = paymentFilter === 'all' || order.paymentMethod === paymentFilter;
    const searchNorm = normalizeSearch(searchTerm.trim());
    const matchesSearch = searchNorm === '' || 
      normalizeSearch(order.id).includes(searchNorm) ||
      (order.customerName && normalizeSearch(order.customerName).includes(searchNorm)) ||
      (order.userName && normalizeSearch(order.userName).includes(searchNorm));
    let matchesDate = true;
    if (dateFrom || dateTo) {
      const created = order.createdAt ? new Date(order.createdAt).getTime() : 0;
      if (dateFrom) {
        const from = new Date(dateFrom + 'T00:00:00').getTime();
        if (created < from) matchesDate = false;
      }
      if (dateTo) {
        const to = new Date(dateTo + 'T23:59:59').getTime();
        if (created > to) matchesDate = false;
      }
    }
    return matchesStatus && matchesPayment && matchesSearch && matchesDate;
  });

  const totalPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ORDERS_PER_PAGE,
    currentPage * ORDERS_PER_PAGE
  );

  // ===== iFood stock-sync status (badge "SINCRONIZAR ESTOQUE") =====
  const externalDeliveredIds = paginatedOrders
    .filter(o => isExternalOrder(o) && o.status === 'delivered')
    .map(o => o.id);
  const externalIdsKey = externalDeliveredIds.join(',');
  const { data: syncStatusRows = [] } = useQuery({
    queryKey: ['ifood-sync-status', externalIdsKey],
    enabled: externalDeliveredIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ifood_sync_status', {
        p_order_ids: externalDeliveredIds,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        order_id: string;
        synced_at: string;
        synced_by: string | null;
        items_count: number;
        total_units: number;
      }>;
    },
    refetchInterval: 15000,
  });
  const syncStatusMap = new Map(syncStatusRows.map(r => [r.order_id, r]));

  const handleSubTabChange = (tab: SubTab) => {
    setActiveSubTab(tab);
    setCurrentPage(1);
    setStatusFilter('all');
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleEditDeliveryFee = (orderId: string, newFee: number) => {
    editDeliveryFeeMutation.mutate({ orderId, newFee });
  };

  const renderEditButton = (order: OrderWithDetails) => {
    if (!canEditOrder(order)) return null;
    return (
      <Button
        size="sm"
        variant="outline"
        className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
        onClick={() => setEditOrder(order)}
      >
        <Edit2 className="h-4 w-4 mr-1" />
        Editar Itens
      </Button>
    );
  };

  // Atribuição rápida de motoboy SEMPRE visível no card (sem expandir)
  const renderMotoboyQuickAssign = (order: OrderWithDetails) => {
    const isDelivery = order.orderType === 'delivery' || isExternalOrder(order);
    if (!isDelivery) return null;
    if (['delivered', 'cancelled'].includes(order.status)) return null;
    const activeMotoboys = motoboysData.filter(m => m.isActive);
    const assigned = !!order.motoboyId;
    return (
      <Select
        onValueChange={(motoboyId) => assignMotoboyMutation.mutate({ orderId: order.id, motoboyId })}
        value={order.motoboyId || undefined}
      >
        <SelectTrigger
          className={`w-full h-11 text-sm font-semibold ${
            assigned
              ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
              : 'bg-secondary border-primary/30'
          }`}
        >
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4 flex-shrink-0" />
            <SelectValue placeholder="🏍️ Atribuir Motoboy" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {activeMotoboys.map(m => (
            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const renderOrderActions = (order: OrderWithDetails) => {
    const external = isExternalOrder(order);

    // External orders (iFood etc): admin é conferência — sem botão "Aceitar"
    // (pedidos são auto-aceitos pela trigger trg_auto_accept_order; KDE/LOG operam o fluxo).
    if (external) {
      const syncInfo = order.status === 'delivered' ? syncStatusMap.get(order.id) : undefined;
      const showSyncCta = order.status === 'delivered' && !syncInfo;
      const showSyncDone = order.status === 'delivered' && !!syncInfo;
      return (
        <div className="flex flex-col gap-2 w-full">
          {showSyncCta && (
            <Button
              size="lg"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-base py-5 shadow-lg shadow-red-600/30 animate-pulse"
              onClick={() => setSyncOrder(order)}
              data-testid={`btn-sync-stock-${order.id}`}
            >
              <PackageCheck className="w-5 h-5 mr-2" />
              ⚠ SINCRONIZAR COM ESTOQUE
            </Button>
          )}
          {showSyncDone && (
            <div
              className="w-full flex items-center justify-center gap-2 rounded-md bg-purple-600/20 border border-purple-500/40 text-purple-200 font-bold py-2 text-sm"
              title={`Sincronizado por ${syncInfo?.synced_by ?? 'admin'} em ${new Date(syncInfo!.synced_at).toLocaleString('pt-BR')}`}
            >
              <CheckCircle2 className="w-4 h-4" />
              ✅ ESTOQUE SINCRONIZADO · {syncInfo?.items_count ?? 0} item(ns) · {syncInfo?.total_units ?? 0} un.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {renderEditButton(order)}
            <Button
              size="sm"
              variant="destructive"
              className="font-black"
              onClick={() => {
                if (confirm('ANULAR este pedido? Ele será completamente removido do sistema sem impactar relatórios.')) {
                  setPendingDeleteId(order.id);
                }
              }}
              disabled={deleteOrderMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              ANULAR
            </Button>
            {proofsByOrderId.has(order.id) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleViewProof(order.id)}
              >
                <Eye className="h-4 w-4 mr-1" />
                Comprovante
              </Button>
            )}
          </div>
        </div>
      );
    }

    const isPix = order.paymentMethod === 'pix';
    const isCash = order.paymentMethod === 'cash';
    const isDeliveryCash = isCash && order.orderType === 'delivery';
    // Botão grande de recebimento físico só aparece em delivery cash não confirmado
    const needsCashReceiptConfirmation = isDeliveryCash && !order.paymentConfirmed && order.status !== 'cancelled';
    // BOTÃO GRANDE de conferência (cartão / POS / cash balcão) — substitui o antigo "💰 Recebido"
    const needsCounterConfirmation = !order.paymentConfirmed && !isPix && !isDeliveryCash && order.status !== 'cancelled';
    const counterConfirmed = order.paymentConfirmed && !isPix && !isDeliveryCash;

    // Texto adaptado ao método de pagamento
    const counterMethodLabel = (() => {
      switch (order.paymentMethod) {
        case 'card_credit': return 'NA MAQUININHA (CRÉDITO)';
        case 'card_debit': return 'NA MAQUININHA (DÉBITO)';
        case 'pix_pos': return 'PIX MAQUININHA';
        case 'cash': return 'EM DINHEIRO';
        default: return 'O PAGAMENTO';
      }
    })();

    const formatConfirmedAt = (iso?: string | null) => {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    };

    return (
      <div className="flex flex-col gap-2 w-full">
        {canEditOrder(order) && (
          <div className="flex justify-end">{renderEditButton(order)}</div>
        )}
        {/* BOTÃO GRANDE — Recebimento físico de dinheiro do motoboy */}
        {needsCashReceiptConfirmation && (
          <Button
            size="lg"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-lg py-6 shadow-lg shadow-red-600/30 animate-pulse"
            onClick={() => confirmCashMutation.mutate(order.id)}
            disabled={confirmCashMutation.isPending}
            data-testid={`btn-confirm-cash-${order.id}`}
          >
            <CheckCircle2 className="w-6 h-6 mr-2" />
            {confirmCashMutation.isPending
              ? 'CONFIRMANDO...'
              : `RECEBER R$ ${Number(order.total).toFixed(2).replace('.', ',')} EM DINHEIRO`}
          </Button>
        )}
        {isDeliveryCash && order.paymentConfirmed && (
          <Button
            size="lg"
            disabled
            className="w-full bg-purple-600 hover:bg-purple-600 text-white font-black text-base py-5 cursor-default opacity-100"
            data-testid={`btn-cash-confirmed-${order.id}`}
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            ✅ RECEBIMENTO CONCLUÍDO — R$ {Number(order.total).toFixed(2).replace('.', ',')}
          </Button>
        )}

        {/* BOTÃO GRANDE — Conferência de cartão / POS / cash balcão */}
        {needsCounterConfirmation && (
          <Button
            size="lg"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-lg py-6 shadow-lg shadow-red-600/30 animate-pulse"
            onClick={() => confirmPaymentMutation.mutate({ orderId: order.id })}
            disabled={confirmPaymentMutation.isPending}
            data-testid={`btn-confirm-payment-${order.id}`}
          >
            <CheckCircle2 className="w-6 h-6 mr-2" />
            {confirmPaymentMutation.isPending
              ? 'CONFIRMANDO...'
              : `CONFERIR R$ ${Number(order.total).toFixed(2).replace('.', ',')} ${counterMethodLabel}`}
          </Button>
        )}
        {counterConfirmed && (
          <Button
            size="lg"
            disabled
            className="w-full bg-purple-600 hover:bg-purple-600 text-white font-black text-base py-5 cursor-default opacity-100"
            data-testid={`btn-payment-confirmed-${order.id}`}
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            ✅ PAGAMENTO CONFERIDO — R$ {Number(order.total).toFixed(2).replace('.', ',')}
            {(order.paymentConfirmedBy || order.paymentConfirmedAt) && (
              <span className="ml-2 text-xs font-bold opacity-90">
                {order.paymentConfirmedBy ? `· ${order.paymentConfirmedBy}` : ''}
                {order.paymentConfirmedAt ? ` · ${formatConfirmedAt(order.paymentConfirmedAt)}` : ''}
              </span>
            )}
          </Button>
        )}

        <div className="flex flex-wrap items-center gap-2">
        {isPix && order.paymentConfirmed && (
          <Badge className="bg-green-600/20 text-green-400 border-green-500/30">
            ✅ Pgto Confirmado
          </Badge>
        )}
        {/* Pedidos pendentes só ocorrem em PIX aguardando confirmação. Admin não aceita —
            o pagamento confirma via webhook MP. Mantém apenas Cancelar como segurança. */}
        {order.status === 'pending' && (
          <>
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">
              ⏳ Aguardando PIX
            </Badge>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'cancelled' })}
              disabled={updateStatusMutation.isPending}
            >
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
          </>
        )}
        {order.status === 'delivered' && order.paymentMethod !== 'pix' && (
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
            onClick={() => setRectifyOrder(order)}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Retificar
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground/50"
          onClick={() => {
            if (confirm('Tem certeza que deseja excluir este pedido?')) {
              setPendingDeleteId(order.id);
            }
          }}
          disabled={deleteOrderMutation.isPending}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Excluir
        </Button>
        {proofsByOrderId.has(order.id) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleViewProof(order.id)}
          >
            <Eye className="h-4 w-4 mr-1" />
            Comprovante
          </Button>
        )}
        {/* SINISTRO — reverte status mesmo de pedidos cancelled/delivered.
            Sempre disponível para admin (último recurso operacional). */}
        <SinistroButton
          orderId={order.id}
          currentStatus={order.status}
          orderCode={order.id.slice(0, 8).toUpperCase()}
        />
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-2xl md:text-3xl text-primary">Pedidos</h2>
          <Badge 
            className={isRealtimeConnected 
              ? "bg-green-500/20 text-green-400 border-green-500/30" 
              : "bg-primary/20 text-primary border-primary/30"
            }
          >
            {isRealtimeConnected ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            {isRealtimeConnected ? 'Ao Vivo' : 'Conectando...'}
          </Badge>
        </div>
      </div>

      {/* Banner de erro de permissão — torna falhas visíveis em vez de degradar silenciosamente */}
      {(usersError || addressesError) && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-semibold">Falha ao carregar dados de cliente</p>
          <div className="text-destructive/80 mt-1 space-y-0.5">
            {usersError && <p>Clientes: {(usersError as Error).message}</p>}
            {addressesError && <p>Endereços: {(addressesError as Error).message}</p>}
          </div>
          <p className="text-destructive/80 mt-1">
            Os pedidos podem aparecer sem nome ou endereço. Tente recarregar ou faça login novamente.
          </p>
        </div>
      )}

      {/* Sub-tabs */}
      <OrderOriginFilters
        activeFilter={activeSubTab}
        onFilterChange={(id) => handleSubTabChange(id as SubTab)}
        counts={activeCounts}
        pendingCounts={pendingCounts}
        showAll={true}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 w-full sm:w-48 md:w-64 bg-secondary border-primary/30 text-sm"
            type="search"
            name="order-search-no-autofill"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
            data-1p-ignore="true"
          />

        </div>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-36 md:w-48 bg-secondary border-primary/30 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-40 md:w-48 bg-secondary border-primary/30 text-sm">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos pagamentos</SelectItem>
            <SelectItem value="cash">💵 Dinheiro</SelectItem>
            <SelectItem value="pix">📱 PIX (online)</SelectItem>
            <SelectItem value="pix_pos">🏧 PIX Maquininha</SelectItem>
            <SelectItem value="card_credit">💳 Crédito</SelectItem>
            <SelectItem value="card_debit">💳 Débito</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">De:</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
            className="w-full sm:w-40 bg-secondary border-primary/30 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">Até:</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
            className="w-full sm:w-40 bg-secondary border-primary/30 text-sm"
          />
        </div>
        {(dateFrom || dateTo || paymentFilter !== 'all' || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDateFrom(''); setDateTo(''); setPaymentFilter('all'); setStatusFilter('all'); setCurrentPage(1); }}
            className="text-xs"
          >
            Limpar filtros
          </Button>
        )}
      </div>


      {/* Orders list */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1,2,3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum pedido encontrado
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            Mostrando {(currentPage - 1) * ORDERS_PER_PAGE + 1} - {Math.min(currentPage * ORDERS_PER_PAGE, filteredOrders.length)} de {filteredOrders.length} pedidos
          </div>
          <div className="grid gap-4">
            {paginatedOrders.map(order => {
              // "New" = accepted within last 3 minutes (auto-accepted orders that haven't been acted on)
              const isNewOrder = order.status === 'accepted' && order.acceptedAt && 
                (Date.now() - new Date(String(order.acceptedAt)).getTime()) < 3 * 60 * 1000;
              const stockSynced = isExternalOrder(order) && order.status === 'delivered'
                ? syncStatusMap.get(order.id)
                : undefined;
              return (
              <div key={order.id}>
                <ExpandableOrderCard
                  order={order}
                  variant="admin"
                  defaultExpanded={activeSubTab === 'ifood' || activeSubTab === '99food'}
                  showActions={true}
                  quickActions={renderMotoboyQuickAssign(order)}
                  actions={renderOrderActions(order)}
                  titleBadge={stockSynced ? (
                    <Badge
                      className="bg-white/95 text-green-700 border-0 text-[10px] font-black px-1.5 py-0 leading-4 shadow-md gap-1"
                      title={`Estoque baixado por ${stockSynced.synced_by ?? 'admin'} em ${new Date(stockSynced.synced_at).toLocaleString('pt-BR')}`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      STOCK OK
                    </Badge>
                  ) : undefined}
                  onEditDeliveryFee={activeSubTab !== 'ifood' && activeSubTab !== '99food' ? handleEditDeliveryFee : undefined}
                  isEditingDeliveryFee={editDeliveryFeeMutation.isPending}
                  isNew={!!isNewOrder}
                />
              </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {currentPage} de {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Proxima
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>

      {/* Payment Proof Viewer Dialog */}
      <Dialog open={proofDialogOpen} onOpenChange={setProofDialogOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Comprovante de Pagamento
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {proofImageUrl && (
              <img
                src={proofImageUrl}
                alt="Comprovante de pagamento"
                className="w-full rounded-lg border border-border"
                loading="lazy"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rectify Payment Modal */}
      {rectifyOrder && (
        <RectifyPaymentModal
          open={!!rectifyOrder}
          onOpenChange={(v) => { if (!v) setRectifyOrder(null); }}
          total={Number(rectifyOrder.total)}
          orderId={rectifyOrder.id}
          onConfirm={(splits, notes) => {
            rectifyMutation.mutate({ orderId: rectifyOrder.id, splits, notes });
          }}
          isPending={rectifyMutation.isPending}
        />
      )}

      {/* Edit Order Items Modal */}
      <EditOrderItemsModal
        order={editOrder}
        items={editOrder?.items || []}
        onClose={() => setEditOrder(null)}
        onSave={async (orderId, changes) => {
          await editItemsMutation.mutateAsync({ orderId, changes });
        }}
        isSaving={editItemsMutation.isPending}
      />

      <OperationPinModal
        open={!!pendingDeleteId}
        operation="excluir_pedido"
        title="Confirmar Exclusão"
        description="Digite o PIN para excluir este pedido."
        targetId={pendingDeleteId}
        onValidated={() => {
          if (pendingDeleteId) deleteOrderMutation.mutate(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
      <IfoodStockSyncWizard
        open={!!syncOrder}
        onOpenChange={(v) => { if (!v) setSyncOrder(null); }}
        order={syncOrder}
        syncedBy="admin"
      />
    </>
  );
}
