import { useState, useEffect, useMemo } from 'react';
import { getFruitEmoji } from '@/lib/emoji-icons';
import { queryClient } from '@/lib/queryClient';
import { X, Check, ChevronRight, ChevronLeft, Ban } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TierBottleCarousel, type AvailableBottleWithTier, type SelectedBottleEntry } from './TierBottleCarousel';
import { DrinkRecipeReview } from './DrinkRecipeReview';
import { supabase } from '@/integrations/supabase/client-safe';
import { useCartOptional } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { useDrinkFruits } from '@/hooks/use-drink-fruits';
import type { CustomDrink } from '@/shared/schema';
import { nanoid } from 'nanoid';
import { fetchAllowedByType, filterByAllowedProducts } from '@/lib/allowed-bottles';
import { deductBottleDoses } from '@/lib/deduct-bottle-doses';

type AvailableBottle = AvailableBottleWithTier;
type SelectedBottle = SelectedBottleEntry;

interface FruitOption {
  id: string;
  name: string;
  price: number;
  icon_url?: string | null;
}

interface CaipirinhaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCustomDrink?: (drink: CustomDrink) => void;
}

type Step = 'destilado' | 'sabor' | 'extra1' | 'extra2' | 'review';

const STEP_TITLES: Record<Step, string> = {
  destilado: 'ESCOLHA O DESTILADO',
  sabor: 'ESCOLHA O SABOR',
  extra1: 'FRUTA EXTRA',
  extra2: 'FRUTA EXTRA',
  review: 'SUA CAIPIRINHA',
};

const STEPS: Step[] = ['destilado', 'sabor', 'extra1', 'extra2', 'review'];

