import { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { isPreparedCategoryName } from '@/shared/schema';
import { normalizeSearch } from '@/lib/text-utils';
import { useAdminProducts, useAdminCategories } from '../use-admin-data';

const CHECKED_STORAGE_KEY = 'admin_shopping_checked';
const LIMIT_OPTIONS = [0, 5, 10, 15, 20] as const;
const DEFAULT_LIMIT = 10;

interface ShoppingItem {
  id: string;
  name: string;
  stock: number;
  categoryName: string;
}

function loadChecked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHECKED_STORAGE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Marcações salvas neste aparelho; item que sai da lista (estoque reposto) perde a marcação. */
function useCheckedIds(currentIds: string[], ready: boolean) {
  const [checked, setChecked] = useState<Set<string>>(loadChecked);

  const persist = (next: Set<string>) => {
    setChecked(next);
    try {
      localStorage.setItem(CHECKED_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // sem storage: a marcação vale só até fechar a tela
    }
  };

  const idsKey = currentIds.join(',');
  useEffect(() => {
    if (!ready) return;
    const stillNeeded = new Set(currentIds);
    const pruned = new Set([...checked].filter((id) => stillNeeded.has(id)));
    if (pruned.size !== checked.size) persist(pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, ready]);

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (!next.delete(id)) next.add(id);
    persist(next);
  };

  return { checked, toggle, clear: () => persist(new Set()) };
}

function buildShareText(items: ShoppingItem[], checked: Set<string>): string {
  const lines = items
    .filter((i) => !checked.has(i.id))
    .map((i) => `- ${i.name} (estoque: ${i.stock})`);
  return ['*LISTA DE COMPRAS - VIBE DRINKS*', '', ...lines].join('\n');
}

function ItemRow({ item, done, onToggle }: { item: ShoppingItem; done: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-3 border-t border-border px-3 py-3 cursor-pointer active:bg-muted/50">
      <Checkbox checked={done} onCheckedChange={onToggle} className="h-6 w-6" />
      <span className={`flex-1 text-sm ${done ? 'line-through text-muted-foreground' : 'font-medium'}`}>{item.name}</span>
      <span className={`text-sm font-bold ${item.stock === 0 ? 'text-destructive' : 'text-yellow-500'}`}>
        {item.stock === 0 ? 'zerado' : `resta ${item.stock}`}
      </span>
    </label>
  );
}

export function ShoppingListTab() {
  const { toast } = useToast();
  const { data: products = [], isLoading } = useAdminProducts();
  const { data: categories = [] } = useAdminCategories();
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
  const [search, setSearch] = useState('');

  const items = useMemo<ShoppingItem[]>(() => {
    const prepared = new Set(categories.filter((c) => isPreparedCategoryName(c.name)).map((c) => c.id));
    return products
      .filter((p) => p.isActive && !prepared.has(p.categoryId || '') && (p.stock ?? 0) <= limit)
      .map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock ?? 0,
        categoryName: categories.find((c) => c.id === p.categoryId)?.name ?? 'Sem categoria',
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.stock - b.stock || a.name.localeCompare(b.name));
  }, [products, categories, limit]);

  const { checked, toggle, clear } = useCheckedIds(items.map((i) => i.id), !isLoading && products.length > 0);

  const visible = useMemo(() => {
    const q = normalizeSearch(search.trim());
    return q ? items.filter((i) => normalizeSearch(i.name).includes(q)) : items;
  }, [items, search]);

  const groups = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    visible.forEach((i) => map.set(i.categoryName, [...(map.get(i.categoryName) ?? []), i]));
    return [...map.entries()];
  }, [visible]);

  const doneCount = items.filter((i) => checked.has(i.id)).length;

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText(items, checked));
      toast({ title: 'Lista copiada', description: 'Só o que ainda falta comprar.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold">Lista de Compras</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        {LIMIT_OPTIONS.map((n) => (
          <Button key={n} size="sm" variant={limit === n ? 'default' : 'outline'} onClick={() => setLimit(n)}>
            {n === 0 ? 'Só zerados' : `até ${n}`}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{doneCount} de {items.length} comprados</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={copyList} disabled={items.length === 0}>
                <ClipboardCopy className="h-4 w-4" /> Copiar
              </Button>
              <Button size="sm" variant="ghost" className="gap-1" onClick={clear} disabled={doneCount === 0}>
                <Trash2 className="h-4 w-4" /> Limpar
              </Button>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto..." className="pl-9" />
      </div>

      {groups.map(([category, list]) => (
        <Card key={category} className="overflow-hidden">
          <p className="bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {category} ({list.length})
          </p>
          {list.map((item) => (
            <ItemRow key={item.id} item={item} done={checked.has(item.id)} onToggle={() => toggle(item.id)} />
          ))}
        </Card>
      ))}

      {!isLoading && items.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">Nada para comprar com esse limite.</p>
      )}
      <p className="text-xs text-muted-foreground">
        As marcações ficam salvas neste aparelho. Quando o estoque do produto for reposto, ele sai da lista sozinho.
      </p>
    </div>
  );
}
