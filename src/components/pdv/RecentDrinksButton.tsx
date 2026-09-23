import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Plus, Trash2, GlassWater, Pencil, Minus, Wine, Zap, ArrowLeftRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { CustomDrink, CustomDrinkDose, CustomDrinkEnergetico, CustomDrinkFruit, CustomDrinkGelo } from '@/shared/schema';
import { nanoid } from 'nanoid';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import { useDrinkFruits } from '@/hooks/use-drink-fruits';
import { getFruitEmoji } from '@/lib/emoji-icons';

/**
 * Repetir uma receita salva ("Últimos") pulava a baixa de doses da garrafa aberta —
 * só os fluxos originais (Monte seu Drink/Caipirinha/Copão/Caipi Ice) descontavam.
 * Replica aqui a mesma baixa: destilados pelo bottleId já salvo na receita, e o
 * energético "de garrafa" (grátis) resolvendo a garrafa aberta atual pelo product_id,
 * já que a receita salva não guarda o bottleId do energético.
 */
async function deductRecentDrinkBottles(drink: CustomDrink): Promise<{ ok: true } | { ok: false; itemName: string }> {
  for (const d of drink.doses ?? []) {
    const { error } = await supabase.rpc('deduct_bottle_doses', {
      p_bottle_id: d.bottleId,
      p_doses_used: d.doseCount,
    });
    if (error) return { ok: false, itemName: d.bottleName };
  }
  if (drink.energetico?.type === 'garrafa') {
    const { data: bottle } = await supabase
      .from('open_bottles')
      .select('id')
      .eq('product_id', drink.energetico.productId)
      .eq('is_empty', false)
      .limit(1)
      .maybeSingle();
    if (bottle) {
      const { error } = await supabase.rpc('deduct_bottle_doses', {
        p_bottle_id: bottle.id,
        p_doses_used: (drink.quantity || 1),
      });
      if (error) return { ok: false, itemName: drink.energetico.productName };
    }
  }
  queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
  queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
  queryClient.invalidateQueries({ queryKey: ['assembly-bottles'] });
  return { ok: true };
}

const STORAGE_KEY = 'pdv-recent-drinks-v1';
const MAX_ITEMS = 20;

function readRecent(): CustomDrink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeRecent(items: CustomDrink[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* ignore */
  }
}

/** Soma de todos os componentes conhecidos (sem taxa de montagem). */
function sumComponents(drink: CustomDrink): number {
  const doses = (drink.doses ?? []).reduce((s, d) => s + (d.pricePerDose || 0) * (d.doseCount || 0), 0);
  const energ = drink.energetico?.price ?? 0;
  const fruits = (drink.fruits ?? []).reduce((s, f) => s + (f.price || 0), 0);
  const gelo = drink.gelo?.price ?? 0;
  return doses + energ + fruits + gelo;
}

/** Preserva a "taxa de montagem" (diferença entre total original e soma). */
function assemblyFee(drink: CustomDrink): number {
  return Math.max(0, (drink.totalPrice || 0) - sumComponents(drink));
}

/**
 * Save a drink recipe to the recent list. Dedup by name+description+price
 */
export function rememberRecentDrink(drink: CustomDrink) {
  const hasRecipe =
    (drink.doses?.length ?? 0) > 0 ||
    (drink.fruits?.length ?? 0) > 0 ||
    !!drink.gelo ||
    !!drink.energetico;
  if (!hasRecipe) return;
  const list = readRecent();
  const key = `${drink.name}|${drink.description}|${drink.totalPrice}`;
  const filtered = list.filter(
    (d) => `${d.name}|${d.description}|${d.totalPrice}` !== key,
  );
  filtered.unshift({ ...drink, quantity: 1 });
  writeRecent(filtered);
  window.dispatchEvent(new CustomEvent('pdv-recent-drinks-updated'));
}

interface Props {
  onAddCustomDrink: (drink: CustomDrink) => void;
}

// ---------- Catalog for swapping ----------
interface BottleOpt { bottle_id: string; product_id: string; product_name: string; dose_price: number; product_type: string | null }
interface EnergOpt { productId: string; productName: string; price: number; type: 'garrafa' | 'lata' }
interface GeloOpt { id: string; name: string; price: number }

