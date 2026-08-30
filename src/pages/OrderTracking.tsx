import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Clock, MapPin, Phone, CheckCircle, Truck, ChefHat, AlertCircle, Navigation, ExternalLink, Bell, BellOff, Wifi, WifiOff, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
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
import { Skeleton } from '@/components/ui/skeleton';
import { GoogleMapEmbed } from '@/components/location/GoogleMapEmbed';
import { LiveTrackingMap } from '@/components/location/LiveTrackingMap';
import { DeliveryEstimate } from '@/components/location/DeliveryEstimate';
import { OrderTrackingTimeline } from '@/components/OrderTrackingTimeline';
import { useAuth } from '@/lib/auth';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { supabase } from '@/integrations/supabase/client-safe';
import { mapOrder, mapAddress } from '@/lib/db-mappers';
import type { Order, Address, Motoboy, OrderItem, Settings } from '@/shared/schema';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, type OrderStatus, type PaymentMethod } from '@/shared/schema';

interface OrderWithDetails extends Order {
  items: OrderItem[];
  address?: Address;
  motoboy?: Motoboy;
}

interface MotoboyLiveLocation {
  lat: number;
  lng: number;
  updatedAt: string;
}

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isHydrated } = useAuth();
  const [liveMotoboyLocation, setLiveMotoboyLocation] = useState<MotoboyLiveLocation | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const lastNotifiedStatusRef = useRef<string | null>(null);
  const { toast } = useToast();
  
  const { 
    isSupported: notificationsSupported,
    isGranted: notificationsGranted,
    requestPermission,
    notifyMotoboyArriving,
    notifyMotoboyArrived,
  } = usePushNotifications({ playSound: true, soundRepeat: 3 });

  // Fetch store settings for coordinates (using public RPC)
  const { data: settings } = useQuery<Settings | null>({
    queryKey: ['store-info'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_store_info');
      if (error) throw error;
      if (!data || (data as any[]).length === 0) return null;
      const row = (data as any[])[0];
      return {
        id: '',
        storeLat: row.store_lat != null ? String(row.store_lat) : null,
        storeLng: row.store_lng != null ? String(row.store_lng) : null,
        deliveryRatePerKm: String(row.delivery_rate_per_km ?? 1.5),
        minDeliveryFee: String(row.min_delivery_fee ?? 3),
        maxDeliveryDistance: String(row.max_delivery_distance ?? 15),
        pixKey: null,
        openingHours: row.opening_hours,
        isOpen: row.is_open,
        storeAddress: row.store_address,
      } as Settings;
    },
  });

  // Get store location from settings
  const storeLocation = settings?.storeLat && settings?.storeLng
    ? { lat: Number(settings.storeLat), lng: Number(settings.storeLng) }
    : { lat: -23.5505, lng: -46.6333 };

  // Fetch order details
  const { data: order, isLoading } = useQuery({
    queryKey: ['order-tracking', orderId],
    queryFn: async (): Promise<OrderWithDetails | null> => {
      if (!orderId || !user?.id) return null;

      // Get order using RPC
      const { data: ordersData, error: orderError } = await supabase
        .rpc('get_user_orders', { p_user_id: user.id });
      
      if (orderError || !ordersData) return null;

      const orderData = (ordersData as any[]).find((o: any) => o.id === orderId);
      if (!orderData) return null;

      const mappedOrder = mapOrder(orderData as Record<string, unknown>);

      // Get order items via RPC (bypasses RLS for custom auth)
      const { data: itemsData } = await supabase.rpc('get_user_order_items', {
        p_user_id: user.id,
        p_order_ids: [orderId],
      });

      // Get address if exists
      let address: Address | undefined;
      if (mappedOrder.addressId) {
        const { data: addressesData } = await supabase.rpc('get_all_addresses');
        const addressData = (addressesData as any[] || []).find((a: any) => a.id === mappedOrder.addressId);
        if (addressData) {
          address = mapAddress(addressData as Record<string, unknown>);
        }
      }

      // Get motoboy if assigned (using public RPC)
      let motoboy: Motoboy | undefined;
      if (mappedOrder.motoboyId) {
        const { data: motoboyData } = await supabase.rpc('get_motoboy_public', {
          p_motoboy_id: mappedOrder.motoboyId,
        });
        if (motoboyData && (motoboyData as any[]).length > 0) {
          const mb = (motoboyData as any[])[0];
          motoboy = {
            id: mb.id,
            name: mb.name,
            whatsapp: '',
            isActive: mb.is_active,
            currentLatitude: mb.current_latitude ? Number(mb.current_latitude) : null,
            currentLongitude: mb.current_longitude ? Number(mb.current_longitude) : null,
            locationUpdatedAt: mb.location_updated_at,
          };
          if (motoboy.currentLatitude && motoboy.currentLongitude) {
            setLiveMotoboyLocation({
              lat: motoboy.currentLatitude,
              lng: motoboy.currentLongitude,
              updatedAt: motoboy.locationUpdatedAt || new Date().toISOString(),
            });
          }
        }
      }

      return {
        ...mappedOrder,
        items: (itemsData || []).map(item => ({
          id: item.id,
          orderId: item.order_id,
          productId: item.product_id || '',
          productName: item.product_name,
          quantity: item.quantity,
          unitPrice: String(item.unit_price),
          totalPrice: String(item.total_price),
        })),
        address,
        motoboy,
      };
    },
    enabled: !!orderId && !!user?.id,
    refetchInterval: 10000,
  });

  // Subscribe to order updates and send push notifications
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updatedOrder = payload.new as any;
          const newStatus = updatedOrder.status;
          
          // Send push notification for motoboy status changes
          if (notificationsGranted && newStatus !== lastNotifiedStatusRef.current) {
            if (newStatus === 'dispatched') {
              notifyMotoboyArriving(orderId, order?.motoboy?.name);
            } else if (newStatus === 'arrived') {
              notifyMotoboyArrived(orderId, order?.motoboy?.name);
            }
            lastNotifiedStatusRef.current = newStatus;
          }
          
          // Trigger refetch when order updates
          queryClient.invalidateQueries({ queryKey: ['order-tracking', orderId] });
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, queryClient, notificationsGranted, notifyMotoboyArriving, notifyMotoboyArrived, order?.motoboy?.name]);

  // Subscribe to motoboy location updates in real-time + polling fallback
  useEffect(() => {
    if (!order?.motoboyId || !['dispatched', 'arrived'].includes(order.status)) return;

    console.log('[OrderTracking] Subscribing to motoboy location updates:', order.motoboyId);

    const applyLocation = (row: { latitude: unknown; longitude: unknown; updated_at?: string; created_at?: string }) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setLiveMotoboyLocation({
        lat,
        lng,
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      });
    };

    // Realtime subscription
    const channel = supabase
      .channel(`motoboy-location-tracking-${order.motoboyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'motoboy_locations',
          filter: `motoboy_id=eq.${order.motoboyId}`,
        },
        (payload) => {
          const newLocation = payload.new as any;
          console.log('[OrderTracking] Motoboy location updated (realtime):', newLocation);
          applyLocation(newLocation);
        }
      )
      .subscribe();

    // Polling fallback every 5 seconds — secure RPC covers cases where realtime is blocked by RLS
    const pollLocation = async () => {
      if (!user?.id || !orderId) return;
      try {
        const { data } = await (supabase as any).rpc('get_order_latest_motoboy_location', {
          p_user_id: user.id,
          p_order_id: orderId,
        });
        const row = Array.isArray(data) ? data[0] : data;

        if (row) {
          setLiveMotoboyLocation(prev => {
            const newLat = Number(row.latitude);
            const newLng = Number(row.longitude);
            if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) return prev;
            // Only update if position actually changed
            if (prev && Math.abs(prev.lat - newLat) < 0.00001 && Math.abs(prev.lng - newLng) < 0.00001 && prev.updatedAt === row.updated_at) {
              return prev;
            }
            console.log('[OrderTracking] Motoboy location updated (poll):', newLat, newLng);
            return { lat: newLat, lng: newLng, updatedAt: row.updated_at || new Date().toISOString() };
          });
        }
      } catch (err) {
        console.error('[OrderTracking] Poll location error:', err);
      }
    };

    // Initial fetch
    pollLocation();
    const pollInterval = setInterval(pollLocation, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [order?.motoboyId, order?.status, orderId, user?.id]);

  // Redirect if not authenticated
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      navigate('/login');
    }
  }, [isHydrated, isAuthenticated, navigate]);

  const formatPrice = (price: string | number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(price));
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      pending: 'bg-yellow/20 text-yellow border-yellow/30',
      accepted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      preparing: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      ready: 'bg-green-500/20 text-green-400 border-green-500/30',
      dispatched: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      arrived: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      delivered: 'bg-green-600/20 text-green-500 border-green-600/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return colors[status] || '';
  };

  if (!isHydrated || isLoading) {
    return (
      <div className="min-h-screen bg-background py-8 px-4 overflow-x-hidden">
        <div className="max-w-2xl mx-auto space-y-6 overflow-hidden">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background py-8 px-4 overflow-x-hidden">
        <div className="max-w-2xl mx-auto overflow-hidden">
          <Button variant="ghost" onClick={() => navigate('/pedidos')} className="mb-6">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar
          </Button>
          <Card className="bg-card border-primary/20">
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Pedido não encontrado</h2>
              <p className="text-muted-foreground">O pedido que você procura não existe ou você não tem acesso.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isDeliveryOrder = order.orderType === 'delivery';
  const showTracking = isDeliveryOrder && ['dispatched', 'arrived'].includes(order.status);
  
  const deliveryLocation = order.address?.latitude && order.address?.longitude
    ? { lat: order.address.latitude, lng: order.address.longitude }
    : undefined;
    
  // Use live location if available, otherwise fall back to motoboy record
  const motoboyLocation = liveMotoboyLocation 
    ? { lat: liveMotoboyLocation.lat, lng: liveMotoboyLocation.lng }
    : order.motoboy?.currentLatitude && order.motoboy?.currentLongitude
      ? { lat: order.motoboy.currentLatitude, lng: order.motoboy.currentLongitude }
      : undefined;

  const openInGoogleMaps = () => {
    if (deliveryLocation) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${deliveryLocation.lat},${deliveryLocation.lng}`;
      window.open(url, '_blank');
    }
  };

  const canCancel = order && ['pending', 'accepted'].includes(order.status) && order.status !== 'cancelled';
  const isPixPayment = order?.paymentMethod === 'pix';

  const handleCancelOrder = async () => {
    if (!order || !user?.id) return;
    setIsCancelling(true);
    try {
      const { data, error } = await supabase.rpc('cancel_customer_order', {
        p_user_id: user.id,
        p_order_id: order.id,
      });
      if (error) throw error;
      if (!data) throw new Error('Não foi possível cancelar o pedido');
      toast({ title: '✅ Pedido cancelado com sucesso' });
      queryClient.invalidateQueries({ queryKey: ['order-tracking', orderId] });
    } catch (err: any) {
      toast({ title: '❌ Erro ao cancelar', description: err.message, variant: 'destructive' });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4 overflow-x-hidden">
      <div className="max-w-2xl mx-auto overflow-hidden">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/pedidos')} 
          className="mb-6 text-primary"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Meus Pedidos
        </Button>

        {/* Realtime connection indicator */}
        <div className="flex items-center gap-2 mb-4">
          {isRealtimeConnected ? (
            <Badge variant="outline" className="text-xs gap-1 border-green-500/30 text-green-500">
              <Wifi className="h-3 w-3" />
              Ao vivo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs gap-1 border-yellow-500/30 text-yellow-500">
              <WifiOff className="h-3 w-3" />
              Reconectando...
            </Badge>
          )}
        </div>
        {notificationsSupported && !notificationsGranted && isDeliveryOrder && (
          <Card className="bg-primary/10 border-primary/30 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground text-sm">Ativar notificações</p>
                    <p className="text-xs text-muted-foreground">Saiba quando o motoboy estiver chegando</p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  onClick={requestPermission}
                  className="bg-primary text-primary-foreground"
                >
                  Ativar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Header */}
        <Card className="bg-card border-primary/20 mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Pedido</p>
                <CardTitle className="text-xl text-foreground truncate">
                  #{order.id.slice(-6).toUpperCase()}
                </CardTitle>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                {notificationsGranted && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                    <Bell className="h-3 w-3 mr-1" />
                    Notif.
                  </Badge>
                )}
                <Badge className={getStatusColor(order.status)}>
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {formatDate(order.createdAt)}
            </p>
          </CardHeader>
        </Card>

        {/* Tracking Map - Always show for delivery orders */}
        {isDeliveryOrder && deliveryLocation && (
          <div className="mb-6">
            <Card className="bg-card border-primary/20 overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base min-w-0">
                    <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="truncate">{showTracking ? 'Acompanhe a Entrega' : 'Local de Entrega'}</span>
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openInGoogleMaps}
                    className="border-primary/30 flex-shrink-0 text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Mapa
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <LiveTrackingMap
                  storeLocation={storeLocation}
                  deliveryLocation={deliveryLocation}
                  motoboyLocation={showTracking ? motoboyLocation : undefined}
                  orderId={order.id}
                  height="250px"
                />
              </CardContent>
            </Card>
            
            {/* Delivery Estimate / Live countdown */}
            {showTracking && (
              <div className="mt-4">
                <DeliveryEstimate
                  storeLocation={motoboyLocation || storeLocation}
                  deliveryLocation={deliveryLocation}
                  isLiveTracking={!!motoboyLocation && order.status === 'dispatched'}
                  lastUpdateAt={liveMotoboyLocation?.updatedAt}
                />
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <Card className="bg-card border-primary/20 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-primary" />
              Status do Pedido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrderTrackingTimeline 
              status={order.status}
              orderType={order.orderType}
              timestamps={{
                createdAt: order.createdAt as string,
                acceptedAt: order.acceptedAt,
                preparingAt: order.preparingAt,
                readyAt: order.readyAt,
                dispatchedAt: order.dispatchedAt,
                arrivedAt: order.arrivedAt,
                deliveredAt: order.deliveredAt,
              }}
            />
          </CardContent>
        </Card>

        {/* Delivery Address */}
        {isDeliveryOrder && order.address && (
          <Card className="bg-card border-primary/20 mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-primary" />
                Endereço de Entrega
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">
                {order.address.street}, {order.address.number}
                {order.address.complement && ` - ${order.address.complement}`}
              </p>
              <p className="text-muted-foreground text-sm">
                {order.address.neighborhood} - {order.address.city}, {order.address.state}
              </p>
              {order.address.notes && (
                <p className="text-yellow text-sm mt-2">Obs: {order.address.notes}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Motoboy Info */}
        {order.motoboy && showTracking && (
          <Card className="bg-card border-primary/20 mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-primary" />
                Entregador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Truck className="h-6 w-6 text-primary" />
                  </div>
                  {liveMotoboyLocation && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{order.motoboy.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.status === 'arrived' ? 'Chegou no destino!' : 'A caminho...'}
                  </p>
                  {liveMotoboyLocation && (
                    <p className="text-xs text-green-400 flex items-center gap-1 mt-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      GPS atualizado às {new Date(liveMotoboyLocation.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-green-500/30 text-green-400"
                  onClick={() => window.open(`https://wa.me/55${order.motoboy?.whatsapp}`, '_blank')}
                >
                  <Phone className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Items */}
        <Card className="bg-card border-primary/20 mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Itens do Pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between items-center gap-2 py-2 border-b border-primary/10 last:border-0">
                  <div className="min-w-0">
                    <p className="text-foreground truncate">{item.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity}x {formatPrice(item.unitPrice)}
                    </p>
                  </div>
                  <p className="font-medium text-foreground flex-shrink-0">{formatPrice(item.totalPrice)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-primary/20 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">{formatPrice(order.subtotal)}</span>
              </div>
              {Number(order.deliveryFee) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de entrega</span>
                  <span className="text-foreground">{formatPrice(order.deliveryFee)}</span>
                </div>
              )}
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-400">Desconto</span>
                  <span className="text-green-400">-{formatPrice(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-2 border-t border-primary/10">
                <span className="text-foreground">Total</span>
                <span className="text-primary">{formatPrice(order.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Info */}
        <Card className="bg-card border-primary/20">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Pagamento</span>
              <span className="text-foreground font-medium">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </span>
            </div>
            {order.paymentMethod === 'cash' && order.changeFor && (
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-primary/10">
                <span className="text-muted-foreground">Troco para</span>
                <span className="text-foreground">{formatPrice(order.changeFor)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cancel Order */}
        {canCancel && (
          <div className="mt-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  disabled={isCancelling}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar Pedido
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-primary/20">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-foreground">Cancelar pedido?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground space-y-3">
                    <p>Tem certeza que deseja cancelar este pedido?</p>
                    {isPixPayment && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-400 text-sm">
                        <p className="font-semibold mb-1">⚠️ Pagamento via PIX</p>
                        <p>
                          Como o pagamento foi realizado via PIX, o gerente entrará em contato pelo seu WhatsApp para realizar o estorno.
                        </p>
                        <p className="mt-1">
                          O prazo para o estorno é de <strong>1 a 6 horas</strong>, dependendo da disponibilidade.
                        </p>
                      </div>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-primary/30">Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelOrder}
                    disabled={isCancelling}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isCancelling ? 'Cancelando...' : 'Confirmar Cancelamento'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  );
}
