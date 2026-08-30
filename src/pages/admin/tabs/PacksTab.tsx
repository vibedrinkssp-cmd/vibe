import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Search, Package, AlertTriangle, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminProducts } from '../use-admin-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseNumeric } from '@/lib/format-utils';

interface OpenPack {
  id: string;
  product_id: string;
  product_name: string;
  pack_size: number;
  remaining_units: number;
  unit_price: number | string;
  is_empty: boolean;
  opened_at: string;
  emptied_at: string | null;
  opened_by: string | null;
  notes: string | null;
}

function useOpenPacks() {
  return useQuery({
    queryKey: ['open-packs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_packs');
      if (error) throw error;
      return (data || []) as OpenPack[];
    },
    refetchInterval: 30000,
  });
}

/** Calcula o preço unitário sugerido a partir do produto MAÇO. */
function suggestUnitPrice(productSalePrice: number | null | undefined, packSize: number): number {
  const sp = parseNumeric(productSalePrice);
  if (sp <= 0 || packSize <= 0) return 0;
  return Math.round((sp / packSize) * 100) / 100;
}

export function PacksTab({ readOnly = false }: { readOnly?: boolean }) {
  const { data: products = [] } = useAdminProducts();
  const { data: packs = [], isLoading } = useOpenPacks();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [packSize, setPackSize] = useState<string>('20');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [openedBy, setOpenedBy] = useState('');

  // Edição inline de preço
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');

  // Maços = produtos terminados em "MACO" ou "MAÇO"
  const cigaretteProducts = useMemo(
    () => products.filter(p => /\b(MACO|MAÇO)\b/.test(p.name.toUpperCase().trim())),
    [products],
  );

  // Realtime: invalida ao mudar qualquer pack
  useEffect(() => {
    const channel = supabase
      .channel('packs-tab-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_packs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['open-packs'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Pré-preenche preço sugerido sempre que muda produto ou tamanho
  useEffect(() => {
    if (!selectedProductId) return;
    const prod = cigaretteProducts.find(p => p.id === selectedProductId);
    const size = parseInt(packSize, 10) || 0;
    const suggested = suggestUnitPrice(prod?.salePrice as number | null | undefined, size);
    if (suggested > 0) {
      setUnitPrice(suggested.toFixed(2).replace('.', ','));
    } else {
      setUnitPrice('');
    }
  }, [selectedProductId, packSize, cigaretteProducts]);

  const selectedProduct = cigaretteProducts.find(p => p.id === selectedProductId);
  const suggestedPrice = suggestUnitPrice(
    selectedProduct?.salePrice as number | null | undefined,
    parseInt(packSize, 10) || 0,
  );

  const openPackMutation = useMutation({
    mutationFn: async () => {
      const size = parseInt(packSize, 10);
      const price = parseFloat(unitPrice.replace(',', '.'));
      if (!size || size < 1) throw new Error('Informe a quantidade de cigarros');
      if (!price || price <= 0) throw new Error('Preço por cigarro inválido — verifique o cadastro do produto');
      const { data, error } = await supabase.rpc('open_cigarette_pack', {
        p_product_id: selectedProductId,
        p_pack_size: size,
        p_unit_price: price,
        p_opened_by: openedBy || undefined,
        p_notes: undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-packs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: '🚬 Maço aberto com sucesso!' });
      setOpenDialog(false);
      setSelectedProductId('');
      setUnitPrice('');
      setOpenedBy('');
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao abrir maço', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (packId: string) => {
      const { error } = await supabase.from('open_packs').delete().eq('id', packId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-packs'] });
      toast({ title: '🗑️ Maço excluído!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => {
      if (!price || price <= 0) throw new Error('Preço inválido');
      const { error } = await supabase
        .from('open_packs')
        .update({ unit_price: price })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-packs'] });
      toast({ title: '💲 Preço atualizado!' });
      setEditingPriceId(null);
      setEditingPriceValue('');
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao atualizar preço', description: err.message, variant: 'destructive' });
    },
  });

  const activePacks = packs.filter(p => !p.is_empty);
  const emptyPacks = packs.filter(p => p.is_empty);

  const filteredActive = activePacks.filter(p =>
    p.product_name.toUpperCase().includes(search.toUpperCase())
  );
  const filteredEmpty = emptyPacks.filter(p =>
    p.product_name.toUpperCase().includes(search.toUpperCase())
  );

  const zeroPriceCount = activePacks.filter(p => parseNumeric(p.unit_price) <= 0).length;

  const startEditingPrice = (pack: OpenPack) => {
    const current = parseNumeric(pack.unit_price);
    if (current > 0) {
      setEditingPriceValue(current.toFixed(2).replace('.', ','));
    } else {
      // Sugere a partir do produto
      const prod = products.find(p => p.id === pack.product_id);
      const sug = suggestUnitPrice(prod?.salePrice as number | null | undefined, pack.pack_size);
      setEditingPriceValue(sug > 0 ? sug.toFixed(2).replace('.', ',') : '');
    }
    setEditingPriceId(pack.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Package className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">Maços de Cigarro</h2>
          <Badge variant="secondary">{activePacks.length} abertos</Badge>
          {emptyPacks.length > 0 && (
            <Badge variant="outline" className="text-red-500 border-red-300">
              {emptyPacks.length} vazio{emptyPacks.length > 1 ? 's' : ''}
            </Badge>
          )}
          {zeroPriceCount > 0 && (
            <Badge variant="destructive" className="gap-1 animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              {zeroPriceCount} sem preço
            </Badge>
          )}
        </div>

        {!readOnly && (
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Abrir Maço
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir Maço de Cigarro</DialogTitle>
                <DialogDescription>O preço unitário é calculado automaticamente a partir do cadastro do produto.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Produto (Maço)</Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o maço..." />
                    </SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-60">
                        {cigaretteProducts.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            Nenhum produto MAÇO encontrado.
                          </div>
                        ) : (
                          cigaretteProducts.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} (Estoque: {p.stock} • R$ {parseNumeric(p.salePrice).toFixed(2).replace('.', ',')})
                            </SelectItem>
                          ))
                        )}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                  {selectedProduct && parseNumeric(selectedProduct.salePrice) <= 0 && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Este produto está sem preço de venda cadastrado.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Quantidade de cigarros no maço</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={packSize}
                    onChange={(e) => setPackSize(e.target.value)}
                    placeholder="Ex: 20"
                  />
                </div>
                <div>
                  <Label>Preço por cigarro solto (R$)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.10"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="Ex: 1,50"
                  />
                  {suggestedPrice > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Sugerido pelo cadastro: <span className="font-semibold text-primary">R$ {suggestedPrice.toFixed(2).replace('.', ',')}</span> ({selectedProduct?.name} ÷ {packSize})
                    </p>
                  )}
                </div>
                <div>
                  <Label>Aberto por (opcional)</Label>
                  <Input
                    value={openedBy}
                    onChange={(e) => setOpenedBy(e.target.value)}
                    placeholder="Nome do funcionário"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => openPackMutation.mutate()}
                  disabled={!selectedProductId || openPackMutation.isPending}
                >
                  {openPackMutation.isPending ? 'Abrindo...' : 'Abrir Maço'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar maço..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="h-32" /></Card>
          ))}
        </div>
      ) : (
        <>
          {filteredActive.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">🚬 Maços Ativos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredActive.map(pack => {
                  const percentage = (pack.remaining_units / pack.pack_size) * 100;
                  const price = parseNumeric(pack.unit_price);
                  const noPrice = price <= 0;
                  const isEditing = editingPriceId === pack.id;
                  return (
                    <Card key={pack.id} className={noPrice ? 'border-destructive ring-2 ring-destructive/30' : 'border-primary/20'}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-bold text-sm">{pack.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Maço de {pack.pack_size} • Aberto {new Date(pack.opened_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          {!readOnly && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() => {
                                if (confirm(`Excluir maço "${pack.product_name}" com ${pack.remaining_units} cigarros restantes?`))
                                  deleteMutation.mutate(pack.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <Progress value={percentage} className="h-2 mb-2" />
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {pack.remaining_units}/{pack.pack_size}
                          </Badge>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="0.10"
                                min={0}
                                value={editingPriceValue}
                                onChange={(e) => setEditingPriceValue(e.target.value)}
                                className="h-7 w-20 text-xs"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-green-600"
                                disabled={updatePriceMutation.isPending}
                                onClick={() => {
                                  const v = parseFloat(editingPriceValue.replace(',', '.'));
                                  updatePriceMutation.mutate({ id: pack.id, price: v });
                                }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground"
                                onClick={() => { setEditingPriceId(null); setEditingPriceValue(''); }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : noPrice ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="destructive" className="text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                PREÇO 0
                              </Badge>
                              {!readOnly && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[10px] gap-1"
                                  onClick={() => startEditingPrice(pack)}
                                >
                                  <Pencil className="h-3 w-3" />
                                  Editar
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs font-bold text-primary">
                                R$ {price.toFixed(2).replace('.', ',')}/un
                              </Badge>
                              {!readOnly && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                  onClick={() => startEditingPrice(pack)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        {pack.opened_by && (
                          <span className="text-[10px] text-muted-foreground block mt-1">por {pack.opened_by}</span>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {filteredEmpty.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-500 mb-3">📦 Maços Vazios</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEmpty.map(pack => (
                  <Card key={pack.id} className="border-red-300/30 bg-red-50 dark:bg-red-950/10">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-sm">{pack.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Maço de {pack.pack_size} • Esvaziado {pack.emptied_at ? new Date(pack.emptied_at).toLocaleDateString('pt-BR') : ''}
                          </p>
                        </div>
                        {!readOnly && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() => {
                              if (confirm(`Excluir maço vazio "${pack.product_name}"?`))
                                deleteMutation.mutate(pack.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {filteredActive.length === 0 && filteredEmpty.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum maço de cigarro aberto</p>
                {!readOnly && <p className="text-sm mt-1">Clique em "Abrir Maço" para começar</p>}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