function useRecipeCatalog(open: boolean) {
  const [bottles, setBottles] = useState<BottleOpt[]>([]);
  const [energeticos, setEnergeticos] = useState<EnergOpt[]>([]);
  const [gelos, setGelos] = useState<GeloOpt[]>([]);
  const { data: fruits = [] } = useDrinkFruits({ activeOnly: true, enabled: open });

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data: b } = await supabase.rpc('get_available_bottles_for_assembly');
        const rawBottles = (b || []) as any[];
        const productIds = [...new Set(rawBottles.map(x => x.product_id))];
        let typeMap = new Map<string, string>();
        if (productIds.length) {
          const { data: prods } = await supabase.from('products').select('id, product_type').in('id', productIds);
          (prods || []).forEach((p: any) => typeMap.set(p.id, p.product_type || ''));
        }
        const spirits: BottleOpt[] = [];
        const energBottles: EnergOpt[] = [];
        rawBottles.forEach(x => {
          const type = typeMap.get(x.product_id) || '';
          if (type === 'energetico') {
            energBottles.push({ productId: x.product_id, productName: x.product_name, price: 0, type: 'garrafa' });
          } else {
            spirits.push({ bottle_id: x.bottle_id, product_id: x.product_id, product_name: x.product_name, dose_price: Number(x.dose_price), product_type: type });
          }
        });
        setBottles(spirits);

        const { data: enerProds } = await supabase.from('products_public').select('id, name, sale_price').eq('product_type', 'energetico').eq('is_active', true).order('name');
        const openedIds = new Set(energBottles.map(e => e.productId));
        const canned: EnergOpt[] = (enerProds || [])
          .filter((p: any) => !openedIds.has(p.id))
          .map((p: any) => ({ productId: p.id, productName: p.name, price: Number(p.sale_price), type: 'lata' as const }));
        setEnergeticos([...energBottles, ...canned]);

        const { data: geloCats } = await supabase.from('categories_public').select('id').ilike('name', '%gelo%');
        const catIds = (geloCats || []).map((c: any) => c.id).filter(Boolean);
        if (catIds.length) {
          const { data: geloProds } = await supabase.from('products_public').select('id, name, sale_price').in('category_id', catIds).eq('is_active', true).order('sale_price');
          setGelos((geloProds || []).map((p: any) => ({ id: p.id, name: p.name, price: Number(p.sale_price) })));
        } else {
          setGelos([]);
        }
      } catch (err) {
        console.warn('[RecentDrinks] catalog load failed', err);
      }
    })();
  }, [open]);

  return { bottles, energeticos, gelos, fruits };
}

// ---------- Picker dialog ----------
type PickerKind = 'dose' | 'energetico' | 'gelo' | 'fruta';
interface PickerState {
  kind: PickerKind;
  /** index in draft.doses / draft.fruits, or 'new' when adding */
  target: number | 'new';
}

