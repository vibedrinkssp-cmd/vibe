import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, ChevronDown, ChevronUp, Trash2, RefreshCw, Plus, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client-safe';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { parseNumeric } from '@/lib/format-utils';
import { OperationPinModal } from '@/components/auth/OperationPinModal';

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

interface ProductLite {
  id: string;
  name: string;
  stock: number | null;
  sale_price: number | string | null;
}

function suggestUnitPrice(salePrice: number | string | null | undefined, packSize: number): number {
  const sp = parseNumeric(salePrice);
  if (sp <= 0 || packSize <= 0) return 0;
  return Math.round((sp / packSize) * 100) / 100;
}

export function PacksCarousel() {
  const [isOpen, setIsOpen] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [packSize, setPackSize] = useState<string>('20');
  const [unitPrice, setUnitPrice] = useState<string>('');

  // Renovação via diálogo (em vez de prompt)
  const [renewDialog, setRenewDialog] = useState<OpenPack | null>(null);
  const [renewSize, setRenewSize] = useState<string>('20');
  const [renewPrice, setRenewPrice] = useState<string>('');

  // PIN gating quando preço difere do último maço aberto
  const [pinModal, setPinModal] = useState<null | { kind: 'open' | 'renew' }>(null);
  // Último preço por produto (último maço aberto desse produto, vazio ou não)
  const [lastPriceByProduct, setLastPriceByProduct] = useState<Record<string, number>>({});

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allPacks = [], isLoading } = useQuery({
    queryKey: ['open-packs-log'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_packs');
      if (error) throw error;
      return (data || []) as OpenPack[];
    },
    refetchInterval: 30000,
  });

  const { data: cigaretteProducts = [] } = useQuery({
    queryKey: ['cigarette-pack-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, stock, sale_price')
        .eq('is_active', true)
        .or('name.ilike.%MACO%,name.ilike.%MAÇO%')
        .order('name');
      if (error) throw error;
      return ((data || []) as ProductLite[]).filter(p => /\b(MACO|MAÇO)\b/.test(p.name.toUpperCase()));
    },
  });

  // Realtime: refletir mudanças instantaneamente entre KDE/Admin/PDV
  useEffect(() => {
    const channel = supabase
      .channel('packs-carousel-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_packs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['open-packs-log'] });
        queryClient.invalidateQueries({ queryKey: ['open-packs'] });
        queryClient.invalidateQueries({ queryKey: ['loose-cigarette-packs'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Calcula último preço usado por produto a partir dos maços já abertos
  useEffect(() => {
    const map: Record<string, { price: number; opened_at: string }> = {};
    for (const p of allPacks) {
      const price = parseNumeric(p.unit_price);
      if (price <= 0) continue;
      const prev = map[p.product_id];
      if (!prev || new Date(p.opened_at).getTime() > new Date(prev.opened_at).getTime()) {
        map[p.product_id] = { price, opened_at: p.opened_at };
      }
    }
    const flat: Record<string, number> = {};
    Object.entries(map).forEach(([k, v]) => { flat[k] = v.price; });
    setLastPriceByProduct(flat);
  }, [allPacks]);

  // Pré-preenche preço do último maço aberto (ou sugestão como fallback)
  useEffect(() => {
    if (!selectedProductId) return;
    const last = lastPriceByProduct[selectedProductId];
    if (last && last > 0) {
      setUnitPrice(last.toFixed(2).replace('.', ','));
      return;
    }
    const prod = cigaretteProducts.find(p => p.id === selectedProductId);
    const size = parseInt(packSize, 10) || 0;
    const sug = suggestUnitPrice(prod?.sale_price, size);
    setUnitPrice(sug > 0 ? sug.toFixed(2).replace('.', ',') : '');
  }, [selectedProductId, packSize, cigaretteProducts, lastPriceByProduct]);

  // Pré-preenche o diálogo de renovação ao abrir (com último preço usado)
  useEffect(() => {
    if (!renewDialog) return;
    const size = renewDialog.pack_size || 20;
    setRenewSize(String(size));
    const last = lastPriceByProduct[renewDialog.product_id] ?? parseNumeric(renewDialog.unit_price);
    if (last > 0) {
      setRenewPrice(last.toFixed(2).replace('.', ','));
      return;
    }
    const prod = cigaretteProducts.find(p => p.id === renewDialog.product_id);
    const sug = suggestUnitPrice(prod?.sale_price, size);
    setRenewPrice(sug > 0 ? sug.toFixed(2).replace('.', ',') : '');
  }, [renewDialog, cigaretteProducts, lastPriceByProduct]);

  const selectedProduct = useMemo(
    () => cigaretteProducts.find(p => p.id === selectedProductId),
    [cigaretteProducts, selectedProductId],
  );
  const suggestedPrice = suggestUnitPrice(selectedProduct?.sale_price, parseInt(packSize, 10) || 0);

  const renewProduct = useMemo(
    () => renewDialog ? cigaretteProducts.find(p => p.id === renewDialog.product_id) : null,
    [renewDialog, cigaretteProducts],
  );
  const renewSuggested = suggestUnitPrice(renewProduct?.sale_price, parseInt(renewSize, 10) || 0);

  // Empty packs FIRST (need attention) then active by oldest
  const emptyPacks = allPacks.filter(p => p.is_empty);
  const activePacks = allPacks.filter(p => !p.is_empty);
  const displayPacks = [...emptyPacks, ...activePacks];

  const deleteMutation = useMutation({
    mutationFn: async (packId: string) => {
      const { error } = await supabase.from('open_packs').delete().eq('id', packId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-packs-log'] });
      queryClient.invalidateQueries({ queryKey: ['open-packs'] });
      toast({ title: '🗑️ Maço excluído!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const renewMutation = useMutation({
    mutationFn: async ({ packId, size, price }: { packId: string; size: number; price: number }) => {
      const { error } = await supabase.rpc('renew_cigarette_pack', {
        p_pack_id: packId,
        p_pack_size: size,
        p_unit_price: price,
        p_opened_by: 'KDE',
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-packs-log'] });
      queryClient.invalidateQueries({ queryKey: ['open-packs'] });
      queryClient.invalidateQueries({ queryKey: ['cigarette-pack-products'] });
      toast({ title: '🔄 Maço renovado!', description: 'Novo maço aberto.' });
      setRenewDialog(null);
      setRenewPrice('');
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao renovar', description: err.message, variant: 'destructive' });
    },
  });

  const openMutation = useMutation({
    mutationFn: async () => {
      const size = parseInt(packSize, 10);
      const price = parseFloat(unitPrice.replace(',', '.'));
      if (!size || size < 1) throw new Error('Informe a quantidade de cigarros');
      if (!price || price <= 0) throw new Error('Preço por cigarro inválido — verifique o cadastro do produto');
      const { error } = await supabase.rpc('open_cigarette_pack', {
        p_product_id: selectedProductId,
        p_pack_size: size,
        p_unit_price: price,
        p_opened_by: 'KDE',
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-packs-log'] });
      queryClient.invalidateQueries({ queryKey: ['open-packs'] });
      queryClient.invalidateQueries({ queryKey: ['cigarette-pack-products'] });
      toast({ title: '🚬 Maço aberto!', description: 'Cigarros soltos disponíveis para venda.' });
      setOpenDialog(false);
      setSelectedProductId('');
      setPackSize('20');
      setUnitPrice('');
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao abrir', description: err.message, variant: 'destructive' });
    },
  });

  // Decide se exige PIN (preço alterado em relação ao último maço aberto desse produto)
  const priceChangedFromLast = (productId: string, newPrice: number): boolean => {
    const last = lastPriceByProduct[productId];
    if (!last || last <= 0) return false; // sem histórico → liberado
    return Math.abs(newPrice - last) > 0.005;
  };

  const handleConfirmOpen = () => {
    const price = parseFloat(unitPrice.replace(',', '.'));
    if (!selectedProductId || !price || price <= 0) {
      openMutation.mutate();
      return;
    }
    if (priceChangedFromLast(selectedProductId, price)) {
      setPinModal({ kind: 'open' });
      return;
    }
    openMutation.mutate();
  };

  const handleConfirmRenew = () => {
    if (!renewDialog) return;
    const size = parseInt(renewSize, 10);
    const price = parseFloat(renewPrice.replace(',', '.'));
    if (!size || size < 1) { toast({ title: 'Quantidade inválida', variant: 'destructive' }); return; }
    if (!price || price <= 0) { toast({ title: 'Preço inválido', variant: 'destructive' }); return; }
    if (priceChangedFromLast(renewDialog.product_id, price)) {
      setPinModal({ kind: 'renew' });
      return;
    }
    renewMutation.mutate({ packId: renewDialog.id, size, price });
  };

  const handlePinValidated = () => {
    if (!pinModal) return;
    if (pinModal.kind === 'open') {
      openMutation.mutate();
    } else if (pinModal.kind === 'renew' && renewDialog) {
      const size = parseInt(renewSize, 10);
      const price = parseFloat(renewPrice.replace(',', '.'));
      renewMutation.mutate({ packId: renewDialog.id, size, price });
    }
    setPinModal(null);
  };

  const getLevelColor = (percentage: number) => {
    if (percentage > 60) return 'bg-green-500';
    if (percentage > 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const HeaderRow = (
    <div className="flex items-center gap-2 flex-1">
      <Package className="h-5 w-5 text-primary" />
      <span className="font-medium text-foreground">Maços de Cigarro</span>
      <Badge variant="secondary" className="text-xs">{activePacks.length}</Badge>
      {emptyPacks.length > 0 && (
        <Badge variant="outline" className="text-xs text-red-500 border-red-300 animate-pulse">
          {emptyPacks.length} vazio{emptyPacks.length > 1 ? 's' : ''}
        </Badge>
      )}
    </div>
  );

  const OpenPackButton = (
    <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1 border-primary/40 text-primary hover:bg-primary/10"
      onClick={(e) => { e.stopPropagation(); setOpenDialog(true); }}
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold">Abrir Maço</span>
    </Button>
  );

  const openDialogEl = (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir Novo Maço de Cigarro</DialogTitle>
          <DialogDescription>O preço unitário é calculado a partir do cadastro do produto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Produto</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione o maço..." /></SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-60">
                  {cigaretteProducts.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      Nenhum produto MAÇO encontrado.
                    </div>
                  ) : (
                    cigaretteProducts.map(p => (
                      <SelectItem key={p.id} value={p.id} disabled={!p.stock || p.stock < 1}>
                        {p.name} (Estoque: {p.stock ?? 0} • R$ {parseNumeric(p.sale_price).toFixed(2).replace('.', ',')})
                      </SelectItem>
                    ))
                  )}
                </ScrollArea>
              </SelectContent>
            </Select>
            {selectedProduct && parseNumeric(selectedProduct.sale_price) <= 0 && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Produto sem preço cadastrado.
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
            {(() => {
              const last = selectedProductId ? lastPriceByProduct[selectedProductId] : 0;
              const cur = parseFloat((unitPrice || '0').replace(',', '.'));
              if (last && last > 0) {
                const changed = cur > 0 && Math.abs(cur - last) > 0.005;
                return (
                  <p className={`text-xs mt-1 ${changed ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                    Último valor usado: <span className="font-semibold">R$ {last.toFixed(2).replace('.', ',')}</span>
                    {changed && ' • alteração exigirá PIN do administrador'}
                  </p>
                );
              }
              return suggestedPrice > 0 ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Sugerido: <span className="font-semibold text-primary">R$ {suggestedPrice.toFixed(2).replace('.', ',')}</span>
                </p>
              ) : null;
            })()}
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleConfirmOpen}
            disabled={!selectedProductId || openMutation.isPending}
          >
            {openMutation.isPending ? 'Abrindo...' : 'Confirmar Abertura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renewDialogEl = (
    <Dialog open={!!renewDialog} onOpenChange={(v) => { if (!v) setRenewDialog(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renovar Maço</DialogTitle>
          <DialogDescription>
            {renewDialog?.product_name} — preço sugerido a partir do cadastro
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Quantidade de cigarros no novo maço</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={renewSize}
              onChange={(e) => setRenewSize(e.target.value)}
            />
          </div>
          <div>
            <Label>Preço por cigarro solto (R$)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.10"
              value={renewPrice}
              onChange={(e) => setRenewPrice(e.target.value)}
              placeholder="Ex: 1,50"
            />
            {(() => {
              const last = renewDialog ? lastPriceByProduct[renewDialog.product_id] : 0;
              const cur = parseFloat((renewPrice || '0').replace(',', '.'));
              if (last && last > 0) {
                const changed = cur > 0 && Math.abs(cur - last) > 0.005;
                return (
                  <p className={`text-xs mt-1 ${changed ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                    Último valor usado: <span className="font-semibold">R$ {last.toFixed(2).replace('.', ',')}</span>
                    {changed && ' • alteração exigirá PIN do administrador'}
                  </p>
                );
              }
              return renewSuggested > 0 ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Sugerido: <span className="font-semibold text-primary">R$ {renewSuggested.toFixed(2).replace('.', ',')}</span>
                </p>
              ) : null;
            })()}
            {renewProduct && parseNumeric(renewProduct.sale_price) <= 0 && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Produto sem preço cadastrado — informe um valor manualmente.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRenewDialog(null)}>Cancelar</Button>
          <Button disabled={renewMutation.isPending} onClick={handleConfirmRenew}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {renewMutation.isPending ? 'Renovando...' : 'Confirmar Renovação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const pinModalEl = (
    <OperationPinModal
      open={!!pinModal}
      operation="editar_pedido"
      title="Alteração de preço — PIN do administrador"
      description="O preço informado é diferente do último maço aberto. Confirme com o PIN para autorizar a alteração."
      onValidated={handlePinValidated}
      onCancel={() => setPinModal(null)}
    />
  );

  if (isLoading) {
    return (
      <div className="mb-6 p-4 bg-card/50 border border-primary/20 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-5 w-5 text-primary" />
          <span className="font-medium">Maços de Cigarro</span>
        </div>
        <div className="animate-pulse flex gap-3">
          {[1, 2, 3].map(i => (<div key={i} className="h-24 w-24 bg-muted rounded-lg" />))}
        </div>
      </div>
    );
  }

  if (displayPacks.length === 0) {
    return (
      <>
        <div className="mb-6 p-4 bg-card/50 border border-primary/20 rounded-lg flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-5 w-5" />
            <span>Nenhum maço de cigarro aberto</span>
          </div>
          {OpenPackButton}
        </div>
        {openDialogEl}
        {renewDialogEl}
        {pinModalEl}
      </>
    );
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-6">
        <div className="p-4 bg-card/50 border border-primary/20 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center justify-between p-0 h-auto hover:bg-transparent flex-1"
              >
                {HeaderRow}
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>
            </CollapsibleTrigger>
            {OpenPackButton}
          </div>

          <CollapsibleContent className="mt-3">
            <Carousel opts={{ align: 'start', loop: false }} className="w-full">
              <CarouselContent className="-ml-2">
                {displayPacks.map((pack, index) => {
                  const percentage = pack.is_empty ? 0 : (pack.remaining_units / pack.pack_size) * 100;
                  const levelColor = pack.is_empty ? 'bg-red-500' : getLevelColor(percentage);
                  const price = parseNumeric(pack.unit_price);
                  const noPrice = !pack.is_empty && price <= 0;

                  return (
                    <CarouselItem key={pack.id} className="pl-2 basis-32 md:basis-36">
                      <Card className={`border-primary/20 h-full ${pack.is_empty ? 'bg-red-50 dark:bg-red-950/20 border-red-300 ring-2 ring-red-400/40' : noPrice ? 'border-destructive ring-2 ring-destructive/30' : 'bg-background/80'}`}>
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
                                const msg = pack.is_empty
                                  ? `Excluir maço vazio "${pack.product_name}"?`
                                  : `⚠️ Maço "${pack.product_name}" ainda tem ${pack.remaining_units} cigarros! Excluir mesmo assim?`;
                                if (confirm(msg)) deleteMutation.mutate(pack.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="relative w-10 h-14 mb-2">
                            <div className="absolute inset-0 border-2 border-primary/40 rounded bg-background/50">
                              <div
                                className={`absolute bottom-0 left-0 right-0 ${levelColor} rounded-b transition-all duration-500`}
                                style={{ height: `${percentage}%` }}
                              />
                            </div>
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] font-bold text-muted-foreground">
                              {pack.pack_size}
                            </div>
                          </div>

                          <div className="text-center w-full overflow-hidden">
                            <p
                              className="text-xs font-semibold truncate"
                              title={pack.product_name}
                            >
                              {pack.product_name}
                            </p>
                            {pack.is_empty ? (
                              <p className="text-[10px] text-red-500 font-bold mt-1">VAZIO</p>
                            ) : (
                              <>
                                <p className="text-xs text-primary font-medium mt-1">
                                  {pack.remaining_units}/{pack.pack_size}
                                </p>
                                {noPrice ? (
                                  <p className="text-[10px] text-destructive font-bold flex items-center justify-center gap-0.5">
                                    <AlertTriangle className="h-2.5 w-2.5" /> SEM PREÇO
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-muted-foreground font-semibold">
                                    R$ {price.toFixed(2).replace('.', ',')}/un
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          {pack.is_empty && (
                            <div className="w-full mt-2 flex gap-1">
                              <Button
                                size="sm"
                                variant="default"
                                className="flex-1 h-7 text-[10px] gap-1 bg-green-600 hover:bg-green-700"
                                disabled={renewMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const price = parseNumeric(pack.unit_price);
                                  renewMutation.mutate({ packId: pack.id, size: pack.pack_size, price });
                                }}
                              >
                                <RefreshCw className="h-3 w-3" />
                                Renovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] px-2"
                                disabled={renewMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenewDialog(pack);
                                }}
                                title="Renovar alterando quantidade/preço"
                              >
                                ✏️
                              </Button>
                            </div>
                          )}

                        </CardContent>
                      </Card>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              {displayPacks.length > 4 && (
                <>
                  <CarouselPrevious className="hidden md:flex -left-3 h-6 w-6" />
                  <CarouselNext className="hidden md:flex -right-3 h-6 w-6" />
                </>
              )}
            </Carousel>
          </CollapsibleContent>
        </div>
      </Collapsible>
      {openDialogEl}
      {renewDialogEl}
      {pinModalEl}
    </>
  );
}
