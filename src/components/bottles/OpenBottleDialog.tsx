import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wine, Plus, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client-safe';
import { useToast } from '@/hooks/use-toast';
import { normalizeSearch } from '@/lib/text-utils';

// Tipos de produtos líquidos que podem ser abertos como garrafa
const LIQUID_TYPES = new Set(['destilado', 'whisky', 'gin', 'vodka', 'cachaca', 'licor', 'corote', 'vinho', 'energetico', 'cerveja', 'suco', 'xarope', 'agua', 'drink', 'espumante']);

const LIQUID_KEYWORDS = [
  // Categorias genéricas
  'vodka', 'whisky', 'whiskey', 'gin', 'rum', 'cachaça', 'cachaca', 'licor', 'corote', 'vinho',
  'energético', 'energetico', 'cerveja', 'suco', 'xarope', 'tequila', 'absinto', 'destilado', 'bourbon',
  'espumante', 'champagne', 'chandon', 'prosecco',
  // Marcas de destilados
  'jack daniel', 'absolut', 'smirnoff', 'ballantine', 'buchanan', 'black label', 'red label',
  'johnnie walker', 'chivas', 'jameson', 'maker\'s mark', 'wild turkey', 'jim beam',
  'grey goose', 'belvedere', 'ketel one', 'ciroc', 'skyy', 'stolichnaya',
  'beefeater', 'bombay', 'tanqueray', 'hendrick', 'gordon', 'monkey 47',
  'bacardi', 'havana club', 'captain morgan', 'malibu',
  'jose cuervo', 'patron', 'olmeca', 'don julio',
  'amarula', 'baileys', 'campari', 'aperol', 'vermouth', 'martini', 'jagermeister', 'jägermeister',
  'sake', 'saquê', 'conhaque', 'brandy', 'cointreau', 'drambuie', 'frangelico', 'grand marnier',
  'kahlua', 'midori', 'sambuca', 'fernet', 'underberg',
  // Energéticos / mixers
  'red bull', 'monster', 'baly', 'burn', 'tônica', 'tonica', 'schweppes', 'citrus',
  'agua de coco', 'soda',
  // Marcas brasileiras
  'ice', 'askov', 'master black', 'natov', 'orloff', 'weber haus',
  'cantina', 'sangria', 'catuaba', 'jurubeba',
  // Tamanhos comuns de líquidos (ml/L)
  '750ml', '1l', '1000ml', '700ml', '275ml', '269ml', '350ml', '473ml', '330ml', '2l', '2 litros',
];

function isLiquidProduct(product: { name: string; product_type?: string | null }): boolean {
  if (product.product_type && LIQUID_TYPES.has(product.product_type.toLowerCase())) return true;
  const nameLower = product.name.toLowerCase();
  return LIQUID_KEYWORDS.some(kw => nameLower.includes(kw));
}

// Extrai o volume (ml) do nome do produto: "SMIRNOFF 998ML" -> 998, "VODKA 1L" -> 1000, "GIN 1,5 LITROS" -> 1500
export function parseVolumeMl(name: string): number | null {
  const ml = name.match(/(\d{2,4})\s*ml\b/i);
  if (ml) return parseInt(ml[1], 10);
  const liters = name.match(/(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|litros?)\b/i);
  if (liters) return Math.round(parseFloat(liters[1].replace(',', '.')) * 1000);
  return null;
}

const DEFAULT_VOLUME_ML = 1000;
const DEFAULT_DOSE_PRICE = 8;
const DOSE_SIZES_ML = [50, 100, 400] as const;
const SEARCH_RESULTS_LIMIT = 200;

// Telas que mostram garrafas abertas precisam recarregar quando uma nova é aberta
const BOTTLE_QUERY_KEYS = ['open-bottles', 'open-bottles-kitchen', 'open-bottles-prep', 'assembly-bottles', 'copao-available', 'admin-products', 'allowed-bottle-candidates-admin'];

interface BottleProduct {
  id: string;
  name: string;
  stock: number | null;
  product_type: string | null;
}

interface LastBottleConfig {
  product_id: string;
  ml_per_dose: number;
  dose_price: number;
}

