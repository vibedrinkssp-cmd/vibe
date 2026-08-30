import { useState, useEffect } from 'react';
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Package, LogOut, Navigation, CheckCircle, Truck, Wifi, WifiOff, MapPinCheck, MapPin, DollarSign, Clock, BarChart3, HelpCircle, History, ChevronDown, ChevronUp, Camera, RefreshCw, BellOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOrderUpdates } from '@/hooks/use-order-updates';
import { useMotoboyRealtime } from '@/hooks/use-realtime-sync';
import { useNotificationSound } from '@/hooks/use-notification-sound';
import { useOrderAlert } from '@/hooks/use-order-alert';
import { useSoundTestListener } from '@/hooks/use-sound-test-listener';
import { useMotoboyTracking } from '@/hooks/use-motoboy-tracking';
import { MotoboyTutorialModal } from '@/components/motoboy/MotoboyTutorialModal';
import { GpsPermissionBanner } from '@/components/location/GpsPermissionBanner';

import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';
import { ExpandableOrderCard } from '@/components/ExpandableOrderCard';
import { OrderCarousel } from '@/components/OrderCarousel';
import { IfoodConfirmationActions } from '@/components/IfoodConfirmationActions';
import { isExternalOrder } from '@/lib/external-platforms';
import { PaymentOCRModal } from '@/components/motoboy/PaymentOCRModal';
import { ChangePaymentModal } from '@/components/motoboy/ChangePaymentModal';
import { supabase } from '@/integrations/supabase/client-safe';
import { mapAddress, mapOrder, mapOrderItem, mapMotoboy } from '@/lib/db-mappers';
import type { Order, OrderItem, Address, Motoboy } from '@/shared/schema';
import { SoundUnlockBanner } from '@/components/SoundUnlockBanner';

interface OrderWithDetails extends Order {
  items: OrderItem[];
  userName?: string;
  userWhatsapp?: string;
  address?: Address;
}

