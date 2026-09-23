import { useState, useEffect, useMemo } from 'react';
import { getFruitEmoji } from '@/lib/emoji-icons';
import { queryClient } from '@/lib/queryClient';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Check, ChevronRight, ChevronLeft, ShoppingCart, Plus, Minus, Ban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client-safe';
import { useCartOptional } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { useDrinkFruits } from '@/hooks/use-drink-fruits';
import type { CustomDrink, Product } from '@/shared/schema';
import { nanoid } from 'nanoid';
import { mapProduct } from '@/lib/db-mappers';
import { TierBottleCarousel, type AvailableBottleWithTier, type SelectedBottleEntry } from './TierBottleCarousel';
import { fetchAllowedByType, filterByAllowedProducts } from '@/lib/allowed-bottles';
import { deductBottleDoses } from '@/lib/deduct-bottle-doses';
import { DrinkRecipeReview } from './DrinkRecipeReview';

type AvailableBottle = AvailableBottleWithTier;
type SelectedBottle = SelectedBottleEntry;

interface FruitOption {
  id: string;
  name: string;
  price: number;
  icon_url?: string | null;
}

interface CaipiIceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCustomDrink?: (drink: CustomDrink) => void;
}

type Step = 'destilado' | 'frutas' | 'ice' | 'review';

const STEP_TITLES: Record<Step, string> = {
  destilado: 'ESCOLHA O DESTILADO',
  frutas: 'FRUTAS NO COPO',
  ice: 'ESCOLHA A ICE',
  review: 'SUA CAIPI ICE',
};

const ICES_CATEGORY_ID = '8e030d4d-ec1f-4722-8b68-0f0f93c13971';
const CERVEJAS_CATEGORY_ID = '910004ea-3a2c-4f2e-85a5-e94d00ebd3ab';
const PREMADE_PATTERN = /^caip/i;

