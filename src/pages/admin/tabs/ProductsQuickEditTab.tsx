import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminProducts, useAdminCategories } from '../use-admin-data';
import { resilientRpc } from '@/lib/resilient-rpc';
import { getAdminSessionToken } from '@/lib/admin-session';
import { supabase } from '@/integrations/supabase/client-safe';
import { useToast } from '@/hooks/use-toast';
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2, Star, Copy, Loader2, Check } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type SortField = 'name' | 'cost_price' | 'sale_price' | 'stock';
type SortDir = 'asc' | 'desc';
type EditableField = 'name' | 'cost_price' | 'sale_price' | 'stock';
type SaveResult = boolean | Promise<boolean>;

const parseEditableValue = (value: string, isInt = false) => {
  if (isInt) return Math.max(0, parseInt(value, 10) || 0);
  return parseFloat(value.replace(',', '.')) || 0;
};

const normalizeEditableValue = (value: string, isInt = false) => String(parseEditableValue(value, isInt));

export function ProductsQuickEditTab() {
  const { data: products = [], isLoading } = useAdminProducts();
  const { data: categories = [] } = useAdminCategories();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const PAGE_SIZE = 60;
  const [page, setPage] = useState(0);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };
  // Flat sorted list (used for horizontal pagination)
  const sortedFlat = useMemo(() => {
    const getValue = (p: any, f: SortField) => {
      if (f === 'name') return (p.name || '').toLowerCase();
      if (f === 'cost_price') return p.costPrice ?? 0;
      if (f === 'sale_price') return p.salePrice ?? 0;
      return p.stock ?? 0;
    };

    return [...products].sort((a, b) => {
      const va = getValue(a, sortField);
      const vb = getValue(b, sortField);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : (va as number) - (vb as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [products, sortField, sortDir]);

  // Agrupa TODOS os produtos por categoria primeiro, mantendo cada categoria
  // inteira (uma categoria NUNCA é dividida entre páginas). Antes a paginação
  // era feita na lista plana alfabética e depois reagrupada por página, o que
  // espalhava os produtos de uma mesma categoria (ex.: CAFES) por várias
  // páginas, dando a impressão de que faltavam produtos.
  const allGroups = useMemo(() => {
    const catMap = new Map<string, { name: string; products: any[] }>();
    const uncategorized: any[] = [];

    for (const p of sortedFlat) {
      if (!p.categoryId) {
        uncategorized.push(p);
        continue;
      }
      if (!catMap.has(p.categoryId)) {
        const cat = categories.find((c: any) => c.id === p.categoryId);
        catMap.set(p.categoryId, { name: cat?.name || 'Sem nome', products: [] });
      }
      catMap.get(p.categoryId)!.products.push(p);
    }

    const groups = [...catMap.entries()]
      .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(([id, g]) => ({ id, ...g }));

    if (uncategorized.length > 0) {
      groups.push({ id: '__none__', name: 'Sem Categoria', products: uncategorized });
    }

    return groups;
  }, [sortedFlat, categories]);

  // Empacota categorias inteiras em páginas de ~PAGE_SIZE produtos. Se uma
  // categoria sozinha ultrapassar PAGE_SIZE, ela fica em sua própria página
  // (nunca dividida), garantindo que todos os seus produtos apareçam juntos.
  const pages = useMemo(() => {
    const result: { id: string; name: string; products: any[] }[][] = [];
    let current: { id: string; name: string; products: any[] }[] = [];
    let currentCount = 0;

    for (const group of allGroups) {
      if (currentCount > 0 && currentCount + group.products.length > PAGE_SIZE) {
        result.push(current);
        current = [];
        currentCount = 0;
      }
      current.push(group);
      currentCount += group.products.length;
    }
    if (current.length > 0) result.push(current);
    if (result.length === 0) result.push([]);
    return result;
  }, [allGroups]);

  const totalProducts = sortedFlat.length;
  const totalPages = pages.length;

  // Current page groups (uma categoria inteira nunca é dividida)
  const visibleGroups = useMemo(() => {
    return pages[Math.min(page, pages.length - 1)] ?? [];
  }, [pages, page]);

  const visibleProducts = visibleGroups.reduce((sum, group) => sum + group.products.length, 0);


  const handleBlur = useCallback(async (productId: string, field: EditableField, value: string): Promise<boolean> => {
    const isName = field === 'name';
    const finalValue = isName ? value.toUpperCase().trim() : value;
    const num = isName ? 0 : parseEditableValue(finalValue, field === 'stock');
    
    if (isName && !finalValue) return false; // Don't allow empty names

    try {
      const payload: {
        p_id: string;
        p_name?: string;
        p_cost_price?: number;
        p_sale_price?: number;
        p_stock?: number;
      } = { p_id: productId };

      if (field === 'name') payload.p_name = finalValue;
      if (field === 'cost_price') payload.p_cost_price = num;
      if (field === 'sale_price') payload.p_sale_price = num;
      if (field === 'stock') payload.p_stock = num;

      const { error } = await resilientRpc('update_product', payload);

      if (error) {
        throw error;
      }

      // Atualiza o cache localmente (sem refetch pesado) para o valor PERSISTIR na
      // tela e REFLETIR no resto do sistema. Sem isso, o EditableCell revertia para
      // o valor antigo do cache logo após salvar.
      const patchProduct = (p: any) => {
        if (p.id !== productId) return p;
        if (field === 'name') return { ...p, name: finalValue };
        if (field === 'cost_price') return { ...p, costPrice: num };
        if (field === 'sale_price') return { ...p, salePrice: num };
        if (field === 'stock') return { ...p, stock: num };
        return p;
      };
      queryClient.setQueryData<any[]>(['admin-products'], (current) =>
        current ? current.map(patchProduct) : current
      );
      // Marca as demais listas do catálogo como stale — elas refazem sob demanda
      // quando abertas, sem travar a edição rápida.
      queryClient.invalidateQueries({ queryKey: ['products'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['pdv-products'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['products-public'], refetchType: 'none' });
      return true;
    } catch (error) {
      const description = error instanceof Error
        ? error.message
        : typeof error === 'object' && error && 'message' in error
          ? String(error.message)
          : 'Não foi possível salvar a alteração.';

      toast({ title: 'Erro ao salvar', description, variant: 'destructive' });
      return false;
    }
  }, [queryClient, toast]);

  const handleDelete = useCallback(async (productId: string, productName: string) => {
    queryClient.setQueryData<any[]>(['admin-products'], (current = []) =>
      current.filter((p) => p.id !== productId)
    );

    try {
      const { error } = await resilientRpc('delete_product', { p_id: productId });
      if (error) throw error;

      toast({ title: 'Produto excluído', description: productName });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-products'] }),
      ]);
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: ['admin-products'] });

      const description = error instanceof Error
        ? error.message
        : 'Não foi possível excluir o produto.';

      toast({ title: 'Erro ao excluir', description, variant: 'destructive' });
    }
  }, [queryClient, toast]);

  const [cloningId, setCloningId] = useState<string | null>(null);

  const handleClone = useCallback(async (product: any) => {
    if (cloningId) return;
    setCloningId(product.id);

    try {
      let newImageUrl: string | null = null;

      // Try copying image server-side (best-effort — never blocks the clone)
      if (product.imageUrl) {
        try {
          const sessionToken = getAdminSessionToken();
          if (sessionToken) {
            const urlObj = new URL(product.imageUrl);
            const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/images\/(.+)$/);
            const sourcePath = pathMatch?.[1];

            if (sourcePath) {
              const { data, error } = await supabase.functions.invoke('copy-storage-image', {
                body: { sourcePath, sessionToken },
              });
              if (!error && data?.publicUrl) {
                newImageUrl = data.publicUrl;
              } else if (error) {
                console.warn('[clone] copy-storage-image falhou, reutilizando URL original:', error);
              }
            }
          }
        } catch (imgErr) {
          console.warn('[clone] erro ao copiar imagem (ignorado):', imgErr);
        }
      }

      // Clone the product in DB — fallback to original image URL when copy failed
      const rpcParams: Record<string, unknown> = { p_product_id: product.id };
      if (newImageUrl) rpcParams.p_new_image_url = newImageUrl;

      const { data, error } = await resilientRpc('clone_product', rpcParams);
      if (error) throw error;

      toast({ title: '✅ Produto clonado!', description: `${product.name} (CÓPIA)` });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-products'] }),
        queryClient.invalidateQueries({ queryKey: ['barcode-products'] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-products'] }),
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao clonar';
      toast({ title: 'Erro ao clonar', description: msg, variant: 'destructive' });
    } finally {
      setCloningId(null);
    }
  }, [cloningId, queryClient, toast]);

  const handleTierChange = useCallback(async (productId: string, tier: string | null): Promise<boolean> => {
    try {
      const { error } = await resilientRpc('update_product', { 
        p_id: productId, 
        p_tier: tier 
      });
      if (error) throw error;

      // Keep this interaction local; avoid a full catalog refetch on every star click.
      return true;
    } catch (error) {
      toast({ title: 'Erro ao salvar tier', variant: 'destructive' });
      return false;
    }
  }, [queryClient, toast]);

  const handlePlatformToggle = useCallback(async (productId: string, platform: 'on99food' | 'onIfood', value: boolean): Promise<boolean> => {
    try {
      const payload: Record<string, unknown> = { p_id: productId };
      if (platform === 'on99food') payload.p_on_99food = value;
      if (platform === 'onIfood') payload.p_on_ifood = value;

      const { error } = await resilientRpc('update_product', payload);
      if (error) throw error;

      // Optimistic update is enough; no refetch to keep the table responsive.
      return true;
    } catch (error) {
      toast({ title: 'Erro ao salvar conferência', variant: 'destructive' });
      return false;
    }
  }, [queryClient, toast]);

  const handlePlatformPrice = useCallback(async (productId: string, platform: 'price99food' | 'priceIfood', value: string): Promise<boolean> => {
    const num = parseEditableValue(value);

    try {
      const payload: Record<string, unknown> = { p_id: productId };
      if (platform === 'price99food') payload.p_price_99food = num;
      if (platform === 'priceIfood') payload.p_price_ifood = num;

      const { error } = await resilientRpc('update_product', payload);
      if (error) throw error;

      // Optimistic update is enough; no refetch to keep the table responsive.
      return true;
    } catch (error) {
      toast({ title: 'Erro ao salvar preço', variant: 'destructive' });
      return false;
    }
  }, [queryClient, toast]);

  const [applyingMarkup, setApplyingMarkup] = useState<string | null>(null);
  const [percent99, setPercent99] = useState('0');
  const [percentIfood, setPercentIfood] = useState('0');

  const handleApplyMarkup = async (platform: '99food' | 'ifood', percent: number) => {
    setApplyingMarkup(platform);
    try {
      const { data, error } = await resilientRpc('apply_platform_price_markup', {
        p_platform: platform,
        p_percent: percent,
      });
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({
        title: '✅ Preços atualizados',
        description: `${platform === '99food' ? '99Food' : 'iFood'}: venda ${percent >= 0 ? '+' : ''}${percent}% aplicado a ${data ?? 0} produtos.`,
      });
    } catch (error) {
      toast({ title: 'Erro ao aplicar percentual', variant: 'destructive' });
    } finally {
      setApplyingMarkup(null);
    }
  };

  const [roundingPlatform, setRoundingPlatform] = useState<string | null>(null);

  const handleRoundPrices = async (platform: '99food' | 'ifood') => {
    setRoundingPlatform(platform);
    try {
      const { data, error } = await resilientRpc('round_platform_prices', {
        p_platform: platform,
      });
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({
        title: '✅ Preços arredondados',
        description: `${platform === '99food' ? '99Food' : 'iFood'}: ${data ?? 0} preços ajustados para terminar em .49 ou .90.`,
      });
    } catch (error) {
      toast({ title: 'Erro ao arredondar preços', variant: 'destructive' });
    } finally {
      setRoundingPlatform(null);
    }
  };




  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  return (
    <>
    <div className="border rounded overflow-x-auto">
      <table className="w-full min-w-[1040px] table-fixed text-xs">
        <colgroup>
          <col className="w-14" />
          <col className="w-[320px]" />
          <col className="w-[92px]" />
          <col className="w-[92px]" />
          <col className="w-[76px]" />
          <col className="w-[80px]" />
          <col className="w-[64px]" />
          <col className="w-[64px]" />
          <col className="w-[150px]" />
          <col className="w-[150px]" />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted/80 border-b">
            <th className="w-14 px-1"></th>
            <th
              className="text-left px-2 py-2 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={() => toggleSort('name')}
            >
              <span className="flex items-center">Produto <SortIcon field="name" /></span>
            </th>
            <th
              className="text-right px-2 py-2 font-medium text-muted-foreground w-[16%] cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={() => toggleSort('cost_price')}
            >
              <span className="flex items-center justify-end">Custo <SortIcon field="cost_price" /></span>
            </th>
            <th
              className="text-right px-2 py-2 font-medium text-muted-foreground w-[16%] cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={() => toggleSort('sale_price')}
            >
              <span className="flex items-center justify-end">Venda <SortIcon field="sale_price" /></span>
            </th>
             <th
               className="text-right px-2 py-2 font-medium text-muted-foreground w-[16%] cursor-pointer select-none hover:text-foreground transition-colors"
               onClick={() => toggleSort('stock')}
             >
               <span className="flex items-center justify-end">Estoque <SortIcon field="stock" /></span>
             </th>
             <th className="text-center px-2 py-2 font-medium text-muted-foreground w-[80px]">
               <span className="flex items-center justify-center">Tier</span>
             </th>
             <th className="text-center px-1 py-2 font-medium text-muted-foreground w-[64px]">
               <span className="flex items-center justify-center text-yellow-500">99Food</span>
             </th>
             <th className="text-center px-1 py-2 font-medium text-muted-foreground w-[64px]">
               <span className="flex items-center justify-center text-red-500">iFood</span>
             </th>
             <th className="text-right px-1 py-1 font-medium text-muted-foreground w-[150px]">
               <PlatformPriceHeader
                 label="Preço 99Food"
                 labelClass="text-yellow-500"
                 percent={percent99}
                 setPercent={setPercent99}
                 onApply={() => handleApplyMarkup('99food', parseEditableValue(percent99))}
                 applying={applyingMarkup === '99food'}
                 onRound={() => handleRoundPrices('99food')}
                 rounding={roundingPlatform === '99food'}
               />
             </th>
             <th className="text-right px-1 py-1 font-medium text-muted-foreground w-[150px]">
               <PlatformPriceHeader
                 label="Preço iFood"
                 labelClass="text-red-500"
                 percent={percentIfood}
                 setPercent={setPercentIfood}
                 onApply={() => handleApplyMarkup('ifood', parseEditableValue(percentIfood))}
                 applying={applyingMarkup === 'ifood'}
                 onRound={() => handleRoundPrices('ifood')}
                 rounding={roundingPlatform === 'ifood'}
               />
             </th>
           </tr>
         </thead>
          <tbody>
           {visibleGroups.map((group) => (
               <CategoryGroup key={group.id} group={group} onBlur={handleBlur} onRequestDelete={setDeleteTarget} onTierChange={handleTierChange} onPlatformToggle={handlePlatformToggle} onPlatformPrice={handlePlatformPrice} onClone={handleClone} cloningId={cloningId} />
            ))}
         </tbody>
      </table>
    </div>
    <div className="flex items-center justify-between gap-3 border-x border-b rounded-b px-3 py-3 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setPage((p) => Math.max(0, p - 1))}
        disabled={page <= 0}
        className="rounded border border-input bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ← Anterior
      </button>
      <span className="text-center">
        Página <strong className="text-foreground">{page + 1}</strong> de {totalPages}
        <span className="hidden sm:inline"> · {visibleProducts} de {totalProducts} produtos</span>
      </span>
      <button
        type="button"
        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        disabled={page >= totalPages - 1}
        className="rounded border border-input bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Próxima →
      </button>
    </div>

    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir <strong className="text-foreground">{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (!deleteTarget) return;
              void handleDelete(deleteTarget.id, deleteTarget.name);
              setDeleteTarget(null);
            }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

const CategoryGroup = memo(function CategoryGroup({ group, onBlur, onRequestDelete, onTierChange, onPlatformToggle, onPlatformPrice, onClone, cloningId }: {
  group: { id: string; name: string; products: any[] };
  onBlur: (id: string, field: EditableField, value: string) => SaveResult;
  onRequestDelete: (target: { id: string; name: string }) => void;
  onTierChange: (id: string, tier: string | null) => SaveResult;
  onPlatformToggle: (id: string, platform: 'on99food' | 'onIfood', value: boolean) => SaveResult;
  onPlatformPrice: (id: string, platform: 'price99food' | 'priceIfood', value: string) => SaveResult;
  onClone: (product: any) => void;
  cloningId: string | null;
}) {
  return (
    <>
      <tr>
        <td colSpan={10} className="bg-primary/10 px-2 py-1.5 text-xs font-semibold text-primary border-b border-primary/20">
          {group.name} ({group.products.length})
        </td>
      </tr>
      {group.products.map((p) => (
        <ProductRow key={p.id} product={p} onBlur={onBlur} onRequestDelete={onRequestDelete} onTierChange={onTierChange} onPlatformToggle={onPlatformToggle} onPlatformPrice={onPlatformPrice} onClone={onClone} cloningId={cloningId} />
      ))}
    </>
  );
});

const ProductRow = memo(function ProductRow({ product, onBlur, onRequestDelete, onTierChange, onPlatformToggle, onPlatformPrice, onClone, cloningId }: {
  product: any;
  onBlur: (id: string, field: EditableField, value: string) => SaveResult;
  onRequestDelete: (target: { id: string; name: string }) => void;
  onTierChange: (id: string, tier: string | null) => SaveResult;
  onPlatformToggle: (id: string, platform: 'on99food' | 'onIfood', value: boolean) => SaveResult;
  onPlatformPrice: (id: string, platform: 'price99food' | 'priceIfood', value: string) => SaveResult;
  onClone: (product: any) => void;
  cloningId: string | null;
}) {
  const isCloning = cloningId === product.id;
  const [localTier, setLocalTier] = useState<string | null>(product.tier || null);
  const tierStars = localTier === 'essencial' ? 1 : localTier === 'premium' ? 2 : localTier === 'luxo' ? 3 : 0;

  useEffect(() => {
    setLocalTier(product.tier || null);
  }, [product.tier]);
  
  const cycleTier = () => {
    const tiers = [null, 'essencial', 'premium', 'luxo'] as const;
    const previousTier = localTier;
    const currentIndex = tiers.indexOf(localTier as typeof tiers[number]);
    const nextTier = tiers[(currentIndex + 1) % tiers.length];
    setLocalTier(nextTier);
    Promise.resolve(onTierChange(product.id, nextTier)).then((ok) => {
      if (!ok) setLocalTier(previousTier);
    }).catch(() => setLocalTier(previousTier));
  };

  return (
    <tr className="border-b border-border/40 hover:bg-muted/30 group">
      <td className="px-1 py-0.5 text-center align-top">
        <div className="flex items-center gap-0.5 justify-center">
          <button
            onClick={() => onClone(product)}
            disabled={!!cloningId}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary disabled:opacity-50"
            title="Clonar produto"
          >
            {isCloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete({ id: product.id, name: product.name })}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Excluir produto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      <td className="px-2 py-1 align-top">
        <EditableTextCell
          defaultValue={product.name}
          onBlur={(v) => onBlur(product.id, 'name', v)}
        />
      </td>
      <td className="px-1 py-0.5 align-top">
        <EditableCell
          defaultValue={String(product.costPrice ?? 0)}
          onBlur={(v) => onBlur(product.id, 'cost_price', v)}
          prefix="R$"
        />
      </td>
      <td className="px-1 py-0.5 align-top">
        <EditableCell
          defaultValue={String(product.salePrice ?? 0)}
          onBlur={(v) => onBlur(product.id, 'sale_price', v)}
          prefix="R$"
        />
      </td>
      <td className="px-1 py-0.5 align-top">
        <EditableCell
          defaultValue={String(product.stock ?? 0)}
          onBlur={(v) => onBlur(product.id, 'stock', v)}
          isInt
        />
      </td>
      <td className="px-1 py-0.5 text-center align-top">
        <button
          onClick={cycleTier}
          className="inline-flex min-h-6 items-center gap-0.5 px-1 py-0.5 rounded hover:bg-muted"
          title={localTier ? `${localTier} (clique para alternar)` : 'Sem tier (clique para definir)'}
        >
          {tierStars === 0 ? (
            <Star className="h-3 w-3 text-muted-foreground/40" />
          ) : (
            Array.from({ length: tierStars }).map((_, i) => (
              <Star key={i} className={`h-3 w-3 fill-current ${
                tierStars === 1 ? 'text-amber-600' : tierStars === 2 ? 'text-blue-500' : 'text-purple-500'
              }`} />
            ))
          )}
        </button>
      </td>
      <td className="px-1 py-0.5 text-center align-top">
        <PlatformCheck
          checked={!!product.on99food}
          onToggle={(v) => onPlatformToggle(product.id, 'on99food', v)}
          activeClass="bg-yellow-500 border-yellow-500 text-black"
          title="Cadastrado no 99Food"
        />
      </td>
      <td className="px-1 py-0.5 text-center align-top">
        <PlatformCheck
          checked={!!product.onIfood}
          onToggle={(v) => onPlatformToggle(product.id, 'onIfood', v)}
          activeClass="bg-red-600 border-red-600 text-white"
          title="Cadastrado no iFood"
        />
      </td>
      <td className="px-1 py-0.5 align-top">
        <EditableCell
          defaultValue={String(product.price99food ?? product.salePrice ?? 0)}
          onBlur={(v) => onPlatformPrice(product.id, 'price99food', v)}
          prefix="R$"
        />
      </td>
      <td className="px-1 py-0.5 align-top">
        <EditableCell
          defaultValue={String(product.priceIfood ?? product.salePrice ?? 0)}
          onBlur={(v) => onPlatformPrice(product.id, 'priceIfood', v)}
          prefix="R$"
        />
      </td>
    </tr>
  );
});

function PlatformPriceHeader({ label, labelClass, percent, setPercent, onApply, applying, onRound, rounding }: {
  label: string;
  labelClass: string;
  percent: string;
  setPercent: (v: string) => void;
  onApply: () => void;
  applying: boolean;
  onRound: () => void;
  rounding: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`font-semibold ${labelClass}`}>{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">Venda</span>
        <input
          type="number"
          step="any"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          className="w-12 text-right text-[11px] bg-background border border-input rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-primary"
          title="Percentual sobre o preço de venda"
        />
        <span className="text-[10px] text-muted-foreground">%</span>
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 disabled:opacity-50"
          title="Aplicar percentual a todos os produtos"
        >
          {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Aplicar'}
        </button>
      </div>
      <button
        type="button"
        onClick={onRound}
        disabled={rounding}
        className="px-1.5 py-0.5 rounded border border-input bg-background text-[10px] font-medium hover:bg-muted disabled:opacity-50 flex items-center gap-1"
        title="Arredondar preços para terminar em .49 ou .90"
      >
        {rounding ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Arredondar .49/.90'}
      </button>
    </div>
  );
}

function PlatformCheck({ checked, onToggle, activeClass, title }: {
  checked: boolean;
  onToggle: (value: boolean) => SaveResult;
  activeClass: string;
  title: string;
}) {
  const [localChecked, setLocalChecked] = useState(checked);

  useEffect(() => {
    setLocalChecked(checked);
  }, [checked]);

  const handleClick = () => {
    const previous = localChecked;
    const next = !localChecked;
    setLocalChecked(next);
    Promise.resolve(onToggle(next)).then((ok) => {
      if (!ok) setLocalChecked(previous);
    }).catch(() => setLocalChecked(previous));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      className={`inline-flex items-center justify-center h-5 w-5 rounded border transition-colors ${
        localChecked ? activeClass : 'border-muted-foreground/40 text-transparent hover:border-muted-foreground'
      }`}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}

function EditableCell({ defaultValue, onBlur, prefix, isInt }: {
  defaultValue: string;
  onBlur: (value: string) => SaveResult;
  prefix?: string;
  isInt?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [lastSavedValue, setLastSavedValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    // Não sincronizar com o cache enquanto um salvamento está em andamento —
    // senão a célula reverte para o valor antigo antes do save concluir.
    if (editing || savingRef.current) return;
    if (defaultValue !== lastSavedValue) {
      setValue(defaultValue);
      setLastSavedValue(defaultValue);
    }
  }, [defaultValue, editing, lastSavedValue]);

  const handleClick = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    const normalizedValue = normalizeEditableValue(value, isInt);

    setEditing(false);

    if (normalizedValue !== value) {
      setValue(normalizedValue);
    }

    if (normalizedValue !== lastSavedValue) {
      const previous = lastSavedValue;
      setLastSavedValue(normalizedValue);
      savingRef.current = true;
      Promise.resolve(onBlur(normalizedValue)).then((ok) => {
        if (!ok) {
          setValue(previous);
          setLastSavedValue(previous);
        }
      }).catch(() => {
        setValue(previous);
        setLastSavedValue(previous);
      }).finally(() => {
        savingRef.current = false;
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') inputRef.current?.blur();
    else if (e.key === 'Escape') { setValue(lastSavedValue); setEditing(false); }
  };

  if (!editing) {
    return (
      <div
        onClick={handleClick}
        className="text-right cursor-pointer px-1 py-0.5 rounded hover:bg-primary/10 min-h-[24px] flex items-center justify-end"
      >
        <span className="text-foreground">
          {prefix && <span className="text-muted-foreground mr-0.5">{prefix}</span>}
          {parseEditableValue(value, isInt).toLocaleString('pt-BR', {
            minimumFractionDigits: isInt ? 0 : 2,
            maximumFractionDigits: isInt ? 0 : 2,
          })}
        </span>
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      step={isInt ? '1' : 'any'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full text-right text-xs bg-background border border-primary rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-primary"
      autoFocus
    />
  );
}

function EditableTextCell({ defaultValue, onBlur }: {
  defaultValue: string;
  onBlur: (value: string) => SaveResult;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [lastSavedValue, setLastSavedValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (editing || savingRef.current) return;
    if (defaultValue !== lastSavedValue) {
      setValue(defaultValue);
      setLastSavedValue(defaultValue);
    }
  }, [defaultValue, editing, lastSavedValue]);

  const handleClick = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    const trimmed = value.toUpperCase().trim();
    setEditing(false);
    if (trimmed !== value) setValue(trimmed);
    if (trimmed && trimmed !== lastSavedValue) {
      const previous = lastSavedValue;
      setLastSavedValue(trimmed);
      savingRef.current = true;
      Promise.resolve(onBlur(trimmed)).then((ok) => {
        if (!ok) {
          setValue(previous);
          setLastSavedValue(previous);
        }
      }).catch(() => {
        setValue(previous);
        setLastSavedValue(previous);
      }).finally(() => {
        savingRef.current = false;
      });
    } else {
      setValue(lastSavedValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') inputRef.current?.blur();
    else if (e.key === 'Escape') { setValue(lastSavedValue); setEditing(false); }
  };

  if (!editing) {
    return (
      <div
        onClick={handleClick}
        className="cursor-pointer px-1 py-0.5 rounded hover:bg-primary/10 min-h-[24px] flex items-center"
      >
        <span className="text-foreground leading-tight break-words">{value}</span>
      </div>

    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full text-left text-xs bg-background border border-primary rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-primary uppercase"
      autoFocus
    />
  );
}
