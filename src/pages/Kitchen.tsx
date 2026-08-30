import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ChefHat, Package, LogOut, Truck, Wifi, WifiOff, BellOff, Bike } from 'lucide-react';
import { BottlesCarousel } from '@/components/kitchen/BottlesCarousel';
import { FruitAvailabilityPanel } from '@/components/kitchen/FruitAvailabilityPanel';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useKitchenRealtime } from '@/hooks/use-realtime-sync';
import { useNotificationSound } from '@/hooks/use-notification-sound';
import { useOrderAlert } from '@/hooks/use-order-alert';
import { useSoundTestListener } from '@/hooks/use-sound-test-listener';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';
import { useOrders, useMotoboys, useProducts } from '@/hooks/use-supabase-data';
import { supabase } from '@/integrations/supabase/client-safe';
import type { Order, OrderItem, Address, Motoboy } from '@/shared/schema';
import { ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, ORDER_STATUS_LABELS, type OrderStatus } from '@/shared/schema';
import { isExternalOrder, itemNameLooksPrepared } from '@/lib/external-platforms';
import { OrderOriginFilters } from '@/components/OrderOriginFilterIcons';
import { useEffect, useState, useMemo, useRef, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { PanelSwitcher } from '@/components/admin/PanelSwitcher';
import { SoundUnlockBanner } from '@/components/SoundUnlockBanner';
import { EditOrderItemsButton } from '@/components/admin/EditOrderItemsButton';
import { OrderCarousel } from '@/components/OrderCarousel';

interface OrderWithItems extends Order {
  items: OrderItem[];
  userName?: string;
  userWhatsapp?: string;
  address?: Address;
  motoboy?: Motoboy;
}

const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatKitchenMoney(value: number | string | null | undefined) {
  return moneyFormatter.format(Number(value || 0));
}

function formatKitchenTime(value: Date | string | null | undefined) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function KitchenOrderCard({
  order,
  statusColor,
  actions,
  isNew = false,
}: {
  order: OrderWithItems;
  statusColor: string;
  actions: ReactNode;
  isNew?: boolean;
}) {
  const orderId = order.id.slice(-6).toUpperCase();
  const customerName = order.customerName || order.userName || 'CLIENTE';

  return (
    <Card className="border-primary/20 border-l-4 bg-card overflow-hidden" style={{ borderLeftColor: statusColor }} data-testid={`order-card-${order.id}`}>
      <div className="px-3 py-2 bg-primary/10 border-b border-primary/15 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-black text-primary text-base">#{orderId}</span>
          {isNew && <Badge className="bg-red-500 text-white text-[10px] animate-pulse">NOVO</Badge>}
          <Badge variant="outline" className="text-[10px]">{ORDER_STATUS_LABELS[order.status]}</Badge>
        </div>
        <span className="font-black text-foreground text-sm">{formatKitchenMoney(order.total)}</span>
      </div>
      <CardContent className="p-3 space-y-3">
        <div className="min-w-0">
          <p className="font-bold text-foreground text-sm break-words">{customerName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Badge variant="secondary" className="text-[10px]">{ORDER_TYPE_LABELS[order.orderType]}</Badge>
            <Badge variant="outline" className="text-[10px]">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</Badge>
            <span>{formatKitchenTime(order.createdAt)}</span>
          </div>
        </div>

        <div className="rounded-md bg-secondary/35 border border-border/60 p-2 space-y-2">
          {order.items.length > 0 ? order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-2 text-xs leading-snug">
              <span className="font-medium text-foreground whitespace-pre-line break-words flex-1 min-w-0">{item.productName}</span>
              <span className="text-primary font-bold shrink-0">x{item.quantity}</span>
            </div>
          )) : <p className="text-xs text-muted-foreground">Itens carregando...</p>}
        </div>

        {actions && <div className="pt-1 border-t border-border/60">{actions}</div>}
      </CardContent>
    </Card>
  );
}