export function CaipiIceModal({ open, onOpenChange, onAddCustomDrink }: CaipiIceModalProps) {
  const cart = useCartOptional();
  const { toast } = useToast();
  const addDrink = onAddCustomDrink || cart?.addCustomDrink;

  // Centralized fruits from DB
  const { data: centralFruits = [] } = useDrinkFruits({ activeOnly: true });

  const [step, setStep] = useState<Step>('destilado');
  const [bottles, setBottles] = useState<AvailableBottle[]>([]);
  const [iceProducts, setIceProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [valorAgregado, setValorAgregado] = useState(10);
  const [noAlcoholPrice, setNoAlcoholPrice] = useState(10);
  const [allowNoAlcohol, setAllowNoAlcohol] = useState(false);
  const [noAlcohol, setNoAlcohol] = useState(false);

  const [selectedBottles, setSelectedBottles] = useState<SelectedBottle[]>([]);
  const [extraFruits, setExtraFruits] = useState<FruitOption[]>([]);
  const [selectedIce, setSelectedIce] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Map centralized fruits to FruitOption format
  const fruitOptions: FruitOption[] = useMemo(() =>
    centralFruits.map(f => ({ id: f.id, name: f.name, price: f.price, icon_url: f.icon_url })),
    [centralFruits]
  );

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
        const [bottlesRes, icesRes, longneckRes, configRes] = await Promise.all([
          supabase.rpc('get_available_bottles_for_assembly'),
          supabase.from('products').select('*').eq('category_id', ICES_CATEGORY_ID).eq('is_active', true).order('name'),
          supabase.from('products').select('*').eq('category_id', CERVEJAS_CATEGORY_ID).eq('is_active', true).ilike('name', '%longneck%'),
          supabase.from('special_drink_configs').select('base_price, no_alcohol_price, allow_no_alcohol').eq('slug', 'caipi-ice').maybeSingle(),
        ]);
        if (bottlesRes.data) {
          const allBottles = (bottlesRes.data as any[]).map((b: any) => ({
            bottle_id: b.bottle_id, product_id: b.product_id, product_name: b.product_name,
            dose_price: b.dose_price, tier: b.tier || null, image_url: b.image_url || null,
          })) as AvailableBottle[];
          const { spiritIds, hasAny } = await fetchAllowedByType('caipi-ice');
          setBottles(hasAny ? filterByAllowedProducts(allBottles, spiritIds) : []);
        }
        const standaloneIces = (icesRes.data || [])
          .filter((p: Record<string, unknown>) => !PREMADE_PATTERN.test(String(p.name || '')))
          .map(p => mapProduct(p as Record<string, unknown>));
        const longneckMapped = (longneckRes.data || []).map((p: Record<string, unknown>) => mapProduct(p));
        setIceProducts([...standaloneIces, ...longneckMapped]);
        if (configRes.data) {
          setValorAgregado(Number(configRes.data.base_price ?? 10));
          setNoAlcoholPrice(Number((configRes.data as any).no_alcohol_price ?? 10));
          setAllowNoAlcohol((configRes.data as any).allow_no_alcohol ?? false);
        }
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
      setExtraFruits([]);
      setSelectedIce(null);
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
        return { ...sb, doses: Math.max(1, Math.min(2, sb.doses + delta)) };
      }
      return sb;
    }));
  };

  const toggleFruit = (fruit: FruitOption) => {
    setExtraFruits(prev => {
      const exists = prev.find(f => f.id === fruit.id);
      if (exists) return prev.filter(f => f.id !== fruit.id);
      return [...prev, fruit];
    });
  };

  const totalPrice = useMemo(() => {
    const doseCost = noAlcohol
      ? noAlcoholDoseValue
      : selectedBottles.reduce((s, sb) => s + sb.bottle.dose_price * sb.doses, 0);
    const fruitsCost = extraFruits.reduce((s, f) => s + f.price, 0);
    const iceCost = selectedIce ? Number(selectedIce.salePrice) : 0;
    return doseCost + valorAgregado + fruitsCost + iceCost;
  }, [selectedBottles, extraFruits, selectedIce, valorAgregado, noAlcohol, noAlcoholDoseValue]);

  const persistAndAddToCart = async (): Promise<boolean> => {
    if (!selectedIce) return false;
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

    const destDescription = noAlcohol
      ? 'Sem Álcool'
      : selectedBottles.map(sb => `${sb.doses}x ${sb.bottle.product_name}`).join(' + ');
    const fruitNames = ['Limão', ...extraFruits.map(f => f.name)].join(', ');
    const description = [destDescription, `Frutas: ${fruitNames}`, selectedIce.name].filter(Boolean).join(' + ');
    const allFruits = [
      { id: 'limao-auto', name: 'Limão', price: 0 },
      ...extraFruits.map(f => ({ id: f.id, name: f.name, price: f.price })),
    ];
    addDrink?.({
      id: nanoid(), type: 'custom_drink', name: noAlcohol ? '🧊 Caipi Ice (Sem Álcool)' : '🧊 Caipi Ice', description,
      doses: noAlcohol ? [] : selectedBottles.map(sb => ({
        bottleId: sb.bottle.bottle_id, bottleName: sb.bottle.product_name,
        productId: sb.bottle.product_id, doseCount: sb.doses, pricePerDose: sb.bottle.dose_price,
      })),
      energetico: null, fruits: allFruits,
      gelo: { id: 'agua', name: 'Gelo de Água', price: 0 },
      totalPrice, quantity,
    });
    return true;
  };

  const resetWizard = () => {
    setStep('destilado');
    setSelectedBottles([]);
    setExtraFruits([]);
    setSelectedIce(null);
    setNoAlcohol(false);
    setQuantity(1);
  };

  const handleFinish = async () => {
    const ok = await persistAndAddToCart();
    if (!ok) return;
    toast({ title: '🧊 Caipi Ice Adicionada!', description: `${quantity}x Caipi Ice no carrinho` });
    onOpenChange(false);
  };

  const handleAddAnother = async () => {
    const ok = await persistAndAddToCart();
    if (!ok) return;
    toast({ title: '🧊 Caipi Ice Adicionada!', description: 'Monte outra Caipi Ice diferente' });
    resetWizard();
  };

  const goTo = (s: Step) => setStep(s);

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
                      <p className="text-[10px] text-muted-foreground">Caipi Ice sem destilado</p>
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
                  onClick={() => goTo('frutas')}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── FRUTAS (opcional, múltiplas) ── */}
          {step === 'frutas' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3 text-center">
                Deseja adicionar fruta(s) no copo? Selecione quantas quiser ou pule.
              </p>
              <div className="grid grid-cols-4 gap-1.5 px-3 py-2">
                {fruitOptions.map(fruit => {
                  const isSelected = extraFruits.some(f => f.id === fruit.id);
                  return (
                    <button
                      key={fruit.id}
                      onClick={() => toggleFruit(fruit)}
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
                      <span className="text-[9px] text-muted-foreground leading-tight">+R$ {fruit.price.toFixed(2)}</span>
                      {isSelected && (
                        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {extraFruits.length > 0 && (
                <p className="text-[10px] text-purple-600 font-medium px-4 truncate text-center">
                  ✓ {extraFruits.length} fruta(s) — +R$ {extraFruits.reduce((s, f) => s + f.price, 0).toFixed(2)}
                </p>
              )}
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={() => goTo('destilado')} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                {extraFruits.length === 0 ? (
                  <button
                    onClick={() => goTo('ice')}
                    className="flex-1 py-3 rounded-xl border text-sm font-medium"
                  >
                    Pular
                  </button>
                ) : (
                  <button
                    onClick={() => goTo('ice')}
                    className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-1"
                  >
                    Avançar <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── ICE ── */}
          {step === 'ice' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3">Escolha a Ice ou Longneck:</p>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-1.5">
                {iceProducts.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma ice disponível</p>
                ) : (
                  iceProducts.map(product => {
                    const isLongneck = product.name.toLowerCase().includes('longneck');
                    const isSelected = selectedIce?.id === product.id;
                    return (
                      <button
                        key={product.id}
                        onClick={() => setSelectedIce(product)}
                        className={`w-full p-3 rounded-xl border-2 text-left flex justify-between items-center ${
                          isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-10 h-10 object-contain rounded-md bg-muted/40"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-xl w-10 h-10 flex items-center justify-center">{isLongneck ? '🍺' : '🧊'}</span>
                          )}
                          <div>
                            <p className="font-medium text-sm">{product.name}</p>
                            {isLongneck && <span className="text-[10px] text-muted-foreground">Cerveja especial</span>}
                          </div>
                        </div>
                        <span className="text-sm font-bold text-purple-500">R$ {Number(product.salePrice).toFixed(2)}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={() => goTo('frutas')} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button
                  disabled={!selectedIce}
                  onClick={() => goTo('review')}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── REVIEW ── */}
          {step === 'review' && selectedIce && (
            <div className="flex-1 min-h-0 flex flex-col">
              <DrinkRecipeReview
                title="🧊 1 CAIPI ICE MONTADA"
                noun="caipi ice"
                doses={selectedBottles.map(sb => ({
                  bottleName: sb.bottle.product_name,
                  doses: sb.doses,
                  imageUrl: sb.bottle.image_url,
                }))}
                gelo={{ name: 'Gelo de Água (incluso)', emoji: '❄️' }}
                fruits={[{ id: 'limao-auto', name: 'Limão' }, ...extraFruits.map(f => ({ id: f.id, name: f.name }))]}
                extraLines={[{ label: 'Ice', value: selectedIce.name, emoji: '🍾', color: 'text-emerald-500' }]}
                quantity={quantity}
                setQuantity={setQuantity}
                unitPrice={totalPrice}
                onBack={() => goTo('ice')}
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
