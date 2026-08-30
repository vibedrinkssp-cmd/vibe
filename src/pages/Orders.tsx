import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Wifi, WifiOff, Loader2, RefreshCw, MapPin, Eye, QrCode, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { useOrderUpdates } from '@/hooks/use-order-updates';
import { useCustomerRealtime } from '@/hooks/use-realtime-sync';
import { useNotificationSound } from '@/hooks/use-notification-sound';
import { useToast } from '@/hooks/use-toast';
import { useCustomerOrderBadge } from '@/hooks/use-customer-order-badge';
import { ExpandableOrderCard } from '@/components/ExpandableOrderCard';
import { OrderTrackingTimeline } from '@/components/OrderTrackingTimeline';
import { OrderStatusAlert } from '@/components/OrderStatusAlert';
import { PixQRCodeModal } from '@/components/PixQRCodeModal';
import { useOrders, useOrderItems, useMotoboys } from '@/hooks/use-supabase-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import type { Order, OrderItem, Motoboy, OrderStatus } from '@/shared/schema';

interface OrderWithDetails extends Order {
  items: OrderItem[];
  motoboy?: Motoboy;
}

export default function Orders() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isHydrated } = useAuth();
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);
  const [selectedOrderForPix, setSelectedOrderForPix] = useState<OrderWithDetails | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const { playOnce, playLoop, stopAll } = useNotificationSound({ screen: 'customer' });
  // Orders.tsx is customer-facing — uses basic playLoop/stopAll, not useOrderAlert
  const { toast } = useToast();
  const { clearBadge } = useCustomerOrderBadge();

  // Clear badge when user visits this page
  useEffect(() => {
    clearBadge();
  }, [clearBadge]);

  // Redirect to login if not authenticated (wait for hydration)
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      navigate('/login?redirect=/pedidos');
    }
  }, [isAuthenticated, isHydrated, navigate]);

  // Realtime sync for customer orders - automatic query invalidation
  useCustomerRealtime(user?.id, {
    onConnected: () => setIsSSEConnected(true),
    onDisconnected: () => setIsSSEConnected(false),
    onEvent: (event) => {
      if (event.table === 'orders' && event.event === 'UPDATE') {
        const newStatus = event.payload?.status as OrderStatus;
        const orderUserId = event.payload?.user_id;
        
        if (orderUserId === user?.id) {
          const statusMessages: Record<string, string> = {
            accepted: '✅ Seu pedido foi aceito!',
            preparing: '🍳 Seu pedido está sendo preparado!',
            ready: '📦 Seu pedido está pronto!',
            dispatched: '🛵 Seu pedido saiu para entrega!',
            arrived: '🔔 O entregador chegou!',
            delivered: '🎉 Pedido entregue com sucesso!',
            cancelled: '❌ Seu pedido foi cancelado.',
          };
          
          if (newStatus === 'arrived') {
            // Doorbell loop until customer acknowledges
            playLoop('arrived');
            toast({ 
              title: statusMessages[newStatus],
              description: `Pedido #${(event.payload?.id as string).slice(-6).toUpperCase()}`,
            });
          } else if (newStatus === 'cancelled') {
            playOnce('cancelled');
            toast({ 
              title: statusMessages[newStatus],
              description: `Pedido #${(event.payload?.id as string).slice(-6).toUpperCase()}`,
              variant: 'destructive',
            });
          } else if (newStatus === 'delivered') {
            stopAll();
            playOnce('status_update');
            toast({ 
              title: statusMessages[newStatus],
              description: `Pedido #${(event.payload?.id as string).slice(-6).toUpperCase()}`,
            });
          } else if (statusMessages[newStatus]) {
            playOnce('status_update');
            toast({ 
              title: statusMessages[newStatus],
              description: `Pedido #${(event.payload?.id as string).slice(-6).toUpperCase()}`,
            });
          }
        }
      }
    },
  });

  // Fallback polling with useOrderUpdates
  useOrderUpdates({
    onConnected: () => setIsSSEConnected(true),
    onDisconnected: () => setIsSSEConnected(false),
  });

  // Use direct Supabase hooks instead of /api/ routes
  const { data: orders = [], isLoading, refetch } = useOrders({
    userId: user?.id,
    enabled: !!user?.id && isHydrated,
    refetchInterval: 15000, // Poll at 15s to reduce I/O pressure
    useRpc: true,
  });

  const orderIds = orders.map(o => o.id);
  
  const { data: orderItems = [] } = useOrderItems(orderIds, {
    enabled: orders.length > 0,
    refetchInterval: 15000,
    useAdminRpc: true,
  });

  const { data: motoboys = [] } = useMotoboys();

  const ordersWithDetails: OrderWithDetails[] = orders.map(order => ({
    ...order,
    items: orderItems.filter(item => item.orderId === order.id),
    motoboy: order.motoboyId ? motoboys.find(m => m.id === order.motoboyId) : undefined,
  }));

  // Separate active and completed orders
  const activeOrders = ordersWithDetails.filter(o => 
    !['delivered', 'cancelled'].includes(o.status)
  );
  const completedOrders = ordersWithDetails.filter(o => 
    ['delivered', 'cancelled'].includes(o.status)
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast({ title: 'Pedidos atualizados!' });
  };

  // Handle retry PIX payment
  const handleRetryPixPayment = (order: OrderWithDetails) => {
    setSelectedOrderForPix(order);
    setShowPixModal(true);
  };

  // Handle PIX payment approved
  const handlePixPaymentApproved = () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    toast({ title: '✅ Pagamento confirmado!', description: 'Seu pedido foi confirmado.' });
    setShowPixModal(false);
    setSelectedOrderForPix(null);
    refetch();
  };

  // Handle PIX payment cancelled from modal (just close)
  const handlePixModalCancelled = () => {
    setShowPixModal(false);
    setSelectedOrderForPix(null);
  };

  // Handle cancel pending order
  const handleCancelOrder = async (orderId: string) => {
    setCancellingOrderId(orderId);
    try {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const { error } = await supabase.rpc('cancel_customer_order', {
        p_user_id: user.id,
        p_order_id: orderId,
      });
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ 
        title: 'Pedido cancelado', 
        description: 'O pedido foi cancelado com sucesso.',
        variant: 'destructive' 
      });
      refetch();
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast({ 
        title: 'Erro ao cancelar', 
        description: 'Não foi possível cancelar o pedido.',
        variant: 'destructive' 
      });
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Show loading while checking auth
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4 overflow-x-hidden" style={{ paddingBottom: 'max(32px, calc(16px + env(safe-area-inset-bottom, 0px)))' }}>
      <div className="max-w-4xl mx-auto pb-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <Button
            variant="ghost"
            className="text-primary"
            onClick={() => navigate('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar ao cardápio
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-primary/30"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Badge 
              className={isSSEConnected 
                ? "bg-green-500/20 text-green-400 border-green-500/30" 
                : "bg-primary/20 text-primary border-primary/30"
              }
              data-testid="badge-connection-status"
            >
              {isSSEConnected ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
              {isSSEConnected ? 'Ao Vivo' : 'Atualizando...'}
            </Badge>
          </div>
        </div>

        <h1 className="font-serif text-3xl text-primary mb-6">Meus Pedidos</h1>
        
        {/* Notification Permission Prompt */}
        {activeOrders.length > 0 && (
          <OrderStatusAlert className="mb-6" />
        )}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card border-primary/20">
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-32 mb-4" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : ordersWithDetails.length === 0 ? (
          <Card className="bg-card border-primary/20">
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Nenhum pedido ainda</h2>
              <p className="text-muted-foreground mb-6">
                Você ainda não fez nenhum pedido. Que tal explorar nosso cardápio?
              </p>
              <Button
                className="bg-primary text-primary-foreground"
                onClick={() => navigate('/')}
                data-testid="button-explore"
              >
                Ver Cardápio
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active" className="relative">
                Em Andamento
                {activeOrders.length > 0 && (
                  <Badge className="ml-2 bg-primary text-primary-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {activeOrders.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed">
                Histórico
                {completedOrders.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {completedOrders.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {activeOrders.length === 0 ? (
                <Card className="bg-card border-primary/20">
                  <CardContent className="p-8 text-center">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">Nenhum pedido em andamento</p>
                  </CardContent>
                </Card>
              ) : (
                activeOrders.map((order) => (
                  <Card key={order.id} className="bg-card border-primary/20 overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-bold text-primary">
                          Pedido #{order.id.slice(-6).toUpperCase()}
                        </CardTitle>
                        <Badge 
                          className={
                            order.status === 'pending' ? 'bg-primary/20 text-primary border-primary/30' :
                            order.status === 'accepted' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                            order.status === 'preparing' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                            order.status === 'ready' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                            order.status === 'dispatched' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' :
                            order.status === 'arrived' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse' :
                            'bg-primary/20 text-primary border-primary/30'
                          }
                        >
                          {order.status === 'pending' && order.paymentMethod === 'pix' && '💳 Aguardando PIX'}
                          {order.status === 'pending' && order.paymentMethod !== 'pix' && 'Aguardando'}
                          {order.status === 'accepted' && 'Confirmado'}
                          {order.status === 'preparing' && 'Em Preparo'}
                          {order.status === 'ready' && 'Pronto'}
                          {order.status === 'dispatched' && 'A Caminho'}
                          {order.status === 'arrived' && '🛵 Chegou!'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <OrderTrackingTimeline 
                        status={order.status as OrderStatus}
                        orderType={order.orderType as 'delivery' | 'pickup' | 'local' | 'counter'}
                        timestamps={{
                          createdAt: order.createdAt ? String(order.createdAt) : null,
                          acceptedAt: order.acceptedAt ? String(order.acceptedAt) : null,
                          preparingAt: order.preparingAt ? String(order.preparingAt) : null,
                          readyAt: order.readyAt ? String(order.readyAt) : null,
                          dispatchedAt: order.dispatchedAt ? String(order.dispatchedAt) : null,
                          arrivedAt: order.arrivedAt ? String(order.arrivedAt) : null,
                          deliveredAt: order.deliveredAt ? String(order.deliveredAt) : null,
                        }}
                      />
                      
                      {/* Pending PIX payment actions */}
                      {order.status === 'pending' && order.paymentMethod === 'pix' && (
                        <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mt-4">
                          <div className="flex items-start gap-3 mb-3">
                            <QrCode className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-primary">Pagamento PIX pendente</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                Clique em "Pagar Agora" para gerar um novo QR Code ou cancele o pedido.
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-primary text-primary-foreground"
                              onClick={() => handleRetryPixPayment(order)}
                            >
                              <QrCode className="h-4 w-4 mr-1" />
                              Pagar Agora
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/30 text-destructive hover:bg-destructive/10"
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={cancellingOrderId === order.id}
                            >
                              {cancellingOrderId === order.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Cancelar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {order.motoboy && (
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 mt-4">
                          <p className="text-sm text-purple-400 font-medium">Entregador</p>
                          <p className="text-foreground font-semibold">{order.motoboy.name}</p>
                        </div>
                      )}

                      {/* Order Items Detail */}
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-sm font-medium text-muted-foreground mb-2">Itens do Pedido:</p>
                        <div className="space-y-2">
                          {order.items.length > 0 ? (
                            order.items.map((item) => (
                              <div key={item.id} className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="bg-primary/20 text-primary text-xs font-bold rounded px-1.5 py-0.5">
                                    {item.quantity}x
                                  </span>
                                  <span className="text-foreground">{item.productName}</span>
                                </div>
                                <span className="text-muted-foreground">
                                  R$ {Number(item.totalPrice).toFixed(2).replace('.', ',')}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Carregando itens...</p>
                          )}
                        </div>
                        
                        {/* Totals Summary */}
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-1 text-sm">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Subtotal</span>
                            <span>R$ {Number(order.subtotal).toFixed(2).replace('.', ',')}</span>
                          </div>
                          {Number(order.deliveryFee) > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                              <span>Entrega</span>
                              <span>R$ {Number(order.deliveryFee).toFixed(2).replace('.', ',')}</span>
                            </div>
                          )}
                          {Number(order.discount) > 0 && (
                            <div className="flex justify-between text-green-500">
                              <span>Desconto</span>
                              <span>-R$ {Number(order.discount).toFixed(2).replace('.', ',')}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-primary pt-1">
                            <span>Total</span>
                            <span>R$ {Number(order.total).toFixed(2).replace('.', ',')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                        <div className="text-sm text-muted-foreground">
                          {order.paymentMethod === 'pix' && '💳 PIX'}
                          {order.paymentMethod === 'cash' && '💵 Dinheiro'}
                          {order.paymentMethod === 'card_credit' && '💳 Crédito'}
                          {order.paymentMethod === 'card_debit' && '💳 Débito'}
                          {order.paymentMethod === 'card_pos' && '💳 Maquininha'}
                          {order.changeFor && Number(order.changeFor) > 0 && (
                            <span className="ml-2">(Troco p/ R$ {Number(order.changeFor).toFixed(2).replace('.', ',')})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {order.orderType === 'delivery' && ['dispatched', 'arrived'].includes(order.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-primary/30 text-primary hover:bg-primary/10"
                              onClick={() => navigate(`/pedido/${order.id}`)}
                            >
                              <MapPin className="h-4 w-4 mr-1" />
                              Rastrear
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => navigate(`/pedido/${order.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detalhes
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedOrders.length === 0 ? (
                <Card className="bg-card border-primary/20">
                  <CardContent className="p-8 text-center">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">Nenhum pedido no histórico</p>
                  </CardContent>
                </Card>
              ) : (
                completedOrders.map((order) => (
                  <ExpandableOrderCard
                    key={order.id}
                    order={order}
                    variant="customer"
                    defaultExpanded={false}
                    showActions={false}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* PIX Payment Modal for retry */}
      {selectedOrderForPix && (
        <PixQRCodeModal
          open={showPixModal}
          onOpenChange={setShowPixModal}
          amount={Number(selectedOrderForPix.total)}
          description={`Pedido #${selectedOrderForPix.id.slice(-6).toUpperCase()} - Vibe Drinks`}
          orderId={selectedOrderForPix.id}
          onPaymentApproved={handlePixPaymentApproved}
          onPaymentCancelled={handlePixModalCancelled}
        />
      )}
    </div>
  );
}