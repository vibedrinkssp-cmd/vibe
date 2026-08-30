import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wine, ChevronDown, ChevronUp, RefreshCw, Loader2, Trash2, Plus, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CurrencyInput } from '@/components/ui/currency-input';
import { supabase } from '@/integrations/supabase/client-safe';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { normalizeSearch } from '@/lib/text-utils';

interface OpenBottle {
  id: string;
  product_id: string;
  product_name: string;
  total_ml: number;
  ml_per_dose: number;
  total_doses: number;
  remaining_doses: number;
  is_empty: boolean;
  opened_at: string;
  notes: string | null;
  dose_price: number;
}

export function BottlesCarousel() {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allBottles = [], isLoading } = useQuery({
    queryKey: ['open-bottles-kitchen'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_bottles');
      if (error) throw error;
      return (data || []) as OpenBottle[];
    },
    refetchInterval: 30000,
  });

  const activeBottles = allBottles.filter((b) => !b.is_empty);
  const emptyBottles = allBottles.filter((b) => b.is_empty);

  const renewMutation = useMutation({
    mutationFn: async (bottle: OpenBottle) => {
      const res = await supabase.functions.invoke('verify-bottle-renew', {
        body: { bottle_id: bottle.id },
      });
      // FunctionsHttpError exposes a .context.json() yielding { success, error }
      let body: { success?: boolean; error?: string } | null = res.data ?? null;
      if (res.error) {
        try {
          const ctx = (res.error as { context?: { json?: () => Promise<unknown> } }).context;
          body = ((await ctx?.json?.()) as typeof body) ?? body;
        } catch {
          /* ignore parse errors */
        }
        if (!body) throw new Error(res.error.message || 'Erro ao renovar');
      }
      if (!body?.success) throw new Error(body?.error || 'Falha na renovação');
      // Auditoria
      await supabase.from('cash_register_audit').insert({
        action: 'bottle_renewed',
        responsible: 'Kitchen',
        notes: `Garrafa renovada: ${bottle.product_name} (era: ${bottle.remaining_doses}/${bottle.total_doses} doses)`,
      });
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      toast({ title: '🍾 Garrafa renovada com sucesso!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (bottle: OpenBottle) => {
      const { error } = await supabase.rpc('delete_open_bottle', { p_bottle_id: bottle.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      toast({ title: '🗑️ Garrafa excluída!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    },
  });

  const getLevelColor = (percentage: number) => {
    if (percentage > 60) return 'bg-green-500';
    if (percentage > 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (isLoading) {
    return (
      <div className="mb-6 p-4 bg-card/50 border border-primary/20 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Wine className="h-5 w-5 text-primary" />
          <span className="font-medium">Garrafas Abertas</span>
        </div>
        <div className="animate-pulse flex gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 w-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (activeBottles.length === 0 && emptyBottles.length === 0) {
    return (
      <div className="mb-6 p-4 bg-card/50 border border-primary/20 rounded-lg flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wine className="h-5 w-5" />
          <span>Nenhuma garrafa aberta</span>
        </div>
        <OpenBottleKitchenDialog />
      </div>
    );
  }

  const renderBottleCard = (bottle: OpenBottle, index: number) => {
    const percentage = bottle.is_empty
      ? 0
      : Math.max(0, Math.min(100, (bottle.remaining_doses / bottle.total_doses) * 100));
    const levelColor = bottle.is_empty ? 'bg-red-500' : getLevelColor(percentage);

    return (
      <Card key={bottle.id} className={`border-primary/20 h-full ${bottle.is_empty ? 'bg-red-50 dark:bg-red-950/20 border-red-300' : 'bg-background/80'}`}>
        <CardContent className="p-3 flex flex-col items-center">
          <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between w-full">
            <span>#{index + 1}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 text-destructive hover:bg-destructive/10"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                const msg = bottle.is_empty
                  ? `Excluir garrafa vazia "${bottle.product_name}"?`
                  : `⚠️ Garrafa "${bottle.product_name}" ainda tem ${bottle.remaining_doses} doses! Excluir mesmo assim?`;
                if (confirm(msg)) deleteMutation.mutate(bottle);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          <div className="relative w-8 h-16 mb-2">
            <div className="absolute inset-0 border-2 border-primary/40 rounded-b-lg rounded-t-sm bg-background/50">
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-2 border-2 border-primary/40 rounded-t-sm bg-background/50" />
              <div className={`absolute bottom-0 left-0 right-0 ${levelColor} rounded-b-md`} style={{ height: `${percentage}%` }} />
            </div>
          </div>

          <div className="text-center w-full overflow-hidden">
            <p className="text-xs font-semibold truncate" title={bottle.product_name}>
              {bottle.product_name}
            </p>
            {bottle.is_empty ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-1 h-6 text-[10px] px-2 border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
                disabled={renewMutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  renewMutation.mutate(bottle);
                }}
              >
                {renewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Renovar
              </Button>
            ) : (
              <p className="text-xs text-primary font-medium mt-1">
                {bottle.remaining_doses}/{bottle.total_doses} doses
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-6">
      <div className="p-4 bg-card/50 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex-1 flex items-center justify-between p-0 h-auto hover:bg-transparent"
            >
              <div className="flex items-center gap-2">
                <Wine className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Garrafas Abertas</span>
                <Badge variant="secondary" className="text-xs">
                  {activeBottles.length}
                </Badge>
                {emptyBottles.length > 0 && (
                  <Badge variant="outline" className="text-xs text-red-500 border-red-300">
                    {emptyBottles.length} vazia{emptyBottles.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <OpenBottleKitchenDialog compact />
        </div>

        <CollapsibleContent className="mt-3 space-y-3">
          {emptyBottles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-red-500">Garrafas a renovar</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
                {emptyBottles.map((bottle, index) => renderBottleCard(bottle, index))}
              </div>
            </div>
          )}

          {activeBottles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Em uso</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2 max-h-[46vh] overflow-y-auto pr-1">
                {activeBottles.map((bottle, index) => renderBottleCard(bottle, index))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─── Dialog: Abrir Garrafa pela Cozinha ─────────────────────────────
const LIQUID_TYPES = new Set(['destilado', 'whisky', 'gin', 'vodka', 'cachaca', 'licor', 'corote', 'vinho', 'energetico', 'espumante']);

interface LiquidProduct {
  id: string;
  name: string;
  stock: number | null;
  product_type: string | null;
}

function OpenBottleKitchenDialog({ compact = false }: { compact?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [totalMl, setTotalMl] = useState('1000');
  const [mlPerDose, setMlPerDose] = useState('50');
  const [dosePrice, setDosePrice] = useState('8');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ['kitchen-liquid-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, stock, product_type')
        .eq('is_active', true)
        .in('product_type', [...LIQUID_TYPES])
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as LiquidProduct[];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim());
    return products
      .filter(p => (p.stock ?? 0) > 0)
      .filter(p => !q || normalizeSearch(p.name).includes(q))
      .slice(0, 60);
  }, [products, search]);

  const selected = products.find(p => p.id === productId);
  const doses = parseInt(totalMl) && parseInt(mlPerDose) ? Math.floor(parseInt(totalMl) / parseInt(mlPerDose)) : 0;

  const reset = () => {
    setProductId(''); setSearch(''); setTotalMl('1000'); setMlPerDose('50'); setDosePrice('8');
  };

  const handleSubmit = async () => {
    if (!productId) return;
    setSubmitting(true);
    try {
      const { data: bottleId, error } = await supabase.rpc('open_bottle', {
        p_product_id: productId,
        p_total_ml: parseInt(totalMl),
        p_ml_per_dose: parseInt(mlPerDose),
        p_opened_by: 'Cozinha',
      });
      if (error) throw error;
      const price = parseFloat(dosePrice) || 0;
      if (price > 0 && bottleId) {
        await supabase.rpc('update_bottle_dose_price', {
          p_bottle_id: bottleId,
          p_dose_price: price,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
      queryClient.invalidateQueries({ queryKey: ['allowed-bottle-candidates-admin'] });
      toast({ title: '🍾 Garrafa aberta!' });
      setOpen(false);
      reset();
    } catch (err: any) {
      toast({ title: 'Erro ao abrir garrafa', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size={compact ? 'sm' : 'default'} className="gap-1 shrink-0">
          <Plus className="h-4 w-4" />
          {compact ? 'Abrir' : 'Abrir Garrafa'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wine className="h-5 w-5 text-primary" /> Abrir Nova Garrafa
          </DialogTitle>
          <DialogDescription>Selecione o produto líquido e informe o volume.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 flex-1 overflow-y-auto">
          {!selected ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar vodka, whisky, gin..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" autoFocus />
              </div>
              <ScrollArea className="max-h-[220px] border rounded-lg">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{search ? 'Nenhum produto encontrado' : 'Busque um produto líquido'}</p>
                ) : (
                  <div className="p-1 space-y-0.5">
                    {filtered.map(p => (
                      <button key={p.id} onClick={() => { setProductId(p.id); setSearch(''); }} className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left">
                        <Wine className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground">Est: {p.stock}</span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2.5 border border-primary/50 bg-primary/5 rounded-lg">
              <Wine className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium flex-1 truncate">{selected.name}</span>
              <Badge variant="secondary" className="text-xs">Est: {selected.stock}</Badge>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setProductId('')}>Trocar</Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Volume Total (ml)</Label>
              <Input type="number" value={totalMl} onChange={e => setTotalMl(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ML por Dose</Label>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant={mlPerDose === '50' ? 'default' : 'outline'} className="flex-1" onClick={() => setMlPerDose('50')}>50</Button>
                <Button type="button" size="sm" variant={mlPerDose === '100' ? 'default' : 'outline'} className="flex-1" onClick={() => setMlPerDose('100')}>100</Button>
                <Button type="button" size="sm" variant={mlPerDose === '400' ? 'default' : 'outline'} className="flex-1" onClick={() => setMlPerDose('400')}>400</Button>
              </div>
            </div>
          </div>

          {doses > 0 && (
            <div className="p-2 bg-primary/10 rounded text-center text-sm">
              Total: <span className="font-bold text-primary">{doses}</span> doses
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Preço por Dose</Label>
            <CurrencyInput value={dosePrice} onChange={(v) => setDosePrice(String(v))} step={0.5} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!productId || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wine className="h-4 w-4 mr-2" />}
            Abrir Garrafa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
