import { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Percent,
  Plus,
  ShoppingCart,
  Snowflake,
  Wine,
  X,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useProducts, useCategories } from '@/hooks/use-supabase-data';
import { useToast } from '@/hooks/use-toast';
import { useCartOptional } from '@/lib/cart';
import { cn } from '@/lib/utils';
import { getFruitEmoji } from '@/lib/emoji-icons';
import { useDrinkFruits } from '@/hooks/use-drink-fruits';
import { filterVisibleIceFlavorOptions, getIceFlavorPhotoUrl, iceAgua, isWaterIceName } from '@/lib/ice-flavor-icons';
import type { Product, ComboGelo } from '@/shared/schema';

interface ComboModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Caminho legado: adiciona item único ao carrinho. Não baixa estoque dos componentes. */
  onAddItem?: (product: Product) => void;
  /**
   * Caminho atômico (preferido no PDV): recebe a lista de componentes REAIS do combo
   * com preço unitário já com desconto rateado. Cada item é inserido como order_item
   * separado, com product_id real, e o trigger trg_deduct_stock_on_order_item baixa
   * o estoque automaticamente para spirit, energético/latas e gelos (sabor ou 5kg).
   */
  onAddComboComponents?: (parts: Array<{ product: Product; quantity: number; unitPrice: number }>, comboLabel: string) => void;
}

const SPIRIT_CLASSES = [
  { key: 'gin', label: 'Gin', keywords: ['gin'] },
  { key: 'whisky', label: 'Whisky', keywords: ['whisky', 'whiskey'] },
  { key: 'vodka', label: 'Vodka', keywords: ['vodka'] },
  { key: 'tequila', label: 'Tequila', keywords: ['tequila'] },
  { key: 'conhaque', label: 'Conhaque', keywords: ['conhaque', 'brandy', 'drecher'] },
] as const;
type SpiritClass = typeof SPIRIT_CLASSES[number]['key'];
const ENERGETICO_KEYWORDS = ['energetico', 'energético'];
const GELO_KEYWORDS = ['gelo'];
const CAN_COUNT = 5;
const FLAVOR_ICE_COUNT = 5;
const COMBO_DISCOUNT = 0.10;
// Fallback: o gelo de água do combo deve usar o produto real GELO COMUM 5KG.
const WATER_ICE_FALLBACK_PRICE = 15;

type Step = 'destilado' | 'energetico' | 'gelo' | 'review';
type EnergeticoMode = '2L' | 'cans' | null;
type IceMode = 'flavor' | 'water' | null;

const STEPS: Step[] = ['destilado', 'energetico', 'gelo', 'review'];
const STEP_LABELS: Record<Step, string> = {
  destilado: 'Bebida',
  energetico: 'Energético',
  gelo: 'Gelo',
  review: 'Pronto',
};
const STEP_TITLES: Record<Step, string> = {
  destilado: '🍾 Escolha o Destilado',
  energetico: '⚡ Escolha o Energético',
  gelo: '🧊 Escolha o Gelo',
  review: '🛒 Seu Combo',
};
const STEP_ICONS: Record<Step, React.ReactNode> = {
  destilado: <Wine className="w-4 h-4" />,
  energetico: <Zap className="w-4 h-4" />,
  gelo: <Snowflake className="w-4 h-4" />,
  review: <ShoppingCart className="w-4 h-4" />,
};

const normalizeText = (v: string) =>
  v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const matchesKeywords = (v: string, kw: string[]) => {
  const n = normalizeText(v);
  return kw.some((k) => n.includes(normalizeText(k)));
};

const isTwoLiter = (p: Product) => {
  const n = normalizeText(p.name).replace(/\s+/g, '');
  return n.includes('2l') || n.includes('2litros') || n.includes('2000ml');
};

const isWaterIce = (p: Product) => {
  return isWaterIceName(p.name);
};

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const getWaterIceComboPrice = (product: Product | null) => {
  const price = Number(product?.salePrice);
  return Number.isFinite(price) && price > 0 ? price : WATER_ICE_FALLBACK_PRICE;
};

