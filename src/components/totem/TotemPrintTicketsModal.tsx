import { useEffect, useMemo, useState } from 'react';
import { X, Printer, Loader2, Receipt } from 'lucide-react';
import { resilientRpc } from '@/lib/resilient-rpc';
import { mapOrder, mapOrderItem } from '@/lib/db-mappers';
import { printOrderTicket } from '@/lib/print-ticket';
import type { Order, OrderItem } from '@/shared/schema';
import { toast } from '@/hooks/use-toast';

const TICKET_PIN = '12345678';

async function fetchTotemOrderItems(orderIds: string[]): Promise<OrderItem[]> {
  if (!orderIds.length) return [];
  const { data, error } = await resilientRpc('get_totem_order_items', { p_order_ids: orderIds });
  if (error || !Array.isArray(data)) {
    console.warn('[TotemPrintTickets] falha ao buscar itens:', error?.message ?? error);
    return [];
  }
  return (data as any[]).map((it) => mapOrderItem(it as Record<string, unknown>));
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TotemPrintTicketsModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    if (!open) {
      setOrders([]);
      setItems([]);
      setUnlocked(false);
      setPin('');
      setPinError(false);
    }
  }, [open]);

  const handleDigit = (d: string) => {
    setPinError(false);
    setPin(prev => {
      const next = (prev + d).slice(0, TICKET_PIN.length);
      if (next.length === TICKET_PIN.length) {
        if (next === TICKET_PIN) {
          setUnlocked(true);
        } else {
          setPinError(true);
          setTimeout(() => setPin(''), 300);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (!open || !unlocked) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await resilientRpc('get_totem_recent_orders');
        if (error) throw error;
        const mapped = ((data || []) as any[]).map(mapOrder);
        const recent = mapped
          .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
          .slice(0, 40);
        if (cancelled) return;
        setOrders(recent);
        if (recent.length) {
          const its = await fetchTotemOrderItems(recent.map(o => o.id));
          if (!cancelled) setItems(its);
        }
      } catch (e: any) {
        toast({ title: 'Erro ao carregar pedidos', description: e?.message ?? 'Tente novamente', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, unlocked]);


  const itemsByOrder = useMemo(() => {
    const m = new Map<string, OrderItem[]>();
    items.forEach(it => {
      const arr = m.get(it.orderId) ?? [];
      arr.push(it);
      m.set(it.orderId, arr);
    });
    return m;
  }, [items]);

  const handlePrint = (order: Order) => {
    setPrintingId(order.id);
    try {
      const orderItems = itemsByOrder.get(order.id) ?? [];
      printOrderTicket({ ...order, items: orderItems } as any);
    } catch (e: any) {
      toast({ title: 'Erro ao imprimir', description: e?.message ?? '', variant: 'destructive' });
    } finally {
      setTimeout(() => setPrintingId(null), 800);
    }
  };


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-extrabold uppercase tracking-tight">Imprimir Tickets</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!unlocked ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Digite a senha</p>
            <div className="flex gap-2">
              {Array.from({ length: TICKET_PIN.length }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 ${
                    pinError ? 'border-destructive' : 'border-primary'
                  } ${i < pin.length ? (pinError ? 'bg-destructive' : 'bg-primary') : 'bg-transparent'}`}
                />
              ))}
            </div>
            {pinError && <p className="text-sm font-bold text-destructive">Senha incorreta</p>}
            <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  className="h-16 rounded-2xl bg-muted text-2xl font-black text-foreground active:scale-95 transition-transform"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => { setPinError(false); setPin(p => p.slice(0, -1)); }}
                className="h-16 rounded-2xl bg-muted/50 text-lg font-bold text-muted-foreground active:scale-95 transition-transform"
              >
                ←
              </button>
              <button
                onClick={() => handleDigit('0')}
                className="h-16 rounded-2xl bg-muted text-2xl font-black text-foreground active:scale-95 transition-transform"
              >
                0
              </button>
              <div />
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto p-4">


            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : orders.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Nenhum pedido recente.</p>
            ) : (
              <div className="space-y-2">
                {orders.map(order => {
                  const code = order.id.slice(-6).toUpperCase();
                  const date = new Date(order.createdAt as any);
                  const dateStr = date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                  const itemCount = itemsByOrder.get(order.id)?.length ?? 0;
                  return (
                    <div key={order.id} className="flex items-center justify-between gap-3 p-3 border rounded-xl hover:bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">#{code}</span>
                          <span className="text-xs uppercase px-2 py-0.5 rounded-full bg-muted">{order.status}</span>
                        </div>
                        <div className="text-sm font-semibold truncate uppercase">{order.customerName || 'CLIENTE'}</div>
                        <div className="text-xs text-muted-foreground">{dateStr} · {itemCount} {itemCount === 1 ? 'item' : 'itens'} · R$ {Number(order.total).toFixed(2)}</div>
                      </div>
                      <button
                        onClick={() => handlePrint(order)}
                        disabled={printingId === order.id}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-bold uppercase text-sm active:scale-95 disabled:opacity-50"
                      >
                        {printingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                        Imprimir
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


      </div>
    </div>
  );
}
