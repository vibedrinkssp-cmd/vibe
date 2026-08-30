// Delivery Tab Component — READ-ONLY consultation panel
import { Clock, Truck, CheckCircle, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExpandableOrderCard } from '@/components/ExpandableOrderCard';
import { 
  useAdminOrders, 
  useAdminOrderItems, 
  useAdminUsers, 
  useAdminMotoboys,
  useAdminAddresses,
} from '../use-admin-data';
import { isExternalOrder } from '@/lib/external-platforms';
import type { OrderWithDetails } from '../shared';

export function DeliveryTab() {
  const { data: orders = [] } = useAdminOrders({ refetchInterval: 5000 });
  const { data: users = [] } = useAdminUsers();
  const { data: motoboys = [] } = useAdminMotoboys();
  const { data: addresses = [] } = useAdminAddresses();

  // Filter only delivery orders
  const deliveryOrders = orders.filter(order => order.orderType === 'delivery' || (isExternalOrder(order) && ['ready', 'dispatched', 'arrived', 'delivered'].includes(order.status)));
  const orderIds = deliveryOrders.map(o => o.id);
  
  const { data: orderItems = [] } = useAdminOrderItems(orderIds);

  const ordersWithDetails: OrderWithDetails[] = deliveryOrders.map(order => {
    const user = users.find(u => u.id === order.userId);
    const motoboy = order.motoboyId ? motoboys.find(m => m.id === order.motoboyId) : undefined;
    const address = (order as any).address || (order.addressId ? addresses.find(a => a.id === order.addressId) : undefined);
    return {
      ...order,
      items: orderItems.filter(item => item.orderId === order.id),
      userName: (order as any).userName || user?.name || order.customerName || 'Cliente',
      userWhatsapp: (order as any).userWhatsapp || user?.whatsapp,
      motoboy,
      address,
    };
  });

  const readyOrders = ordersWithDetails.filter(o => o.status === 'ready');
  const dispatchedOrders = ordersWithDetails.filter(o => o.status === 'dispatched' || o.status === 'arrived');
  const deliveredOrders = ordersWithDetails.filter(o => o.status === 'delivered').slice(0, 10);

  const renderReadyInfo = (order: OrderWithDetails) => (
    <Badge className="w-full justify-center py-1.5 bg-amber-500/15 text-amber-400 border-amber-500/30">
      <Clock className="h-3.5 w-3.5 mr-1.5" />
      Aguardando alocação (Cozinha/LOG)
    </Badge>
  );

  const renderDispatchedInfo = (order: OrderWithDetails) => {
    const currentMotoboy = order.motoboy;
    const hasPickedUp = !!order.pickedUpAt;

    if (!currentMotoboy) {
      return (
        <Badge className="w-full justify-center py-1.5 bg-red-500/15 text-red-400 border-red-500/30">
          ⚠️ Sem motoboy atribuído
        </Badge>
      );
    }

    if (!hasPickedUp) {
      return (
        <Badge className="w-full justify-center py-1.5 bg-amber-500/15 text-amber-400 border-amber-500/30">
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          Aguardando coleta — {currentMotoboy.name}
        </Badge>
      );
    }

    return (
      <Badge className="w-full justify-center py-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
        <Truck className="h-3.5 w-3.5 mr-1.5" />
        Em rota — {currentMotoboy.name}
      </Badge>
    );
  };

  const renderDeliveredInfo = (order: OrderWithDetails) => {
    const currentMotoboy = order.motoboy;
    return (
      <Badge className="w-full justify-center py-1.5 bg-purple-500/15 text-purple-400 border-purple-500/30">
        <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
        Entregue{currentMotoboy ? ` por ${currentMotoboy.name}` : ''}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="font-serif text-3xl text-primary">Delivery</h2>
        <Badge variant="outline" className="text-muted-foreground">
          <Eye className="h-3 w-3 mr-1" />
          Somente consulta
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Prontos ({readyOrders.length})
          </h3>
          <div className="space-y-4">
            {readyOrders.map(order => (
              <ExpandableOrderCard
                key={order.id}
                order={order}
                variant="admin"
                defaultExpanded={false}
                showActions={true}
                actions={renderReadyInfo(order)}
              />
            ))}
            {readyOrders.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum pedido pronto
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Em Rota ({dispatchedOrders.length})
          </h3>
          <div className="space-y-4">
            {dispatchedOrders.map(order => (
              <ExpandableOrderCard
                key={order.id}
                order={order}
                variant="admin"
                defaultExpanded={false}
                showActions={true}
                actions={renderDispatchedInfo(order)}
              />
            ))}
            {dispatchedOrders.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum pedido em rota
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            Entregues Recentes ({deliveredOrders.length})
          </h3>
          <div className="space-y-4">
            {deliveredOrders.map(order => (
              <ExpandableOrderCard
                key={order.id}
                order={order}
                variant="admin"
                defaultExpanded={false}
                showActions={true}
                actions={renderDeliveredInfo(order)}
              />
            ))}
            {deliveredOrders.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum pedido entregue recentemente
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
