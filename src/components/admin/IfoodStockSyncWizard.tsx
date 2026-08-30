import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, PackageCheck, AlertTriangle, X, CheckCircle2, MinusCircle, Wine, Package, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { normalizeText, normalizeSearch } from '@/lib/text-utils';
import type { OrderWithDetails } from '@/pages/admin/shared';

type CatalogProduct = { id: string; name: string; stock: number };
type OpenBottle = { id: string; product_name: string; remaining_doses: number; ml_per_dose: number };

type TargetType = 'product' | 'bottle';

interface Deduction {
  id: string;
  targetType: TargetType;
  productId: string | null;
  bottleId: string | null;
  quantity: number;
  suggestionSource: 'alias' | 'exact' | 'fuzzy' | 'none';
}

interface WizardItemState {
  rowId: string;          // local key (item.id or composed)
  originalName: string;   // first line of product_name from order_item
  fullText: string;       // full product_name (with options/obs)
  action: 'sync' | 'ignore';
  deductions: Deduction[];
}

function newDeduction(partial?: Partial<Deduction>): Deduction {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    targetType: 'product',
    productId: null,
    bottleId: null,
    quantity: 1,
    suggestionSource: 'none',
    ...partial,
  };
}

// Ranking inteligente: pontua o quão parecido um item da lista é do texto buscado.
// Substring direto = 1 (melhor). Caso contrário, sobreposição de palavras (tokens).
// Retornar > 0 mantém o item visível e ordenado pela relevância no cmdk.
function scoreMatch(value: string, search: string): number {
  const v = normalizeSearch(value);
  const s = normalizeSearch(search).trim();
  if (!s) return 1;
  if (v.includes(s)) return 1;
  const sTokens = s.split(/\s+/).filter(t => t.length >= 3);
  if (sTokens.length === 0) return 0;
  let hits = 0;
  for (const t of sTokens) {
    if (v.includes(t)) hits += 1;
  }
  // 0 quando nada bate (item some), proporcional quando há sobreposição
  return hits === 0 ? 0 : (hits / sTokens.length) * 0.9;
}

function firstMeaningfulLine(text: string): string {
  if (!text) return '';
  const firstLine = text.split('\n')[0] ?? '';
  return firstLine.split('[PDV:')[0].trim();
}

interface IfoodStockSyncWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithDetails | null;
  syncedBy?: string;
}

