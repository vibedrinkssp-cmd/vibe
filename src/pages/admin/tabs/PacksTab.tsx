import { useEffect, useState } from 'react';
import { confirmDialog } from '@/lib/dialogs';
import { Trash2, Search, Package, AlertTriangle, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { OpenPackDialog, suggestUnitPrice } from '@/components/packs/OpenPackDialog';
import { useAdminProducts } from '../use-admin-data';
import { supabase } from '@/integrations/supabase/client-safe';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
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

export function PacksTab({ readOnly = false }: { readOnly?: boolean }) {
  const { data: products = [] } = useAdminProducts();
  const { data: packs = [], isLoading } = useOpenPacks();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  // Edição inline de preço
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');

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

        {!readOnly && <OpenPackDialog />}
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
                              onClick={async () => {
                                if (await confirmDialog(`Excluir maço "${pack.product_name}" com ${pack.remaining_units} cigarros restantes?`))
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
                        {pack.notes && /sem baixa/i.test(pack.notes) && (
                          <span className="text-[10px] text-muted-foreground block mt-1">{pack.notes}</span>
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
                            onClick={async () => {
                              if (await confirmDialog(`Excluir maço vazio "${pack.product_name}"?`))
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