function PickerDialog({
  state,
  onClose,
  onPick,
  catalog,
}: {
  state: PickerState | null;
  onClose: () => void;
  onPick: (item: any) => void;
  catalog: ReturnType<typeof useRecipeCatalog>;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (state) setQ(''); }, [state]);
  if (!state) return null;

  const items: { key: string; label: string; sub?: string; payload: any }[] = (() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filter = (name: string) => !q.trim() || norm(name).includes(norm(q));
    if (state.kind === 'dose') {
      return catalog.bottles.filter(b => filter(b.product_name)).map(b => ({
        key: b.bottle_id,
        label: b.product_name,
        sub: `R$ ${b.dose_price.toFixed(2)} / dose`,
        payload: b,
      }));
    }
    if (state.kind === 'energetico') {
      return catalog.energeticos.filter(e => filter(e.productName)).map(e => ({
        key: `${e.type}-${e.productId}`,
        label: e.productName,
        sub: e.price > 0 ? `R$ ${e.price.toFixed(2)} (${e.type})` : `Grátis (garrafa aberta)`,
        payload: e,
      }));
    }
    if (state.kind === 'gelo') {
      return catalog.gelos.filter(g => filter(g.name)).map(g => ({
        key: g.id, label: g.name, sub: `R$ ${g.price.toFixed(2)}`, payload: g,
      }));
    }
    return catalog.fruits.filter(f => filter(f.name)).map(f => ({
      key: f.id, label: f.name, sub: `R$ ${f.price.toFixed(2)}`, payload: f,
    }));
  })();

  const title = state.kind === 'dose' ? 'Escolher destilado'
    : state.kind === 'energetico' ? 'Escolher energético'
    : state.kind === 'gelo' ? 'Escolher gelo'
    : 'Escolher fruta';

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>Pesquise ou selecione para substituir.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Pesquisar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum item encontrado.</p>
          )}
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => onPick(it.payload)}
              className="w-full text-left p-2 rounded-lg border bg-background hover:bg-secondary/50 transition-colors"
            >
              <p className="text-sm font-bold truncate">{it.label}</p>
              {it.sub && <p className="text-[10px] text-muted-foreground">{it.sub}</p>}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit modal ----------
