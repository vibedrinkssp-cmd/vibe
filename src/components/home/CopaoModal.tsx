import { useState, useEffect, useMemo } from 'react';
import { queryClient } from '@/lib/queryClient';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Check, X, Plus, Minus, Wine, Zap, Snowflake, ShoppingCart, ChevronRight, ChevronLeft, Cherry, Ban } from 'lucide-react';
import { getFruitEmoji } from '@/lib/emoji-icons';
import { supabase } from '@/integrations/supabase/client-safe';
import { useCartOptional } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { useDrinkFruits } from '@/hooks/use-drink-fruits';
import { filterVisibleIceFlavorOptions, getIceFlavorPhotoUrl, iceAgua } from '@/lib/ice-flavor-icons';
import { nanoid } from 'nanoid';
import type { CustomDrink } from '@/shared/schema';
import { fetchAllowedByType, filterByAllowedProducts } from '@/lib/allowed-bottles';
import { TierBottleCarousel, type AvailableBottleWithTier, type SelectedBottleEntry } from './TierBottleCarousel';

interface AvailableBottle extends AvailableBottleWithTier {}
interface SelectedBottle extends SelectedBottleEntry {}
interface EnergeticoOption { type: 'lata' | 'garrafa'; id: string; name: string; price: number; productId: string; }
interface GeloOption { id: string; name: string; price: number; }
interface FruitOption { id: string; name: string; price: number; icon_url?: string | null; }

interface CopaoModalProps { open: boolean; onOpenChange: (open: boolean) => void; onAddCustomDrink?: (drink: CustomDrink) => void; }

type Step = 'destilado' | 'energetico' | 'gelo' | 'frutas' | 'review';

const STEP_TITLES: Record<Step, string> = {
  destilado: 'ESCOLHA O DESTILADO',
  energetico: 'ESCOLHA O ENERGÉTICO',
  gelo: 'ESCOLHA O GELO',
  frutas: 'FRUTAS (OPCIONAL)',
  review: 'SEU COPÃO',
};

const STEPS: Step[] = ['destilado', 'energetico', 'gelo', 'frutas', 'review'];

const COPAO_MIN_PRICE = 10;
const GELO_CAIXINHA_PRICE = 2;

const isFreeEnergeticoBrand = (name: string) => {
  const normalized = name.toLowerCase();
  return normalized.includes('baly') || normalized.includes('big boss');
};

const normalizeIce = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const isGeloCaixinha = (name: string) => {
  const n = normalizeIce(name);
  return n.includes('caixinha') || n.includes('caixa');
};

// Ícone único e distintivo para cada sabor de gelo (evita confusão visual)
// Ícones de sabores de gelo — usar frutas reais (consistente com getFruitEmoji do sistema)
const ICE_FLAVOR_EMOJI: [string[], string][] = [
  [['caixinha', 'caixa'], '🧊'],
  [['frutas vermelhas', 'vermelha'], '🍓'],
  [['frutas amarelas', 'amarela'], '🍍'],
  [['tropical'], '🥭'],
  [['limao', 'lemon'], '🍋'],
  [['morango', 'strawberry'], '🍓'],
  [['maracuja', 'passion'], '🥭'],
  [['abacaxi', 'pineapple'], '🍍'],
  [['uva', 'grape'], '🍇'],
  [['tangerina', 'mexerica'], '🍊'],
  [['laranja', 'orange'], '🍊'],
  [['manga', 'mango'], '🥭'],
  [['coco', 'coconut'], '🥥'],
  [['melancia', 'watermelon'], '🍉'],
  [['kiwi'], '🥝'],
  [['pessego', 'peach'], '🍑'],
  [['cereja', 'cherry'], '🍒'],
  [['acai'], '🫐'],
  [['amora', 'blackberry'], '🫐'],
  [['framboesa', 'raspberry'], '🫐'],
  [['acerola'], '🍒'],
  [['goiaba', 'guava'], '🍈'],
  [['melao', 'melon'], '🍈'],
  [['banana'], '🍌'],
  [['maca', 'apple'], '🍎'],
  [['hortela', 'menta', 'mint'], '🌿'],
];

