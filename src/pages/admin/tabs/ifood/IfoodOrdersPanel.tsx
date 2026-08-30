import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RefreshCw, ChefHat, Truck, CheckCircle2, XCircle, MapPin, Phone, User, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface IfoodOrder {
  id: string;
  ifood_order_id: string;
  display_id: string;
  status_ifood: string;
  status_vm: string;
  order_type: string;
  customer_name: string;
  customer_phone: string | null;
  customer_doc: string | null;
  delivery_address: any;
  items: any[];
  payments: any;
  raw_order?: any;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  change_for: number | null;
  delivery_code: string | null;
  imported_at: string;
  cancellation_reason: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  PENDENTE: 'bg-orange-500 text-white',
  CONFIRMADO: 'bg-blue-500 text-white',
  PREPARANDO: 'bg-amber-500 text-white',
  PRONTO: 'bg-green-500 text-white',
  SAIU: 'bg-indigo-500 text-white',
  ENTREGUE: 'bg-purple-600 text-white',
  CANCELADO: 'bg-red-600 text-white',
};

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtAddress(a: any): string {
  if (!a) return '—';
  const parts = [
    a.formattedAddress ?? `${a.streetName ?? ''}, ${a.streetNumber ?? ''}`.trim(),
    a.complement && `Compl: ${a.complement}`,
    a.neighborhood,
    a.city && a.state && `${a.city}/${a.state}`,
    a.postalCode && `CEP ${a.postalCode}`,
  ].filter(Boolean);
  return parts.join(' — ');
}

function fmtPayment(p: any): string {
  if (!p?.methods?.length) return '—';
  return p.methods.map((m: any) => {
    const tag = m.type === 'OFFLINE' ? '💵 COBRAR' : '💳 PAGO';
    const change = m.cash?.changeFor ? ` (troco p/ ${fmtMoney(m.cash.changeFor)})` : '';
    return `${tag} ${m.method ?? '?'} ${fmtMoney(Number(m.value ?? 0))}${change}`;
  }).join(' · ');
}

function getCustomerPhone(o: IfoodOrder): string | null {
  const phone = o.customer_phone || o.raw_order?.customer?.phone;
  if (!phone) return null;
  if (typeof phone === 'string') return phone;
  return phone.number ? `${phone.number}${phone.localizer ? ` (cód ${phone.localizer})` : ''}` : null;
}

function getCustomerDoc(o: IfoodOrder): string | null {
  return o.customer_doc || o.raw_order?.customer?.documentNumber || null;
}

function getDeliveryAddress(o: IfoodOrder): any {
  return o.delivery_address || o.raw_order?.delivery?.deliveryAddress || null;
}