function EditRecentDrinkModal({
  drink,
  open,
  onOpenChange,
  onConfirm,
}: {
  drink: CustomDrink | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (edited: CustomDrink) => void;
}) {
  const [draft, setDraft] = useState<CustomDrink | null>(drink);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const baseFee = useMemo(() => (drink ? assemblyFee(drink) : 0), [drink]);
  const catalog = useRecipeCatalog(open);

  useEffect(() => {
    setDraft(drink ? JSON.parse(JSON.stringify(drink)) : null);
  }, [drink]);

  if (!draft) return null;

  const total = sumComponents(draft) + baseFee;

  const updateDose = (idx: number, delta: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const doses = [...(prev.doses ?? [])];
      const next = Math.max(0, (doses[idx].doseCount || 0) + delta);
      if (next === 0) {
        doses.splice(idx, 1);
      } else {
        doses[idx] = { ...doses[idx], doseCount: next };
      }
      return { ...prev, doses };
    });
  };

  const removeEnerg = () => setDraft((p) => (p ? { ...p, energetico: null } : p));
  const removeGelo = () => setDraft((p) => (p ? { ...p, gelo: null } : p));
  const removeFruit = (id: string) =>
    setDraft((p) => (p ? { ...p, fruits: (p.fruits ?? []).filter((f) => f.id !== id) } : p));

  const handlePick = (payload: any) => {
    if (!picker) return;
    setDraft((prev) => {
      if (!prev) return prev;
      if (picker.kind === 'dose') {
        const b = payload as BottleOpt;
        const newDose: CustomDrinkDose = {
          bottleId: b.bottle_id,
          bottleName: b.product_name,
          productId: b.product_id,
          doseCount: picker.target === 'new' ? 1 : (prev.doses?.[picker.target as number]?.doseCount || 1),
          pricePerDose: b.dose_price,
        };
        const doses = [...(prev.doses ?? [])];
        if (picker.target === 'new') doses.push(newDose);
        else doses[picker.target as number] = newDose;
        return { ...prev, doses };
      }
      if (picker.kind === 'energetico') {
        const e = payload as EnergOpt;
        const newEnerg: CustomDrinkEnergetico = {
          type: e.type, productId: e.productId, productName: e.productName, price: e.price,
        };
        return { ...prev, energetico: newEnerg };
      }
      if (picker.kind === 'gelo') {
        const g = payload as GeloOpt;
        const newGelo: CustomDrinkGelo = { id: g.id, name: g.name, price: g.price };
        return { ...prev, gelo: newGelo };
      }
      // fruta
      const f = payload as { id: string; name: string; price: number };
      const newFruit: CustomDrinkFruit = { id: f.id, name: f.name, price: f.price };
      const fruits = [...(prev.fruits ?? [])];
      if (picker.target === 'new') fruits.push(newFruit);
      else fruits[picker.target as number] = newFruit;
      return { ...prev, fruits };
    });
    setPicker(null);
  };

  const handleConfirm = () => {
    const parts: string[] = [];
    if (draft.doses?.length) {
      parts.push(draft.doses.map((d) => `${d.doseCount}x ${d.bottleName}`).join(' + '));
    }
    if (draft.energetico) parts.push(draft.energetico.productName);
    if (draft.gelo) parts.push(draft.gelo.name);
    if (draft.fruits?.length) parts.push(draft.fruits.map((f) => f.name).join(', '));
    onConfirm({
      ...draft,
      description: parts.join(' • ') || draft.description,
      totalPrice: Number(total.toFixed(2)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Editar receita
          </DialogTitle>
          <DialogDescription>
            Toque em um item para trocar, ou ajuste a quantidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {/* Doses */}
          {(draft.doses ?? []).map((d, i) => (
            <div key={`${d.bottleId}-${i}`} className="flex items-center gap-2 p-2 rounded-lg border bg-background">
              <Wine className="h-4 w-4 text-purple-500 shrink-0" />
              <button
                type="button"
                onClick={() => setPicker({ kind: 'dose', target: i })}
                className="flex-1 min-w-0 text-left"
                title="Trocar destilado"
              >
                <p className="text-xs font-bold truncate flex items-center gap-1">
                  {d.bottleName}
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                </p>
                <p className="text-[10px] text-muted-foreground">
                  R$ {(d.pricePerDose * d.doseCount).toFixed(2)}
                </p>
              </button>
              <button
                onClick={() => updateDose(i, -1)}
                className="w-7 h-7 rounded-full border flex items-center justify-center"
                aria-label="Diminuir dose"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-sm font-bold w-5 text-center">{d.doseCount}</span>
              <button
                onClick={() => updateDose(i, 1)}
                className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                aria-label="Aumentar dose"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          ))}

          {draft.energetico && (
            <div className="flex items-center gap-2 p-2 rounded-lg border bg-background">
              <Zap className="h-4 w-4 text-amber-500 shrink-0" />
              <button
                type="button"
                onClick={() => setPicker({ kind: 'energetico', target: 0 })}
                className="flex-1 min-w-0 text-left"
                title="Trocar energético"
              >
                <p className="text-xs font-bold truncate flex items-center gap-1">
                  {draft.energetico.productName}
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                </p>
                <p className="text-[10px] text-muted-foreground">R$ {draft.energetico.price.toFixed(2)}</p>
              </button>
              <Button size="sm" variant="ghost" onClick={removeEnerg} className="h-7 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {draft.gelo && (
            <div className="flex items-center gap-2 p-2 rounded-lg border bg-background">
              <span className="text-lg">🧊</span>
              <button
                type="button"
                onClick={() => setPicker({ kind: 'gelo', target: 0 })}
                className="flex-1 min-w-0 text-left"
                title="Trocar gelo"
              >
                <p className="text-xs font-bold truncate flex items-center gap-1">
                  {draft.gelo.name}
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                </p>
                <p className="text-[10px] text-muted-foreground">R$ {draft.gelo.price.toFixed(2)}</p>
              </button>
              <Button size="sm" variant="ghost" onClick={removeGelo} className="h-7 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {(draft.fruits ?? []).map((f, i) => (
            <div key={`${f.id}-${i}`} className="flex items-center gap-2 p-2 rounded-lg border bg-background">
              <span className="text-lg">{getFruitEmoji(f.name)}</span>
              <button
                type="button"
                onClick={() => setPicker({ kind: 'fruta', target: i })}
                className="flex-1 min-w-0 text-left"
                title="Trocar fruta"
              >
                <p className="text-xs font-bold truncate flex items-center gap-1">
                  {f.name}
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                </p>
                <p className="text-[10px] text-muted-foreground">R$ {f.price.toFixed(2)}</p>
              </button>
              <Button size="sm" variant="ghost" onClick={() => removeFruit(f.id)} className="h-7 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {/* Add-new buttons */}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t">
            <Button size="sm" variant="outline" className="gap-1 h-7 text-[11px]" onClick={() => setPicker({ kind: 'dose', target: 'new' })}>
              <Plus className="h-3 w-3" /> Dose
            </Button>
            {!draft.energetico && (
              <Button size="sm" variant="outline" className="gap-1 h-7 text-[11px]" onClick={() => setPicker({ kind: 'energetico', target: 0 })}>
                <Plus className="h-3 w-3" /> Energético
              </Button>
            )}
            {!draft.gelo && (
              <Button size="sm" variant="outline" className="gap-1 h-7 text-[11px]" onClick={() => setPicker({ kind: 'gelo', target: 0 })}>
                <Plus className="h-3 w-3" /> Gelo
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1 h-7 text-[11px]" onClick={() => setPicker({ kind: 'fruta', target: 'new' })}>
              <Plus className="h-3 w-3" /> Fruta
            </Button>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 text-left">
            <p className="text-[10px] text-muted-foreground">TOTAL</p>
            <p className="text-lg font-extrabold text-primary">R$ {total.toFixed(2).replace('.', ',')}</p>
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} className="gap-1">
            <Plus className="h-4 w-4" />

            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
      <PickerDialog
        state={picker}
        onClose={() => setPicker(null)}
        onPick={handlePick}
        catalog={catalog}
      />
    </Dialog>
  );
}

export function RecentDrinksButton({ onAddCustomDrink }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CustomDrink[]>([]);
  const [editing, setEditing] = useState<CustomDrink | null>(null);

  const refresh = useCallback(() => setItems(readRecent()), []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('pdv-recent-drinks-updated', handler);
    return () => window.removeEventListener('pdv-recent-drinks-updated', handler);
  }, [refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleAdd = async (drink: CustomDrink) => {
    const result = await deductRecentDrinkBottles(drink);
    if (!result.ok) {
      toast({ title: `Doses insuficientes em ${result.itemName}`, description: 'Verifique o controle de doses antes de vender.', variant: 'destructive' });
      return;
    }
    onAddCustomDrink({ ...drink, id: nanoid(8), quantity: 1 });
    toast({ title: `${drink.name} adicionado!` });
  };

  const handleEditConfirm = async (edited: CustomDrink) => {
    const result = await deductRecentDrinkBottles(edited);
    if (!result.ok) {
      toast({ title: `Doses insuficientes em ${result.itemName}`, description: 'Verifique o controle de doses antes de vender.', variant: 'destructive' });
      return;
    }
    onAddCustomDrink({ ...edited, id: nanoid(8), quantity: 1 });
    toast({ title: `${edited.name} adicionado!` });
    setEditing(null);
  };

  const handleRemove = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    writeRecent(next);
  };

  const handleClear = () => {
    setItems([]);
    writeRecent([]);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
        title="Últimos drinks montados"
      >
        <History className="h-4 w-4" />
        <span className="hidden sm:inline">Últimos</span>
        {items.length > 0 && (
          <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
            {items.length}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GlassWater className="h-5 w-5 text-primary" />
              Últimos drinks montados
            </DialogTitle>
            <DialogDescription>
              Repita rapidamente uma receita já preparada neste PDV.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum drink montado ainda.<br />
                Ao usar "Monte seu Drink", Caipirinha, Copão ou Caipi Ice, a receita fica salva aqui.
              </p>
            )}

            {items.map((drink, idx) => (
              <div
                key={`${drink.name}-${idx}`}
                className="p-3 rounded-lg border bg-secondary/30 space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{drink.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {drink.description}
                    </p>
                    <p className="text-sm font-extrabold text-primary mt-1">
                      R$ {Number(drink.totalPrice).toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleAdd(drink)}
                        className="gap-1 h-8"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(drink)}
                        className="h-8 px-2"
                        title="Editar receita antes de adicionar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemove(idx)}
                      className="h-7 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {items.length > 0 && (
              <Button variant="outline" onClick={handleClear} className="gap-1">
                <Trash2 className="h-4 w-4" />
                Limpar histórico
              </Button>
            )}
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditRecentDrinkModal
        drink={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onConfirm={handleEditConfirm}
      />
    </>
  );
}