export function IfoodStockSyncWizard({
  open,
  onOpenChange,
  order,
  syncedBy,
}: IfoodStockSyncWizardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [items, setItems] = useState<WizardItemState[]>([]);
  const [openCombo, setOpenCombo] = useState<string | null>(null); // deduction id
  const [comboSearch, setComboSearch] = useState(''); // texto de busca do popover aberto

  // Catálogo completo de produtos (fabricados + industrializados)
  const { data: allProducts = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['all-products-for-sync'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, stock')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CatalogProduct[];
    },
  });

  // Garrafas abertas (doses)
  const { data: openBottles = [], isLoading: loadingBottles } = useQuery({
    queryKey: ['open-bottles-for-sync'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('open_bottles')
        .select('id, product_name, remaining_doses, ml_per_dose')
        .eq('is_empty', false)
        .order('product_name');
      if (error) throw error;
      return (data ?? []) as OpenBottle[];
    },
  });

  const productMap = useMemo(() => {
    const map = new Map<string, CatalogProduct>();
    for (const p of allProducts) map.set(p.id, p);
    return map;
  }, [allProducts]);

  const bottleMap = useMemo(() => {
    const map = new Map<string, OpenBottle>();
    for (const b of openBottles) map.set(b.id, b);
    return map;
  }, [openBottles]);

  const loading = loadingProducts || loadingBottles;

  // Inicializa itens quando abrir e produtos carregarem
  useEffect(() => {
    if (!open || !order?.items || allProducts.length === 0) return;

    const init = async () => {
      const next: WizardItemState[] = [];
      for (const it of order.items ?? []) {
        const original = firstMeaningfulLine(it.productName);
        const rowId = it.id;
        // tenta sugestão via RPC (alias / exact / fuzzy)
        let productId: string | null = null;
        let source: Deduction['suggestionSource'] = 'none';
        try {
          const { data } = await supabase.rpc('suggest_product_for_ifood_item', { p_name: original });
          const first = Array.isArray(data) ? data[0] : null;
          if (first?.product_id) {
            productId = first.product_id as string;
            source = (first.source as Deduction['suggestionSource']) ?? 'fuzzy';
          }
        } catch {
          /* ignore */
        }
        next.push({
          rowId,
          originalName: original || it.productName,
          fullText: it.productName,
          action: productId ? 'sync' : 'ignore',
          deductions: [
            newDeduction({
              targetType: 'product',
              productId,
              quantity: it.quantity || 1,
              suggestionSource: source,
            }),
          ],
        });
      }
      setItems(next);
      setStep(1);
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id, allProducts.length]);

  const updateItem = (rowId: string, patch: Partial<WizardItemState>) => {
    setItems(prev => prev.map(it => (it.rowId === rowId ? { ...it, ...patch } : it)));
  };

  const updateDeduction = (rowId: string, dedId: string, patch: Partial<Deduction>) => {
    setItems(prev =>
      prev.map(it =>
        it.rowId === rowId
          ? { ...it, deductions: it.deductions.map(d => (d.id === dedId ? { ...d, ...patch } : d)) }
          : it,
      ),
    );
  };

  const addDeduction = (rowId: string) => {
    setItems(prev =>
      prev.map(it =>
        it.rowId === rowId ? { ...it, deductions: [...it.deductions, newDeduction()] } : it,
      ),
    );
  };

  const removeDeduction = (rowId: string, dedId: string) => {
    setItems(prev =>
      prev.map(it =>
        it.rowId === rowId
          ? {
              ...it,
              deductions:
                it.deductions.length > 1
                  ? it.deductions.filter(d => d.id !== dedId)
                  : it.deductions,
            }
          : it,
      ),
    );
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Pedido inválido');
      const payload: any[] = [];
      for (const it of items) {
        if (it.action === 'ignore') {
          payload.push({
            target_type: 'product',
            product_id: null,
            bottle_id: null,
            quantity: 0,
            original_name: it.originalName,
            action: 'ignore',
          });
          continue;
        }
        for (const d of it.deductions) {
          const valid =
            (d.targetType === 'product' && d.productId) ||
            (d.targetType === 'bottle' && d.bottleId);
          payload.push({
            target_type: d.targetType,
            product_id: d.targetType === 'product' ? d.productId : null,
            bottle_id: d.targetType === 'bottle' ? d.bottleId : null,
            quantity: valid ? d.quantity : 0,
            original_name: it.originalName,
            action: valid ? 'sync' : 'ignore',
          });
        }
      }
      const { data, error } = await supabase.rpc('sync_ifood_order_stock', {
        p_order_id: order.id,
        p_items: payload,
        p_synced_by: syncedBy ?? 'admin',
      });
      if (error) throw error;
      return data as {
        synced_count: number;
        synced_products: number;
        synced_bottles: number;
        ignored_count: number;
        total_units: number;
      };
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Estoque sincronizado',
        description: `${data.synced_products} produto(s), ${data.synced_bottles} dose(s) de garrafa, ${data.total_units} unidade(s) baixada(s).`,
      });
      qc.invalidateQueries({ queryKey: ['ifood-sync-status'] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['open-bottles'] });
      qc.invalidateQueries({ queryKey: ['open-bottles-for-sync'] });
      qc.invalidateQueries({ queryKey: ['all-products-for-sync'] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: 'Falha ao sincronizar',
        description: String(err?.message ?? err),
        variant: 'destructive',
      });
    },
  });

  if (!order) return null;

  const deductionIsValid = (d: Deduction) =>
    (d.targetType === 'product' && !!d.productId) || (d.targetType === 'bottle' && !!d.bottleId);

  // resumo (passo 2): todas as baixas válidas
  const allValidDeductions = items
    .filter(i => i.action === 'sync')
    .flatMap(i => i.deductions.filter(deductionIsValid).map(d => ({ item: i, d })));

  const itemsToIgnore = items.filter(i => i.action === 'ignore');

  const hasUnresolved = items.some(
    i => i.action === 'sync' && i.deductions.some(d => !deductionIsValid(d)),
  );

  const labelForDeduction = (d: Deduction): string => {
    if (d.targetType === 'bottle' && d.bottleId) return bottleMap.get(d.bottleId)?.product_name ?? d.bottleId;
    if (d.targetType === 'product' && d.productId) return productMap.get(d.productId)?.name ?? d.productId;
    return '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-primary" />
            Sincronizar estoque · iFood{' '}
            {order.externalOrderId && (
              <Badge variant="outline" className="font-mono text-xs">
                #{order.externalOrderId.slice(-6)}
              </Badge>
            )}
          </DialogTitle>
          <div className="text-xs text-muted-foreground mt-1">
            {step === 1
              ? 'Para cada item você pode adicionar várias baixas (produtos e/ou doses de garrafa). Ex.: um copão pode baixar dose + Red Bull + gelo.'
              : 'Revise as baixas antes de confirmar.'}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando catálogo...
            </div>
          ) : step === 1 ? (
            items.map(item => {
              const itemUnresolved =
                item.action === 'sync' && item.deductions.some(d => !deductionIsValid(d));
              return (
                <div
                  key={item.rowId}
                  className={`rounded-lg border p-3 transition-colors ${
                    itemUnresolved
                      ? 'border-amber-500/60 bg-amber-500/5'
                      : item.action === 'ignore'
                      ? 'border-muted-foreground/20 bg-muted/30 opacity-70'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase text-muted-foreground mb-1">Item do iFood</div>
                      <div className="font-semibold text-sm uppercase break-words">
                        {item.originalName}
                      </div>
                      {item.fullText !== item.originalName && (
                        <details className="text-xs text-muted-foreground mt-1">
                          <summary className="cursor-pointer">Ver detalhes</summary>
                          <pre className="whitespace-pre-wrap font-sans mt-1">{item.fullText}</pre>
                        </details>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={item.action === 'ignore' ? 'default' : 'ghost'}
                      className={
                        item.action === 'ignore'
                          ? 'bg-muted text-muted-foreground hover:bg-muted'
                          : ''
                      }
                      onClick={() =>
                        updateItem(item.rowId, {
                          action: item.action === 'ignore' ? 'sync' : 'ignore',
                        })
                      }
                    >
                      {item.action === 'ignore' ? (
                        <>
                          <MinusCircle className="w-4 h-4 mr-1" /> Ignorado
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4 mr-1" /> Ignorar
                        </>
                      )}
                    </Button>
                  </div>

                  {item.action === 'sync' && (
                    <div className="mt-3 space-y-3">
                      {item.deductions.map((d, idx) => {
                        const selectedLabel = labelForDeduction(d);
                        return (
                          <div
                            key={d.id}
                            className="rounded-md border border-border/60 bg-background/40 p-2 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] uppercase text-muted-foreground">
                                Baixa {idx + 1}
                              </span>
                              {item.deductions.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1 text-destructive hover:text-destructive"
                                  onClick={() => removeDeduction(item.rowId, d.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>

                            {/* Seletor de tipo */}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant={d.targetType === 'product' ? 'default' : 'outline'}
                                className="flex-1"
                                onClick={() =>
                                  updateDeduction(item.rowId, d.id, {
                                    targetType: 'product',
                                    bottleId: null,
                                  })
                                }
                              >
                                <Package className="w-4 h-4 mr-1" /> Produto
                              </Button>
                              <Button
                                size="sm"
                                variant={d.targetType === 'bottle' ? 'default' : 'outline'}
                                className="flex-1"
                                onClick={() =>
                                  updateDeduction(item.rowId, d.id, {
                                    targetType: 'bottle',
                                    productId: null,
                                    suggestionSource: 'none',
                                  })
                                }
                              >
                                <Wine className="w-4 h-4 mr-1" /> Dose de garrafa
                              </Button>
                            </div>

                            <div className="grid grid-cols-[1fr_90px] gap-2 items-center">
                              <Popover
                                open={openCombo === d.id}
                                onOpenChange={(o) => {
                                  setOpenCombo(o ? d.id : null);
                                  // Ao abrir um produto sem seleção, já pré-preenche a busca
                                  // com o nome do item do iFood para surgir os mais parecidos.
                                  setComboSearch(
                                    o && d.targetType === 'product' && !d.productId
                                      ? item.originalName
                                      : '',
                                  );
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={`w-full justify-between font-normal ${
                                      !selectedLabel ? 'text-amber-500 border-amber-500/60' : ''
                                    }`}
                                  >
                                    {selectedLabel ? (
                                      <span className="truncate uppercase">{selectedLabel}</span>
                                    ) : (
                                      <span className="flex items-center gap-1">
                                        <AlertTriangle className="w-4 h-4" />
                                        {d.targetType === 'bottle'
                                          ? 'Selecione uma garrafa aberta'
                                          : 'Selecione um produto'}
                                      </span>
                                    )}
                                    {d.targetType === 'product' &&
                                      d.suggestionSource !== 'none' &&
                                      d.productId && (
                                        <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                                          {d.suggestionSource === 'alias'
                                            ? 'Aprendido'
                                            : d.suggestionSource === 'exact'
                                            ? 'Nome exato'
                                            : 'Sugestão'}
                                        </Badge>
                                      )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                                  <Command filter={(value, search) => scoreMatch(value, search)}>
                                    <CommandInput
                                      value={comboSearch}
                                      onValueChange={setComboSearch}
                                      placeholder={
                                        d.targetType === 'bottle'
                                          ? 'Buscar garrafa aberta...'
                                          : 'Buscar produto...'
                                      }
                                    />
                                    <CommandList>
                                      <CommandEmpty>Nada encontrado.</CommandEmpty>
                                      <CommandGroup>
                                        {d.targetType === 'bottle'
                                          ? openBottles.map(b => (
                                              <CommandItem
                                                key={b.id}
                                                value={`${normalizeText(b.product_name)} ${b.id}`}
                                                onSelect={() => {
                                                  updateDeduction(item.rowId, d.id, { bottleId: b.id });
                                                  setOpenCombo(null);
                                                }}
                                                className="flex items-center justify-between"
                                              >
                                                <span className="uppercase">{b.product_name}</span>
                                                <Badge variant="outline" className="text-[10px]">
                                                  {b.remaining_doses} dose(s)
                                                </Badge>
                                              </CommandItem>
                                            ))
                                          : allProducts.map(p => (
                                              <CommandItem
                                                key={p.id}
                                                value={`${normalizeText(p.name)} ${p.id}`}
                                                onSelect={() => {
                                                  updateDeduction(item.rowId, d.id, {
                                                    productId: p.id,
                                                    suggestionSource: 'none',
                                                  });
                                                  setOpenCombo(null);
                                                }}
                                                className="flex items-center justify-between"
                                              >
                                                <span className="uppercase">{p.name}</span>
                                                <Badge variant="outline" className="text-[10px]">
                                                  Estoque: {p.stock}
                                                </Badge>
                                              </CommandItem>
                                            ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              <Input
                                type="number"
                                min={1}
                                value={d.quantity}
                                onChange={e =>
                                  updateDeduction(item.rowId, d.id, {
                                    quantity: Math.max(1, parseInt(e.target.value || '1', 10)),
                                  })
                                }
                                className="text-center font-bold"
                              />
                            </div>
                          </div>
                        );
                      })}

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-dashed"
                        onClick={() => addDeduction(item.rowId)}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Adicionar outra baixa (produto ou dose)
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="space-y-2">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-xs uppercase text-muted-foreground mb-2">
                  Vai baixar do estoque
                </div>
                {allValidDeductions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhum item será baixado.</div>
                ) : (
                  <ul className="space-y-1">
                    {allValidDeductions.map(({ item, d }) => (
                      <li key={d.id} className="flex justify-between text-sm">
                        <span className="uppercase font-medium flex items-center gap-1">
                          {d.targetType === 'bottle' ? (
                            <Wine className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Package className="w-3.5 h-3.5 text-primary" />
                          )}
                          {labelForDeduction(d)}
                          <span className="text-[10px] text-muted-foreground normal-case">
                            ({item.originalName})
                          </span>
                        </span>
                        <span className="font-bold">
                          −{d.quantity}
                          {d.targetType === 'bottle' ? ' dose(s)' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {itemsToIgnore.length > 0 && (
                <div className="rounded-lg border border-muted bg-muted/30 p-3">
                  <div className="text-xs uppercase text-muted-foreground mb-2">
                    Ignorados ({itemsToIgnore.length})
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {itemsToIgnore.map(it => (
                      <li key={it.rowId} className="uppercase">{it.originalName}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-background gap-2">
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={hasUnresolved || items.length === 0}
                className="font-bold"
              >
                {hasUnresolved
                  ? 'Resolva os itens em amarelo'
                  : `Revisar (${allValidDeductions.length} baixa${allValidDeductions.length === 1 ? '' : 's'})`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)} disabled={syncMutation.isPending}>
                Voltar
              </Button>
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white font-black"
              >
                {syncMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> SINCRONIZANDO...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> CONFIRMAR BAIXA
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