interface SelectedCan { product: Product; quantity: number; }
interface SelectedIce { product: Product; quantity: number; }

export function ComboModal({ open, onOpenChange, onAddItem, onAddComboComponents }: ComboModalProps) {
  const cart = useCartOptional();
  const { toast } = useToast();
  const { data: products = [], isLoading: pl } = useProducts();
  const { data: categories = [], isLoading: cl } = useCategories();
  const { data: drinkFruits = [] } = useDrinkFruits({ activeOnly: true });

  const [step, setStep] = useState<Step>('destilado');
  const [selectedSpirit, setSelectedSpirit] = useState<Product | null>(null);
  const [energeticoMode, setEnergeticoMode] = useState<EnergeticoMode>(null);
  const [selected2L, setSelected2L] = useState<Product | null>(null);
  const [selectedCans, setSelectedCans] = useState<SelectedCan[]>([]);
  const [iceMode, setIceMode] = useState<IceMode>(null);
  const [selectedIces, setSelectedIces] = useState<SelectedIce[]>([]);
  const [selectedWaterIce, setSelectedWaterIce] = useState<Product | null>(null);
  const [spiritClass, setSpiritClass] = useState<SpiritClass>('gin');
  const isLoading = pl || cl;
  const stepIndex = STEPS.indexOf(step);

  // ---- Filtered products ----
  const allSpiritKeywords = SPIRIT_CLASSES.flatMap(c => c.keywords);
  const spiritCatIds = useMemo(
    () => categories.filter(c => c.isActive && matchesKeywords(c.name, allSpiritKeywords)).map(c => c.id),
    [categories],
  );
  const allSpirits = useMemo(
    () => products.filter(p => p.isActive && p.stock > 0 && spiritCatIds.includes(p.categoryId ?? '')),
    [products, spiritCatIds],
  );
  const activeClassKw = SPIRIT_CLASSES.find(c => c.key === spiritClass)?.keywords ?? [];
  const spirits = useMemo(
    () => allSpirits.filter(p => {
      const cat = categories.find(c => c.id === p.categoryId);
      return cat && matchesKeywords(cat.name, [...activeClassKw]);
    }),
    [allSpirits, categories, spiritClass],
  );

  const energyCatIds = useMemo(
    () => categories.filter(c => c.isActive && matchesKeywords(c.name, ENERGETICO_KEYWORDS)).map(c => c.id),
    [categories],
  );
  const energy2L = useMemo(
    () => products.filter(p => p.isActive && p.stock > 0 && energyCatIds.includes(p.categoryId ?? '') && isTwoLiter(p)),
    [products, energyCatIds],
  );
  const energyCans = useMemo(
    () => products.filter(p => p.isActive && p.stock > 0 && energyCatIds.includes(p.categoryId ?? '') && !isTwoLiter(p)),
    [products, energyCatIds],
  );

  const geloCatIds = useMemo(
    () => categories.filter(c => c.isActive && matchesKeywords(c.name, GELO_KEYWORDS)).map(c => c.id),
    [categories],
  );
  const flavorIces = useMemo(
    () => filterVisibleIceFlavorOptions(products.filter(p => p.isActive && p.stock > 0 && geloCatIds.includes(p.categoryId ?? ''))),
    [products, geloCatIds],
  );
  const waterIces = useMemo(() => {
    const all = products.filter(p => p.isActive && p.stock > 0 && geloCatIds.includes(p.categoryId ?? '') && isWaterIce(p));
    // Prioriza saco de 5kg (GELO COMUM 5KG) sobre gelo de água em copo
    const score = (p: Product) => {
      const n = normalizeText(p.name).replace(/\s+/g, '');
      if (n.includes('5kg') || n.includes('saco') || n.includes('comum')) return 0;
      return 1;
    };
    return [...all].sort((a, b) => score(a) - score(b)).slice(0, 1);
  }, [products, geloCatIds]);

  // Produto do gelo de água com preço ajustado para o combo (mantém id para baixar estoque correto)
  const waterIceForCombo = useMemo<Product | null>(() => {
    if (!selectedWaterIce) return null;
    return { ...selectedWaterIce, salePrice: String(getWaterIceComboPrice(selectedWaterIce)) };
  }, [selectedWaterIce]);

  const totalCans = selectedCans.reduce((s, i) => s + i.quantity, 0);
  const totalFlavorIce = selectedIces.reduce((s, i) => s + i.quantity, 0);

  // ---- Totals ----
  const totals = useMemo(() => {
    let orig = 0;
    if (selectedSpirit) orig += Number(selectedSpirit.salePrice);
    if (energeticoMode === '2L' && selected2L) orig += Number(selected2L.salePrice);
    if (energeticoMode === 'cans') orig += selectedCans.reduce((s, i) => s + Number(i.product.salePrice) * i.quantity, 0);
    if (iceMode === 'flavor') orig += selectedIces.reduce((s, i) => s + Number(i.product.salePrice) * i.quantity, 0);
    if (iceMode === 'water' && selectedWaterIce) orig += getWaterIceComboPrice(selectedWaterIce);
    return { original: orig, discounted: orig * (1 - COMBO_DISCOUNT) };
  }, [selectedSpirit, energeticoMode, selected2L, selectedCans, iceMode, selectedIces, selectedWaterIce]);

  // ---- Can proceed ----
  const canProceed = useMemo(() => {
    switch (step) {
      case 'destilado': return !!selectedSpirit;
      case 'energetico':
        if (!energeticoMode) return false;
        return energeticoMode === '2L' ? !!selected2L : totalCans === CAN_COUNT;
      case 'gelo':
        if (!iceMode) return false;
        return iceMode === 'flavor' ? totalFlavorIce === FLAVOR_ICE_COUNT : !!selectedWaterIce;
      case 'review': return true;
    }
  }, [step, selectedSpirit, energeticoMode, selected2L, totalCans, iceMode, totalFlavorIce, selectedWaterIce]);

  const resetAll = () => {
    setStep('destilado');
    setSelectedSpirit(null);
    setSpiritClass('gin');
    setEnergeticoMode(null);
    setSelected2L(null);
    setSelectedCans([]);
    setIceMode(null);
    setSelectedIces([]);
    setSelectedWaterIce(null);
  };

  const next = () => { if (canProceed && stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]); };
  const prev = () => { if (stepIndex > 0) setStep(STEPS[stepIndex - 1]); };

  const handleCanChange = (product: Product, delta: number) => {
    setSelectedCans(prev => {
      const draft = [...prev];
      const idx = draft.findIndex(i => i.product.id === product.id);
      const total = draft.reduce((s, i) => s + i.quantity, 0);
      if (idx >= 0) {
        const nq = draft[idx].quantity + delta;
        if (nq <= 0) { draft.splice(idx, 1); return draft; }
        if (total - draft[idx].quantity + nq <= CAN_COUNT) draft[idx] = { ...draft[idx], quantity: nq };
        return draft;
      }
      if (delta > 0 && total < CAN_COUNT) draft.push({ product, quantity: 1 });
      return draft;
    });
  };

  const handleIceChange = (product: Product, delta: number) => {
    setSelectedIces(prev => {
      const draft = [...prev];
      const idx = draft.findIndex(i => i.product.id === product.id);
      const total = draft.reduce((s, i) => s + i.quantity, 0);
      if (idx >= 0) {
        const nq = draft[idx].quantity + delta;
        if (nq <= 0) { draft.splice(idx, 1); return draft; }
        if (total - draft[idx].quantity + nq <= FLAVOR_ICE_COUNT) draft[idx] = { ...draft[idx], quantity: nq };
        return draft;
      }
      if (delta > 0 && total < FLAVOR_ICE_COUNT) draft.push({ product, quantity: 1 });
      return draft;
    });
  };

  const handleConfirm = () => {
    if (!selectedSpirit) return;
    const comboId = `combo-${Date.now()}`;
    const energeticoProduct = energeticoMode === '2L' ? selected2L : selectedCans[0]?.product;
    if (!energeticoProduct) return;

    const gelos: ComboGelo[] =
      iceMode === 'flavor'
        ? selectedIces.map(i => ({ product: i.product, quantity: i.quantity }))
        : waterIceForCombo ? [{ product: waterIceForCombo, quantity: 1 }] : [];

    const enerDesc = energeticoMode === '2L' ? `1x ${selected2L?.name}` : selectedCans.map(i => `${i.quantity}x ${i.product.name}`).join(', ');
    const geloDesc = iceMode === 'flavor' ? selectedIces.map(i => `${i.quantity}x ${i.product.name}`).join(', ') : `1x ${selectedWaterIce?.name}`;
    const comboLabel = `Combo: ${selectedSpirit.name} + ${enerDesc} + ${geloDesc}`;

    if (onAddComboComponents) {
      // Caminho ATÔMICO: cada componente vira order_item real, trigger baixa estoque.
      const factor = 1 - COMBO_DISCOUNT;
      const parts: Array<{ product: Product; quantity: number; unitPrice: number }> = [];
      parts.push({ product: selectedSpirit, quantity: 1, unitPrice: Number(selectedSpirit.salePrice) * factor });
      if (energeticoMode === '2L' && selected2L) {
        parts.push({ product: selected2L, quantity: 1, unitPrice: Number(selected2L.salePrice) * factor });
      } else {
        for (const c of selectedCans) {
          parts.push({ product: c.product, quantity: c.quantity, unitPrice: Number(c.product.salePrice) * factor });
        }
      }
      if (iceMode === 'flavor') {
        for (const ice of selectedIces) {
          parts.push({ product: ice.product, quantity: ice.quantity, unitPrice: Number(ice.product.salePrice) * factor });
        }
      } else if (selectedWaterIce) {
        // Saco 5kg: estoque debita do produto real GELO COMUM 5KG e cobra o valor cadastrado dele.
        parts.push({ product: selectedWaterIce, quantity: 1, unitPrice: getWaterIceComboPrice(selectedWaterIce) * factor });
      }
      onAddComboComponents(parts, comboLabel);
    } else if (onAddItem) {
      const comboProduct: Product = {
        id: comboId, name: comboLabel,
        salePrice: String(totals.discounted), costPrice: '0', categoryId: selectedSpirit.categoryId,
        isActive: true, isPrepared: false, stock: 999, description: 'Combo 10% OFF',
        imageUrl: selectedSpirit.imageUrl, comboEligible: false, sortOrder: 0, productType: 'combo',
        profitMargin: '0', createdAt: new Date().toISOString(),
      };
      onAddItem(comboProduct);
    } else {
      cart?.addCombo({
        id: comboId, destilado: selectedSpirit, energetico: energeticoProduct,
        energeticoQuantity: energeticoMode === '2L' ? 1 : totalCans,
        gelos, discount: totals.original - totals.discounted, discountPercent: COMBO_DISCOUNT * 100,
        originalTotal: totals.original, discountedTotal: totals.discounted,
      });
    }

    toast({ title: 'Combo adicionado!', description: 'Combo montado com 10% OFF' });
    resetAll();
    onOpenChange(false);
  };

  // ---- Shared UI pieces ----
  const getIceIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('agua') || n.includes('água') || n.includes('saco') || n.includes('water')) return '🧊';
    return getFruitEmoji(name);
  };

  const IceIcon = ({ name, size = 40 }: { name: string; size?: number }) => {
    if (isWaterIceName(name)) {
      const dim = `${size}px`;
      return <img src={iceAgua} alt={name} loading="lazy" className="object-contain shrink-0" style={{ width: dim, height: dim, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.30))' }} />;
    }
    const photo = getIceFlavorPhotoUrl(name, drinkFruits);
    const dim = `${size}px`;
    if (photo) {
      return (
        <img
          src={photo}
          alt={name}
          loading="lazy"
          className="object-contain shrink-0"
          style={{ width: dim, height: dim, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.30))' }}
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = 'none';
            const sib = el.nextElementSibling as HTMLElement | null;
            if (sib) sib.style.display = 'inline-flex';
          }}
        />
      );
    }
    return (
      <span
        className="flex items-center justify-center shrink-0"
        style={{ width: dim, height: dim, fontSize: size >= 40 ? '1.5rem' : '1.25rem' }}
      >
        {getIceIcon(name)}
      </span>
    );
  };

  const ProductCard = ({ p, selected, onSelect, showIceIcon }: { p: Product; selected: boolean; onSelect: () => void; showIceIcon?: boolean }) => (
    <button onClick={onSelect} className={cn(
      'w-full p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-all',
      selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
    )}>
      {showIceIcon ? (
        <IceIcon name={p.name} size={40} />
      ) : p.imageUrl ? (
        <img src={p.imageUrl} className="w-10 h-10 rounded-lg object-cover shrink-0" />
      ) : null}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{p.name}</p>
        <p className="text-xs text-muted-foreground">{fmt(Number(p.salePrice))}</p>
      </div>
      {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
    </button>
  );

  const CounterRow = ({ p, qty, onChange, max, showIceIcon }: { p: Product; qty: number; onChange: (d: number) => void; max: number; showIceIcon?: boolean }) => (
    <div className={cn(
      'p-3 rounded-xl border-2 flex items-center gap-3 transition-all',
      qty > 0 ? 'border-primary bg-primary/10' : 'border-border',
    )}>
      {showIceIcon ? (
        <IceIcon name={p.name} size={36} />
      ) : p.imageUrl ? (
        <img src={p.imageUrl} className="w-9 h-9 rounded-lg object-cover shrink-0" />
      ) : null}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{p.name}</p>
        <p className="text-xs text-muted-foreground">{fmt(Number(p.salePrice))}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={() => onChange(-1)} disabled={qty <= 0} className="w-7 h-7 rounded-full border flex items-center justify-center disabled:opacity-30"><Minus className="h-3 w-3" /></button>
        <span className="text-sm font-bold w-5 text-center tabular-nums">{qty}</span>
        <button onClick={() => onChange(1)} disabled={qty >= Math.min(p.stock, max)} className="w-7 h-7 rounded-full border flex items-center justify-center disabled:opacity-30"><Plus className="h-3 w-3" /></button>
      </div>
    </div>
  );

  const ModeToggle = ({ options, value, onChange }: { options: { key: string; label: string; desc: string }[]; value: string | null; onChange: (k: string) => void }) => (
    <div className="grid grid-cols-2 gap-2">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)} className={cn(
          'p-3 rounded-xl border-2 text-center transition-all',
          value === o.key ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
        )}>
          <p className="font-semibold text-sm">{o.label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{o.desc}</p>
        </button>
      ))}
    </div>
  );

  // ---- Step Indicator ----
  const StepIndicator = () => (
    <div className="bg-primary/5 rounded-xl p-3 mx-4 mt-2">
      <div className="flex items-center justify-between gap-1">
        {STEPS.map((s, i) => {
          const done = (s === 'destilado' && !!selectedSpirit) ||
            (s === 'energetico' && ((energeticoMode === '2L' && !!selected2L) || (energeticoMode === 'cans' && totalCans === CAN_COUNT))) ||
            (s === 'gelo' && ((iceMode === 'flavor' && totalFlavorIce === FLAVOR_ICE_COUNT) || (iceMode === 'water' && !!selectedWaterIce)));
          const active = s === step;
          return (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className="flex flex-col items-center flex-1">
                <motion.div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                    done ? 'bg-primary text-primary-foreground' : active ? 'bg-primary/20 text-primary ring-2 ring-primary' : 'bg-muted text-muted-foreground',
                  )}
                  animate={{ scale: done ? [1, 1.1, 1] : 1 }}
                >
                  {done ? <Check className="w-4 h-4" /> : STEP_ICONS[s]}
                </motion.div>
                <span className="text-[9px] mt-0.5 font-medium">{STEP_LABELS[s]}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[400px] max-w-[95vw] p-0 rounded-2xl">
          <div className="flex items-center justify-center h-[300px]">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAll(); onOpenChange(v); }}>
      <DialogContent className="w-[420px] max-w-[95vw] p-0 rounded-2xl border-primary/30" hideCloseButton>
        <div className="flex flex-col bg-background max-h-[85dvh] overflow-hidden rounded-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">{STEP_TITLES[step]}</h2>
              <p className="text-[11px] text-white/80">Etapa {stepIndex + 1} de {STEPS.length} • 5% OFF no combo</p>
            </div>
            <button onClick={() => onOpenChange(false)} className="p-1.5 hover:bg-white/20 rounded-full">
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          <StepIndicator />

          {/* Progress bar */}
          <div className="flex gap-1 px-4 py-2 shrink-0">
            {STEPS.map((_, i) => (
              <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= stepIndex ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>

          {/* Content */}
          <div className="px-4 py-3 flex-1 overflow-y-auto min-h-0 max-h-[50vh]">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }}>

                {/* DESTILADO */}
                {step === 'destilado' && (
                  <div className="space-y-3">
                    <div className="flex gap-1 bg-muted rounded-xl p-1">
                      {SPIRIT_CLASSES.map(sc => (
                        <button
                          key={sc.key}
                          onClick={() => { setSpiritClass(sc.key); setSelectedSpirit(null); }}
                          className={cn(
                            'flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all',
                            spiritClass === sc.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {sc.label}
                        </button>
                      ))}
                    </div>
                    {spirits.length === 0 ? (
                      <p className="text-center py-8 text-sm text-muted-foreground">Nenhum {SPIRIT_CLASSES.find(c => c.key === spiritClass)?.label} disponível</p>
                    ) : spirits.map(p => (
                      <ProductCard key={p.id} p={p} selected={selectedSpirit?.id === p.id} onSelect={() => setSelectedSpirit(p)} />
                    ))}
                  </div>
                )}

                {/* ENERGÉTICO */}
                {step === 'energetico' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Escolha o formato e selecione:</p>
                    <ModeToggle
                      value={energeticoMode}
                      onChange={(k) => { setEnergeticoMode(k as 'cans' | '2L'); setSelected2L(null); setSelectedCans([]); }}
                      options={[
                        { key: '2L', label: '1x Garrafa 2L', desc: 'Uma garrafa grande' },
                        { key: 'cans', label: `${CAN_COUNT}x Latas`, desc: 'Mix de sabores' },
                      ]}
                    />

                    {energeticoMode === '2L' && (
                      <div className="space-y-2 pt-1">
                        {energy2L.length === 0 ? (
                          <p className="text-center py-4 text-xs text-muted-foreground">Nenhuma garrafa 2L disponível</p>
                        ) : energy2L.map(p => (
                          <ProductCard key={p.id} p={p} selected={selected2L?.id === p.id} onSelect={() => setSelected2L(p)} />
                        ))}
                      </div>
                    )}

                    {energeticoMode === 'cans' && (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs text-muted-foreground font-medium">Latas: {totalCans}/{CAN_COUNT}</p>
                        {energyCans.length === 0 ? (
                          <p className="text-center py-4 text-xs text-muted-foreground">Nenhuma lata disponível</p>
                        ) : energyCans.map(p => {
                          const qty = selectedCans.find(c => c.product.id === p.id)?.quantity ?? 0;
                          return <CounterRow key={p.id} p={p} qty={qty} max={CAN_COUNT - totalCans + qty} onChange={(d) => handleCanChange(p, d)} />;
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* GELO */}
                {step === 'gelo' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Escolha o tipo de gelo:</p>
                    <ModeToggle
                      value={iceMode}
                      onChange={(k) => {
                        const m = k as 'flavor' | 'water';
                        setIceMode(m);
                        setSelectedIces([]);
                        setSelectedWaterIce(m === 'water' && waterIces.length === 1 ? waterIces[0] : null);
                      }}
                      options={[
                        { key: 'flavor', label: `${FLAVOR_ICE_COUNT}x Sabor`, desc: 'Gelos de sabor' },
                        { key: 'water', label: '1x Saco 5kg', desc: 'Gelo de água comum' },
                      ]}
                    />

                    {iceMode === 'flavor' && (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs text-muted-foreground font-medium">Gelos: {totalFlavorIce}/{FLAVOR_ICE_COUNT}</p>
                        {flavorIces.length === 0 ? (
                          <p className="text-center py-4 text-xs text-muted-foreground">Nenhum gelo de sabor disponível</p>
                        ) : flavorIces.map(p => {
                          const qty = selectedIces.find(i => i.product.id === p.id)?.quantity ?? 0;
                          return <CounterRow key={p.id} p={p} qty={qty} max={FLAVOR_ICE_COUNT - totalFlavorIce + qty} onChange={(d) => handleIceChange(p, d)} showIceIcon />;
                        })}
                      </div>
                    )}

                    {iceMode === 'water' && (
                      <div className="space-y-2 pt-1">
                        {waterIces.length === 0 ? (
                          <p className="text-center py-4 text-xs text-muted-foreground">Nenhum gelo de água disponível</p>
                        ) : waterIces.map(p => {
                          const display = { ...p, salePrice: String(getWaterIceComboPrice(p)) };
                          return (
                            <ProductCard key={p.id} p={display} selected={selectedWaterIce?.id === p.id} onSelect={() => setSelectedWaterIce(p)} showIceIcon />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* REVIEW */}
                {step === 'review' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl bg-muted/50">
                        <p className="text-xs text-muted-foreground font-medium">🍾 Destilado</p>
                        <p className="font-semibold text-sm">{selectedSpirit?.name}</p>
                        <p className="text-xs text-muted-foreground">{fmt(Number(selectedSpirit?.salePrice ?? 0))}</p>
                      </div>

                      <div className="p-3 rounded-xl bg-muted/50">
                        <p className="text-xs text-muted-foreground font-medium">⚡ Energético</p>
                        {energeticoMode === '2L' && selected2L && (
                          <>
                            <p className="font-semibold text-sm">1x {selected2L.name}</p>
                            <p className="text-xs text-muted-foreground">{fmt(Number(selected2L.salePrice))}</p>
                          </>
                        )}
                        {energeticoMode === 'cans' && selectedCans.map(c => (
                          <p key={c.product.id} className="text-sm">{c.quantity}x {c.product.name} — {fmt(Number(c.product.salePrice) * c.quantity)}</p>
                        ))}
                      </div>

                      <div className="p-3 rounded-xl bg-muted/50">
                        <p className="text-xs text-muted-foreground font-medium">🧊 Gelo</p>
                        {iceMode === 'flavor' && selectedIces.map(i => (
                          <p key={i.product.id} className="text-sm">{i.quantity}x {i.product.name} — {fmt(Number(i.product.salePrice) * i.quantity)}</p>
                        ))}
                        {iceMode === 'water' && selectedWaterIce && (
                          <>
                            <p className="font-semibold text-sm">1x {selectedWaterIce.name}</p>
                            <p className="text-xs text-muted-foreground">{fmt(getWaterIceComboPrice(selectedWaterIce))}</p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-border pt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="line-through text-muted-foreground">{fmt(totals.original)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Desconto 10%</span>
                        <span className="text-green-600 font-medium">-{fmt(totals.original - totals.discounted)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base">
                        <span>Total</span>
                        <span className="text-primary">{fmt(totals.discounted)}</span>
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>

          {/* Price preview */}
          {step !== 'review' && totals.original > 0 && (
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Parcial</span>
              <span className="text-sm font-bold text-primary">{fmt(totals.discounted)}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
            {stepIndex > 0 && (
              <Button variant="outline" onClick={prev} className="flex-1 gap-1">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </Button>
            )}
            {step === 'review' ? (
              <Button onClick={handleConfirm} className="flex-1 gap-1 bg-gradient-to-r from-orange-600 to-amber-600 text-white">
                <ShoppingCart className="w-4 h-4" /> Adicionar Combo
              </Button>
            ) : (
              <Button onClick={next} disabled={!canProceed} className="flex-1 gap-1">
                Próximo <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