export default function Kitchen() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role, logout, isHydrated, isAuthReady, hasSupabaseSession } = useAuth();
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const hasPanelRole = isHydrated && (role === 'kitchen' || role === 'pdv' || role === 'log' || role === 'admin');
  const isAuthorized = hasPanelRole && isAuthReady && hasSupabaseSession;
  const { playOnce } = useNotificationSound({ screen: 'kitchen' });
  const { ackOrder, ackAll, syncPendingOrders, isAlertActive } = useOrderAlert('kitchen');
  const visibleAlertedOrdersRef = useRef<Set<string>>(new Set());

  useSoundTestListener({
    panelId: 'kitchen',
    enabled: isAuthorized,
    onTestSignal: (soundType) => {
      playOnce(soundType);
      toast({ title: `🔊 Teste de som recebido (${soundType})` });
    },
  });
  
  const [originFilter, setOriginFilter] = useState<import('@/components/OrderOriginFilterIcons').OriginFilterId>('all');

  // Redirect to home if not authorized (wait for hydration)
  useEffect(() => {
    if (isHydrated && isAuthReady && !hasPanelRole) {
      navigate('/');
    }
  }, [isHydrated, isAuthReady, hasPanelRole, navigate]);

  // Realtime sync for kitchen - automatic query invalidation.
  // Não dispara som bruto no INSERT: pedido de cliente pode nascer antes dos
  // itens chegarem. O polling abaixo, já com order_items, decide atomicamente
  // se precisa KDE e então mantém o loop tocando.
  useKitchenRealtime({
    enabled: isAuthorized,
    onConnected: () => setIsSSEConnected(true),
    onDisconnected: () => setIsSSEConnected(false),
    onEvent: (event) => {
      if (event.table === 'orders') {
        const orderId = event.payload?.id;
        if (event.event === 'UPDATE') {
          const status = event.payload?.status;
          if ((status === 'preparing' || status === 'ready' || status === 'cancelled') && orderId) {
            if (status === 'ready' || status === 'cancelled') visibleAlertedOrdersRef.current.delete(orderId);
            ackOrder(orderId);
          }
        }
      }
    },
  });

  // Single polling source — realtime handles instant updates,
  // polling at 8s is a safety net (was 5s with duplicate channels)
  const { data: orders = [], isLoading, isError, refetch } = useOrders({
    enabled: isAuthorized,
    refetchInterval: 8000,
    useKitchenRpc: true,
  });

  const { data: motoboysData = [] } = useMotoboys({ enabled: isAuthorized, useAdminRpc: true });
  const { data: allProducts = [] } = useProducts({ enabled: isAuthorized, activeOnly: false });
  const productsById = useMemo(() => new Map(allProducts.map((product) => [product.id, product])), [allProducts]);

  // Critério IDÊNTICO ao Log.tsx — determina se o pedido precisa passar pela cozinha (KDE).
  // Ordem: (1) flag atômica is_wizard_item, (2) product.is_prepared, (3) heurística por nome.
  const orderNeedsKDE = (order: OrderWithItems) => {
    return order.items.some(item => {
      if ((item as any).isWizardItem === true) return true;
      if (item.productId) {
        const product = productsById.get(item.productId);
        return product?.isPrepared === true;
      }
      return itemNameLooksPrepared(item.productName);
    });
  };

  const ordersWithItems: OrderWithItems[] = useMemo(() => {
    const motoboysById = new Map(motoboysData.map((motoboy) => [motoboy.id, motoboy]));

    return orders.map(order => {
      const motoboy = order.motoboyId ? motoboysById.get(order.motoboyId) : undefined;
      return {
        ...order,
        items: ((order as any).items || []) as OrderItem[],
        userName: (order as any).userName,
        userWhatsapp: (order as any).userWhatsapp,
        address: (order as any).address,
        motoboy,
      };
    });
  }, [orders, motoboysData]);

  // Origin filter logic
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

  const kitchenBase = useMemo(
    () => ordersWithItems.filter(o => !isExternalOrder(o) && orderNeedsKDE(o)),
    [ordersWithItems, productsById]
  );

  const originCounts = useMemo(() => ({
    all: kitchenBase.length,
    vm_delivery: kitchenBase.filter(o => o.orderType === 'delivery' || o.orderType === 'pickup').length,
    pdv: kitchenBase.filter(o => o.orderType === 'counter').length,
    totem: kitchenBase.filter(o => o.orderType === 'totem').length,
    ifood: 0,
    '99food': 0,
    ifood_test: 0,
  }), [kitchenBase]);

  // COZINHA (KDE) só mostra pedidos que TÊM item de preparo (kitchenBase). Pedidos
  // só-varejo e externos (iFood/99food) NÃO aparecem aqui — vão direto p/ Logística.
  const filteredOrdersWithItems = kitchenBase.filter(filterByOrigin);
  const actionableAlertIds = useMemo(() => kitchenBase
    .filter((o) => o.status === 'accepted' || o.status === 'preparing')
    // PDV/Balcão (counter) não dispara loop sonoro — venda já tocou caixa registradora.
    .filter((o) => o.orderType !== 'counter')
    .map((o) => o.id), [kitchenBase]);

  // Reconciliação por polling: garante que o som toque se realtime falhou.
  // Critério: pedidos que ainda precisam do KDE (status accepted/preparing).
  useEffect(() => {
    if (!isAuthorized) return;
    syncPendingOrders(actionableAlertIds);
    actionableAlertIds.forEach((id) => visibleAlertedOrdersRef.current.add(id));
  }, [isAuthorized, actionableAlertIds, syncPendingOrders]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const now = new Date().toISOString();
      
      // Use RPC function to bypass RLS for custom auth
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: orderId,
        p_status: status as "pending" | "accepted" | "preparing" | "ready" | "dispatched" | "arrived" | "delivered" | "cancelled",
        p_preparing_at: status === 'preparing' ? now : undefined,
        p_ready_at: (status === 'ready' || status === 'delivered') ? now : undefined,
        p_delivered_at: status === 'delivered' ? now : undefined,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    },
  });

  const assignMotoboyMutation = useMutation({
    mutationFn: async ({ orderId, motoboyId }: { orderId: string; motoboyId: string }) => {
      const { error } = await supabase.rpc('assign_motoboy', {
        p_order_id: orderId,
        p_motoboy_id: motoboyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Motoboy atribuído!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atribuir motoboy', variant: 'destructive' });
    },
  });

  const activeMotoboys = motoboysData.filter(m => m.isActive);

  const renderMotoboyAssign = (order: OrderWithItems) => {
    const isDeliveryOrIfood = order.orderType === 'delivery' || isExternalOrder(order);
    if (!isDeliveryOrIfood) return null;
    if (order.pickedUpAt) {
      const m = order.motoboyId ? motoboysData.find(x => x.id === order.motoboyId) : undefined;
      return (
        <Badge className="w-full justify-center py-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
          ✅ Coletado por {m?.name || 'motoboy'}
        </Badge>
      );
    }
    const currentMotoboy = order.motoboyId ? motoboysData.find(m => m.id === order.motoboyId) : undefined;
    return (
      <div className="space-y-2">
        <Select
          onValueChange={(motoboyId) => assignMotoboyMutation.mutate({ orderId: order.id, motoboyId })}
          value={order.motoboyId || undefined}
        >
          <SelectTrigger className="w-full bg-secondary border-primary/30 text-sm">
            <Bike className="h-4 w-4 mr-1" />
            <SelectValue placeholder="🏍️ Atribuir Motoboy" />
          </SelectTrigger>
          <SelectContent>
            {activeMotoboys.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {currentMotoboy && (
          <Badge className="w-full justify-center py-1 bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
            <Package className="h-3 w-3 mr-1" />
            Aguardando coleta — {currentMotoboy.name}
          </Badge>
        )}
      </div>
    );
  };


  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!isHydrated || !isAuthReady || (hasPanelRole && !hasSupabaseSession)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {hasPanelRole && !hasSupabaseSession ? (
          <Card className="mx-4 max-w-md border-destructive/40 bg-card">
            <CardContent className="p-5 space-y-4 text-center">
              <WifiOff className="h-9 w-9 mx-auto text-destructive" />
              <div>
                <h1 className="text-lg font-black text-foreground">SESSÃO EXPIRADA</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Entre novamente para liberar os pedidos da cozinha.
                </p>
              </div>
              <Button className="w-full" variant="destructive" onClick={handleLogout}>
                Entrar novamente
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        )}
      </div>
    );
  }

  const acceptedOrders = filteredOrdersWithItems.filter(o => o.status === 'accepted');
  const preparingOrders = filteredOrdersWithItems.filter(o => o.status === 'preparing');
  // Apenas pedidos EXTERNOS (iFood/99food) somem do KDE ao atribuir motoboy — a
  // plataforma não confirma coleta no app. Delivery PRÓPRIO permanece até a coleta.
  const readyOrders = filteredOrdersWithItems.filter(o =>
    o.status === 'ready' ||
    (o.status === 'dispatched' && !o.pickedUpAt && !(o.motoboyId && isExternalOrder(o)))
  );

  const renderOrderActions = (order: OrderWithItems, status: string) => {
    const isDeliveryOrIfood = order.orderType === 'delivery' || isExternalOrder(order);
    const editBtn = isDeliveryOrIfood ? (
      <EditOrderItemsButton order={order} responsible="KDE" className="w-full" />
    ) : null;
    if (status === 'accepted') {
      return (
        <div className="flex flex-col gap-2">
          <Button
            className="w-full bg-primary text-primary-foreground py-4 text-base font-semibold"
            onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'preparing' })}
            disabled={updateStatusMutation.isPending}
            data-testid={`button-start-${order.id}`}
          >
            <ChefHat className="h-5 w-5 mr-2" />
            Iniciar Producao
          </Button>
          {isDeliveryOrIfood && renderMotoboyAssign(order)}
          {editBtn}
        </div>
      );
    }
    if (status === 'preparing') {
      return (
        <div className="flex flex-col gap-2">
          <Button
            className="w-full bg-green-600 text-white py-4 text-base font-semibold"
            onClick={() => updateStatusMutation.mutate({
              orderId: order.id,
              status: 'ready',
            })}
            disabled={updateStatusMutation.isPending}
            data-testid={`button-ready-${order.id}`}
          >
            <Package className="h-5 w-5 mr-2" />
            {isDeliveryOrIfood ? 'PRODUZIDO' : 'PRONTO P/ RETIRADA ✅'}
          </Button>
          {isDeliveryOrIfood && renderMotoboyAssign(order)}
          {editBtn}
        </div>
      );
    }
    if (status === 'ready' || status === 'dispatched') {
      if (isDeliveryOrIfood) return (
        <div className="flex flex-col gap-2">
          {renderMotoboyAssign(order)}
          {editBtn}
        </div>
      );
      // Counter/totem/pickup: order is on the pager "Pronto p/ Retirada".
      // Mark delivered when the customer collects it at the counter.
      return (
        <Button
          className="w-full bg-emerald-600 text-white py-4 text-base font-semibold"
          onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'delivered' })}
          disabled={updateStatusMutation.isPending}
          data-testid={`button-collected-${order.id}`}
        >
          <Package className="h-5 w-5 mr-2" />
          RETIRADO PELO CLIENTE ✅
        </Button>
      );
    }
    return null;
  };

  // Show loading while checking auth
  if (!isHydrated || !isAuthReady) {
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

      <header className="bg-primary border-b border-primary-foreground/20 py-4 px-4 md:px-6 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-50">
        <PanelSwitcher current="kitchen" />
        <div className="flex items-center gap-2 md:gap-4">
          {isAlertActive && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5 animate-pulse"
              onClick={ackAll}
            >
              <BellOff className="h-4 w-4" />
              Parar Alerta
            </Button>
          )}
          <Badge 
            className={isSSEConnected 
              ? "bg-green-500 text-white border-green-600" 
              : "bg-red-500/20 text-red-200 border-red-500/30"
            }
            data-testid="badge-connection-status"
          >
            {isSSEConnected ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            <span className="hidden sm:inline">{isSSEConnected ? 'Ao Vivo' : 'Offline'}</span>
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="p-3 md:p-6 max-w-7xl mx-auto pb-20 safe-area-bottom">
        

        {/* Fruit Availability Panel */}
        <FruitAvailabilityPanel />

        {/* Bottles Carousel */}
        <BottlesCarousel />

        {/* Origin filter buttons */}
        <div className="mb-4">
          <OrderOriginFilters
            activeFilter={originFilter}
            onFilterChange={setOriginFilter}
            counts={originCounts}
            hiddenFilters={['ifood', '99food', 'ifood_test']}
          />
        </div>
        {isError && (
          <Card className="border-destructive/40 bg-destructive/10 mb-4">
            <CardContent className="py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-destructive">
                <WifiOff className="h-5 w-5" />
                <span className="text-sm font-semibold">
                  Sessão expirada — os pedidos não puderam ser carregados.
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  Tentar novamente
                </Button>
                <Button size="sm" variant="destructive" onClick={handleLogout}>
                  Entrar novamente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {[1,2,3].map(i => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-8 w-48" />
                {[1,2].map(j => (
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
              title="Aceitos"
              icon={<Package className="h-5 w-5 text-blue-400" />}
              accentColor="#3b82f6"
              emptyLabel="Nenhum pedido aceito"
              items={acceptedOrders.map(order => {
                const isNewOrder = order.acceptedAt &&
                  (Date.now() - new Date(String(order.acceptedAt)).getTime()) < 3 * 60 * 1000;
                return {
                  id: order.id,
                  label: `#${order.id.slice(-6).toUpperCase()} · ${order.customerName || order.userName || 'CLIENTE'}`,
                  node: (
                    <KitchenOrderCard
                      order={order}
                      statusColor="#3b82f6"
                      actions={renderOrderActions(order, 'accepted')}
                      isNew={!!isNewOrder}
                    />
                  ),
                };
              })}
            />

            <OrderCarousel
              title="Preparando"
              icon={<ChefHat className="h-5 w-5 text-purple-400" />}
              accentColor="#a855f7"
              emptyLabel="Nenhum pedido em preparo"
              items={preparingOrders.map(order => ({
                id: order.id,
                label: `#${order.id.slice(-6).toUpperCase()} · ${order.customerName || order.userName || 'CLIENTE'}`,
                node: (
                  <KitchenOrderCard
                    order={order}
                    statusColor="#a855f7"
                    actions={renderOrderActions(order, 'preparing')}
                  />
                ),
              }))}
            />

            <OrderCarousel
              title="Prontos"
              icon={<Truck className="h-5 w-5 text-green-400" />}
              accentColor="#22c55e"
              emptyLabel="Nenhum pedido pronto"
              items={readyOrders.map(order => ({
                id: order.id,
                label: `#${order.id.slice(-6).toUpperCase()} · ${order.customerName || order.userName || 'CLIENTE'}`,
                node: (
                  <KitchenOrderCard
                    order={order}
                    statusColor="#22c55e"
                    actions={renderOrderActions(order, order.status)}
                  />
                ),
              }))}
            />
          </div>
        )}

      </main>
    </div>
  );
}