const getIceEmoji = (name: string): string => {
  const n = normalizeIce(name);
  for (const [keys, emoji] of ICE_FLAVOR_EMOJI) {
    for (const k of keys) if (n.includes(k)) return emoji;
  }
  return '🍓';
};

export function CopaoModal({ open, onOpenChange, onAddCustomDrink }: CopaoModalProps) {
  const cart = useCartOptional();
  const { toast } = useToast();
  const addDrink = onAddCustomDrink || cart?.addCustomDrink;

  // Centralized fruits from DB
  const { data: centralFruits = [] } = useDrinkFruits({ activeOnly: true });

  const [step, setStep] = useState<Step>('destilado');
  const [bottles, setBottles] = useState<AvailableBottle[]>([]);
  const [energeticoOptions, setEnergeticoOptions] = useState<EnergeticoOption[]>([]);
  const [geloOptions, setGeloOptions] = useState<GeloOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAlcoholPrice, setNoAlcoholPrice] = useState(10);
  const [allowNoAlcohol, setAllowNoAlcohol] = useState(false);
  const [noAlcohol, setNoAlcohol] = useState(false);

  // Copão only allows 3 specific fruits
  const COPAO_ALLOWED_FRUITS = ['limão', 'morango', 'laranja'];
  const fruitOptions: FruitOption[] = useMemo(() =>
    centralFruits
      .filter(f => COPAO_ALLOWED_FRUITS.some(allowed => f.name.toLowerCase().includes(allowed)))
      .map(f => ({ id: f.id, name: f.name, price: f.price, icon_url: f.icon_url })),
    [centralFruits]
  );
  
  const [selectedBottles, setSelectedBottles] = useState<SelectedBottle[]>([]);
  const [selectedEnergetico, setSelectedEnergetico] = useState<EnergeticoOption | null>(null);
  const [selectedGelo, setSelectedGelo] = useState<GeloOption | null>(null);
  const [selectedFruits, setSelectedFruits] = useState<FruitOption[]>([]);
  const [quantity, setQuantity] = useState(1);

  // Cheapest available dose — used as the "Sem Álcool" replacement (nunca mais barato).
  const minDosePrice = useMemo(
    () => (bottles.length ? Math.min(...bottles.map(b => b.dose_price)) : 0),
    [bottles]
  );
  const noAlcoholDoseValue = useMemo(
    () => Math.max(noAlcoholPrice, minDosePrice),
    [noAlcoholPrice, minDosePrice]
  );

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: bottlesData }, { data: configData }] = await Promise.all([
          (supabase.rpc as Function)('get_available_bottles_for_assembly'),
          supabase.from('special_drink_configs').select('no_alcohol_price, allow_no_alcohol').eq('slug', 'copao').maybeSingle(),
        ]);
        if (configData) {
          setNoAlcoholPrice(Number((configData as any).no_alcohol_price ?? 10));
          setAllowNoAlcohol((configData as any).allow_no_alcohol ?? false);
        }
        const allBottles = (bottlesData || []).map((b: any) => ({
          bottle_id: b.bottle_id, product_id: b.product_id, product_name: b.product_name,
          dose_price: b.dose_price, tier: b.tier || null, image_url: b.image_url || null,
        })) as AvailableBottle[];

        const bottleProductIds = [...new Set(allBottles.map(b => b.product_id))];
        const { data: bottleProducts } = bottleProductIds.length > 0
          ? await supabase.from('products').select('id, product_type').in('id', bottleProductIds)
          : { data: [] as { id: string; product_type: string | null }[] };

        const typeMap = new Map<string, string>();
        (bottleProducts || []).forEach((p: { id: string; product_type: string | null }) => {
          typeMap.set(p.id, p.product_type || '');
        });

        const { spiritIds, energeticoIds, hasAny } = await fetchAllowedByType('copao');
        let filteredDestilados: AvailableBottle[];
        if (hasAny) {
          filteredDestilados = filterByAllowedProducts(allBottles, spiritIds);
        } else {
          filteredDestilados = [];
        }

        let enerBottles: EnergeticoOption[];
        if (hasAny && energeticoIds.size > 0) {
          enerBottles = filterByAllowedProducts(allBottles, energeticoIds)
            .map(b => ({ type: 'garrafa' as const, id: b.bottle_id, name: b.product_name, price: 0, productId: b.product_id }));
        } else if (hasAny) {
          enerBottles = [];
        } else {
          enerBottles = allBottles.filter(b => typeMap.get(b.product_id) === 'energetico')
            .map(b => ({ type: 'garrafa' as const, id: b.bottle_id, name: b.product_name, price: 0, productId: b.product_id }));
        }
        setBottles(filteredDestilados);

        // IDs de produto já cobertos por garrafas abertas (evita duplicação Big Boss / Baly)
        const openedProductIds = new Set(enerBottles.map(b => b.productId));

        const { data: enerProducts } = await supabase.from('products_public').select('id, name, sale_price').eq('product_type', 'energetico').eq('is_active', true).order('name');
        const isExcluded = (n: string) => {
          const x = n.toLowerCase();
          // Fusion removido temporariamente
          return x.includes('fusion');
        };
        // Demais energéticos (latas/individuais) viram opções pagas
        const cannedOpts: EnergeticoOption[] = (enerProducts || [])
          .filter(p => !openedProductIds.has(p.id!) && !isExcluded(p.name || '') && !isFreeEnergeticoBrand(p.name || ''))
          .map(p => ({ type: 'lata' as const, id: p.id!, name: p.name!, price: Number(p.sale_price), productId: p.id! }));
        setEnergeticoOptions([...enerBottles, ...cannedOpts]);

        const { data: geloCats } = await supabase.from('categories_public').select('id').ilike('name', '%gelo%');
        const geloCatIds = (geloCats || []).filter(c => c.id).map(c => c.id!);
        const flavorIces: GeloOption[] = [];
        if (geloCatIds.length > 0) {
          const { data: geloProds } = await supabase.from('products_public').select('id, name, sale_price').in('category_id', geloCatIds).eq('is_active', true).order('sale_price');
          filterVisibleIceFlavorOptions(geloProds || []).filter(p => (p.name || '').toLowerCase().startsWith('gelo'))
            .forEach(p => flavorIces.push({ id: p.id!, name: p.name!, price: Number(p.sale_price) }));
        }
        setGeloOptions(flavorIces);
        // Fruits now come from centralized useDrinkFruits hook
      } catch (err) {
        console.error('Error loading copão data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open]);

  useEffect(() => {
    if (open) {
      setStep('destilado');
      setSelectedBottles([]);
      setSelectedEnergetico(null);
      setSelectedGelo({ id: 'agua', name: 'Gelo Água', price: 0 });
      setSelectedFruits([]);
      setNoAlcohol(false);
      setQuantity(1);
    }
  }, [open]);

  const toggleBottle = (bottle: AvailableBottle) => {
    setSelectedBottles(prev => {
      const exists = prev.find(sb => sb.bottle.bottle_id === bottle.bottle_id);
      if (exists) return prev.filter(sb => sb.bottle.bottle_id !== bottle.bottle_id);
      setNoAlcohol(false);
      return [...prev, { bottle, doses: 1 }];
    });
  };

  const updateDoses = (bottleId: string, delta: number) => {
    setSelectedBottles(prev => prev.map(sb =>
      sb.bottle.bottle_id === bottleId ? { ...sb, doses: Math.max(1, Math.min(5, sb.doses + delta)) } : sb
    ));
  };

  const geloTotal = useMemo(() => (selectedGelo?.price || 0), [selectedGelo]);

  const toggleFruit = (fruit: FruitOption) => {
    setSelectedFruits(prev => {
      const exists = prev.find(f => f.id === fruit.id);
      if (exists) return prev.filter(f => f.id !== fruit.id);
      if (prev.length >= 2) return prev;
      return [...prev, fruit];
    });
  };

  const dosesTotal = useMemo(
    () => noAlcohol ? noAlcoholDoseValue : selectedBottles.reduce((s, sb) => s + sb.bottle.dose_price * sb.doses, 0),
    [selectedBottles, noAlcohol, noAlcoholDoseValue]
  );
  const fruitsTotal = useMemo(() => selectedFruits.reduce((s, f) => s + f.price, 0), [selectedFruits]);
  const energeticoTotal = useMemo(() => (selectedEnergetico && selectedEnergetico.price > 0 ? selectedEnergetico.price : 0), [selectedEnergetico]);
  const baseBeforeMinimum = useMemo(() => dosesTotal + fruitsTotal, [dosesTotal, fruitsTotal]);
  const baseAfterMinimum = useMemo(() => Math.max(baseBeforeMinimum, COPAO_MIN_PRICE), [baseBeforeMinimum]);
  const hasDestilado = noAlcohol || selectedBottles.length > 0;
  const minimumApplied = hasDestilado && baseBeforeMinimum < COPAO_MIN_PRICE;

  const unitPrice = useMemo(() => {
    // Regra do Copão: dose(s) + frutas com piso mínimo R$ 10, depois soma energético pago e gelo de caixinha (R$ 2).
    return baseAfterMinimum + energeticoTotal + geloTotal;
  }, [baseAfterMinimum, energeticoTotal, geloTotal]);

  const buildDrinkPayload = (): CustomDrink | null => {
    if (!selectedEnergetico || !selectedGelo || !hasDestilado) return null;
    const isNoEnergetico = selectedEnergetico.productId === '__none__';
    const parts = [
      ...(noAlcohol ? ['Sem Álcool'] : selectedBottles.map(sb => `${sb.doses}x ${sb.bottle.product_name}`)),
      ...(isNoEnergetico ? [] : [selectedEnergetico.name]),
      selectedGelo.name,
      ...selectedFruits.map(f => f.name),
    ];
    return {
      id: nanoid(), type: 'custom_drink', name: noAlcohol ? '🍷 Copão (Sem Álcool)' : '🍷 Copão', description: parts.join(' + '),
      doses: noAlcohol ? [] : selectedBottles.map(sb => ({ bottleId: sb.bottle.bottle_id, bottleName: sb.bottle.product_name, productId: sb.bottle.product_id, doseCount: sb.doses, pricePerDose: sb.bottle.dose_price })),
      energetico: isNoEnergetico ? null : { type: selectedEnergetico.type, productId: selectedEnergetico.productId, productName: selectedEnergetico.name, price: selectedEnergetico.price },
      fruits: selectedFruits.map(f => ({ id: f.id, name: f.name, price: f.price })),
      gelo: { id: selectedGelo.id, name: selectedGelo.name, price: selectedGelo.price },
      totalPrice: unitPrice, quantity,
    };
  };

  const persistAndAddToCart = async (): Promise<boolean> => {
    if (!selectedEnergetico || !selectedGelo || !hasDestilado) return false;
    if (!noAlcohol) {
      for (const sb of selectedBottles) {
        const { error } = await supabase.rpc('deduct_bottle_doses', { p_bottle_id: sb.bottle.bottle_id, p_doses_used: sb.doses });
        if (error) { toast({ title: `Erro ao deduzir doses de ${sb.bottle.product_name}`, variant: 'destructive' }); return false; }
      }
    }
    // Energético em garrafa (BALY / BIG BOSS): consome 1 dose de 400ml por copão,
    // auto-abrindo nova garrafa do estoque se a atual esvaziar.
    if (selectedEnergetico.type === 'garrafa' && selectedEnergetico.productId !== '__none__') {
      const { error } = await supabase.rpc('auto_consume_energy_dose', {
        p_product_id: selectedEnergetico.productId,
        p_doses: quantity,
      });
      if (error) { toast({ title: `Erro ao consumir ${selectedEnergetico.name}: ${error.message}`, variant: 'destructive' }); return false; }
    }
    queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
    queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
    queryClient.invalidateQueries({ queryKey: ['assembly-bottles'] });
    const payload = buildDrinkPayload();
    if (!payload) return false;
    addDrink?.(payload);
    return true;
  };

  const resetWizard = () => {
    setStep('destilado');
    setSelectedBottles([]);
    setSelectedEnergetico(null);
    setSelectedGelo({ id: 'agua', name: 'Gelo Água', price: 0 });
    setSelectedFruits([]);
    setNoAlcohol(false);
    setQuantity(1);
  };

  const handleFinish = async () => {
    const ok = await persistAndAddToCart();
    if (!ok) return;
    toast({ title: '🍷 Copão adicionado!', description: `${quantity}x Copão no carrinho` });
    onOpenChange(false);
  };

  const handleAddAnother = async () => {
    const ok = await persistAndAddToCart();
    if (!ok) return;
    toast({ title: '🍷 Copão adicionado!', description: 'Monte outro copão diferente' });
    resetWizard();
  };


  const goTo = (s: Step) => setStep(s);

  /* ── Selectable card ── */
  const SelectableCard = ({ selected, onClick, children, disabled }: { selected: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl border-2 p-3 text-left flex items-center gap-3 ${
        disabled ? 'opacity-40 cursor-not-allowed border-border' :
        selected ? 'border-purple-500 bg-purple-500/10' : 'border-border'
      }`}
    >
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
        selected ? 'border-purple-500 bg-purple-500' : 'border-muted-foreground/40'
      }`}>
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
      {children}
    </button>
  );

  /* ── Purple title bar ── */
  const TitleBar = ({ title }: { title: string }) => (
    <div className="flex items-center bg-purple-600 px-4 py-3 shrink-0 rounded-t-3xl">
      <h2 className="flex-1 text-center text-white font-bold text-sm tracking-wide">{title}</h2>
      <button onClick={() => onOpenChange(false)} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center ml-2">
        <X className="h-4 w-4 text-white" />
      </button>
    </div>
  );

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[380px] max-w-[95vw] p-0 rounded-3xl overflow-hidden" hideCloseButton>
          <div className="flex items-center justify-center h-[300px]">
            <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[95vw] p-0 rounded-3xl overflow-hidden" hideCloseButton>
        <div className="flex flex-col bg-background max-h-[85dvh] overflow-hidden">
          <TitleBar title={STEP_TITLES[step]} />

          {/* ── DESTILADO ── */}
          {step === 'destilado' && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto py-2">
                {allowNoAlcohol && (
                  <button
                    onClick={() => { setNoAlcohol(!noAlcohol); if (!noAlcohol) setSelectedBottles([]); }}
                    className={`mx-4 mb-2 p-3 rounded-xl border-2 text-left flex items-center gap-3 ${
                      noAlcohol ? 'border-destructive/50 bg-destructive/10' : 'border-border'
                    }`}
                    style={{ width: 'calc(100% - 2rem)' }}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      noAlcohol ? 'border-destructive bg-destructive' : 'border-muted-foreground'
                    }`}>
                      {noAlcohol && <Ban className="w-3.5 h-3.5 text-destructive-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">🚫 Sem Álcool</p>
                      <p className="text-[10px] text-muted-foreground">Copão sem destilado</p>
                    </div>
                  </button>
                )}
                <TierBottleCarousel
                  bottles={bottles}
                  selectedBottles={selectedBottles}
                  onToggle={toggleBottle}
                  onUpdateDoses={updateDoses}
                  compact
                />
              </div>
              {!noAlcohol && selectedBottles.length > 0 && (
                <p className="text-[10px] text-muted-foreground font-medium px-4 truncate">
                  ✓ {selectedBottles.map(sb => `${sb.doses}x ${sb.bottle.product_name}`).join(' · ')}
                </p>
              )}
              <div className="px-4 py-3 shrink-0">
                <button disabled={!noAlcohol && selectedBottles.length === 0} onClick={() => goTo('energetico')}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1">
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── ENERGÉTICO ── */}
          {step === 'energetico' && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1.5">
                <SelectableCard
                  selected={selectedEnergetico?.productId === '__none__'}
                  onClick={() => setSelectedEnergetico({ type: 'lata', id: '__none__', name: 'Sem Energético', price: 0, productId: '__none__' })}
                >
                  <p className="font-medium text-sm flex-1">🚫 Sem Energético</p>
                  <span className="text-xs font-bold text-muted-foreground shrink-0">—</span>
                </SelectableCard>
                {energeticoOptions.filter(o => o.type === 'garrafa').length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">⚡ Energético Incluso (Grátis)</p>
                    {energeticoOptions.filter(o => o.type === 'garrafa').map(opt => (
                      <SelectableCard key={opt.id} selected={selectedEnergetico?.id === opt.id} onClick={() => setSelectedEnergetico(selectedEnergetico?.id === opt.id ? null : opt)}>
                        <p className="font-medium text-sm truncate flex-1">{opt.name}</p>
                        <span className="text-xs font-bold text-green-600 shrink-0">Grátis</span>
                      </SelectableCard>
                    ))}
                  </>
                )}
                {energeticoOptions.filter(o => o.type === 'lata').length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-3 mb-1 px-1">🥫 Energético Adicional (+valor)</p>
                    {energeticoOptions.filter(o => o.type === 'lata').map(opt => (
                      <SelectableCard key={opt.id} selected={selectedEnergetico?.id === opt.id} onClick={() => setSelectedEnergetico(selectedEnergetico?.id === opt.id ? null : opt)}>
                        <p className="font-medium text-sm truncate flex-1">{opt.name}</p>
                        <span className="text-xs font-bold shrink-0">+ R$ {opt.price.toFixed(2)}</span>
                      </SelectableCard>
                    ))}
                  </>
                )}
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={() => goTo('destilado')} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button disabled={!selectedEnergetico} onClick={() => goTo('gelo')}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1">
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── GELO ── */}
          {step === 'gelo' && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
                <p className="text-[11px] text-muted-foreground text-center px-2">
                  Gelos de água e sabores são <span className="font-semibold text-foreground">grátis</span>. Apenas o <span className="font-semibold text-amber-600">Gelo de Caixinha</span> tem custo extra de R$ 2,00.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setSelectedGelo({ id: 'sem', name: 'Sem Gelo', price: 0 })}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 ${
                      selectedGelo?.id === 'sem' ? 'border-purple-500 bg-purple-500/10' : 'border-border'
                    }`}
                  >
                    <span className="w-12 h-12 flex items-center justify-center text-3xl" aria-hidden>🚫</span>
                    <span className="font-medium text-xs text-center">Sem Gelo</span>
                    <span className="text-[10px] text-muted-foreground font-semibold">—</span>
                    {selectedGelo?.id === 'sem' && <Check className="h-3.5 w-3.5 text-purple-500" />}
                  </button>
                  <button
                    onClick={() => setSelectedGelo({ id: 'agua', name: 'Gelo Água', price: 0 })}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 ${
                      selectedGelo?.id === 'agua' ? 'border-purple-500 bg-purple-500/10' : 'border-border'
                    }`}
                  >
                    <img src={iceAgua} alt="Gelo de Água" className="w-12 h-12 object-contain"
                      style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.30))' }} />
                    <span className="font-medium text-xs text-center">Água</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">GRÁTIS</span>
                    {selectedGelo?.id === 'agua' && <Check className="h-3.5 w-3.5 text-purple-500" />}
                  </button>
                  {geloOptions.map(opt => {
                    const isSelected = selectedGelo?.id === opt.id;
                    const caixinha = isGeloCaixinha(opt.name);
                    const price = caixinha ? GELO_CAIXINHA_PRICE : 0;
                    const emoji = getIceEmoji(opt.name);
                    const photoUrl = getIceFlavorPhotoUrl(opt.name, centralFruits);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedGelo({ ...opt, price })}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/10'
                            : caixinha
                              ? 'border-amber-400/60'
                              : 'border-border'
                        }`}
                      >
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={opt.name}
                            loading="lazy"
                            className="w-14 h-14 object-contain shrink-0 drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)] transition-transform"
                            style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.25))' }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                              const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
                              if (sib) sib.style.display = 'inline';
                            }}
                          />
                        ) : null}
                        <span className="text-2xl" style={{ display: photoUrl ? 'none' : 'inline' }}>{emoji}</span>
                        <span className="font-medium text-xs text-center leading-tight">{opt.name.replace(/^gelo\s*/i, '')}</span>
                        {caixinha ? (
                          <span className="text-[10px] text-amber-600 font-bold">+ R$ 2,00</span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-semibold">GRÁTIS</span>
                        )}
                        {isSelected && <Check className="h-3.5 w-3.5 text-purple-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={() => goTo('energetico')} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button disabled={!selectedGelo} onClick={() => goTo('frutas')}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1">
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── FRUTAS ── */}
          {step === 'frutas' && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <p className="text-xs text-muted-foreground">Cada fruta: <span className="font-bold">R$ 5,00</span> • Máximo 2</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {fruitOptions.map(fruit => {
                    const isSelected = selectedFruits.some(f => f.id === fruit.id);
                    const isDisabled = !isSelected && selectedFruits.length >= 2;
                    return (
                      <button
                        key={fruit.id}
                        onClick={() => !isDisabled && toggleFruit(fruit)}
                        disabled={isDisabled}
                        className={`relative p-1.5 rounded-xl border-2 flex flex-col items-center gap-0.5 ${
                          isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'
                        } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {fruit.icon_url ? (
                          <img src={fruit.icon_url} alt={fruit.name} className="w-full aspect-square object-contain" />
                        ) : (
                          <span className="text-5xl leading-none py-2">{getFruitEmoji(fruit.name)}</span>
                        )}
                        <span className="font-bold text-xs leading-tight">{fruit.name}</span>
                        {isSelected && (
                          <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={() => goTo('gelo')} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button onClick={() => goTo('review')}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-1">
                  {selectedFruits.length > 0 ? `Com ${selectedFruits.length} fruta${selectedFruits.length > 1 ? 's' : ''}` : 'Sem fruta'} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── REVIEW ── */}
          {step === 'review' && (
            <>
              <div className="px-4 py-3 flex-1 overflow-y-auto space-y-3">
                {/* Visual Recipe Card */}
                <div className="rounded-2xl border-2 border-purple-500 bg-gradient-to-b from-purple-500/10 to-purple-500/5 overflow-hidden">
                  <div className="bg-purple-600 text-white text-center py-2 px-3">
                    <p className="text-[10px] uppercase tracking-wider opacity-80">Sua receita</p>
                    <p className="text-base font-extrabold">🍷 1 COPÃO MONTADO</p>
                  </div>
                  <div className="p-3 space-y-3">
                    {noAlcohol && (
                      <div className="flex items-center gap-3 bg-background/60 rounded-xl p-2">
                        <div className="w-12 h-12 flex items-center justify-center shrink-0 text-3xl">🚫</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase font-bold text-destructive">Sem Álcool</p>
                          <p className="text-sm font-bold leading-tight">Copão sem destilado</p>
                        </div>
                      </div>
                    )}
                    {selectedBottles.map(sb => (
                      <div key={sb.bottle.bottle_id} className="flex items-center gap-3 bg-background/60 rounded-xl p-2">
                        {sb.bottle.image_url ? (
                          <img src={sb.bottle.image_url} alt={sb.bottle.product_name} className="w-12 h-12 object-contain shrink-0" />
                        ) : (
                          <Wine className="w-10 h-10 text-purple-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase font-bold text-purple-500">Destilado</p>
                          <p className="text-sm font-bold leading-tight truncate">{sb.bottle.product_name}</p>
                          <p className="text-xs font-semibold text-amber-600">{sb.doses} {sb.doses > 1 ? 'DOSES' : 'DOSE'}</p>
                        </div>
                      </div>
                    ))}

                    {selectedEnergetico && selectedEnergetico.productId !== '__none__' && (
                      <div className="flex items-center gap-3 bg-background/60 rounded-xl p-2">
                        <div className="w-12 h-12 flex items-center justify-center shrink-0 text-3xl">⚡</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase font-bold text-amber-500">Energético</p>
                          <p className="text-sm font-bold leading-tight truncate">{selectedEnergetico.name}</p>
                        </div>
                      </div>
                    )}

                    {selectedGelo && selectedGelo.id !== 'sem' && (
                      <div className="flex items-center gap-3 bg-background/60 rounded-xl p-2">
                        <div className="w-12 h-12 flex items-center justify-center shrink-0 text-3xl">
                          {selectedGelo.id === 'agua' ? '🧊' : getIceEmoji(selectedGelo.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase font-bold text-blue-500">Gelo</p>
                          <p className="text-sm font-bold leading-tight truncate">{selectedGelo.name}</p>
                        </div>
                      </div>
                    )}

                    {selectedFruits.length > 0 && (
                      <div className="flex items-center gap-3 bg-background/60 rounded-xl p-2">
                        <div className="flex shrink-0">
                          {selectedFruits.map(f => (
                            <span key={f.id} className="text-2xl -ml-1 first:ml-0">{getFruitEmoji(f.name)}</span>
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase font-bold text-pink-500">Frutas</p>
                          <p className="text-sm font-bold leading-tight">{selectedFruits.map(f => f.name).join(', ')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-muted/30 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">Quantos copões IGUAIS?</p>
                    <p className="text-[11px] text-muted-foreground">Mesma receita acima</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-9 h-9 rounded-full bg-background border-2 border-purple-500 flex items-center justify-center"><Minus className="h-4 w-4" /></button>
                    <span className="text-3xl font-extrabold w-10 text-center tabular-nums text-purple-500">{quantity}</span>
                    <button onClick={() => setQuantity(q => Math.min(10, q + 1))} className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="bg-secondary/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">TOTAL</p>
                  <p className="text-3xl font-extrabold text-primary">R$ {(unitPrice * quantity).toFixed(2)}</p>
                  {quantity > 1 && <p className="text-xs text-muted-foreground">{quantity}x R$ {unitPrice.toFixed(2)}</p>}
                </div>

              </div>

              <div className="px-4 py-3 shrink-0 border-t bg-background space-y-2">
                <p className="text-center text-xs font-bold text-foreground">
                  E agora, o que deseja fazer?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => goTo('frutas')}
                    className="py-3 rounded-xl border text-xs font-medium text-muted-foreground flex items-center justify-center"
                  >
                    <ChevronLeft className="h-3 w-3 inline mr-1" />Editar
                  </button>
                  <button
                    onClick={handleAddAnother}
                    className="py-3 rounded-xl border-2 border-purple-500 text-purple-600 dark:text-purple-300 text-xs font-bold flex items-center justify-center gap-1 active:scale-[0.98] transition"
                  >
                    🍷 OUTRO copão
                  </button>
                </div>
                <button
                  onClick={handleFinish}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Finalizar • R$ {(unitPrice * quantity).toFixed(2)}
                </button>
              </div>

            </>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