export function CaipirinhaModal({ open, onOpenChange, onAddCustomDrink }: CaipirinhaModalProps) {
  const cart = useCartOptional();
  const { toast } = useToast();
  const addDrink = onAddCustomDrink || cart?.addCustomDrink;

  // Centralized fruits from DB
  const { data: centralFruits = [], isLoading: fruitsLoading } = useDrinkFruits({ activeOnly: true });

  const [step, setStep] = useState<Step>('destilado');
  const [bottles, setBottles] = useState<AvailableBottle[]>([]);
  const [configBasePrice, setConfigBasePrice] = useState(15);
  const [noAlcoholPrice, setNoAlcoholPrice] = useState(10);
  const [allowNoAlcohol, setAllowNoAlcohol] = useState(false);
  const [noAlcohol, setNoAlcohol] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selectedBottles, setSelectedBottles] = useState<SelectedBottle[]>([]);
  const [selectedFruit, setSelectedFruit] = useState<FruitOption | null>(null);
  const [extraFruit1, setExtraFruit1] = useState<FruitOption | null>(null);
  const [extraFruit2, setExtraFruit2] = useState<FruitOption | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Cheapest available dose — used as the "Sem Álcool" replacement so a drink
  // without spirit never ends up cheaper than the most affordable alcoholic one.
  const minDosePrice = useMemo(
    () => (bottles.length ? Math.min(...bottles.map(b => b.dose_price)) : 0),
    [bottles]
  );
  const noAlcoholDoseValue = useMemo(
    () => Math.max(noAlcoholPrice, minDosePrice),
    [noAlcoholPrice, minDosePrice]
  );

  // Map centralized fruits to FruitOption format
  const fruitOptions: FruitOption[] = useMemo(() =>
    centralFruits.map(f => ({ id: f.id, name: f.name, price: f.price, icon_url: f.icon_url })),
    [centralFruits]
  );

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        // Load bottles and config in parallel
        const [bottlesRes, configRes] = await Promise.all([
          supabase.rpc('get_available_bottles_for_assembly'),
          supabase.from('special_drink_configs').select('base_price, no_alcohol_price, allow_no_alcohol').eq('slug', 'caipirinha').single(),
        ]);
        if (bottlesRes.data) {
          const allBottles = (bottlesRes.data as any[]).map((b: any) => ({
            bottle_id: b.bottle_id, product_id: b.product_id, product_name: b.product_name,
            dose_price: b.dose_price, tier: b.tier || null, image_url: b.image_url || null,
          })) as AvailableBottle[];
          const { spiritIds, hasAny } = await fetchAllowedByType('caipirinha');
          setBottles(hasAny ? filterByAllowedProducts(allBottles, spiritIds) : []);
        }
        if (configRes.data) {
          setConfigBasePrice(Number(configRes.data.base_price) || 15);
          setNoAlcoholPrice(Number((configRes.data as any).no_alcohol_price ?? 10));
          setAllowNoAlcohol((configRes.data as any).allow_no_alcohol ?? false);
        }
      } catch (err) {
        console.error('Error loading caipirinha data:', err);
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
      setSelectedFruit(null);
      setExtraFruit1(null);
      setExtraFruit2(null);
      setNoAlcohol(false);
      setQuantity(1);
    }
  }, [open]);

  const toggleBottle = (bottle: AvailableBottle) => {
    const existing = selectedBottles.find(sb => sb.bottle.bottle_id === bottle.bottle_id);
    if (existing) {
      setSelectedBottles(prev => prev.filter(sb => sb.bottle.bottle_id !== bottle.bottle_id));
    } else {
      setNoAlcohol(false);
      setSelectedBottles(prev => [...prev, { bottle, doses: 1 }]);
    }
  };

  const updateBottleDoses = (bottleId: string, delta: number) => {
    setSelectedBottles(prev => prev.map(sb => {
      if (sb.bottle.bottle_id === bottleId) {
        return { ...sb, doses: Math.max(1, Math.min(5, sb.doses + delta)) };
      }
      return sb;
    }));
  };

  const extraFruits = useMemo(() => [extraFruit1, extraFruit2].filter(Boolean) as FruitOption[], [extraFruit1, extraFruit2]);

  const unitPrice = useMemo(() => {
    // Sem álcool usa a dose mais barata como valor substituto (nunca mais barato).
    const doseCost = noAlcohol
      ? noAlcoholDoseValue
      : selectedBottles.reduce((s, sb) => s + sb.bottle.dose_price * sb.doses, 0);
    // Primeira fruta (sabor) já está inclusa no base_price. Só frutas extras adicionam custo.
    const extrasCost = extraFruits.reduce((s, f) => s + f.price, 0);
    const base = doseCost + configBasePrice;
    // Piso mínimo de R$ 25 para qualquer caipirinha (aplicado antes dos extras)
    const baseWithFloor = Math.max(base, 25);
    return baseWithFloor + extrasCost;
  }, [selectedBottles, extraFruits, configBasePrice, noAlcohol, noAlcoholDoseValue]);

  const persistAndAddToCart = async (): Promise<boolean> => {
    if (!selectedFruit) return false;
    if (!noAlcohol && selectedBottles.length === 0) return false;
    if (!noAlcohol) {
      const ok = await deductBottleDoses(selectedBottles, (name) =>
        toast({ title: `Erro ao deduzir doses de ${name}`, variant: 'destructive' }), quantity
      );
      if (!ok) return false;
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
      queryClient.invalidateQueries({ queryKey: ['assembly-bottles'] });
    }
    const fruitNames = [selectedFruit.name, ...extraFruits.map(f => f.name)].join(', ');
    const parts = [
      ...(noAlcohol ? ['Sem Álcool'] : selectedBottles.map(sb => `${sb.doses}x ${sb.bottle.product_name}`)),
      `Sabor: ${fruitNames}`, 'Gelo Água',
    ];
    addDrink?.({
      id: nanoid(), type: 'custom_drink', name: noAlcohol ? '🍋 Caipirinha (Sem Álcool)' : '🍋 Caipirinha',
      description: parts.join(' + '),
      doses: noAlcohol ? [] : selectedBottles.map(sb => ({
        bottleId: sb.bottle.bottle_id, bottleName: sb.bottle.product_name,
        productId: sb.bottle.product_id, doseCount: sb.doses, pricePerDose: sb.bottle.dose_price,
      })),
      energetico: null,
      fruits: [
        { id: selectedFruit.id, name: selectedFruit.name, price: selectedFruit.price },
        ...extraFruits.map(f => ({ id: f.id, name: f.name, price: f.price })),
      ],
      gelo: { id: 'agua', name: 'Gelo Água', price: 0 },
      totalPrice: unitPrice, quantity,
    });
    return true;
  };

  const resetWizard = () => {
    setStep('destilado');
    setSelectedBottles([]);
    setSelectedFruit(null);
    setExtraFruit1(null);
    setExtraFruit2(null);
    setNoAlcohol(false);
    setQuantity(1);
  };

  const handleFinish = async () => {
    const ok = await persistAndAddToCart();
    if (!ok) return;
    toast({ title: '🍋 Caipirinha adicionada!', description: `${quantity}x Caipirinha no carrinho` });
    onOpenChange(false);
  };

  const handleAddAnother = async () => {
    const ok = await persistAndAddToCart();
    if (!ok) return;
    toast({ title: '🍋 Caipirinha adicionada!', description: 'Monte outra caipirinha diferente' });
    resetWizard();
  };

  const goTo = (s: Step) => setStep(s);

  /* ── Fruit grid component ── */
  const FruitGrid = ({ selected, onSelect, excludeIds }: {
    selected: FruitOption | null;
    onSelect: (f: FruitOption) => void;
    excludeIds: string[];
  }) => (
    <div className="grid grid-cols-4 gap-1.5 px-3 py-2">
      {fruitOptions.filter(f => !excludeIds.includes(f.id)).map(fruit => {
        const isSelected = selected?.id === fruit.id;
        return (
          <button
            key={fruit.id}
            onClick={() => onSelect(fruit)}
            className={`relative p-1 rounded-xl border-2 flex flex-col items-center gap-0.5 ${
              isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'
            }`}
          >
            {fruit.icon_url ? (
              <img src={fruit.icon_url} alt={fruit.name} className="w-full aspect-square object-contain" />
            ) : (
              <span className="text-4xl leading-none py-1">{getFruitEmoji(fruit.name)}</span>
            )}
            <span className="font-bold text-[10px] leading-tight">{fruit.name}</span>
            {isSelected && (
              <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  /* ── Purple title bar with BACK (resets attempt) ── */
  const TitleBar = ({ title }: { title: string }) => (
    <div className="flex items-center bg-purple-600 px-4 py-3 shrink-0 rounded-t-3xl">
      <h2 className="flex-1 text-center text-white font-bold text-sm tracking-wide">{title}</h2>
      <button onClick={() => onOpenChange(false)} className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center ml-2">
        <X className="h-4 w-4 text-white" />
      </button>
    </div>
  );

  const isLoading = loading || fruitsLoading;
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[380px] max-w-[95vw] p-0 rounded-3xl overflow-hidden" hideCloseButton>
          <div className="flex items-center justify-center h-[300px]">
            <div className="animate-spin w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full" />
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
                      <p className="text-[10px] text-muted-foreground">Caipirinha sem destilado</p>
                    </div>
                  </button>
                )}
                <TierBottleCarousel
                  bottles={bottles}
                  selectedBottles={selectedBottles}
                  onToggle={toggleBottle}
                  onUpdateDoses={updateBottleDoses}
                  compact
                />
              </div>
              {!noAlcohol && selectedBottles.length > 0 && (
                <p className="text-[10px] text-muted-foreground font-medium px-4 truncate">
                  ✓ {selectedBottles.map(sb => `${sb.doses}x ${sb.bottle.product_name}`).join(' · ')}
                </p>
              )}
              <div className="px-4 py-3 shrink-0">
                <button
                  disabled={!noAlcohol && selectedBottles.length === 0}
                  onClick={() => goTo('sabor')}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── SABOR ── */}
          {step === 'sabor' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3">Qual o sabor da sua Caipirinha?</p>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <FruitGrid selected={selectedFruit} onSelect={setSelectedFruit} excludeIds={[]} />
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={() => goTo('destilado')} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button
                  disabled={!selectedFruit}
                  onClick={() => goTo('extra1')}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── EXTRA 1 ── */}
          {step === 'extra1' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3">Deseja adicionar uma fruta extra? (+R$ 5,00)</p>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <FruitGrid
                  selected={extraFruit1}
                  onSelect={(f) => setExtraFruit1(prev => prev?.id === f.id ? null : f)}
                  excludeIds={[selectedFruit?.id || '']}
                />
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={() => goTo('sabor')} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button
                  onClick={() => { setExtraFruit1(null); goTo('extra2'); }}
                  className="flex-1 py-3 rounded-xl border text-sm font-medium"
                >
                  Pular
                </button>
                {extraFruit1 && (
                  <button
                    onClick={() => goTo('extra2')}
                    className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-1"
                  >
                    Avançar <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── EXTRA 2 ── */}
          {step === 'extra2' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3">Mais uma fruta extra? (+R$ 5,00)</p>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <FruitGrid
                  selected={extraFruit2}
                  onSelect={(f) => setExtraFruit2(prev => prev?.id === f.id ? null : f)}
                  excludeIds={[selectedFruit?.id || '', extraFruit1?.id || ''].filter(Boolean)}
                />
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={() => goTo('extra1')} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button
                  onClick={() => { setExtraFruit2(null); goTo('review'); }}
                  className="flex-1 py-3 rounded-xl border text-sm font-medium"
                >
                  Pular
                </button>
                {extraFruit2 && (
                  <button
                    onClick={() => goTo('review')}
                    className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-1"
                  >
                    Avançar <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── REVIEW ── */}
          {step === 'review' && selectedFruit && (
            <div className="flex-1 min-h-0 flex flex-col">

              <DrinkRecipeReview
                title="🍋 1 CAIPIRINHA MONTADA"
                noun="caipirinha"
                doses={selectedBottles.map(sb => ({
                  bottleName: sb.bottle.product_name,
                  doses: sb.doses,
                  imageUrl: sb.bottle.image_url,
                }))}
                gelo={{ name: 'Gelo Água (incluso)', emoji: '❄️' }}
                fruits={[selectedFruit, ...extraFruits].map(f => ({ id: f.id, name: f.name }))}
                quantity={quantity}
                setQuantity={setQuantity}
                unitPrice={unitPrice}
                onBack={() => goTo('extra2')}
                onAddAnotherDifferent={handleAddAnother}
                onFinish={handleFinish}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