interface OpenBottleInput {
  productId: string;
  productName: string;
  totalMl: number;
  mlPerDose: number;
  dosePrice: number;
  // Garrafa que já estava aberta no balcão e nunca esteve no estoque do sistema: não desconta estoque.
  alreadyOpen: boolean;
  stockBefore: number;
}

function useOpenBottleMutation(openedBy: string, onDone: () => void) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ productId, productName, totalMl, mlPerDose, dosePrice, alreadyOpen, stockBefore }: OpenBottleInput) => {
      let bottleId: string | null = null;
      if (alreadyOpen) {
        // Insere direto (staff tem permissão na tabela) para não passar pela baixa de estoque do open_bottle
        const doses = Math.floor(totalMl / mlPerDose);
        const { data, error } = await supabase
          .from('open_bottles')
          .insert({
            product_id: productId,
            product_name: productName,
            total_ml: totalMl,
            ml_per_dose: mlPerDose,
            total_doses: doses,
            remaining_doses: doses,
            opened_by: openedBy,
            notes: 'Já aberta antes do sistema (sem baixa de estoque)',
          })
          .select('id')
          .single();
        if (error) throw error;
        bottleId = data?.id ?? null;
      } else {
        // open_bottle já desconta 1 unidade do estoque
        const { data, error } = await supabase.rpc('open_bottle', {
          p_product_id: productId,
          p_total_ml: totalMl,
          p_ml_per_dose: mlPerDose,
          p_opened_by: openedBy,
        });
        if (error) throw error;
        bottleId = data;
        // Registra na garrafa que o estoque foi descontado (best-effort: a baixa já foi feita pela RPC)
        if (bottleId) {
          await supabase
            .from('open_bottles')
            .update({ notes: `Descontou 1 un do estoque (${stockBefore} → ${Math.max(stockBefore - 1, 0)})` })
            .eq('id', bottleId);
        }
      }
      if (!bottleId) throw new Error('Falha ao abrir garrafa: ID não retornado');
      if (dosePrice > 0) {
        const { error: priceError } = await supabase.rpc('update_bottle_dose_price', {
          p_bottle_id: bottleId,
          p_dose_price: dosePrice,
        });
        if (priceError) throw new Error(`Garrafa aberta, mas falha ao salvar preço: ${priceError.message}`);
      }
    },
    onSuccess: (_data, { alreadyOpen, stockBefore }) => {
      BOTTLE_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      toast({
        title: '🍾 Garrafa aberta!',
        description: alreadyOpen
          ? 'Estoque não foi alterado.'
          : `Estoque descontado: ${stockBefore} → ${Math.max(stockBefore - 1, 0)}`,
      });
      onDone();
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao abrir garrafa', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Abrir garrafa: escolhe o produto e confirma. Volume, dose e preço já vêm preenchidos.
 * A garrafa sai do estoque e fica aberta no controle de dose. Usado na cozinha e no gerente.
 */
export function OpenBottleDialog({ openedBy, compact = false }: { openedBy: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [totalMl, setTotalMl] = useState(String(DEFAULT_VOLUME_ML));
  const [mlPerDose, setMlPerDose] = useState<number>(DOSE_SIZES_ML[0]);
  const [dosePrice, setDosePrice] = useState(String(DEFAULT_DOSE_PRICE));
  const [alreadyOpen, setAlreadyOpen] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['open-bottle-dialog-products', alreadyOpen],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('id, name, stock, product_type')
        .eq('is_active', true);
      // Garrafa já aberta fora do estoque: o produto pode estar com estoque 0
      if (!alreadyOpen) query = query.gt('stock', 0);
      const { data, error } = await query.order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as BottleProduct[];
    },
    enabled: open,
  });

  const { data: bottles = [] } = useQuery({
    queryKey: ['open-bottles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_bottles');
      if (error) throw error;
      return (data || []) as LastBottleConfig[];
    },
    enabled: open,
  });

  const reset = () => {
    setProductId('');
    setSearch('');
    setTotalMl(String(DEFAULT_VOLUME_ML));
    setMlPerDose(DOSE_SIZES_ML[0]);
    setDosePrice(String(DEFAULT_DOSE_PRICE));
    setAlreadyOpen(false);
  };

  const openMutation = useOpenBottleMutation(openedBy, () => {
    setOpen(false);
    reset();
  });

  // Sem busca: mostra só líquidos. Digitando: procura em tudo que tem estoque (product_type vem vazio no cadastro).
  const results = useMemo(() => {
    const q = normalizeSearch(search.trim());
    const pool = q ? products.filter(p => normalizeSearch(p.name).includes(q)) : products.filter(isLiquidProduct);
    return pool.slice(0, SEARCH_RESULTS_LIMIT);
  }, [products, search]);

  const selected = products.find(p => p.id === productId);

  const selectProduct = (p: BottleProduct) => {
    setProductId(p.id);
    setSearch('');
    setTotalMl(String(parseVolumeMl(p.name) ?? DEFAULT_VOLUME_ML));
    // Reaproveita a configuração da última garrafa aberta deste produto
    const last = bottles.find(b => b.product_id === p.id);
    if (last) {
      setMlPerDose(last.ml_per_dose);
      if (last.dose_price > 0) setDosePrice(String(last.dose_price));
    }
  };

  const totalMlNum = parseInt(totalMl, 10) || 0;
  const doses = Math.floor(totalMlNum / mlPerDose);

  const handleSubmit = () => {
    if (!selected || doses <= 0) return;
    openMutation.mutate({
      productId: selected.id,
      productName: selected.name,
      alreadyOpen,
      stockBefore: selected.stock ?? 0,
      totalMl: totalMlNum,
      mlPerDose,
      dosePrice: parseFloat(dosePrice) || 0,
    });
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
          <DialogDescription>
            Escolha a garrafa. Ela sai do estoque e fica aberta no controle de dose.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 overflow-y-auto">
          <label className="flex items-start gap-2 p-2.5 border rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={alreadyOpen}
              onChange={(e) => setAlreadyOpen(e.target.checked)}
              className="mt-0.5 rounded border-primary"
            />
            <span className="text-sm">
              Garrafa que já estava aberta
              <span className="block text-xs text-muted-foreground">Não desconta do estoque. Informe só quanto ainda resta nela.</span>
            </span>
          </label>

          {selected ? (
            <div className="flex items-center gap-2 p-2.5 border border-primary/50 bg-primary/5 rounded-lg">
              <Wine className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium flex-1 truncate">{selected.name}</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setProductId('')}>
                Trocar
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar vodka, whisky, gin, energético..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <div className="max-h-[260px] overflow-y-auto overscroll-contain border rounded-lg">
                {results.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? (alreadyOpen ? 'Nenhum produto com esse nome' : 'Nenhum produto em estoque com esse nome') : 'Busque um produto'}
                  </p>
                ) : (
                  <div className="p-1 space-y-0.5">
                    {results.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectProduct(p)}
                        className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left transition-colors"
                      >
                        <Wine className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground">Est: {p.stock}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {results.length === SEARCH_RESULTS_LIMIT && (
                <p className="text-xs text-muted-foreground text-center">
                  Mostrando os primeiros {SEARCH_RESULTS_LIMIT}. Digite para refinar a busca.
                </p>
              )}
            </>
          )}

          {selected && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{alreadyOpen ? 'Quanto resta (ml)' : 'Volume (ml)'}</Label>
                  <Input type="number" inputMode="numeric" value={totalMl} onChange={(e) => setTotalMl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tamanho da dose</Label>
                  <div className="flex gap-2">
                    {DOSE_SIZES_ML.map(size => (
                      <Button
                        key={size}
                        type="button"
                        variant={mlPerDose === size ? 'default' : 'outline'}
                        className="flex-1 font-bold px-0"
                        onClick={() => setMlPerDose(size)}
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preço por dose</Label>
                <CurrencyInput value={dosePrice} onChange={(v) => setDosePrice(String(v))} step={0.5} placeholder="8,00" />
              </div>

              <div className="p-3 bg-primary/10 rounded-lg text-center space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Rende </span>
                  <span className="text-xl font-bold text-primary">{doses}</span>
                  <span className="text-muted-foreground"> doses</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {alreadyOpen
                    ? `Estoque continua ${selected.stock ?? 0} (não desconta)`
                    : `Estoque: ${selected.stock ?? 0} → ${Math.max((selected.stock ?? 0) - 1, 0)}`}
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={openMutation.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!selected || doses <= 0 || openMutation.isPending}>
            {openMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wine className="h-4 w-4 mr-2" />}
            Abrir Garrafa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