export default function MotoboyPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, logout, isHydrated } = useAuth();
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const [gpsRequested, setGpsRequested] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryDate, setSummaryDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [summaryPeriod, setSummaryPeriod] = useState<'all' | 'manha' | 'tarde' | 'noite'>('all');
  const [showTutorial, setShowTutorial] = useState(false);
  const [ocrOrderId, setOcrOrderId] = useState<string | null>(null);
  const [ocrExpectedValue, setOcrExpectedValue] = useState(0);
  const [changePaymentOrder, setChangePaymentOrder] = useState<OrderWithDetails | null>(null);
  const isAuthorized = isHydrated && (role === 'motoboy' || role === 'admin');
  const { playOnce } = useNotificationSound({ screen: 'motoboy' });
  const { alertOrder, ackOrder, ackAll, syncPendingOrders, isAlertActive } = useOrderAlert('motoboy');
  const visibleAlertedOrdersRef = useRef<Set<string>>(new Set());

  useSoundTestListener({
    panelId: 'motoboy',
    enabled: isAuthorized,
    onTestSignal: (soundType) => {
      playOnce(soundType);
      toast({ title: `🔊 Teste de som recebido (${soundType})` });
    },
  });
  const motoboyId = user?.id || '';
  const loginTime = user?.createdAt || new Date().toISOString();

  // Fetch motoboy's own data using motoboy-specific RPC (no auth role needed)
  const { data: currentMotoboy, isLoading: motoboyLoading } = useQuery<Motoboy | null>({
    queryKey: ['motoboy-self', motoboyId],
    queryFn: async () => {
      if (!motoboyId) return null;
      const { data, error } = await supabase.rpc('get_motoboy_self', { p_motoboy_id: motoboyId });
      if (error) {
        console.error('[Motoboy] get_motoboy_self error:', error);
        return null;
      }
      const arr = (data || []).map(mapMotoboy);
      return arr[0] || null;
    },
    enabled: isAuthorized && !!motoboyId,
  });

  // Fetch orders assigned to this motoboy using motoboy-specific RPC
  const { data: allOrders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['motoboy-orders', motoboyId],
    queryFn: async () => {
      if (!motoboyId) return [];
      const { data, error } = await supabase.rpc('get_motoboy_orders', { p_motoboy_id: motoboyId });
      if (error) {
        console.error('[Motoboy] get_motoboy_orders error:', error);
        return [];
      }
      // Dedup defensivo por id: garante que o mesmo pedido nunca apareça
      // duplicado no painel, independente de quirks de RPC/realtime/cache.
      const seen = new Set<string>();
      return (data || []).map(mapOrder).filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });
    },
    enabled: !!currentMotoboy?.id,
    refetchInterval: isSSEConnected ? 30000 : 8000,
  });

  // Fetch users for motoboy's orders
  const { data: users = [] } = useQuery<{ id: string; name: string; whatsapp: string }[]>({
    queryKey: ['motoboy-order-users', motoboyId],
    queryFn: async () => {
      if (!motoboyId) return [];
      const { data, error } = await supabase.rpc('get_motoboy_order_users', { p_motoboy_id: motoboyId });
      if (error) {
        console.error('[Motoboy] get_motoboy_order_users error:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!currentMotoboy?.id,
  });

  // Mostra qualquer pedido ativo atribuído a este motoboy (inclui accepted/preparing/ready
  // caso a cozinha ainda não tenha marcado como pronto, mas o admin já alocou o motoboy)
  const dispatchedOrdersRaw = allOrders.filter(
    o => o.motoboyId === currentMotoboy?.id &&
      ['accepted', 'preparing', 'ready', 'dispatched', 'arrived'].includes(o.status as string)
  );

  // Get the first dispatched order for tracking
  const currentOrderForTracking = dispatchedOrdersRaw[0];

  // GPS Tracking - Always enabled when motoboy is logged in
  const { 
    isTracking, 
    permissionStatus, 
    lastError,
    requestPermission,
    startTracking,
  } = useMotoboyTracking({
    motoboyId: currentMotoboy?.id || '',
    orderId: currentOrderForTracking?.id,
    enabled: !!currentMotoboy?.id,
    updateInterval: 5000,
  });

  // Sync online state from DB
  useEffect(() => {
    if (currentMotoboy) {
      setIsOnline(!!currentMotoboy.isOnline);
    }
  }, [currentMotoboy?.isOnline]);

  // AUTO-ONLINE: Set online when motoboy logs in / opens page
  useEffect(() => {
    if (!currentMotoboy?.id) return;
    
    // Set online immediately
    supabase.rpc('set_motoboy_online_status', {
      p_motoboy_id: currentMotoboy.id,
      p_is_online: true,
    }).then(() => {
      setIsOnline(true);
      queryClient.invalidateQueries({ queryKey: ['motoboy-self'] });
    });

    // Set offline on browser close / tab close
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliability on page unload
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/set_motoboy_online_status`;
      const body = JSON.stringify({
        p_motoboy_id: currentMotoboy.id,
        p_is_online: false,
      });
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentMotoboy?.id]);

  // Heartbeat: keep motoboy "online" while logged in
  useEffect(() => {
    if (!currentMotoboy?.id) return;
    
    supabase.rpc('motoboy_heartbeat', { p_motoboy_id: currentMotoboy.id });
    
    const interval = setInterval(() => {
      supabase.rpc('motoboy_heartbeat', { p_motoboy_id: currentMotoboy.id });
    }, 60000);
    
    return () => clearInterval(interval);
  }, [currentMotoboy?.id]);

  // Auto-request GPS on first load
  useEffect(() => {
    if (!currentMotoboy?.id || gpsRequested) return;
    setGpsRequested(true);
    
    const timer = setTimeout(async () => {
      const success = await startTracking();
      if (success) {
        toast({ title: '✅ GPS ativado!', description: 'Localização sendo compartilhada.', duration: 3000 });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [currentMotoboy?.id, gpsRequested, startTracking, toast]);

  // Realtime sync for motoboy
  useMotoboyRealtime({
    enabled: isAuthorized,
    onConnected: () => setIsSSEConnected(true),
    onDisconnected: () => setIsSSEConnected(false),
    onEvent: (event) => {
      if (event.table === 'orders') {
        const status = event.payload?.status;
        const orderId = event.payload?.id;
        const eventMotoboyId = event.payload?.motoboy_id;
        
        if (event.event === 'UPDATE') {
          if (eventMotoboyId === currentMotoboy?.id && status === 'dispatched' && orderId) {
            visibleAlertedOrdersRef.current.add(orderId);
            alertOrder(orderId);
            toast({ title: '🏍️ Nova entrega atribuída!' });
          }
          if ((status === 'arrived' || status === 'delivered' || status === 'picked_up') && orderId) {
            visibleAlertedOrdersRef.current.delete(orderId);
            ackOrder(orderId);
          }
        }
        // Force immediate refetch of all motoboy queries
        queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
        queryClient.invalidateQueries({ queryKey: ['motoboy-order-items'] });
        queryClient.invalidateQueries({ queryKey: ['motoboy-order-users'] });
      }
    },
  });

  // Fallback polling
  useOrderUpdates({
    onConnected: () => setIsSSEConnected(true),
    onDisconnected: () => setIsSSEConnected(false),
  });

  // Entregas concluídas filtradas por data e período selecionados no Resumo.
  const filteredDelivered = useMemo(() => {
    if (!currentMotoboy?.id) return [] as Order[];
    const [y, m, d] = summaryDate.split('-').map(Number);
    const dayStart = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
    const dayEnd = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
    return allOrders.filter(o => {
      if (o.motoboyId !== currentMotoboy.id || o.status !== 'delivered' || !o.deliveredAt) return false;
      const dt = new Date(o.deliveredAt);
      if (dt < dayStart || dt > dayEnd) return false;
      if (summaryPeriod === 'all') return true;
      const h = dt.getHours();
      if (summaryPeriod === 'manha') return h >= 5 && h < 12;
      if (summaryPeriod === 'tarde') return h >= 12 && h < 18;
      return h >= 18 || h < 5; // noite
    });
  }, [allOrders, currentMotoboy?.id, summaryDate, summaryPeriod]);

  // IDs ativos + (quando Resumo aberto) ids dos entregues filtrados, para reusar o
  // mesmo card expansível no histórico sem custo desnecessário em modo padrão.
  const todayDeliveredIdsForFetch = useMemo(() => {
    if (!showSummary) return [] as string[];
    return filteredDelivered.map(o => o.id);
  }, [showSummary, filteredDelivered]);

  const orderIds = Array.from(new Set([
    ...dispatchedOrdersRaw.map(o => o.id),
    ...todayDeliveredIdsForFetch,
  ]));

  // Fetch order items using motoboy-specific RPC
  const { data: orderItems = [] } = useQuery<OrderItem[]>({
    queryKey: ['motoboy-order-items', motoboyId, orderIds.join(',')],
    queryFn: async () => {
      if (!motoboyId || orderIds.length === 0) return [];
      const { data, error } = await supabase.rpc('get_motoboy_order_items', {
        p_motoboy_id: motoboyId,
        p_order_ids: orderIds,
      });
      if (error) {
        console.error('[Motoboy] get_motoboy_order_items error:', error);
        return [];
      }
      return (data || []).map(mapOrderItem);
    },
    enabled: !!currentMotoboy?.id && orderIds.length > 0,
    refetchInterval: isSSEConnected ? 60000 : 15000,
  });

  // Fetch addresses using motoboy-specific RPC
  const addressIds = Array.from(new Set([
    ...dispatchedOrdersRaw.map(o => o.addressId).filter(Boolean) as string[],
    ...allOrders.filter(o => todayDeliveredIdsForFetch.includes(o.id)).map(o => o.addressId).filter(Boolean) as string[],
  ]));
  const { data: addresses = [] } = useQuery<Address[]>({
    queryKey: ['motoboy-addresses', motoboyId, addressIds.join(',')],
    queryFn: async () => {
      if (!motoboyId || addressIds.length === 0) return [];
      const { data, error } = await supabase.rpc('get_motoboy_addresses', {
        p_motoboy_id: motoboyId,
        p_address_ids: addressIds,
      });
      if (error) {
        console.error('[Motoboy] get_motoboy_addresses error:', error);
        return [];
      }
      return (data || []).map(mapAddress);
    },
    enabled: !!currentMotoboy?.id && addressIds.length > 0,
  });

  const dispatchedOrders: OrderWithDetails[] = dispatchedOrdersRaw
    .map(order => ({
      ...order,
      items: orderItems.filter(item => item.orderId === order.id),
      address: addresses.find(a => a.id === order.addressId),
      userName: users.find(u => u.id === order.userId)?.name || order.customerName || undefined,
      userWhatsapp: users.find(u => u.id === order.userId)?.whatsapp,
    }))
    // Ordena do mais antigo (esquerda) para o mais recente (direita)
    .sort((a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime());

  // Reconciliação por polling: garante som mesmo se realtime falhar.
  // Acionável: pedidos despachados para este motoboy que ainda não foram coletados.
  useEffect(() => {
    if (!isAuthorized) return;
    const actionableIds = dispatchedOrders
      .filter((o) => o.status === 'dispatched' && !o.pickedUpAt)
      .map((o) => o.id);
    syncPendingOrders(actionableIds);
  }, [isAuthorized, dispatchedOrders, syncPendingOrders]);

  // Entregas do resumo (data/período selecionados) — dirige cards e totais.
  const todayDelivered = filteredDelivered;
  const isSummaryToday = summaryDate === new Date().toISOString().slice(0, 10);
  const periodLabel = summaryPeriod === 'manha' ? ' (manhã)' : summaryPeriod === 'tarde' ? ' (tarde)' : summaryPeriod === 'noite' ? ' (noite)' : '';
  const summaryLabel = (isSummaryToday ? 'Hoje' : summaryDate.split('-').reverse().join('/')) + periodLabel;

  const accumulatedFees = todayDelivered.reduce((sum, o) => sum + Number(o.deliveryFee || 0), 0);

  // Total que o motoboy cobrou de clientes em pedidos externos (iFood etc.) hoje e
  // precisa prestar contas (dinheiro/maquininha) — costuma passar despercebido pois
  // o pedido aparece como "pago via app".
  const externalChargeOrders = useMemo(() => {
    return todayDelivered
      .map((o) => {
        if (!isExternalOrder(o)) return null;
        const match = o.notes?.match(/<!--META:(.*?)-->/);
        if (!match) return null;
        try {
          const meta = JSON.parse(match[1]);
          const cobrar = meta['cobrar_cliente'];
          if (!cobrar) return null;
          const v = Number(String(cobrar).replace(/[R$\s]/g, '').replace(',', '.'));
          if (!Number.isFinite(v) || v <= 0) return null;
          return { order: o, amount: v };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { order: typeof todayDelivered[number]; amount: number }[];
  }, [todayDelivered]);
  const externalChargeTotal = externalChargeOrders.reduce((sum, e) => sum + e.amount, 0);


  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const now = new Date().toISOString();
      
      // Use motoboy-specific RPC (no auth role needed)
      const { error } = await supabase.rpc('update_order_status_motoboy', {
        p_motoboy_id: motoboyId,
        p_order_id: orderId,
        p_status: status as "pending" | "accepted" | "preparing" | "ready" | "dispatched" | "arrived" | "delivered" | "cancelled",
        p_arrived_at: status === 'arrived' ? now : undefined,
        p_delivered_at: status === 'delivered' ? now : undefined,
      });
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (variables.status === 'arrived') {
        toast({ title: 'Chegada confirmada! Cliente foi notificado.' });
      } else {
        toast({ title: 'Entrega confirmada!' });
      }
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    },
  });

  const handleLogout = async () => {
    // Set offline before logging out
    if (currentMotoboy?.id) {
      await supabase.rpc('set_motoboy_online_status', {
        p_motoboy_id: currentMotoboy.id,
        p_is_online: false,
      });
    }
    logout();
    navigate('/');
  };

  const openMaps = (address: Address, orderId?: string) => {
    // Internal embedded navigation (keeps PWA active for GPS tracking)
    if (orderId && address.latitude && address.longitude) {
      navigate(`/motoboy/entrega/${orderId}`);
      return;
    }
    // Fallback when no coords
    if (address.latitude && address.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${address.latitude},${address.longitude}&travelmode=driving`, '_blank');
    } else {
      const query = encodeURIComponent(
        `${address.street}, ${address.number}, ${address.neighborhood}, ${address.city} - ${address.state}`
      );
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`, '_blank');
    }
  };

  const openWhatsApp = (phone: string) => {
    window.open(`https://wa.me/55${phone}`, '_blank');
  };

  useEffect(() => {
    if (isHydrated && role !== 'motoboy' && role !== 'admin') {
      navigate('/');
    }
  }, [isHydrated, role, navigate]);

  if (!isHydrated || (role !== 'motoboy' && role !== 'admin')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  const confirmPickupMutation = useMutation({
    mutationFn: async (orderId: string) => {
      console.log('[Motoboy] confirm_pickup_motoboy', { motoboyId, orderId });
      const { data, error } = await supabase.rpc('confirm_pickup_motoboy', {
        p_motoboy_id: motoboyId,
        p_order_id: orderId,
      });
      if (error) {
        console.error('[Motoboy] confirm_pickup error:', error);
        throw error;
      }
      console.log('[Motoboy] confirm_pickup success', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: '✅ Coleta confirmada!' });
    },
    onError: (err) => {
      console.error('[Motoboy] confirm_pickup mutation error:', err);
      toast({ title: 'Erro ao confirmar coleta', variant: 'destructive' });
    },
  });

  const renderOrderActions = (order: OrderWithDetails) => {
    const status = order.status as string;
    const isIfood = order.salesperson?.toLowerCase() === 'ifood';
    const needsPaymentConfirmation = ['card_credit', 'card_debit', 'card_pos', 'pix_pos'].includes(order.paymentMethod) && !order.paymentConfirmed;
    const hasPickedUp = !!order.pickedUpAt;
    // Estados terminais onde nenhuma ação operacional faz sentido.
    const isTerminal = status === 'delivered' || status === 'cancelled';
    // PIX already paid at checkout — no change allowed
    const pixAlreadyPaid = order.paymentMethod === 'pix' && order.paymentConfirmed;

    const pixNotConfirmed = order.paymentMethod === 'pix' && !order.paymentConfirmed && !isIfood;

    return (
      <div className="space-y-3">
        {/* iFood confirmation section — large buttons for street use */}
        {isIfood && (
          <IfoodConfirmationActions notes={order.notes} variant="motoboy" />
        )}

        {/* PIX não confirmado — alerta crítico para o motoboy cobrar */}
        {pixNotConfirmed && (
          <div className="rounded-lg border-2 border-red-500/60 bg-red-500/15 p-3 animate-pulse">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
              <p className="text-red-300 font-bold text-sm">PIX NÃO CONFIRMADO</p>
            </div>
            <p className="text-red-200 text-xs leading-snug">
              Este pedido está marcado como PIX, mas o pagamento NÃO foi confirmado.
              Confira o comprovante ou cobre na entrega antes de finalizar. Se pagar em
              dinheiro/cartão, use "Alterar Forma de Pagamento".
            </p>
          </div>
        )}


        {/* Pickup confirmation — qualquer pedido atribuído ainda não coletado,
            inclusive se já foi marcado "arrived" por engano sem coleta. */}
        {!hasPickedUp && !isTerminal && (
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 text-base font-semibold"
            onClick={() => confirmPickupMutation.mutate(order.id)}
            disabled={confirmPickupMutation.isPending}
            data-testid={`button-pickup-${order.id}`}
          >
            <Package className="h-5 w-5 mr-2" />
            REALIZEI A COLETA
          </Button>
        )}

        {/* Payment confirmation via camera for card payments */}
        {needsPaymentConfirmation && hasPickedUp && (
          <Button
            className="w-full bg-amber-600 hover:bg-amber-700 text-white py-4 text-base font-semibold"
            onClick={() => {
              setOcrOrderId(order.id);
              setOcrExpectedValue(Number(order.total));
            }}
          >
            <Camera className="h-5 w-5 mr-2" />
            📸 Confirmar Pagamento na Máquina
          </Button>
        )}

        {order.paymentConfirmed && (
          <Badge className="w-full justify-center py-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle className="h-4 w-4 mr-2" />
            Pagamento Confirmado
          </Badge>
        )}

        {/* Change payment method — only if not already paid via PIX and order is picked up */}
        {hasPickedUp && !pixAlreadyPaid && !isIfood && (
          <Button
            variant="outline"
            className="w-full py-3 text-sm border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
            onClick={() => setChangePaymentOrder(order)}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Alterar Forma de Pagamento
          </Button>
        )}

        {hasPickedUp && status !== 'arrived' && !isTerminal && (
          <Button
            className="w-full bg-cyan-600 text-white py-4 text-base font-semibold"
            onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'arrived' })}
            disabled={updateStatusMutation.isPending}
            data-testid={`button-arrived-${order.id}`}
          >
            <MapPinCheck className="h-5 w-5 mr-2" />
            CHEGUEI
          </Button>
        )}

        {status === 'arrived' && (
          needsPaymentConfirmation ? (
            <div className="text-center text-amber-400 text-sm font-medium bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              ⚠️ Confirme o pagamento na máquina antes de finalizar a entrega
            </div>
          ) : (
            <Button
              className="w-full bg-primary text-primary-foreground py-4 text-base font-semibold"
              onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'delivered' })}
              disabled={updateStatusMutation.isPending}
              data-testid={`button-delivered-${order.id}`}
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              MARCAR COMO ENTREGUE
            </Button>
          )
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SoundUnlockBanner />
      <header className="bg-[#0A0A0A] border-b border-[#D4AF37]/30 py-4 px-4 md:px-6 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-50 flex-shrink-0 w-full overflow-hidden">
        <div className="flex items-center gap-2 md:gap-3">
          <Navigation className="h-6 w-6 md:h-8 md:w-8 text-white" />
          <h1 className="font-serif text-lg md:text-2xl text-white">Entregas</h1>
        </div>
        <div className="flex items-center flex-wrap gap-2 md:gap-4">
          {isAlertActive && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5 animate-pulse"
              onClick={ackAll}
            >
              <BellOff className="h-4 w-4" />
              <span className="hidden sm:inline">Parar</span>
            </Button>
          )}

          {/* Online Status Badge */}
          <Badge
            className={isOnline
              ? "bg-green-500 text-white border-green-600"
              : "bg-red-500/20 text-red-200 border-red-500/30"
            }
          >
            {isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
          </Badge>

          {/* GPS Badge */}
          {isTracking ? (
            <Badge className="bg-green-500 text-white border-green-600">
              <MapPin className="h-3 w-3 mr-1 animate-pulse" />
              <span className="hidden sm:inline">GPS</span>
            </Badge>
          ) : (
            <Badge
              className="bg-red-500/20 text-red-200 border-red-500/30 cursor-pointer"
              onClick={() => requestPermission()}
            >
              <MapPin className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">GPS</span>
            </Badge>
          )}

          {/* Summary Button */}
          <Button
            variant={showSummary ? "default" : "outline"}
            size="sm"
            className={`gap-1.5 ${!showSummary ? 'border-primary-foreground/40 text-white hover:bg-primary-foreground/10' : ''}`}
            onClick={() => setShowSummary(!showSummary)}
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Resumo</span>
          </Button>

          {/* Help Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-primary-foreground/40 text-white hover:bg-primary-foreground/10"
            onClick={() => setShowTutorial(true)}
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Ajuda</span>
          </Button>

          {/* Logout */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-primary-foreground/10"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary Panel (collapsible) */}
        {showSummary && currentMotoboy && (
          <div className="mt-3 pt-3 border-t border-primary-foreground/20 grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-white/60" />
              <div>
                <p className="text-white/60 text-[10px]">Login</p>
                <p className="text-white font-medium text-xs">
                  {currentMotoboy.loggedInAt
                    ? new Date(currentMotoboy.loggedInAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '--:--'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-white/60" />
              <div>
                <p className="text-white/60 text-[10px]">Entregas {summaryLabel}</p>
                <p className="text-white font-medium text-xs">{todayDelivered.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-white/60" />
              <div>
                <p className="text-white/60 text-[10px]">Taxas Acumuladas</p>
                <p className="text-white font-bold text-xs">R$ {accumulatedFees.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-white/60" />
              <div>
                <p className="text-white/60 text-[10px]">Em Andamento</p>
                <p className="text-white font-medium text-xs">{dispatchedOrders.length}</p>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="p-4 max-w-2xl mx-auto pb-20 safe-area-bottom">
        

        {/* GPS Permission Banner */}
        {currentMotoboy && (
          <GpsPermissionBanner
            permissionStatus={permissionStatus as any}
            isTracking={isTracking}
            lastError={lastError}
            onRequestPermission={requestPermission}
            className="mb-4"
          />
        )}

        {/* Filtro de data e período do resumo */}
        {showSummary && currentMotoboy && (
          <Card className="bg-card border-primary/20 mb-4">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Filtrar relatório</h3>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Data</label>
                  <input
                    type="date"
                    value={summaryDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setSummaryDate(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Período</label>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { key: 'all', label: 'Todos' },
                      { key: 'manha', label: 'Manhã' },
                      { key: 'tarde', label: 'Tarde' },
                      { key: 'noite', label: 'Noite' },
                    ] as const).map((p) => (
                      <Button
                        key={p.key}
                        type="button"
                        size="sm"
                        variant={summaryPeriod === p.key ? 'default' : 'outline'}
                        className="text-xs px-1"
                        onClick={() => setSummaryPeriod(p.key)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Accumulated fees card — só aparece quando o motoboy abre o Resumo */}
        {showSummary && currentMotoboy && (
          <Card className="bg-card border-emerald-500/30 mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ganhos de {summaryLabel}</p>
                    <p className="text-2xl font-bold text-emerald-400">
                      R$ {accumulatedFees.toFixed(2)}
                    </p>
                  </div>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  {todayDelivered.length} entrega{todayDelivered.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Valores cobrados de clientes em pedidos externos (iFood etc.) — prestar contas */}
        {showSummary && currentMotoboy && externalChargeTotal > 0 && (
          <Card className="bg-card border-amber-500/50 mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-amber-300 font-semibold">A prestar contas (cobrado do cliente)</p>
                    <p className="text-2xl font-bold text-amber-400">
                      R$ {externalChargeTotal.toFixed(2)}
                    </p>
                  </div>
                </div>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                  {externalChargeOrders.length} pedido{externalChargeOrders.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <p className="text-xs text-amber-200/80 leading-snug">
                Estes pedidos aparecem como "pago via app", mas você recebeu em dinheiro/maquininha na entrega. Acerte com o caixa.
              </p>
            </CardContent>
          </Card>
        )}


        {/* Detailed delivery history — cards expansíveis completos (recolhidos por padrão) */}
        {showSummary && currentMotoboy && (
          <Card className="bg-card border-primary/20 mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="h-5 w-5 text-blue-400" />
                <h3 className="text-base font-semibold text-foreground">Histórico — {summaryLabel}</h3>
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 ml-auto">
                  {todayDelivered.length} entrega{todayDelivered.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              {todayDelivered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma entrega concluída nesse período</p>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {todayDelivered
                    .slice()
                    .sort((a, b) => new Date(b.deliveredAt!).getTime() - new Date(a.deliveredAt!).getTime())
                    .map((order) => {
                      const enriched: OrderWithDetails = {
                        ...order,
                        items: orderItems.filter(it => it.orderId === order.id),
                        address: addresses.find(a => a.id === order.addressId),
                        userName: users.find(u => u.id === order.userId)?.name || order.customerName || undefined,
                        userWhatsapp: users.find(u => u.id === order.userId)?.whatsapp,
                      };
                      return (
                        <ExpandableOrderCard
                          key={order.id}
                          order={enriched}
                          variant="motoboy"
                          defaultExpanded={false}
                          statusColor="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          onOpenMaps={openMaps}
                          onOpenWhatsApp={openWhatsApp}
                        />
                      );
                    })}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mt-2">
                    <span className="text-sm font-semibold text-foreground">Total do dia</span>
                    <span className="text-base font-bold text-emerald-400">R$ {accumulatedFees.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}


        {isLoading || motoboyLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Card key={i} className="bg-card border-primary/20">
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-32 mb-4" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !currentMotoboy ? (
          <Card className="bg-card border-primary/20">
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 mx-auto text-destructive mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Motoboy nao cadastrado</h2>
              <p className="text-muted-foreground">
                Seu usuario nao esta vinculado a um motoboy. Entre em contato com o administrador.
              </p>
            </CardContent>
          </Card>
        ) : dispatchedOrders.length === 0 ? (
          <Card className="bg-card border-primary/20">
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Sem entregas no momento</h2>
              <p className="text-muted-foreground">
                Quando houver pedidos prontos para entrega, eles aparecerao aqui
              </p>
            </CardContent>
          </Card>
        ) : (
          <OrderCarousel
            title="Minhas Entregas em Andamento"
            icon={<Truck className="h-5 w-5 text-purple-400" />}
            accentColor="#D4AF37"
            emptyLabel="Sem entregas no momento"
            items={dispatchedOrders.map((order) => ({
              id: order.id,
              label: `#${order.id.slice(-6).toUpperCase()} · ${order.userName || order.customerName || 'CLIENTE'}`,
              node: (
                <ExpandableOrderCard
                  order={order}
                  variant="motoboy"
                  defaultExpanded={true}
                  statusColor="bg-purple-500/20 text-purple-400 border-purple-500/30"
                  onOpenMaps={openMaps}
                  onOpenWhatsApp={openWhatsApp}
                  actions={renderOrderActions(order)}
                />
              ),
            }))}
          />
        )}
      </main>
      <MotoboyTutorialModal open={showTutorial} onOpenChange={setShowTutorial} />
      {ocrOrderId && (
        <PaymentOCRModal
          open={!!ocrOrderId}
          onOpenChange={(open) => { if (!open) setOcrOrderId(null); }}
          orderId={ocrOrderId}
          motoboyId={motoboyId}
          expectedValue={ocrExpectedValue}
          orderShortId={ocrOrderId.slice(-4)}
        />
      )}
      {changePaymentOrder && (
        <ChangePaymentModal
          open={!!changePaymentOrder}
          onOpenChange={(open) => { if (!open) setChangePaymentOrder(null); }}
          orderId={changePaymentOrder.id}
          motoboyId={motoboyId}
          currentPaymentMethod={changePaymentOrder.paymentMethod}
          orderTotal={Number(changePaymentOrder.total)}
          orderShortId={changePaymentOrder.id.slice(-4)}
          onChanged={() => {
            setChangePaymentOrder(null);
            queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
          }}
        />
      )}
    </div>
  );
}
