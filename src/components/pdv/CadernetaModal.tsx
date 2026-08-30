import { useState, useEffect, useMemo } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BookOpen, User, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client-safe';
import { OperationPinModal } from '@/components/auth/OperationPinModal';
import { prepareCadernetaOrder } from './caderneta-order-utils';
import { parseLooseCigarettePackId, stripLooseCigaretteMarker } from './loose-cigarette-utils';
import { parseNumeric } from '@/lib/format-utils';
import type { Product, CustomDrink } from '@/shared/schema';

interface CartItem {
  product: Product;
  quantity: number;
}

interface CadernetaCustomer {
  id: string;
  name: string;
  whatsapp: string | null;
  is_active: boolean | null;
  notes: string | null;
}

interface CadernetaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  customDrinks?: CustomDrink[];
  total: number;
  onSuccess: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function CadernetaModal({ open, onOpenChange, cart, customDrinks = [], total, onSuccess }: CadernetaModalProps) {
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pinOpen, setPinOpen] = useState(false);

  const preparedOrder = useMemo(
    () => prepareCadernetaOrder({ cart, customDrinks, total }),
    [cart, customDrinks, total]
  );

  useEffect(() => {
    if (open) {
      setSelectedCustomer('');
      setSearchTerm('');
    }
  }, [open]);

  // Use SECURITY DEFINER RPC directly — no edge function, no session token needed
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['caderneta-customers-pdv'],
    queryFn: async (): Promise<CadernetaCustomer[]> => {
      // Primary: SECURITY DEFINER RPC (bypasses RLS, works even with flaky auth)
      try {
        const { data, error } = await supabase.rpc('list_caderneta_customers_staff', {
          p_active_only: true,
        });
        if (!error && data) {
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsed?.customers && Array.isArray(parsed.customers)) {
            return parsed.customers as CadernetaCustomer[];
          }
        }
        if (error) console.warn('[Caderneta] RPC failed:', error.message);
      } catch (err) {
        console.warn('[Caderneta] RPC exception:', err);
      }

      // Fallback: direct query (works if Supabase Auth session is valid + RLS passes)
      const { data, error } = await (supabase.from('caderneta_customers') as any)
        .select('id, name, whatsapp, is_active, notes')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as CadernetaCustomer[];
    },
    enabled: open,
  });

  const filteredCustomers = customers.filter(c =>
    searchIncludes(c.name, searchTerm)
  );

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // ATOMIC: all items in a single transaction (rollback if any fails)
      const looseCigConsumptions: Array<{ packId: string; quantity: number }> = [];
      const itemsPayload = preparedOrder.items.map(item => {
        const packId = parseLooseCigarettePackId(item.productName);
        if (packId) looseCigConsumptions.push({ packId, quantity: item.quantity });
        const cleanName = packId ? stripLooseCigaretteMarker(item.productName) : item.productName;
        return {
          product_id: packId ? null : (item.productId || null),
          product_name: cleanName,
          quantity: item.quantity,
          unit_price: parseNumeric(item.unitPrice),
          total_price: parseNumeric(item.totalPrice),
          notes: item.notes || null,
        };
      });
      const { error } = await supabase.rpc('create_caderneta_entries_batch', {
        p_customer_id: selectedCustomer,
        p_items: itemsPayload,
        p_salesperson: null,
      } as any);
      if (error) throw new Error(error.message);

      // Decrement open_packs for each loose cigarette item (no order_id in caderneta flow)
      for (const lc of looseCigConsumptions) {
        try {
          const { error: rpcErr } = await supabase.rpc('sell_loose_cigarette', {
            p_pack_id: lc.packId,
            p_quantity: lc.quantity,
          });
          if (rpcErr) console.error('[Caderneta] sell_loose_cigarette failed', lc, rpcErr);
        } catch (err) {
          console.error('[Caderneta] sell_loose_cigarette exception', lc, err);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      queryClient.invalidateQueries({ queryKey: ['caderneta-customers-pdv'] });
      toast({ title: '📒 Lançamento na caderneta registrado!' });
      onOpenChange(false);
      onSuccess();
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao registrar na caderneta',
        description: error instanceof Error ? error.message : 'Falha inesperada ao registrar o fiado.',
        variant: 'destructive'
      });
    },
  });

  const handleConfirm = () => {
    if (!selectedCustomer) {
      toast({ title: 'Selecione um cliente', variant: 'destructive' });
      return;
    }
    if (preparedOrder.items.length === 0) {
      toast({ title: 'Carrinho vazio', variant: 'destructive' });
      return;
    }
    setPinOpen(true);
  };

  const handlePinValidated = () => {
    setPinOpen(false);
    confirmMutation.mutate();
  };


  const customerName = customers.find(c => c.id === selectedCustomer)?.name;
  const totalItems = preparedOrder.summary.totalItems;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md mx-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-violet-400" />
            Caderneta (Fiado)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-center py-3 bg-secondary rounded-lg">
            <p className="text-muted-foreground text-xs">Total a lançar</p>
            <p className="text-3xl font-bold text-violet-400">{formatCurrency(preparedOrder.summary.total)}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalItems} item(s)</p>
            {(preparedOrder.summary.discount > 0 || preparedOrder.summary.subtotal !== preparedOrder.summary.total) && (
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <p>Subtotal original: {formatCurrency(preparedOrder.summary.subtotal)}</p>
                {preparedOrder.summary.discount > 0 && (
                  <p>Desconto aplicado: {formatCurrency(preparedOrder.summary.discount)}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Selecionar cliente cadastrado</label>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : customers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhum cliente cadastrado. Cadastre clientes na aba Caderneta do painel administrativo.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-36 overflow-auto border rounded-lg divide-y">
                  {filteredCustomers.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhum cliente encontrado</p>
                  ) : (
                    filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                          selectedCustomer === c.id
                            ? 'bg-violet-500/20 text-violet-300 font-medium'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedCustomer(c.id)}
                      >
                        <User className="h-3 w-3 flex-shrink-0" />
                        {c.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {preparedOrder.items.length > 0 && (
            <div className="max-h-32 overflow-auto border rounded-lg p-2 space-y-1">
              {preparedOrder.items.map((item, index) => (
                <div key={`${item.productId ?? 'custom'}-${index}`} className="space-y-1 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
                  <div className="flex justify-between text-xs gap-2">
                    <span className="flex-1 break-words">{item.quantity}x {item.productName}</span>
                    <span className="font-medium ml-2 whitespace-nowrap">{formatCurrency(item.totalPrice)}</span>
                  </div>
                  {item.notes && (
                    <p className="text-[11px] text-muted-foreground whitespace-pre-line break-words">{item.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full py-5 bg-violet-600 hover:bg-violet-700"
            disabled={!selectedCustomer || preparedOrder.items.length === 0 || confirmMutation.isPending}
            onClick={handleConfirm}
          >
            {confirmMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <BookOpen className="h-4 w-4 mr-2" />
            )}
            {confirmMutation.isPending
              ? 'Registrando...'
              : `Lançar para ${customerName || '...'}`}
          </Button>
        </div>
      </DialogContent>
      <OperationPinModal
        open={pinOpen}
        operation="registrar_fiado"
        title="PIN para registrar fiado"
        description="Informe o PIN de 4 dígitos autorizado para lançar vendas na caderneta."
        onValidated={handlePinValidated}
        onCancel={() => setPinOpen(false)}
      />
    </Dialog>
  );
}
