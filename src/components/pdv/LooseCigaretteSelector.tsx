import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Cigarette, Plus, Minus, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client-safe';
import { parseNumeric } from '@/lib/format-utils';
import { type LooseCigaretteSelection } from './loose-cigarette-utils';

interface OpenPack {
  id: string;
  product_id: string;
  product_name: string;
  pack_size: number;
  remaining_units: number;
  // Postgres `numeric` is serialized as string by supabase-js → keep both shapes
  // and always coerce with Number() before any arithmetic / .toFixed().
  unit_price: number | string;
  is_empty: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (items: LooseCigaretteSelection[]) => void;
}

export function LooseCigaretteSelector({ open, onOpenChange, onConfirm }: Props) {
  const [pending, setPending] = useState<Record<string, number>>({});
  const queryClient = useQueryClient();

  const { data: packs = [], isLoading } = useQuery({
    queryKey: ['loose-cigarette-packs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_packs');
      if (error) throw error;
      return ((data || []) as OpenPack[]).filter(p => !p.is_empty && p.remaining_units > 0);
    },
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });

  // Realtime: atualiza o seletor instantaneamente quando alguém abre/renova/vende
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('loose-cig-selector-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_packs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['loose-cigarette-packs'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, queryClient]);

  const setQty = (packId: string, qty: number, max: number) => {
    setPending(prev => {
      const clamped = Math.max(0, Math.min(qty, max));
      const next = { ...prev };
      if (clamped === 0) delete next[packId];
      else next[packId] = clamped;
      return next;
    });
  };

  const total = Object.entries(pending).reduce((sum, [packId, qty]) => {
    const p = packs.find(pp => pp.id === packId);
    return sum + (p ? parseNumeric(p.unit_price) * qty : 0);
  }, 0);

  const handleConfirm = () => {
    const items: LooseCigaretteSelection[] = Object.entries(pending)
      .map(([packId, quantity]) => {
        const p = packs.find(pp => pp.id === packId);
        if (!p) return null;
        return {
          packId,
          productName: p.product_name,
          unitPrice: parseNumeric(p.unit_price),
          quantity,
        };
      })
      .filter((x): x is LooseCigaretteSelection => x !== null && x.quantity > 0);

    if (items.length > 0) onConfirm(items);
    setPending({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setPending({}); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cigarette className="h-5 w-5 text-primary" />
            Cigarros Soltos
          </DialogTitle>
          <DialogDescription>
            Selecione a quantidade de cada marca a partir dos maços abertos.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-2">
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>
          ) : packs.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nenhum maço aberto disponível. Abra um maço no painel de Maços.
            </div>
          ) : (
            <div className="space-y-2">
              {packs.map(p => {
                const qty = pending[p.id] || 0;
                const label = p.product_name.replace(/\s*(MACO|MAÇO)\b/i, '').trim();
                const price = parseNumeric(p.unit_price);
                const noPrice = price <= 0;
                return (
                  <Card key={p.id} className={`p-3 flex items-center justify-between gap-3 ${noPrice ? 'border-destructive ring-1 ring-destructive/30' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{label}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {noPrice ? (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" /> SEM PREÇO
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            R$ {price.toFixed(2).replace('.', ',')}/un
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {p.remaining_units} disp.
                        </Badge>
                      </div>
                      {noPrice && (
                        <p className="text-[10px] text-destructive mt-1">
                          Configure o preço deste maço no Admin/Maços antes de vender.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => setQty(p.id, qty - 1, p.remaining_units)}
                        disabled={qty <= 0}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center font-bold text-sm">{qty}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => setQty(p.id, qty + 1, p.remaining_units)}
                        disabled={qty >= p.remaining_units || noPrice}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-sm">
            Total: <span className="font-bold text-primary">R$ {total.toFixed(2).replace('.', ',')}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setPending({}); onOpenChange(false); }}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={Object.keys(pending).length === 0}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar ao carrinho
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
