import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client-safe';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format-utils';
import { FEE_PLATFORMS } from '@/lib/platform-fees';

type Channel = 'balcao' | 'delivery' | 'ifood' | '99food';
const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'balcao', label: 'Balcão' },
  { id: 'delivery', label: 'Delivery loja' },
  { id: 'ifood', label: 'iFood' },
  { id: '99food', label: '99Food' },
];
const channelLabel = (c: Channel) => CHANNELS.find((x) => x.id === c)?.label ?? c;

/** Mesma regra do Relatório Diário: origem de plataforma > balcão > delivery da loja. */
function orderChannel(o: { salesperson: string | null; order_type: string }): Channel {
  const sp = (o.salesperson ?? '').toLowerCase();
  if ((FEE_PLATFORMS as readonly string[]).includes(sp)) return sp as Channel;
  return o.order_type === 'counter' ? 'balcao' : 'delivery';
}

interface OutflowItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  total_price: number;
}

interface OutflowOrder {
  id: string;
  created_at: string;
  salesperson: string | null;
  order_type: string;
  total: number;
  order_items: OutflowItem[];
  order_platform_fees: { fee_percent: number; fee_amount: number } | null;
}

interface ProductRow {
  productId: string | null;
  name: string;
  channel: Channel;
  quantity: number;
  revenue: number;
  fee: number;
}

const ORDER_SELECT =
  'id, created_at, salesperson, order_type, total, order_items(product_id, product_name, quantity, total_price), order_platform_fees(fee_percent, fee_amount)';

function useOutflowOrders(from: string, to: string) {
  return useQuery({
    queryKey: ['platform-outflow', from, to],
    queryFn: async () => {
      const start = new Date(`${from}T00:00:00`);
      const end = addDays(new Date(`${to}T00:00:00`), 1);
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .not('status', 'in', '(pending,cancelled)')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OutflowOrder[];
    },
  });
}

/** Agrupa os itens por produto+plataforma; a taxa de cada item é proporcional à taxa % do pedido. */
function groupByProduct(orders: OutflowOrder[]): ProductRow[] {
  const rows = new Map<string, ProductRow>();
  for (const order of orders) {
    const channel = orderChannel(order);
    const percent = Number(order.order_platform_fees?.fee_percent ?? 0);
    for (const item of order.order_items) {
      const key = `${channel}|${item.product_name}`;
      const row = rows.get(key) ?? { productId: item.product_id, name: item.product_name, channel, quantity: 0, revenue: 0, fee: 0 };
      row.quantity += item.quantity;
      row.revenue += Number(item.total_price);
      row.fee += (Number(item.total_price) * percent) / 100;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.quantity - a.quantity);
}

/** Estoque atual dos produtos listados, para conferir se a baixa bateu. */
function useCurrentStock(productIds: string[]) {
  const key = productIds.join(',');
  return useQuery({
    queryKey: ['platform-outflow-stock', key],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, stock').in('id', productIds);
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, p.stock as number | null]));
    },
  });
}

export function PlatformOutflowTab() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [channel, setChannel] = useState<Channel | 'all'>('all');
  const { data: allOrders = [], isLoading, error } = useOutflowOrders(from, to);
  const orders = useMemo(
    () => allOrders.filter((o) => channel === 'all' || orderChannel(o) === channel),
    [allOrders, channel],
  );

  const products = useMemo(() => groupByProduct(orders), [orders]);
  const productIds = useMemo(
    () => [...new Set(products.map((p) => p.productId).filter((id): id is string => !!id))],
    [products],
  );
  const { data: stockById } = useCurrentStock(productIds);
  const totalUnits = products.reduce((sum, p) => sum + p.quantity, 0);
  const totalFee = products.reduce((sum, p) => sum + p.fee, 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold">Saídas por canal</h3>
        <p className="text-sm text-muted-foreground">
          Tudo que saiu por Balcão, Delivery da loja, iFood e 99, como foi lançado no PDV. Nas plataformas aparece a taxa simulada.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" />
        {[{ id: 'all' as const, label: 'Todos' }, ...CHANNELS].map((c) => (
          <Button key={c.id} size="sm" variant={channel === c.id ? 'default' : 'outline'} onClick={() => setChannel(c.id)}>
            {c.label}
          </Button>
        ))}
      </div>

      {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
      {error && <p className="text-sm text-destructive">Erro ao carregar: {(error as Error).message}</p>}

      <div className="grid grid-cols-3 gap-2 text-center">
        <SummaryBox label="Pedidos" value={String(orders.length)} />
        <SummaryBox label="Unidades que saíram" value={String(totalUnits)} />
        <SummaryBox label="Taxa simulada" value={formatCurrency(totalFee)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Por produto</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2">Produto</th><th className="pb-2">Saiu por</th>
                <th className="pb-2 text-right">Qtd</th><th className="pb-2 text-right">Valor</th>
                <th className="pb-2 text-right">Taxa</th><th className="pb-2 text-right">Estoque atual</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={`${p.channel}|${p.name}`} className="border-t border-border">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2">{channelLabel(p.channel)}</td>
                  <td className="py-2 text-right font-bold">{p.quantity}</td>
                  <td className="py-2 text-right">{formatCurrency(p.revenue)}</td>
                  <td className="py-2 text-right text-destructive">{formatCurrency(p.fee)}</td>
                  <td className="py-2 text-right">{p.productId ? (stockById?.get(p.productId) ?? '-') : 'sem vínculo'}</td>
                </tr>
              ))}
              {!isLoading && products.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhuma saída no período.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pedidos registrados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="border-t border-border pt-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">
                  {channelLabel(orderChannel(o))} · {format(new Date(o.created_at), 'dd/MM HH:mm')}
                </span>
                <span>
                  {formatCurrency(Number(o.total))}
                  {o.order_platform_fees && (
                    <span className="text-destructive"> (taxa {Number(o.order_platform_fees.fee_percent)}%)</span>
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {o.order_items.map((i) => `${i.quantity}x ${i.product_name}`).join(' · ')}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}
