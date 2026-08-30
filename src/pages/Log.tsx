import { useNavigate } from 'react-router-dom';
import { useSoundTestListener } from '@/hooks/use-sound-test-listener';
import { useMutation } from '@tanstack/react-query';
import { ClipboardList, Package, LogOut, Truck, User as UserIcon, Wifi, WifiOff, Bike, Camera, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { useToast } from '@/hooks/use-toast';
import { useKitchenRealtime } from '@/hooks/use-realtime-sync';
import { useNotificationSound } from '@/hooks/use-notification-sound';
import { useOrderAlert } from '@/hooks/use-order-alert';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';
import { playCashRegisterSound } from '@/lib/cash-register-sound';
import { ExpandableOrderCard } from '@/components/ExpandableOrderCard';
import { OrderCarousel } from '@/components/OrderCarousel';
import { useOrders, useOrderItems, useMotoboys, useProducts } from '@/hooks/use-supabase-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { resilientRpc } from '@/lib/resilient-rpc';
import type { Order, OrderItem, Address, Motoboy } from '@/shared/schema';
import { type OrderStatus } from '@/shared/schema';
import { isExternalOrder, getPlatformLabel, getPlatformColor, itemNameLooksPrepared } from '@/lib/external-platforms';
import { OrderOriginFilters } from '@/components/OrderOriginFilterIcons';
import { useEffect, useState, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { PaymentOCRModal } from '@/components/motoboy/PaymentOCRModal';
import { PacksCarousel } from '@/components/kitchen/PacksCarousel';
import { PanelSwitcher } from '@/components/admin/PanelSwitcher';
import { SoundUnlockBanner } from '@/components/SoundUnlockBanner';
import { EditOrderItemsButton } from '@/components/admin/EditOrderItemsButton';

interface OrderWithItems extends Order {
  items: OrderItem[];
  userName?: string;
  userWhatsapp?: string;
  address?: Address;
  motoboy?: Motoboy;
}

export default function Log() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role, logout, isHydrated } = useAuth();
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const isAuthorized = isHydrated && (role === 'log' || role === 'pdv' || role === 'kitchen' || role === 'admin');
  const { playOnce } = useNotificationSound({ screen: 'logistics' });
  const { alertOrder, ackOrder, ackAll, syncPendingOrders, isAlertActive } = useOrderAlert('logistics');
  const visibleAlertedOrdersRef = useRef<Set<string>>(new Set());
  const pdvCashSoundPlayedRef = useRef<Set<string>>(new Set());

  useSoundTestListener({
    panelId: 'log',
    enabled: isAuthorized,
    onTestSignal: (soundType) => {
      playOnce(soundType);
      toast({ title: `🔊 Teste de som recebido (${soundType})` });
    },
  });
  const [originFilter, setOriginFilter] = useState<import('@/components/OrderOriginFilterIcons').OriginFilterId>('all');
  const [ocrOrderId, setOcrOrderId] = useState<string | null>(null);
  const [ocrMotoboyId, setOcrMotoboyId] = useState<string>('');
  const [ocrExpectedValue, setOcrExpectedValue] = useState<number>(0);
  const [ocrShortId, setOcrShortId] = useState<string>('');

  useEffect(() => {
    if (isHydrated && !isAuthorized) {
      navigate('/');
    }
  }, [isHydrated, isAuthorized, navigate]);

  // LOG também não toca no INSERT bruto. Pedido de cliente pode chegar antes
  // dos itens; a fila atômica abaixo decide se vai LOG direto ou aguarda KDE.
  useKitchenRealtime({
    enabled: isAuthorized,
    onConnected: () => setIsSSEConnected(true),
    onDisconnected: () => setIsSSEConnected(false),
    onEvent: (event) => {
      if (event.table === 'orders') {
        const orderId = event.payload?.id;
        if (event.event === 'UPDATE') {
          const status = event.payload?.status;
          if (status === 'ready' && orderId) {
            visibleAlertedOrdersRef.current.add(orderId);
            // PDV/Balcão (counter) NÃO dispara loop de alerta — venda já tocou
            // o som de caixa registradora no momento do checkout do PDV.
            const o = orders.find(x => x.id === orderId);
            const orderType = event.payload?.order_type || o?.orderType;
            if (orderType === 'counter') {
              if (!pdvCashSoundPlayedRef.current.has(orderId)) {
                pdvCashSoundPlayedRef.current.add(orderId);
                void playCashRegisterSound(0.7);
              }
            } else if (orderType) {
              alertOrder(orderId);
              toast({ title: '📦 Separação aguardando na logística!' });
            }
          }
          if ((status === 'dispatched' || status === 'cancelled') && orderId) {
            visibleAlertedOrdersRef.current.delete(orderId);
            ackOrder(orderId);
          }
        }
      }
    },
  });

  const { data: orders = [], isLoading } = useOrders({
    enabled: isAuthorized,
    refetchInterval: 7000,
    useLogRpc: true,
  });

  const { data: allProducts = [] } = useProducts({ enabled: isAuthorized, activeOnly: false });
  const { data: motoboysData = [] } = useMotoboys({ enabled: isAuthorized, useAdminRpc: true });

  const orderIds = useMemo(() => orders.map(o => o.id), [orders]);
  const { data: orderItems = [] } = useOrderItems(orderIds, {
    enabled: isAuthorized && orders.length > 0,
    refetchInterval: 7000,
    useAdminRpc: true,
  });

  

  const ordersWithItems: OrderWithItems[] = useMemo(() => {
    const itemsByOrder = new Map<string, OrderItem[]>();
    orderItems.forEach((item) => {
      const list = itemsByOrder.get(item.orderId) || [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    });
    const motoboysById = new Map(motoboysData.map((motoboy) => [motoboy.id, motoboy]));

    return orders.map(order => ({
      ...order,
      items: itemsByOrder.get(order.id) || [],
      userName: (order as any).userName,
      userWhatsapp: (order as any).userWhatsapp,
      address: (order as any).address,
      motoboy: order.motoboyId ? motoboysById.get(order.motoboyId) : undefined,
    }));
  }, [orders, orderItems, motoboysData]);

  const productsById = useMemo(() => new Map(allProducts.map((product) => [product.id, product])), [allProducts]);

  // Helper: does this order need KDE (has prepared/wizard items)?
  // Critério IDÊNTICO ao Kitchen.tsx — qualquer divergência aqui faz pedido sumir entre KDE e LOG.
  // Ordem de checagem: (1) flag atômica is_wizard_item, (2) product.is_prepared, (3) heurística por nome.
  const orderNeedsKDE = (order: OrderWithItems) => {
    return order.items.some(item => {
      // (1) Marcação atômica vinda do banco (preferida, definida na criação do pedido)
      if ((item as any).isWizardItem === true) return true;
      // (2) Produto cadastrado: a verdade é product.is_prepared. Não cair em heurística
      // se o produto existe — evita falsos positivos como "GIN GORDONS 750ML" virar drink.
      if (item.productId) {
        const product = productsById.get(item.productId);
        return product?.isPrepared === true;
      }
      // (3) Fallback heurístico SOMENTE para itens sem product_id (pedidos externos)
      return itemNameLooksPrepared(item.productName);
    });
  };

  // LOG (Logística/Separação) recebe TODO pedido novo de QUALQUER origem:
  // PDV/Balcão, Delivery, Totem, iFood/Rappi/99food. Não precisa aprovação manual —
  // os pedidos já entram aceitos automaticamente pela trigger trg_auto_accept_order.
  //
  // REGRA DE SEGURANÇA (REDE ANTI-PEDIDO PERDIDO):
  // Pedidos só são ESCONDIDOS do LOG se: (a) NÃO forem externos, (b) precisem do KDE,
  // (c) estejam em accepted/preparing E (d) ainda NÃO foram marcados como ready.
  // Qualquer outro caso é exibido — assim, mesmo se a classificação KDE divergir,
  // o pedido SEMPRE aparece em pelo menos uma das telas operacionais.
  const logOrders = useMemo(() => ordersWithItems.filter(order => {
    if (order.status === 'delivered' || order.status === 'cancelled') return false;
    const activeStatuses = ['accepted', 'preparing', 'ready', 'arrived', 'dispatched'];
    if (!activeStatuses.includes(order.status)) return false;
    // iFood/Rappi/99food NUNCA passam pela cozinha — sempre visíveis no LOG.
    if (isExternalOrder(order)) return true;
    // Pedidos não-externos com item wizard ficam no KDE até a cozinha marcar como ready.
    if (orderNeedsKDE(order) && (order.status === 'accepted' || order.status === 'preparing')) {
      return false;
    }
    return true;
  }), [ordersWithItems, productsById]);

  // Origin filter
  const filterByOrigin = (order: OrderWithItems) => {
    const external = isExternalOrder(order);
    switch (originFilter) {
      case 'vm_delivery': return !external && (order.orderType === 'delivery' || order.orderType === 'pickup');
      case 'pdv': return !external && order.orderType === 'counter';
      case 'totem': return !external && order.orderType === 'totem';
      case 'ifood': return order.salesperson?.toLowerCase() === 'ifood' && order.externalOrigin !== 'ifood_test';
      case '99food': return order.salesperson?.toLowerCase() === '99food';
      case 'ifood_test': return order.externalOrigin === 'ifood_test';
      default: return true;
    }
  };

  const originCounts = useMemo(() => ({
    all: logOrders.length,
    vm_delivery: logOrders.filter(o => !isExternalOrder(o) && (o.orderType === 'delivery' || o.orderType === 'pickup')).length,
    pdv: logOrders.filter(o => !isExternalOrder(o) && o.orderType === 'counter').length,
    totem: logOrders.filter(o => !isExternalOrder(o) && o.orderType === 'totem').length,
    ifood: logOrders.filter(o => o.salesperson?.toLowerCase() === 'ifood' && o.externalOrigin !== 'ifood_test').length,
    '99food': logOrders.filter(o => o.salesperson?.toLowerCase() === '99food').length,
    ifood_test: logOrders.filter(o => o.externalOrigin === 'ifood_test').length,
  }), [logOrders]);

  const filteredOrders = useMemo(() => logOrders.filter(filterByOrigin), [logOrders, originFilter]);

  // Pedidos de delivery (externos iFood/99food OU delivery próprio): assim que um
  // motoboy é atribuído, o pedido JÁ SAIU para entrega — não depende de confirmação
  // de coleta (o motoboy externo/parceiro não confirma coleta no app). Isso evita
  // que pedidos fiquem poluindo a coluna "Aguardando" após o motoboy já ter saído.
  // APENAS pedidos EXTERNOS (iFood/99food) saem automaticamente da fila ao atribuir
  // motoboy — o entregador da plataforma não confirma coleta no app. Delivery PRÓPRIO
  // continua no fluxo normal: fica em "Aguardando" até o motoboy confirmar a coleta.
  const isDeliveryEnRoute = (o: OrderWithItems) =>
    o.status === 'dispatched' && !!o.motoboyId && isExternalOrder(o);

  // Column 1: Aguardando — ready/accepted + dispatched-not-yet-picked-up (motoboy ainda pode ser trocado)
  const waitingOrders = useMemo(() => filteredOrders.filter(o =>
    o.status === 'ready' ||
    o.status === 'accepted' ||
    (o.status === 'dispatched' && !o.pickedUpAt && !isDeliveryEnRoute(o))
  ), [filteredOrders]);
  // Column 2: Em Entrega — dispatched após coleta confirmada OU delivery com motoboy atribuído
  const dispatchedOrders = useMemo(() => filteredOrders.filter(o => o.status === 'dispatched' && (!!o.pickedUpAt || isDeliveryEnRoute(o))), [filteredOrders]);
  // Column 3: Chegou (arrived)
  const arrivedOrders = useMemo(() => filteredOrders.filter(o => o.status === 'arrived'), [filteredOrders]);
  const waitingAlertIds = useMemo(
    () => waitingOrders.filter(o => o.orderType !== 'counter').map((o) => o.id),
    [waitingOrders],
  );

  // Reconciliação por polling: garante som mesmo se realtime falhar.
  // Acionáveis: tudo que está em "Aguardando" (separação/despacho pendente).
  useEffect(() => {
    if (!isAuthorized) return;
    if (orders.length > 0 && orderItems.length === 0) return;
    // PDV/Balcão (counter) não entra no loop de alerta sonoro.
    syncPendingOrders(waitingAlertIds);
    waitingOrders.forEach((o) => visibleAlertedOrdersRef.current.add(o.id));
  }, [isAuthorized, orders.length, orderItems.length, waitingAlertIds, waitingOrders, syncPendingOrders]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const now = new Date().toISOString();
      // ONDA 9: usa resilientRpc para retry automático em falhas de rede
      const { error } = await resilientRpc('update_order_status', {
        p_order_id: orderId,
        p_status: status,
        p_ready_at: status === 'ready' ? now : undefined,
        p_dispatched_at: status === 'dispatched' ? now : undefined,
        p_delivered_at: status === 'delivered' ? now : undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    },
  });

  const assignMotoboyMutation = useMutation({
    mutationFn: async ({ orderId, motoboyId }: { orderId: string; motoboyId: string }) => {
      // ONDA 9: usa RPC atômica que valida motoboy ativo + sincroniza users/user_roles
      const { data, error } = await resilientRpc('assign_motoboy_atomic', {
        p_order_id: orderId,
        p_motoboy_id: motoboyId,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        throw new Error(result.error || 'Falha ao atribuir motoboy');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: 'Motoboy atribuído!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao atribuir motoboy', description: err?.message, variant: 'destructive' });
    },
  });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const openWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    window.open(`https://wa.me/${formattedPhone}`, '_blank');
  };

  const activeMotoboys = motoboysData.filter(m => m.isActive);

  // Botão/seletor de motoboy SEMPRE visível no card (sem precisar expandir),
  // para o operador atribuir/trocar motoboy rapidamente.
  const renderMotoboyQuickAssign = (order: OrderWithItems) => {
    const isDeliveryOrIfood = order.orderType === 'delivery' || isExternalOrder(order);
    if (!isDeliveryOrIfood) return null;
    const currentMotoboy = order.motoboyId ? motoboysData.find(m => m.id === order.motoboyId) : undefined;
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
              : 'bg-secondary border-primary/30 animate-pulse'
          }`}
        >
          <span className="flex items-center gap-2">
            <Bike className="h-4 w-4 flex-shrink-0" />
            <SelectValue placeholder="Atribuir Motoboy" />
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

  const renderIfoodCloudButton = (order: OrderWithItems) => {
    if (!isExternalOrder(order)) return null;
    const platformLabel = getPlatformLabel(order.salesperson || 'ifood');
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs h-9"
          >
            <Truck className="h-4 w-4 mr-2" />
            Entregue pela nuvem {platformLabel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar entrega pela nuvem {platformLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Use somente quando o entregador da própria {platformLabel} retirou o pedido na loja.
              O pedido será marcado como <strong>ENTREGUE</strong> e sairá da lista ativa de delivery,
              permanecendo nos registros para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'delivered' })}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Confirmar baixa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  const renderWaitingActions = (order: OrderWithItems) => {
    const isDeliveryOrIfood = order.orderType === 'delivery' || isExternalOrder(order);
    
    if (isDeliveryOrIfood) {
      const currentMotoboy = order.motoboyId ? motoboysData.find(m => m.id === order.motoboyId) : undefined;
      return (
        <div className="flex flex-col gap-2">
          <Select
            onValueChange={(motoboyId) => {
              assignMotoboyMutation.mutate({ orderId: order.id, motoboyId });
            }}
            value={order.motoboyId || undefined}
          >
            <SelectTrigger className="w-full bg-secondary border-primary/30 text-sm">
              <SelectValue placeholder="🏍️ Atribuir Motoboy" />
            </SelectTrigger>
            <SelectContent>
              {activeMotoboys.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentMotoboy && (
            <Badge className="w-full justify-center py-1.5 bg-amber-500/15 text-amber-400 border-amber-500/30">
              <Package className="h-3.5 w-3.5 mr-1.5" />
              Aguardando coleta — {currentMotoboy.name}
            </Badge>
          )}
          <EditOrderItemsButton order={order} responsible="LOG" className="w-full" />
          {renderIfoodCloudButton(order)}
        </div>
      );
    }
    
    // Pedidos sem entrega (counter/totem/pickup): etapa de PREPARAÇÃO na logística.
    // Antes de ficar pronto -> "Marcar Preparado" (ready) -> aparece no PAGER para o cliente.
    // Já pronto -> "Retirado pelo Cliente" (delivered, opcional; o cron conclui em 5 min).
    if (order.status === 'ready') {
      return (
        <div className="flex flex-col gap-2">
          <Badge className="w-full justify-center py-1.5 bg-green-500/15 text-green-400 border-green-500/30">
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Pronto p/ retirada — no painel pager
          </Badge>
          <Button
            className="w-full bg-green-600 text-white py-4 text-base font-semibold"
            onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'delivered' })}
            disabled={updateStatusMutation.isPending}
          >
            <UserIcon className="h-5 w-5 mr-2" />
            Retirado pelo Cliente
          </Button>
        </div>
      );
    }

    return (
      <Button
        className="w-full bg-amber-600 hover:bg-amber-700 text-white py-4 text-base font-semibold"
        onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'ready' })}
        disabled={updateStatusMutation.isPending}
      >
        <Package className="h-5 w-5 mr-2" />
        Marcar Preparado
      </Button>
    );
  };

  const renderDispatchedActions = (order: OrderWithItems) => {
    const hasPickedUp = !!order.pickedUpAt;
    const currentMotoboy = order.motoboyId ? motoboysData.find(m => m.id === order.motoboyId) : undefined;

    // Motoboy was deleted — show warning and allow reassignment
    if (order.motoboyId && !currentMotoboy) {
      return (
        <div className="space-y-2">
          <Badge className="w-full justify-center py-1.5 bg-red-500/15 text-red-400 border-red-500/30">
            ⚠️ Motoboy removido — reatribuir
          </Badge>
          <Select onValueChange={(motoboyId) => assignMotoboyMutation.mutate({ orderId: order.id, motoboyId })}>
            <SelectTrigger className="w-full bg-secondary border-primary/30 text-sm h-8">
              <SelectValue placeholder="Atribuir motoboy" />
            </SelectTrigger>
            <SelectContent>
              {activeMotoboys.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (!hasPickedUp) {
      return (
        <div className="space-y-2">
          <Badge className="w-full justify-center py-1.5 bg-amber-500/15 text-amber-400 border-amber-500/30">
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Aguardando coleta — {currentMotoboy?.name || 'Sem motoboy'}
          </Badge>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Trocar:</span>
            <div className="flex-1">
              <Select onValueChange={(motoboyId) => assignMotoboyMutation.mutate({ orderId: order.id, motoboyId })}>
                <SelectTrigger className="w-full bg-secondary border-primary/30 text-sm h-8">
                  <SelectValue placeholder="Reatribuir motoboy" />
                </SelectTrigger>
                <SelectContent>
                  {activeMotoboys.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );
    }

    return (
      <Badge className="w-full justify-center py-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
        ✅ Coletado por {currentMotoboy?.name || 'motoboy'}
      </Badge>
    );
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SoundUnlockBanner />
      <header className="bg-[#0A0A0A] border-b border-[#D4AF37]/30 py-4 px-4 md:px-6 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-50">
        <PanelSwitcher current="log" />
        <div className="flex items-center gap-2 md:gap-4">
          {isAlertActive && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5 animate-pulse"
              onClick={ackAll}
            >
              <BellOff className="h-4 w-4" />
              Parar
            </Button>
          )}
          <Badge
            className={isSSEConnected
              ? "bg-green-500 text-white border-green-600"
              : "bg-red-500/20 text-red-200 border-red-500/30"
            }
          >
            {isSSEConnected ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            <span className="hidden sm:inline">{isSSEConnected ? 'Ao Vivo' : 'Offline'}</span>
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-primary-foreground/10"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="p-3 md:p-6 max-w-7xl mx-auto pb-20 safe-area-bottom">
        
        <PacksCarousel />

        {/* Origin filter buttons */}
        <div className="mb-4">
          <OrderOriginFilters
            activeFilter={originFilter}
            onFilterChange={setOriginFilter}
            counts={originCounts}
          />
        </div>

        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-8 w-48" />
                {[1, 2].map(j => (
                  <Card key={j} className="border-primary/20">
                    <CardContent className="p-4">
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <OrderCarousel
              title="Aguardando"
              icon={<Package className="h-5 w-5 text-orange-400" />}
              accentColor="#fb923c"
              emptyLabel="Nenhum pedido aguardando"
              items={waitingOrders.map(order => {
                const isNewOrder = order.status === 'accepted' && order.acceptedAt &&
                  (Date.now() - new Date(String(order.acceptedAt)).getTime()) < 3 * 60 * 1000;
                return {
                  id: order.id,
                  label: `#${order.id.slice(-6).toUpperCase()} · ${order.customerName || (order as any).userName || 'CLIENTE'}`,
                  node: (
                    <ExpandableOrderCard
                      order={order}
                      variant="kitchen"
                      defaultExpanded={true}
                      statusColor="bg-orange-500/20 text-orange-400 border-orange-500/30"
                      onOpenWhatsApp={openWhatsApp}
                      quickActions={renderMotoboyQuickAssign(order)}
                      actions={renderWaitingActions(order)}
                      isNew={!!isNewOrder}
                    />
                  ),
                };
              })}
            />

            <OrderCarousel
              title="Em Entrega"
              icon={<Truck className="h-5 w-5 text-blue-400" />}
              accentColor="#3b82f6"
              emptyLabel="Nenhum pedido em entrega"
              items={dispatchedOrders.map(order => ({
                id: order.id,
                label: `#${order.id.slice(-6).toUpperCase()} · ${order.customerName || (order as any).userName || 'CLIENTE'}`,
                node: (
                  <ExpandableOrderCard
                    order={order}
                    variant="kitchen"
                    defaultExpanded={true}
                    statusColor="bg-blue-500/20 text-blue-400 border-blue-500/30"
                    onOpenWhatsApp={openWhatsApp}
                    quickActions={renderMotoboyQuickAssign(order)}
                    actions={renderDispatchedActions(order)}
                  />
                ),
              }))}
            />

            <OrderCarousel
              title="Chegou"
              icon={<Bike className="h-5 w-5 text-green-400" />}
              accentColor="#22c55e"
              emptyLabel="Nenhum pedido chegou"
              items={arrivedOrders.map(order => ({
                id: order.id,
                label: `#${order.id.slice(-6).toUpperCase()} · ${order.customerName || (order as any).userName || 'CLIENTE'}`,
                node: (
                  <ExpandableOrderCard
                    order={order}
                    variant="kitchen"
                    defaultExpanded={true}
                    statusColor="bg-green-500/20 text-green-400 border-green-500/30"
                    onOpenWhatsApp={openWhatsApp}
                    actions={
                      <div className="flex flex-col gap-2">
                        {(['card_credit', 'card_debit', 'card_pos'] as const).some(m => order.paymentMethod === m) && (
                          <Button
                            className="w-full bg-amber-600 text-white py-3 text-sm font-semibold"
                            onClick={() => {
                              setOcrOrderId(order.id);
                              setOcrMotoboyId(order.motoboyId || '');
                              setOcrExpectedValue(Number(order.total) || 0);
                              setOcrShortId(order.id.slice(0, 6).toUpperCase());
                            }}
                          >
                            <Camera className="h-4 w-4 mr-2" />
                            📸 Confirmar Pagamento POS
                          </Button>
                        )}
                        <Button
                          className="w-full bg-green-600 text-white py-4 text-base font-semibold"
                          onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'delivered' })}
                          disabled={updateStatusMutation.isPending}
                        >
                          ✅ Confirmar Entrega
                        </Button>
                      </div>
                    }
                  />
                ),
              }))}
            />
          </div>
        )}

      </main>
      <PaymentOCRModal
        open={!!ocrOrderId}
        onOpenChange={(open) => { if (!open) setOcrOrderId(null); }}
        orderId={ocrOrderId || ''}
        motoboyId={ocrMotoboyId}
        expectedValue={ocrExpectedValue}
        orderShortId={ocrShortId}
      />
    </div>
  );
}