export function IfoodOrdersPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);
  const [cancelOrder, setCancelOrder] = useState<IfoodOrder | null>(null);
  const [cancelReasons, setCancelReasons] = useState<any[]>([]);
  const [loadingReasons, setLoadingReasons] = useState(false);

  const { data: orders = [], refetch } = useQuery({
    queryKey: ['ifood-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ifood_orders')
        .select('*')
        .order('imported_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as IfoodOrder[];
    },
    refetchInterval: 15_000,
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('ifood_orders_panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ifood_orders' }, () => {
        qc.invalidateQueries({ queryKey: ['ifood-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const callAction = async (action: string, ifoodOrderId: string, payload?: any) => {
    setActing(`${action}-${ifoodOrderId}`);
    try {
      const { data, error } = await supabase.functions.invoke('ifood-action', {
        body: { action, ifoodOrderId, payload, performedBy: 'admin' },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast({
          title: `❌ iFood recusou (${data?.httpStatus ?? '?'})`,
          description: data?.error ?? 'Sem detalhes',
          variant: 'destructive',
        });
        return null;
      }
      toast({ title: `✅ ${action} OK` });
      refetch();
      return data;
    } catch (e) {
      toast({ title: 'Erro', description: String(e), variant: 'destructive' });
      return null;
    } finally {
      setActing(null);
    }
  };

  const openCancelDialog = async (order: IfoodOrder) => {
    setCancelOrder(order);
    setLoadingReasons(true);
    try {
      const { data } = await supabase.functions.invoke('ifood-action', {
        body: { action: 'cancellationReasons', ifoodOrderId: order.ifood_order_id, performedBy: 'admin' },
      });
      const list = Array.isArray(data?.response) ? data.response : (data?.response?.reasons ?? []);
      setCancelReasons(list);
    } catch {
      setCancelReasons([]);
    } finally {
      setLoadingReasons(false);
    }
  };

  const submitCancel = async (reason: any) => {
    if (!cancelOrder) return;
    const ok = await callAction('requestCancellation', cancelOrder.ifood_order_id, {
      reason: reason.description ?? reason.reason ?? reason.code,
      cancellationCode: reason.cancelCodeId ?? reason.code ?? reason.id,
    });
    if (ok) setCancelOrder(null);
  };

  const buttonsFor = (o: IfoodOrder) => {
    const status = o.status_vm;
    const id = o.ifood_order_id;
    const isLoading = (a: string) => acting === `${a}-${id}`;

    if (status === 'CANCELADO' || status === 'ENTREGUE') return null;

    return (
      <div className="flex flex-wrap gap-2 pt-2 border-t mt-3">
        {status === 'PENDENTE' && (
          <>
            <Button size="sm" disabled={!!acting} onClick={() => callAction('confirm', id)}>
              {isLoading('confirm') ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Confirmar
            </Button>
            <Button size="sm" variant="destructive" disabled={!!acting} onClick={() => openCancelDialog(o)}>
              <XCircle className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          </>
        )}
        {status === 'CONFIRMADO' && (
          <>
            <Button size="sm" disabled={!!acting} onClick={() => callAction('startPreparation', id)}>
              {isLoading('startPreparation') ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ChefHat className="h-4 w-4 mr-1" />}
              Iniciar preparo
            </Button>
            <Button size="sm" variant="destructive" disabled={!!acting} onClick={() => openCancelDialog(o)}>
              <XCircle className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          </>
        )}
        {status === 'PREPARANDO' && (
          <Button size="sm" disabled={!!acting} onClick={() => callAction('readyToPickup', id)}>
            {isLoading('readyToPickup') ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Pronto para retirada
          </Button>
        )}
        {status === 'PRONTO' && (
          <Button size="sm" disabled={!!acting} onClick={() => callAction('dispatch', id)}>
            {isLoading('dispatch') ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Truck className="h-4 w-4 mr-1" />}
            Despachar
          </Button>
        )}
        {status === 'SAIU' && (
          <span className="text-xs text-muted-foreground italic">Aguardando entrega pelo motoboy</span>
        )}
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pedidos iFood TESTE ({orders.length})</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            {orders.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhum pedido iFood ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => {
                  const customerPhone = getCustomerPhone(o);
                  const customerDoc = getCustomerDoc(o);
                  const deliveryAddress = getDeliveryAddress(o);
                  return (
                  <div key={o.id} className="border rounded-lg p-3 bg-card">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={STATUS_COLOR[o.status_vm] ?? ''}>{o.status_vm}</Badge>
                        <Badge variant="outline" className="text-[10px]">#{o.display_id}</Badge>
                        <Badge variant="outline" className="text-[10px]">{o.order_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(o.imported_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <span className="font-bold">{fmtMoney(o.total)}</span>
                    </div>

                    <div className="mt-2 text-sm space-y-1">
                      <p className="flex items-center gap-1">
                        <User className="h-3 w-3" /> <strong>{o.customer_name}</strong>
                        {customerDoc && <span className="text-xs text-muted-foreground">({customerDoc})</span>}
                      </p>
                      {customerPhone && (
                        <p className="flex items-center gap-1 text-xs">
                          <Phone className="h-3 w-3" /> {customerPhone}
                        </p>
                      )}
                      {o.order_type === 'DELIVERY' && (
                        <p className="flex items-start gap-1 text-xs">
                          <MapPin className="h-3 w-3 mt-0.5" /> {fmtAddress(deliveryAddress)}
                        </p>
                      )}
                    </div>

                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer text-primary">
                        📦 {o.items?.length ?? 0} item(ns) — clique para ver
                      </summary>
                      <div className="mt-2 text-xs space-y-1 pl-3 border-l">
                        {(o.items ?? []).map((it: any, idx: number) => (
                          <div key={idx}>
                            <p>
                              <strong>{it.quantity}x</strong> {it.name}
                              {it.externalCode && <span className="text-muted-foreground"> [PDV:{it.externalCode}]</span>}
                              {' · '}{fmtMoney(Number(it.totalPrice ?? 0))}
                            </p>
                            {(it.options ?? []).map((opt: any, j: number) => (
                              <p key={j} className="pl-3 text-muted-foreground">
                                + {opt.quantity}x {opt.name}
                              </p>
                            ))}
                            {it.observations && <p className="pl-3 italic">📝 {it.observations}</p>}
                          </div>
                        ))}
                      </div>
                    </details>

                    <p className="text-xs mt-2">{fmtPayment(o.payments)}</p>
                    {o.change_for && <p className="text-xs">💵 Troco para {fmtMoney(o.change_for)}</p>}
                    {o.delivery_code && (
                      <p className="text-xs font-mono bg-muted px-2 py-1 rounded mt-1 inline-block">
                        🔑 Cód. entrega: <strong>{o.delivery_code}</strong>
                      </p>
                    )}
                    {o.cancellation_reason && (
                      <p className="text-xs text-destructive mt-1">❌ Motivo: {o.cancellation_reason}</p>
                    )}

                    {buttonsFor(o)}
                  </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!cancelOrder} onOpenChange={(o) => !o && setCancelOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar pedido iFood #{cancelOrder?.display_id}</DialogTitle>
          </DialogHeader>
          {loadingReasons ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : cancelReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Não foi possível obter os motivos oficiais. Tente novamente.
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {cancelReasons.map((r: any, idx: number) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-2"
                  onClick={() => submitCancel(r)}
                  disabled={!!acting}
                >
                  <div>
                    <p className="font-semibold text-sm">{r.description ?? r.reason ?? r.code}</p>
                    {r.cancelCodeId && <p className="text-xs text-muted-foreground font-mono">{r.cancelCodeId}</p>}
                  </div>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
