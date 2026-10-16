import { useState, useEffect } from 'react';
import { Wine, Plus, Minus, Droplets, AlertCircle, Package, Trash2, Check, Search, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminProducts } from '../use-admin-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '../shared';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OpenBottle {
  id: string;
  product_id: string;
  product_name: string;
  total_ml: number;
  ml_per_dose: number;
  total_doses: number;
  remaining_doses: number;
  opened_at: string;
  opened_by: string | null;
  is_empty: boolean;
  emptied_at: string | null;
  notes: string | null;
  dose_price: number;
}

// Hook para buscar garrafas abertas
function useOpenBottles() {
  return useQuery({
    queryKey: ['open-bottles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_bottles');
      if (error) throw error;
      return (data || []) as OpenBottle[];
    },
    refetchInterval: 30000,
  });
}

// Hook para abrir garrafa (com preço da dose atômico)
function useOpenBottle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      productId: string;
      totalMl: number;
      mlPerDose: number;
      dosePrice: number;
      openedBy?: string;
      notes?: string;
    }) => {
      // 1. Abre a garrafa e recebe o ID determinístico
      const { data: bottleId, error } = await supabase.rpc('open_bottle', {
        p_product_id: params.productId,
        p_total_ml: params.totalMl,
        p_ml_per_dose: params.mlPerDose,
        p_opened_by: params.openedBy ?? undefined,
        p_notes: params.notes ?? undefined,
      });
      if (error) throw error;
      if (!bottleId) throw new Error('Falha ao abrir garrafa: ID não retornado');

      // 2. Aplica o preço da dose imediatamente no ID retornado (sem race condition)
      if (params.dosePrice > 0) {
        const { error: priceError } = await supabase.rpc('update_bottle_dose_price', {
          p_bottle_id: bottleId,
          p_dose_price: params.dosePrice,
        });
        if (priceError) {
          console.error('Erro ao salvar preço da dose:', priceError);
          throw new Error(`Garrafa aberta, mas falha ao salvar preço: ${priceError.message}`);
        }
      }

      return bottleId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-bottles'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
      queryClient.invalidateQueries({ queryKey: ['assembly-bottles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: '🍾 Garrafa aberta com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao abrir garrafa', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook centralizado para atualizar preço da dose
function useUpdateDosePrice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { bottleId: string; price: number }) => {
      const { error } = await supabase.rpc('update_bottle_dose_price', {
        p_bottle_id: params.bottleId,
        p_dose_price: params.price,
      });
      if (error) throw error;
      return params.price;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-bottles'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
      queryClient.invalidateQueries({ queryKey: ['assembly-bottles'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar preço', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook para usar dose
function useUseDose() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { bottleId: string; doses: number }) => {
      const { data, error } = await supabase.rpc('use_bottle_dose', {
        p_bottle_id: params.bottleId,
        p_doses: params.doses,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (remaining) => {
      queryClient.invalidateQueries({ queryKey: ['open-bottles'] });
      if (remaining === 0) {
        toast({ title: '🍾 Garrafa vazia!', description: 'A garrafa foi esvaziada.' });
      } else {
        toast({ title: '✓ Dose utilizada' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao usar dose', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook para deletar garrafa
function useDeleteBottle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (bottleId: string) => {
      // Use RPC function to bypass RLS
      const { error } = await supabase.rpc('delete_open_bottle', { p_bottle_id: bottleId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-bottles'] });
      toast({ title: '🗑️ Garrafa removida' });
    },
    onError: (error: Error) => {
      console.error('Error deleting bottle:', error);
      toast({ title: 'Erro ao remover garrafa', description: error.message, variant: 'destructive' });
    },
  });
}

const LOW_BOTTLE_PERCENT = 20;
const STALE_BOTTLE_DAYS = 3;

// Componente visual da garrafa
function BottleLevel({ remaining, total, isEmpty }: { remaining: number; total: number; isEmpty: boolean }) {
  const percentage = total > 0 ? (remaining / total) * 100 : 0;
  
  // Cores baseadas no nível
  const getColor = () => {
    if (isEmpty || percentage === 0) return 'bg-muted';
    if (percentage <= 20) return 'bg-red-500';
    if (percentage <= 50) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="relative w-16 h-32 mx-auto">
      {/* Gargalo da garrafa */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-amber-800 rounded-t-sm" />
      
      {/* Corpo da garrafa */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-28 bg-card border-2 border-border rounded-b-lg overflow-hidden">
        {/* Líquido */}
        <div 
          className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${getColor()}`}
          style={{ height: `${percentage}%` }}
        />
        
        {/* Reflexo */}
        <div className="absolute top-0 left-1 w-1 h-full bg-white/20 rounded-full" />
      </div>
      
      {/* Indicador de vazio */}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}

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
function parseVolumeMl(name: string): number | null {
  const ml = name.match(/(\d{2,4})\s*ml\b/i);
  if (ml) return parseInt(ml[1], 10);
  const liters = name.match(/(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|litros?)\b/i);
  if (liters) return Math.round(parseFloat(liters[1].replace(',', '.')) * 1000);
  return null;
}

const DEFAULT_VOLUME_ML = 1000;
const DEFAULT_DOSE_PRICE = 8;
const DOSE_SIZES_ML = [50, 100] as const;

type OpenBottleProduct = { id: string; name: string; stock: number | null; product_type?: string | null };
type OpenBottleParams = { productId: string; totalMl: number; mlPerDose: number; dosePrice: number };

// Modal para abrir nova garrafa: escolhe o produto e confirma. Volume e preço já vêm preenchidos.
function OpenBottleDialog({
  products,
  bottles,
  onOpen,
}: {
  products: OpenBottleProduct[];
  bottles: OpenBottle[];
  onOpen: (params: OpenBottleParams) => void;
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [totalMl, setTotalMl] = useState(String(DEFAULT_VOLUME_ML));
  const [mlPerDose, setMlPerDose] = useState<number>(DOSE_SIZES_ML[0]);
  const [dosePrice, setDosePrice] = useState(String(DEFAULT_DOSE_PRICE));
  const [search, setSearch] = useState('');

  const selectedProduct = products.find(p => p.id === productId);

  const reset = () => {
    setProductId('');
    setTotalMl(String(DEFAULT_VOLUME_ML));
    setMlPerDose(DOSE_SIZES_ML[0]);
    setDosePrice(String(DEFAULT_DOSE_PRICE));
    setSearch('');
  };

  const selectProduct = (p: OpenBottleProduct) => {
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
  const doses = totalMlNum > 0 ? Math.floor(totalMlNum / mlPerDose) : 0;
  const canSubmit = !!selectedProduct && doses > 0;

  const handleSubmit = () => {
    if (!selectedProduct || doses <= 0) return;
    onOpen({
      productId: selectedProduct.id,
      totalMl: totalMlNum,
      mlPerDose,
      dosePrice: parseFloat(dosePrice) || 0,
    });
    setOpen(false);
    reset();
  };

  const liquidProducts = products
    .filter(p => (p.stock ?? 0) > 0 && isLiquidProduct(p))
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Abrir Garrafa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wine className="h-5 w-5 text-primary" />
            Abrir Nova Garrafa
          </DialogTitle>
          <DialogDescription>
            Escolha a garrafa. Ela sai do estoque e fica aberta no controle de dose.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 overflow-y-auto">
          {selectedProduct ? (
            <div className="flex items-center gap-2 p-2.5 border border-primary/50 bg-primary/5 rounded-lg">
              <Wine className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm font-medium flex-1 truncate">{selectedProduct.name}</span>
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
              <ScrollArea className="max-h-[260px] border rounded-lg">
                {liquidProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? 'Nenhum produto líquido em estoque' : 'Busque um produto líquido'}
                  </p>
                ) : (
                  <div className="p-1 space-y-0.5">
                    {liquidProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectProduct(p)}
                        className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left transition-colors"
                      >
                        <Wine className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground">Est: {p.stock}</span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}

          {selectedProduct && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Volume (ml)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={totalMl}
                    onChange={(e) => setTotalMl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tamanho da dose</Label>
                  <div className="flex gap-2">
                    {DOSE_SIZES_ML.map(size => (
                      <Button
                        key={size}
                        type="button"
                        variant={mlPerDose === size ? 'default' : 'outline'}
                        className="flex-1 font-bold"
                        onClick={() => setMlPerDose(size)}
                      >
                        {size}ml
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preço por dose</Label>
                <CurrencyInput
                  value={dosePrice}
                  onChange={(v) => setDosePrice(String(v))}
                  step={0.5}
                  placeholder="8,00"
                />
              </div>

              <div className="p-3 bg-primary/10 rounded-lg text-center space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Rende </span>
                  <span className="text-xl font-bold text-primary">{doses}</span>
                  <span className="text-muted-foreground"> doses</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Estoque: {selectedProduct.stock ?? 0} → {Math.max((selectedProduct.stock ?? 0) - 1, 0)}
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            <Wine className="h-4 w-4 mr-2" />
            Abrir Garrafa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Card de garrafa individual
function BottleCard({ 
  bottle, 
  onUseDose, 
  onDelete,
  onUpdatePrice,
  onEditStock,
  isLoading,
  readOnly = false,
}: { 
  bottle: OpenBottle;
  onUseDose: (doses: number) => void;
  onDelete: () => void;
  onUpdatePrice: (price: number) => void;
  onEditStock?: (remainingDoses: number, totalMl: number, mlPerDose: number) => void;
  isLoading: boolean;
  readOnly?: boolean;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceValue, setPriceValue] = useState(String(bottle.dose_price || 0));
  const [editStockOpen, setEditStockOpen] = useState(false);
  const [editDoses, setEditDoses] = useState(String(bottle.remaining_doses));
  const [editTotalMl, setEditTotalMl] = useState(String(bottle.total_ml));
  const [editMlPerDose, setEditMlPerDose] = useState(String(bottle.ml_per_dose));
  const percentage = bottle.total_doses > 0 ? (bottle.remaining_doses / bottle.total_doses) * 100 : 0;
  const remainingMl = bottle.remaining_doses * bottle.ml_per_dose;
  const openDays = Math.floor((Date.now() - new Date(bottle.opened_at).getTime()) / 86_400_000);
  const isLow = !bottle.is_empty && percentage <= LOW_BOTTLE_PERCENT;

  // Sincroniza valor exibido quando garrafa muda externamente (e usuário não está editando)
  useEffect(() => {
    if (!editingPrice) {
      setPriceValue(String(bottle.dose_price || 0));
    }
  }, [bottle.dose_price, editingPrice]);

  const handleSaveStock = () => {
    const doses = parseInt(editDoses) || 0;
    const totalMl = parseInt(editTotalMl) || bottle.total_ml;
    const mlPerDose = parseInt(editMlPerDose) || bottle.ml_per_dose;
    onEditStock?.(doses, totalMl, mlPerDose);
    setEditStockOpen(false);
  };

  return (
    <Card className={`relative overflow-hidden transition-all ${bottle.is_empty ? 'opacity-60 border-destructive/30' : 'border-primary/20'}`}>
      {(bottle.is_empty || isLow) && (
        <div className="absolute top-2 right-2">
          <Badge variant="destructive" className="text-xs">{bottle.is_empty ? 'VAZIA' : 'ACABANDO'}</Badge>
        </div>
      )}
      
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium truncate">{bottle.product_name}</CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <BottleLevel 
          remaining={bottle.remaining_doses} 
          total={bottle.total_doses} 
          isEmpty={bottle.is_empty}
        />

        <div className="space-y-2">
          <Progress value={percentage} className="h-2" />
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{bottle.remaining_doses} / {bottle.total_doses} doses</span>
            <span>{remainingMl} ml</span>
          </div>
        </div>

        {/* Dose Price Editor — explicit save (Confirm/Cancel/Enter/Esc) */}
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Preço/dose:</span>
            {!readOnly && editingPrice ? (
              <div className="flex items-center gap-1 flex-1 justify-end">
                <CurrencyInput
                  value={priceValue}
                  onChange={(v) => setPriceValue(String(v))}
                  step={0.50}
                  size="sm"
                  className="w-24"
                  showPrefix={false}
                  data-testid={`bottle-price-input-${bottle.id}`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                  title="Confirmar (Enter)"
                  onClick={() => {
                    const parsed = parseFloat(priceValue);
                    const safe = isNaN(parsed) ? 0 : Math.max(0, parsed);
                    onUpdatePrice(safe);
                    setPriceValue(String(safe));
                    setEditingPrice(false);
                  }}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10"
                  title="Cancelar (Esc)"
                  onClick={() => {
                    setPriceValue(String(bottle.dose_price || 0));
                    setEditingPrice(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              readOnly ? (
                <span className="text-sm font-bold text-primary">
                  {bottle.dose_price > 0 ? formatCurrency(bottle.dose_price) : '—'}
                </span>
              ) : (
                <button
                  onClick={() => {
                    setPriceValue(String(bottle.dose_price || 0));
                    setEditingPrice(true);
                  }}
                  className="text-sm font-bold text-primary hover:underline inline-flex items-center gap-1"
                  title="Clique para editar"
                >
                  {bottle.dose_price > 0 ? formatCurrency(bottle.dose_price) : 'Definir'}
                  <Pencil className="h-3 w-3 opacity-60" />
                </button>
              )
            )}
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Volume: {bottle.total_ml}ml ({bottle.ml_per_dose}ml/dose)</p>
          <p className={openDays >= STALE_BOTTLE_DAYS && !bottle.is_empty ? 'text-amber-500 font-medium' : undefined}>
            Aberta {openDays === 0 ? 'hoje' : `há ${openDays} dia${openDays > 1 ? 's' : ''}`}
            {bottle.opened_by ? ` · ${bottle.opened_by}` : ''}
          </p>
        </div>

        {!readOnly && !bottle.is_empty && (
          <div className="grid grid-cols-3 gap-1.5">
            <Button size="sm" className="font-bold" disabled={isLoading} onClick={() => onUseDose(1)}>
              −1 dose
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="font-bold"
              disabled={isLoading || bottle.remaining_doses < 2}
              onClick={() => onUseDose(2)}
            >
              −2
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={isLoading}
              onClick={() => onUseDose(bottle.remaining_doses)}
              title="Marcar a garrafa como vazia"
            >
              Acabou
            </Button>
          </div>
        )}

        {!readOnly && onEditStock && (
          <Dialog open={editStockOpen} onOpenChange={(o) => {
            setEditStockOpen(o);
            if (o) {
              setEditDoses(String(bottle.remaining_doses));
              setEditTotalMl(String(bottle.total_ml));
              setEditMlPerDose(String(bottle.ml_per_dose));
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="w-full gap-1">
                <Pencil className="h-3 w-3" />
                Retificar Estoque
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-base">Retificar: {bottle.product_name}</DialogTitle>
                <DialogDescription>Ajuste doses restantes e volume da garrafa.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Doses Restantes</Label>
                  <Input type="number" value={editDoses} onChange={e => setEditDoses(e.target.value)} min={0} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Volume Total (ml)</Label>
                    <Input type="number" value={editTotalMl} onChange={e => setEditTotalMl(e.target.value)} min={1} />
                  </div>
                  <div className="space-y-2">
                    <Label>ML por Dose</Label>
                    <Input type="number" value={editMlPerDose} onChange={e => setEditMlPerDose(e.target.value)} min={1} />
                  </div>
                </div>
                {parseInt(editTotalMl) > 0 && parseInt(editMlPerDose) > 0 && (
                  <div className="p-2 bg-muted rounded text-center text-sm">
                    Total calculado: <strong>{Math.floor(parseInt(editTotalMl) / parseInt(editMlPerDose))}</strong> doses
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditStockOpen(false)}>Cancelar</Button>
                <Button onClick={handleSaveStock}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {!readOnly && (
          <Button 
            size="sm" 
            variant={bottle.is_empty ? 'destructive' : 'outline'}
            className="w-full"
            onClick={onDelete}
            disabled={isLoading}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            {bottle.is_empty ? 'Remover Garrafa' : 'Excluir Garrafa'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function BottlesTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: products = [], isLoading: productsLoading } = useAdminProducts();
  const { data: bottles = [], isLoading: bottlesLoading } = useOpenBottles();
  const openBottleMutation = useOpenBottle();
  const useDoseMutation = useUseDose();
  const deleteBottleMutation = useDeleteBottle();
  const updateDosePriceMutation = useUpdateDosePrice();

  const handleEditStock = async (bottleId: string, remainingDoses: number, totalMl: number, mlPerDose: number) => {
    const totalDoses = Math.floor(totalMl / mlPerDose);
    const isEmpty = remainingDoses <= 0;
    const { error } = await supabase.from('open_bottles').update({
      remaining_doses: remainingDoses,
      total_ml: totalMl,
      ml_per_dose: mlPerDose,
      total_doses: totalDoses,
      is_empty: isEmpty,
      emptied_at: isEmpty ? new Date().toISOString() : null,
    }).eq('id', bottleId);
    if (error) {
      toast({ title: 'Erro ao retificar', description: error.message, variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['open-bottles'] });
      toast({ title: '✅ Estoque retificado!' });
    }
  };

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('bottles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_bottles' }, () => {
        // Query will be invalidated by mutation hooks
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Quem está acabando aparece primeiro
  const activeBottles = bottles
    .filter(b => !b.is_empty)
    .sort((a, b) => a.remaining_doses / a.total_doses - b.remaining_doses / b.total_doses);
  const emptyBottles = bottles.filter(b => b.is_empty);

  const totalDosesAvailable = activeBottles.reduce((sum, b) => sum + b.remaining_doses, 0);
  const totalMlAvailable = activeBottles.reduce((sum, b) => sum + (b.remaining_doses * b.ml_per_dose), 0);

  if (productsLoading || bottlesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wine className="h-6 w-6 text-primary" />
            Garrafas Abertas
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Controle de garrafas abertas na geladeira
          </p>
        </div>
        
        {!readOnly && (
          <OpenBottleDialog 
            products={products.map(p => ({ id: p.id, name: p.name, stock: p.stock, product_type: p.productType }))} 
            bottles={bottles}
            onOpen={(params) => openBottleMutation.mutate(params)}
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Droplets className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{activeBottles.length}</p>
            <p className="text-xs text-muted-foreground">Garrafas Ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Wine className="h-6 w-6 mx-auto mb-2 text-amber-500" />
            <p className="text-2xl font-bold">{totalDosesAvailable}</p>
            <p className="text-xs text-muted-foreground">Doses Disponíveis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Droplets className="h-6 w-6 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{(totalMlAvailable / 1000).toFixed(1)}L</p>
            <p className="text-xs text-muted-foreground">Volume Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
            <p className="text-2xl font-bold">{emptyBottles.length}</p>
            <p className="text-xs text-muted-foreground">Vazias</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Bottles */}
      {activeBottles.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-500" />
            Garrafas Ativas ({activeBottles.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {activeBottles.map(bottle => (
              <BottleCard
                key={bottle.id}
                bottle={bottle}
                onUseDose={(doses) => useDoseMutation.mutate({ bottleId: bottle.id, doses })}
                onDelete={() => {
                  const confirmed = window.confirm(
                    `⚠️ Excluir a garrafa "${bottle.product_name}" com ${bottle.remaining_doses} dose(s) restantes?`
                  );
                  if (confirmed) {
                    deleteBottleMutation.mutate(bottle.id);
                  }
                }}
                onUpdatePrice={(price) => updateDosePriceMutation.mutate({ bottleId: bottle.id, price })}
                onEditStock={!readOnly ? (doses, totalMl, mlPerDose) => handleEditStock(bottle.id, doses, totalMl, mlPerDose) : undefined}
                isLoading={useDoseMutation.isPending || deleteBottleMutation.isPending}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty Bottles */}
      {emptyBottles.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            Garrafas Vazias ({emptyBottles.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {emptyBottles.map(bottle => (
              <BottleCard
                key={bottle.id}
                bottle={bottle}
                onUseDose={() => {}}
                onDelete={() => {
                  const confirmed = window.confirm(`Remover a garrafa vazia "${bottle.product_name}"?`);
                  if (confirmed) {
                    deleteBottleMutation.mutate(bottle.id);
                  }
                }}
                onUpdatePrice={(price) => updateDosePriceMutation.mutate({ bottleId: bottle.id, price })}
                onEditStock={!readOnly ? (doses, totalMl, mlPerDose) => handleEditStock(bottle.id, doses, totalMl, mlPerDose) : undefined}
                isLoading={deleteBottleMutation.isPending}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {bottles.length === 0 && (
        <Card className="p-8 text-center">
          <Wine className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Nenhuma garrafa aberta</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Clique em "Abrir Garrafa" para começar a controlar as garrafas na geladeira.
          </p>
        </Card>
      )}
    </div>
  );
}
