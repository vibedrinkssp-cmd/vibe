import { useState, useEffect, useMemo, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronRight, ChevronLeft, Check, X, Plus, Minus, Wine, Zap, Cherry, Snowflake, Cookie, Ban, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client-safe';
import { useCartOptional } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { useDrinkFruits } from '@/hooks/use-drink-fruits';
import { getFruitEmoji } from '@/lib/emoji-icons';
import { nanoid } from 'nanoid';
import { mapProduct } from '@/lib/db-mappers';
import { fetchAllowedByType, filterByAllowedProducts } from '@/lib/allowed-bottles';
import { filterVisibleIceFlavorOptions, getIceFlavorPhotoUrl, iceAgua } from '@/lib/ice-flavor-icons';
import type { Product } from '@/shared/schema';
import { TierBottleCarousel, type AvailableBottleWithTier } from './TierBottleCarousel';
import type { CustomDrink } from '@/shared/schema';
import { DrinkRecipeReview } from './DrinkRecipeReview';

interface OpenBottle {
  id: string;
  product_id: string;
  product_name: string;
  remaining_doses: number;
  dose_price: number;
  tier?: string | null;
  image_url?: string | null;
}

interface AssemblyBottle {
  bottle_id: string;
  product_id: string;
  product_name: string;
  dose_price: number;
  remaining_doses: number;
  tier?: string | null;
  image_url?: string | null;
}

interface SelectedBottle {
  bottle: OpenBottle;
  doses: number;
}

type SelectedEnergetico =
  | { kind: 'bottle'; bottle: OpenBottle }
  | { kind: 'can'; product: Product }
  | { kind: 'baly'; id: string; name: string };

const BALY_ENERGETICOS = [
  { id: 'baly-melancia', name: 'Baly Melancia', price: 5 },
  { id: 'baly-tropical', name: 'Baly Tropical', price: 5 },
  { id: 'baly-maca-verde', name: 'Baly Maçã Verde', price: 5 },
  { id: 'baly-morango-pessego', name: 'Baly Morango c/ Pêssego', price: 5 },
];

interface DrinkFruit {
  id: string;
  name: string;
  price: number;
  emoji: string;
  icon_url?: string | null;
}

interface DrinkConfig {
  basePrice: number;
  noAlcoholPrice: number;
  stepDoses: boolean;
  stepEnergetico: boolean;
  stepFrutas: boolean;
  stepGelo: boolean;
  stepAdicionais: boolean;
  adicionalPrice: number;
  allowNoAlcohol: boolean;
}

interface CustomDrinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drinkType?: string | null;
  onAddCustomDrink?: (drink: CustomDrink) => void;
}

type Step = 'sabor' | 'destilado' | 'energetico' | 'frutas' | 'frutas_extra' | 'adicionais' | 'gelo' | 'review';

// dynamicFruits are now loaded dynamically from drink_fruits table

const ADICIONAIS = [
  { id: 'pacoca', name: 'Paçoca', emoji: '🥜' },
  { id: 'chocolate', name: 'Chocolate', emoji: '🍫' },
  { id: 'chocolate-branco', name: 'Chocolate Branco', emoji: '🤍' },
  { id: 'ovomaltine', name: 'Ovomaltine', emoji: '🥤' },
  { id: 'oreo', name: 'Oreo', emoji: '🍪' },
];

const SPIRIT_TYPES = new Set(['destilado', 'whisky', 'gin', 'vodka', 'cachaca', 'licor', 'corote', 'vinho', 'tequila', 'conhaque', 'brandy']);

function getStepTitle(step: Step, drinkType?: string | null): string {
  const isDose = drinkType === 'dose';
  const map: Record<Step, string> = {
    sabor: 'ESCOLHA O SABOR',
    destilado: isDose ? 'ESCOLHA A DOSE' : 'ESCOLHA O DESTILADO',
    energetico: 'ENERGÉTICO',
    frutas: 'FRUTAS',
    frutas_extra: 'FRUTA EXTRA',
    adicionais: 'ADICIONAIS',
    gelo: 'ESCOLHA O GELO',
    review: 'REVISAR PEDIDO',
  };
  return map[step];
}

export function CustomDrinkModal({ open, onOpenChange, drinkType, onAddCustomDrink }: CustomDrinkModalProps) {
  const cart = useCartOptional();
  const { toast } = useToast();
  const addDrink = onAddCustomDrink || cart?.addCustomDrink;

  // Centralized fruits from DB
  const { data: centralFruits = [] } = useDrinkFruits({ activeOnly: true });

  const [step, setStep] = useState<Step>('destilado');
  const [bottles, setBottles] = useState<OpenBottle[]>([]);
  const [energeticoBottles, setEnergeticoBottles] = useState<OpenBottle[]>([]);
  const [energeticoCans, setEnergeticoCans] = useState<Product[]>([]);
  const [gelos, setGelos] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Map centralized fruits to DrinkFruit format
  const dynamicFruits: DrinkFruit[] = useMemo(() =>
    centralFruits.map(f => ({
      id: f.id, name: f.name, price: f.price,
      emoji: getFruitEmoji(f.name),
      icon_url: f.icon_url,
    })),
    [centralFruits]
  );
  const [drinkConfig, setDrinkConfig] = useState<DrinkConfig>({
    basePrice: 0, noAlcoholPrice: 10,
    stepDoses: true, stepEnergetico: true, stepFrutas: true, stepGelo: true,
    stepAdicionais: false, adicionalPrice: 5, allowNoAlcohol: false,
  });
  const [noAlcohol, setNoAlcohol] = useState(false);

  const isBatida = drinkType === 'batida';
  const isLicor = drinkType === 'drink-43';
  const isDose = drinkType === 'dose';

  const [quantity, setQuantity] = useState(1);

  const activeSteps = useMemo(() => {
    if (isDose) return ['destilado', 'review'] as Step[];
    const steps: Step[] = [];
    if (isBatida) {
      if (drinkConfig.stepDoses) steps.push('destilado');
      if (drinkConfig.stepFrutas) { steps.push('sabor'); steps.push('frutas_extra'); }
    } else {
      if (drinkConfig.stepDoses) steps.push('destilado');
      if (drinkConfig.stepFrutas) steps.push('frutas');
    }
    if (drinkConfig.stepEnergetico) steps.push('energetico');
    if (drinkConfig.stepAdicionais) steps.push('adicionais');
    if (drinkConfig.stepGelo) steps.push('gelo');
    steps.push('review');
    return steps.length > 0 ? steps : ['destilado'] as Step[];
  }, [drinkConfig, isBatida, isLicor, isDose]);

  const [selectedBottles, setSelectedBottles] = useState<SelectedBottle[]>([]);
  const [selectedEnergetico, setSelectedEnergetico] = useState<SelectedEnergetico | null>(null);
  const [selectedMainFruit, setSelectedMainFruit] = useState<string | null>(null);
  const [selectedExtraFruit, setSelectedExtraFruit] = useState<string | null>(null);
  const [selectedFruits, setSelectedFruits] = useState<string[]>([]);
  const [selectedAdicionais, setSelectedAdicionais] = useState<string[]>([]);
  const [selectedGelo, setSelectedGelo] = useState<'agua' | 'sem' | Product | null>('agua');

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const slug = drinkType || 'batida';
        const { data: configData } = await supabase
          .from('special_drink_configs').select('*').eq('slug', slug).maybeSingle();
        if (configData) {
          setDrinkConfig({
            basePrice: Number(configData.base_price ?? 0),
            noAlcoholPrice: Number((configData as any).no_alcohol_price ?? 10),
            stepDoses: configData.step_doses ?? true, stepEnergetico: configData.step_energetico ?? false,
            stepFrutas: configData.step_frutas ?? true, stepGelo: configData.step_gelo ?? true,
            stepAdicionais: (configData as any).step_adicionais ?? false,
            adicionalPrice: Number((configData as any).adicional_price ?? 5),
            allowNoAlcohol: configData.allow_no_alcohol ?? false,
          });
        }

        const { data: b } = await (supabase.rpc as Function)('get_available_bottles_for_assembly');
        if (b) {
          const allBottles = ((b || []) as AssemblyBottle[]).map(x => ({
            id: x.bottle_id, product_id: x.product_id, product_name: x.product_name,
            remaining_doses: x.remaining_doses, dose_price: x.dose_price,
            tier: x.tier || null, image_url: x.image_url || null,
          } as OpenBottle));
          const productIds = [...new Set(allBottles.map(x => x.product_id))];
          const { data: productTypes } = await supabase.from('products').select('id, product_type, name').in('id', productIds);
          const typeMap = new Map<string, { type: string; name: string }>();
          if (productTypes) productTypes.forEach((p: { id: string; product_type: string | null; name: string }) => {
            typeMap.set(p.id, { type: p.product_type || '', name: p.name });
          });

          const { spiritIds, energeticoIds, hasAny } = await fetchAllowedByType(slug);
          const sortByPrice = (arr: OpenBottle[]) => arr.sort((a, b) => b.dose_price - a.dose_price);
          let filteredBottles: OpenBottle[];
          if (hasAny) { filteredBottles = filterByAllowedProducts(allBottles, spiritIds); }
          else if (slug === 'drink-43') { filteredBottles = []; }
          else if (slug === 'dose') { filteredBottles = allBottles.filter(x => { const info = typeMap.get(x.product_id); return info && SPIRIT_TYPES.has(info.type); }); }
          else { filteredBottles = []; }
          setBottles(sortByPrice(filteredBottles));

          if (hasAny && energeticoIds.size > 0) { setEnergeticoBottles(filterByAllowedProducts(allBottles, energeticoIds)); }
          else if (hasAny) { setEnergeticoBottles([]); }
          else {
            const eTypeMap = new Map<string, string>();
            productTypes?.forEach((p: { id: string; product_type: string | null }) => eTypeMap.set(p.id, p.product_type || ''));
            setEnergeticoBottles(allBottles.filter(x => eTypeMap.get(x.product_id) === 'energetico'));
          }
        }
        const { data: e } = await supabase.from('products').select('*').eq('product_type', 'energetico').eq('is_active', true).order('name');
        if (e) {
          const cans = e.filter((p: Record<string, unknown>) => { const name = (p.name as string || '').toLowerCase(); return !name.includes('2 litros') && !name.includes('2l'); });
          setEnergeticoCans(cans.map(p => mapProduct(p as Record<string, unknown>)));
        }
        const { data: g } = await supabase.from('products').select('*').eq('product_type', 'gelo').eq('is_active', true).order('name');
        if (g) {
          setGelos(filterVisibleIceFlavorOptions(g).map(p => mapProduct(p as Record<string, unknown>)));
        }
        // Fruits now come from centralized useDrinkFruits hook
      } finally { setLoading(false); }
    };
    load();
  }, [open, drinkType]);

  useEffect(() => {
    if (open) {
      setSelectedBottles([]); setSelectedEnergetico(null); setSelectedMainFruit(null);
      setSelectedExtraFruit(null); setSelectedFruits([]); setSelectedAdicionais([]);
      setSelectedGelo('agua'); setNoAlcohol(false); setQuantity(1);
    }
  }, [open]);

  useEffect(() => {
    if (open && activeSteps.length > 0 && !activeSteps.includes(step)) {
      setStep(activeSteps[0]);
    }
  }, [open, activeSteps, step]);

  const stepIndex = activeSteps.indexOf(step);

  const canAdvance = () => {
    if (step === 'destilado') return noAlcohol || selectedBottles.length > 0;
    if (step === 'sabor') return selectedMainFruit !== null;
    return true;
  };

  const nextStep = () => { const idx = activeSteps.indexOf(step); if (idx < activeSteps.length - 1) setStep(activeSteps[idx + 1]); };
  const prevStep = () => { const idx = activeSteps.indexOf(step); if (idx > 0) setStep(activeSteps[idx - 1]); };
  const isLastStep = stepIndex === activeSteps.length - 1;

  const toggleBottle = (bottle: OpenBottle) => {
    const existing = selectedBottles.find(sb => sb.bottle.id === bottle.id);
    if (existing) setSelectedBottles(prev => prev.filter(sb => sb.bottle.id !== bottle.id));
    else { setNoAlcohol(false); setSelectedBottles(prev => [...prev, { bottle, doses: 1 }]); }
  };

  const updateBottleDoses = (bottleId: string, delta: number) => {
    setSelectedBottles(prev => {
      return prev.reduce<SelectedBottle[]>((acc, sb) => {
        if (sb.bottle.id === bottleId) {
          const newDoses = sb.doses + delta;
          if (newDoses < 1) return acc; // remove bottle
          const maxDose = Math.min(sb.bottle.remaining_doses, 2);
          acc.push({ ...sb, doses: Math.min(maxDose, newDoses) });
        } else {
          acc.push(sb);
        }
        return acc;
      }, []);
    });
  };

  // Cheapest available dose — used as the "Sem Álcool" replacement so the drink
  // never ends up cheaper than the most affordable alcoholic version.
  const minDosePrice = useMemo(
    () => (bottles.length ? Math.min(...bottles.map(b => b.dose_price)) : 0),
    [bottles]
  );
  const noAlcoholDoseValue = useMemo(
    () => (minDosePrice > 0 ? minDosePrice : drinkConfig.noAlcoholPrice),
    [drinkConfig.noAlcoholPrice, minDosePrice]
  );

  const toggleFruit = (id: string) => {
    if (selectedFruits.includes(id)) setSelectedFruits(prev => prev.filter(f => f !== id));
    else if (selectedFruits.length < 3) setSelectedFruits(prev => [...prev, id]);
  };

  const toggleAdicional = (id: string) => {
    if (selectedAdicionais.includes(id)) setSelectedAdicionais(prev => prev.filter(a => a !== id));
    else if (selectedAdicionais.length < 5) setSelectedAdicionais(prev => [...prev, id]);
  };

  const energeticoName = selectedEnergetico
    ? selectedEnergetico.kind === 'can' ? selectedEnergetico.product.name
      : selectedEnergetico.kind === 'baly' ? selectedEnergetico.name
      : selectedEnergetico.bottle.product_name
    : null;

  // Adicionais como sabor (Paçoca, Chocolate, etc.) — disponíveis no passo SABOR/FRUTA EXTRA das batidas
  const adicionalAsFruit = useCallback((adId: string) => {
    const ad = ADICIONAIS.find(a => a.id === adId);
    if (!ad) return null;
    return { id: `adic:${ad.id}`, name: ad.name, price: drinkConfig.adicionalPrice, emoji: ad.emoji };
  }, [drinkConfig.adicionalPrice]);

  const flavorOptions: DrinkFruit[] = useMemo(() => {
    if (!isBatida) return dynamicFruits;
    const adicionalFlavors = ADICIONAIS
      .map(a => adicionalAsFruit(a.id))
      .filter((x): x is DrinkFruit => x !== null);
    return [...dynamicFruits, ...adicionalFlavors];
  }, [dynamicFruits, isBatida, adicionalAsFruit]);

  const getFruitPrice = useCallback((fruitId: string) => {
    if (fruitId.startsWith('adic:')) {
      return adicionalAsFruit(fruitId.slice(5))?.price ?? drinkConfig.adicionalPrice;
    }
    return dynamicFruits.find(f => f.id === fruitId)?.price ?? 5;
  }, [dynamicFruits, adicionalAsFruit, drinkConfig.adicionalPrice]);

  const getFruitName = useCallback((fruitId: string) => {
    if (fruitId.startsWith('adic:')) {
      return adicionalAsFruit(fruitId.slice(5))?.name ?? '';
    }
    return dynamicFruits.find(f => f.id === fruitId)?.name ?? '';
  }, [dynamicFruits, adicionalAsFruit]);

  const calcFruitExtras = useCallback((fruitIds: string[], firstFree: boolean) => {
    if (firstFree) return fruitIds.slice(1).reduce((sum, id) => sum + getFruitPrice(id), 0);
    return fruitIds.reduce((sum, id) => sum + getFruitPrice(id), 0);
  }, [getFruitPrice]);

  const totalPrice = useMemo(() => {
    const doseCost = noAlcohol ? noAlcoholDoseValue : selectedBottles.reduce((s, sb) => s + sb.bottle.dose_price * sb.doses, 0);
    const agregado = drinkType === 'dose' ? 0 : drinkConfig.basePrice;
    let extras = 0;
    if (selectedEnergetico?.kind === 'can') extras += Number(selectedEnergetico.product.salePrice);
    if (isBatida) {
      // Batida: main fruit + extra fruit (both charged)
      if (selectedMainFruit) extras += getFruitPrice(selectedMainFruit);
      if (selectedExtraFruit) extras += getFruitPrice(selectedExtraFruit);
    } else {
      // Caipirinha / Licor 43: ALL fruits charged (no free first fruit)
      extras += calcFruitExtras(selectedFruits, false);
    }
    extras += selectedAdicionais.length * drinkConfig.adicionalPrice;
    if (selectedGelo && selectedGelo !== 'agua' && selectedGelo !== 'sem') extras += Number((selectedGelo as Product).salePrice);
    return doseCost + agregado + extras;
  }, [selectedBottles, selectedEnergetico, selectedFruits, selectedMainFruit, selectedExtraFruit, selectedAdicionais, selectedGelo, getFruitPrice, calcFruitExtras, drinkConfig, isBatida, drinkType, noAlcohol, noAlcoholDoseValue]);

  /** Deduct energético stock: open-bottle doses for free ones, product stock for paid cans */
  const deductEnergeticoStock = async (qty: number) => {
    if (!selectedEnergetico) return true;
    try {
      if (selectedEnergetico.kind === 'bottle') {
        // Free energético from open bottle – deduct 1 dose per drink quantity
        const { error } = await supabase.rpc('deduct_bottle_doses', {
          p_bottle_id: selectedEnergetico.bottle.id,
          p_doses_used: qty,
        });
        if (error) { toast({ title: `Erro ao deduzir energético: ${error.message}`, variant: 'destructive' }); return false; }
      } else if (selectedEnergetico.kind === 'baly') {
        // BALY/BIG BOSS 2L: localiza o produto real e usa auto_consume_energy_dose
        // (consome doses de garrafa aberta E auto-abre nova quando esgota, descontando estoque)
        const balyNameMap: Record<string, string> = {
          'baly-melancia': 'BALY 2 LITROS MELANCIA',
          'baly-tropical': 'BALY 2 LITROS TROPICAL',
          'baly-maca-verde': 'BALY 2 LITROS MAÇÃ VERDE',
          'baly-morango-pessego': 'BALY 2 LITROS PÊSSEGO COM MORANGO',
        };
        const productName = balyNameMap[selectedEnergetico.id];
        if (productName) {
          const { data: prod } = await supabase
            .from('products')
            .select('id')
            .eq('name', productName)
            .eq('is_active', true)
            .maybeSingle();
          if (!prod) {
            toast({ title: `Produto ${productName} não cadastrado`, variant: 'destructive' });
            return false;
          }
          const { error } = await supabase.rpc('auto_consume_energy_dose', {
            p_product_id: prod.id,
            p_doses: qty,
          });
          if (error) { toast({ title: `Erro ao consumir ${selectedEnergetico.name}: ${error.message}`, variant: 'destructive' }); return false; }
        }
      } else if (selectedEnergetico.kind === 'can') {
        // Paid can – deduct from product stock
        const { error } = await supabase.rpc('deduct_product_stock', {
          p_product_id: selectedEnergetico.product.id,
          p_quantity: qty,
        });
        if (error) { toast({ title: `Erro ao deduzir estoque de ${selectedEnergetico.product.name}: ${error.message}`, variant: 'destructive' }); return false; }
      }
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
      queryClient.invalidateQueries({ queryKey: ['assembly-bottles'] });
      return true;
    } catch (err) {
      console.error('[deductEnergeticoStock]', err);
      toast({ title: 'Erro ao deduzir energético', variant: 'destructive' });
      return false;
    }
  };

  const persistAndAddToCart = async (): Promise<boolean> => {
    if (noAlcohol) {
      const agregado = drinkType === 'dose' ? 0 : drinkConfig.basePrice;
      let extras = 0;
      if (selectedEnergetico?.kind === 'can') extras += Number(selectedEnergetico.product.salePrice);
      if (isBatida) {
        if (selectedMainFruit) extras += getFruitPrice(selectedMainFruit);
        if (selectedExtraFruit) extras += getFruitPrice(selectedExtraFruit);
      } else {
        extras += calcFruitExtras(selectedFruits, false);
      }
      extras += selectedAdicionais.length * drinkConfig.adicionalPrice;
      if (selectedGelo && selectedGelo !== 'agua' && selectedGelo !== 'sem') extras += Number((selectedGelo as Product).salePrice);
      const finalPrice = noAlcoholDoseValue + agregado + extras;

      if (selectedEnergetico) {
        const ok = await deductEnergeticoStock(quantity);
        if (!ok) return false;
      }

      const allFruitIds = isBatida ? [selectedMainFruit, selectedExtraFruit].filter(Boolean) as string[] : selectedFruits;
      const adicionaisDescription = selectedAdicionais.length > 0 ? selectedAdicionais.map(id => ADICIONAIS.find(a => a.id === id)?.name).join(', ') : null;
      const description = ['Sem Álcool', energeticoName,
        allFruitIds.length > 0 ? allFruitIds.map(id => `+${getFruitName(id)}`).join(', ') : null,
        adicionaisDescription, selectedGelo === 'agua' ? 'Gelo Água' : selectedGelo === 'sem' ? 'Sem Gelo' : (selectedGelo as Product)?.name,
      ].filter(Boolean).join(' + ');
      addDrink?.({
        id: nanoid(), type: 'custom_drink', name: isBatida ? 'Batida (Sem Álcool)' : 'Drink (Sem Álcool)', description,
        doses: [],
        energetico: selectedEnergetico ? (
          selectedEnergetico.kind === 'can' ? { type: 'lata' as const, productId: selectedEnergetico.product.id, productName: selectedEnergetico.product.name, price: Number(selectedEnergetico.product.salePrice) }
          : selectedEnergetico.kind === 'baly' ? { type: 'garrafa' as const, productId: selectedEnergetico.id, productName: selectedEnergetico.name, price: BALY_ENERGETICOS.find(b => b.id === selectedEnergetico.id)?.price || 5 }
          : { type: 'garrafa' as const, productId: selectedEnergetico.bottle.product_id, productName: selectedEnergetico.bottle.product_name, price: 0 }
        ) : null,
        fruits: allFruitIds.map(id => ({ id, name: getFruitName(id), price: getFruitPrice(id) })),
        gelo: selectedGelo === 'agua' ? { id: 'agua', name: 'Gelo Água', price: 0 } : selectedGelo === 'sem' ? { id: 'sem', name: 'Sem Gelo', price: 0 } : selectedGelo ? { id: (selectedGelo as Product).id, name: (selectedGelo as Product).name, price: Number((selectedGelo as Product).salePrice) } : null,
        totalPrice: finalPrice, quantity,
      });
      return true;
    }

    const resolvedBottles = selectedBottles;
    if (!resolvedBottles || resolvedBottles.length === 0) { toast({ title: 'Selecione ao menos um destilado', variant: 'destructive' }); return false; }

    for (const sb of resolvedBottles) {
      const { error } = await supabase.rpc('deduct_bottle_doses', { p_bottle_id: sb.bottle.id, p_doses_used: sb.doses });
      if (error) { toast({ title: `Erro ao deduzir doses de ${sb.bottle.product_name}`, variant: 'destructive' }); return false; }
    }
    if (selectedEnergetico) {
      const ok = await deductEnergeticoStock(quantity);
      if (!ok) return false;
    }
    queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
    queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
    queryClient.invalidateQueries({ queryKey: ['assembly-bottles'] });

    const finalTotalPrice = (() => {
      const doseCost = resolvedBottles.reduce((s, sb) => s + sb.bottle.dose_price * sb.doses, 0);
      const agregado = drinkType === 'dose' ? 0 : drinkConfig.basePrice;
      let extras = 0;
      if (selectedEnergetico?.kind === 'can') extras += Number(selectedEnergetico.product.salePrice);
      if (isBatida) {
        if (selectedMainFruit) extras += getFruitPrice(selectedMainFruit);
        if (selectedExtraFruit) extras += getFruitPrice(selectedExtraFruit);
      } else {
        extras += calcFruitExtras(selectedFruits, false);
      }
      extras += selectedAdicionais.length * drinkConfig.adicionalPrice;
      if (selectedGelo && selectedGelo !== 'agua' && selectedGelo !== 'sem') extras += Number((selectedGelo as Product).salePrice);
      return doseCost + agregado + extras;
    })();

    const destDescription = resolvedBottles.map(sb => `${sb.doses}x ${sb.bottle.product_name}`).join(' + ');

    if (isDose) {
      addDrink?.({
        id: nanoid(), type: 'custom_drink', name: 'Dose', description: destDescription,
        doses: resolvedBottles.map(sb => ({ bottleId: sb.bottle.id, bottleName: sb.bottle.product_name, productId: sb.bottle.product_id, doseCount: sb.doses as 1 | 2, pricePerDose: sb.bottle.dose_price })),
        energetico: null, fruits: [], gelo: null, totalPrice: finalTotalPrice, quantity,
      });
      return true;
    }

    const allFruitIds = isBatida ? [selectedMainFruit, selectedExtraFruit].filter(Boolean) as string[] : selectedFruits;
    const adicionaisDescription = selectedAdicionais.length > 0 ? selectedAdicionais.map(id => ADICIONAIS.find(a => a.id === id)?.name).join(', ') : null;
    const description = [destDescription, energeticoName,
      allFruitIds.length > 0 ? allFruitIds.map(id => `+${getFruitName(id)}`).join(', ') : null,
      adicionaisDescription, selectedGelo === 'agua' ? 'Gelo Água' : selectedGelo === 'sem' ? 'Sem Gelo' : (selectedGelo as Product)?.name,
    ].filter(Boolean).join(' + ');

    addDrink?.({
      id: nanoid(), type: 'custom_drink',
      name: drinkType === 'drink-43' ? 'Drink de Licor' : isBatida ? 'Batida' : 'Drink Personalizado',
      description,
      doses: resolvedBottles.map(sb => ({ bottleId: sb.bottle.id, bottleName: sb.bottle.product_name, productId: sb.bottle.product_id, doseCount: sb.doses as 1 | 2, pricePerDose: sb.bottle.dose_price })),
      energetico: selectedEnergetico ? (
        selectedEnergetico.kind === 'can' ? { type: 'lata' as const, productId: selectedEnergetico.product.id, productName: selectedEnergetico.product.name, price: Number(selectedEnergetico.product.salePrice) }
        : selectedEnergetico.kind === 'baly' ? { type: 'garrafa' as const, productId: selectedEnergetico.id, productName: selectedEnergetico.name, price: BALY_ENERGETICOS.find(b => b.id === selectedEnergetico.id)?.price || 5 }
        : { type: 'garrafa' as const, productId: selectedEnergetico.bottle.product_id, productName: selectedEnergetico.bottle.product_name, price: 0 }
      ) : null,
      fruits: allFruitIds.map(id => ({ id, name: getFruitName(id), price: getFruitPrice(id) })),
      gelo: selectedGelo === 'agua' ? { id: 'agua', name: 'Gelo Água', price: 0 } : selectedGelo === 'sem' ? { id: 'sem', name: 'Sem Gelo', price: 0 } : selectedGelo ? { id: (selectedGelo as Product).id, name: (selectedGelo as Product).name, price: Number((selectedGelo as Product).salePrice) } : null,
      totalPrice: finalTotalPrice, quantity,
    });
    return true;
  };

  const resetWizard = () => {
    setSelectedBottles([]); setSelectedEnergetico(null); setSelectedMainFruit(null);
    setSelectedExtraFruit(null); setSelectedFruits([]); setSelectedAdicionais([]);
    setSelectedGelo('agua'); setNoAlcohol(false); setQuantity(1);
    if (activeSteps.length > 0) setStep(activeSteps[0]);
  };

  const handleFinish = async () => {
    const ok = await persistAndAddToCart();
    if (!ok) return;
    toast({ title: '🍸 Drink Adicionado!', description: 'Seu drink foi para o carrinho' });
    onOpenChange(false);
  };

  const handleAddAnother = async () => {
    const ok = await persistAndAddToCart();
    if (!ok) return;
    toast({ title: '🍸 Drink Adicionado!', description: 'Monte outro drink diferente' });
    resetWizard();
  };

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

  const modalTitle = isDose ? 'ESCOLHA A DOSE' : getStepTitle(step, drinkType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[95vw] p-0 rounded-3xl overflow-hidden" hideCloseButton>
        <div className="flex flex-col bg-background max-h-[85dvh] overflow-hidden">
          <TitleBar title={modalTitle} />

          {/* ── DESTILADO ── */}
          {step === 'destilado' && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto py-2">
                {drinkConfig.allowNoAlcohol && !isDose && (
                  <button
                    onClick={() => { setNoAlcohol(!noAlcohol); if (!noAlcohol) setSelectedBottles([]); }}
                    className={`w-full mx-4 mb-2 p-3 rounded-xl border-2 text-left flex items-center gap-3 ${
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
                      <p className="text-[10px] text-muted-foreground">Drink sem destilado</p>
                    </div>
                  </button>
                )}

                {(() => {
                  const mappedBottles: AvailableBottleWithTier[] = bottles.map(b => ({
                    bottle_id: b.id, product_id: b.product_id, product_name: b.product_name,
                    dose_price: b.dose_price, tier: b.tier, image_url: b.image_url,
                  }));
                  const mappedSelected = selectedBottles.map(sb => ({
                    bottle: { bottle_id: sb.bottle.id, product_id: sb.bottle.product_id, product_name: sb.bottle.product_name, dose_price: sb.bottle.dose_price, tier: sb.bottle.tier, image_url: sb.bottle.image_url },
                    doses: sb.doses,
                  }));
                  const handleToggleMapped = (mapped: AvailableBottleWithTier) => {
                    const original = bottles.find(b => b.id === mapped.bottle_id);
                    if (original) toggleBottle(original);
                  };
                  return (
                    <TierBottleCarousel
                      bottles={mappedBottles}
                      selectedBottles={mappedSelected}
                      onToggle={handleToggleMapped}
                      onUpdateDoses={(bottleId, delta) => updateBottleDoses(bottleId, delta)}
                      compact
                    />
                  );
                })()}
              </div>
              {selectedBottles.length > 0 && (
                <p className="text-[10px] text-muted-foreground font-medium px-4 truncate">
                  ✓ {selectedBottles.map(sb => `${sb.doses}x ${sb.bottle.product_name}`).join(' · ')}
                </p>
              )}
              <div className="px-4 py-3 shrink-0">
                <button disabled={!canAdvance()} onClick={nextStep}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1">
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── SABOR (batida) ── */}
          {step === 'sabor' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3">Escolha o sabor principal (fruta ou adicional):</p>
              <div className="grid grid-cols-2 gap-2 px-4 py-3 overflow-y-auto" style={{ maxHeight: '55vh' }}>
                {flavorOptions.map(fruit => {
                  const isSelected = selectedMainFruit === fruit.id;
                  return (
                    <button key={fruit.id} onClick={() => setSelectedMainFruit(isSelected ? null : fruit.id)}
                      className={`p-3 rounded-xl border-2 flex items-center gap-3 ${isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'}`}>
                      {fruit.icon_url ? (
                        <img src={fruit.icon_url} alt={fruit.name} className="w-8 h-8 object-contain shrink-0" />
                      ) : (
                        <span className="text-2xl">{fruit.emoji}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block">{fruit.name}</span>
                        <span className="text-[10px] text-muted-foreground">R$ {fruit.price.toFixed(2)}</span>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-purple-500 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={prevStep} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button disabled={!canAdvance()} onClick={nextStep}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-1">
                  Avançar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── FRUTAS (non-batida) ── */}
          {step === 'frutas' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3">
                Frutas (preço individual) • Máx. 3
              </p>
              <div className="grid grid-cols-2 gap-2 px-4 py-3 overflow-y-auto" style={{ maxHeight: '55vh' }}>
                {dynamicFruits.map(fruit => {
                  const isSelected = selectedFruits.includes(fruit.id);
                  const isDisabled = !isSelected && selectedFruits.length >= 3;
                  return (
                    <button key={fruit.id} onClick={() => !isDisabled && toggleFruit(fruit.id)} disabled={isDisabled}
                      className={`p-3 rounded-xl border-2 flex items-center gap-3 ${
                        isSelected ? 'border-purple-500 bg-purple-500/10' : isDisabled ? 'opacity-40 border-border' : 'border-border'
                      }`}>
                      {fruit.icon_url ? (
                        <img src={fruit.icon_url} alt={fruit.name} className="w-8 h-8 object-contain shrink-0" />
                      ) : (
                        <span className="text-2xl">{fruit.emoji}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block">{fruit.name}</span>
                        <span className="text-[10px] text-muted-foreground">R$ {fruit.price.toFixed(2)}</span>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-purple-500 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={prevStep} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button onClick={isLastStep ? handleFinish : nextStep}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-1">
                  {isLastStep ? <><ShoppingCart className="h-4 w-4" /> Finalizar</> : <>Avançar <ChevronRight className="h-4 w-4" /></>}
                </button>
              </div>
            </>
          )}

          {/* ── FRUTA EXTRA (batida) ── */}
          {step === 'frutas_extra' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3">Sabor extra? (opcional — fruta ou adicional)</p>
              <div className="grid grid-cols-2 gap-2 px-4 py-3 overflow-y-auto" style={{ maxHeight: '55vh' }}>
                {flavorOptions.filter(f => f.id !== selectedMainFruit).map(fruit => {
                  const isSelected = selectedExtraFruit === fruit.id;
                  return (
                    <button key={fruit.id} onClick={() => setSelectedExtraFruit(isSelected ? null : fruit.id)}
                      className={`p-3 rounded-xl border-2 flex items-center gap-3 ${isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'}`}>
                      {fruit.icon_url ? (
                        <img src={fruit.icon_url} alt={fruit.name} className="w-8 h-8 object-contain shrink-0" />
                      ) : (
                        <span className="text-2xl">{fruit.emoji}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block">{fruit.name}</span>
                        <span className="text-[10px] text-muted-foreground">+R$ {fruit.price.toFixed(2)}</span>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-purple-500 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={prevStep} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button onClick={() => { setSelectedExtraFruit(null); nextStep(); }}
                  className="flex-1 py-3 rounded-xl border text-sm font-medium">Pular</button>
                {selectedExtraFruit && (
                  <button onClick={isLastStep ? handleFinish : nextStep}
                    className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-1">
                    {isLastStep ? <><ShoppingCart className="h-4 w-4" /> Finalizar</> : <>Avançar <ChevronRight className="h-4 w-4" /></>}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── ENERGÉTICO ── */}
          {step === 'energetico' && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1.5">
                <button onClick={() => setSelectedEnergetico(null)}
                  className={`w-full p-3 rounded-xl border-2 text-left ${selectedEnergetico === null ? 'border-purple-500 bg-purple-500/10' : 'border-border'}`}>
                  <p className="font-medium text-sm">Sem energético</p>
                </button>

                {!isLicor && (
                  <>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2">⚡ R$ 5,00</p>
                    {BALY_ENERGETICOS.map(baly => {
                      const isSelected = selectedEnergetico?.kind === 'baly' && selectedEnergetico.id === baly.id;
                      return (
                        <button key={baly.id} onClick={() => setSelectedEnergetico({ kind: 'baly', id: baly.id, name: baly.name })}
                          className={`w-full p-3 rounded-xl border-2 text-left flex justify-between items-center ${isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'}`}>
                          <p className="font-medium text-sm">{baly.name}</p>
                          <span className="text-xs font-bold text-primary">+ R$ 5,00</span>
                        </button>
                      );
                    })}
                  </>
                )}

                {!isLicor && energeticoBottles.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2">⚡ Da Casa (Grátis)</p>
                    {energeticoBottles.map(bottle => {
                      const isSelected = selectedEnergetico?.kind === 'bottle' && selectedEnergetico.bottle.id === bottle.id;
                      return (
                        <button key={bottle.id} onClick={() => setSelectedEnergetico({ kind: 'bottle', bottle })}
                          className={`w-full p-3 rounded-xl border-2 text-left flex justify-between items-center ${isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'}`}>
                          <div><p className="font-medium text-sm">{bottle.product_name}</p><p className="text-[10px] text-muted-foreground">{bottle.remaining_doses} doses</p></div>
                          <span className="text-xs font-bold text-green-600">Grátis</span>
                        </button>
                      );
                    })}
                  </>
                )}

                {energeticoCans.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2">🥫 Lata (+valor)</p>
                    {energeticoCans.map((product: Product) => {
                      const isSelected = selectedEnergetico?.kind === 'can' && selectedEnergetico.product.id === product.id;
                      return (
                        <button key={product.id} onClick={() => setSelectedEnergetico({ kind: 'can', product })}
                          className={`w-full p-3 rounded-xl border-2 text-left flex justify-between items-center ${isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'}`}>
                          <p className="font-medium text-sm">{product.name}</p>
                          <span className="text-xs font-bold text-purple-500">+ R$ {Number(product.salePrice).toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={prevStep} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button onClick={isLastStep ? handleFinish : nextStep}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-1">
                  {isLastStep ? <><ShoppingCart className="h-4 w-4" /> Finalizar</> : <>Avançar <ChevronRight className="h-4 w-4" /></>}
                </button>
              </div>
            </>
          )}

          {/* ── ADICIONAIS ── */}
          {step === 'adicionais' && (
            <>
              <p className="text-xs text-muted-foreground px-4 pt-3">
                Até 5 adicionais (R$ {drinkConfig.adicionalPrice.toFixed(2)} cada)
              </p>
              <div className="grid grid-cols-2 gap-2 px-4 py-3 overflow-y-auto" style={{ maxHeight: '55vh' }}>
                {ADICIONAIS.map(item => {
                  const isSelected = selectedAdicionais.includes(item.id);
                  const isDisabled = !isSelected && selectedAdicionais.length >= 5;
                  return (
                    <button key={item.id} onClick={() => !isDisabled && toggleAdicional(item.id)} disabled={isDisabled}
                      className={`p-3 rounded-xl border-2 flex items-center gap-3 ${
                        isSelected ? 'border-purple-500 bg-purple-500/10' : isDisabled ? 'opacity-40 border-border' : 'border-border'
                      }`}>
                      <span className="text-2xl">{item.emoji}</span>
                      <span className="font-medium text-sm">{item.name}</span>
                      {isSelected && <Check className="h-4 w-4 text-purple-500 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={prevStep} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button onClick={isLastStep ? handleFinish : nextStep}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-1">
                  {isLastStep ? <><ShoppingCart className="h-4 w-4" /> Finalizar</> : <>Avançar <ChevronRight className="h-4 w-4" /></>}
                </button>
              </div>
            </>
          )}

          {/* ── GELO ── */}
          {step === 'gelo' && (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1.5">
                <button onClick={() => setSelectedGelo('sem')}
                  className={`w-full p-3 rounded-xl border-2 text-left flex justify-between items-center ${
                    selectedGelo === 'sem' ? 'border-purple-500 bg-purple-500/10' : 'border-border'
                  }`}>
                  <div className="flex items-center gap-3">
                    <span className="w-14 h-14 flex items-center justify-center text-3xl shrink-0" aria-hidden>🚫</span>
                    <p className="font-medium text-sm">Sem Gelo</p>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">—</span>
                </button>
                <button onClick={() => setSelectedGelo('agua')}
                  className={`w-full p-3 rounded-xl border-2 text-left flex justify-between items-center ${
                    selectedGelo === 'agua' ? 'border-purple-500 bg-purple-500/10' : 'border-border'
                  }`}>
                  <div className="flex items-center gap-3">
                    <img src={iceAgua} alt="Gelo de Água" className="w-14 h-14 object-contain shrink-0"
                      style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.30))' }} />
                    <p className="font-medium text-sm">Gelo de Água</p>
                  </div>
                  <span className="text-xs font-bold text-green-600">Grátis</span>
                </button>
                {gelos.map(product => {
                  const photo = getIceFlavorPhotoUrl(product.name, centralFruits);
                  const isSelected = selectedGelo !== 'agua' && (selectedGelo as Product)?.id === product.id;
                  return (
                    <button key={product.id} onClick={() => setSelectedGelo(product)}
                      className={`w-full p-3 rounded-xl border-2 text-left flex justify-between items-center ${
                        isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-border'
                      }`}>
                      <div className="flex items-center gap-3">
                        {photo ? (
                          <img
                            src={photo}
                            alt={product.name}
                            loading="lazy"
                            className="w-14 h-14 object-contain shrink-0"
                            style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.30))' }}
                          />
                        ) : (
                          <span className="text-3xl" style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))' }}>🧊</span>
                        )}
                        <p className="font-medium text-sm">{product.name}</p>
                      </div>
                      <span className="text-xs font-bold text-purple-500">R$ {Number(product.salePrice).toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="text-center py-1">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold text-purple-600">R$ {totalPrice.toFixed(2)}</p>
              </div>

              <div className="px-4 py-3 shrink-0 flex gap-2">
                <button onClick={prevStep} className="px-4 py-3 rounded-xl border text-sm font-medium">
                  <ChevronLeft className="h-4 w-4 inline mr-1" />Voltar
                </button>
                <button onClick={isLastStep ? handleFinish : nextStep}
                  className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-2">
                  {isLastStep ? <><ShoppingCart className="h-4 w-4" /> Finalizar Drink • R$ {totalPrice.toFixed(2)}</> : <>Avançar <ChevronRight className="h-4 w-4" /></>}
                </button>
              </div>
            </>
          )}

          {/* ── REVIEW ── */}
          {step === 'review' && (() => {
            const allFruitIds = isBatida
              ? [selectedMainFruit, selectedExtraFruit].filter(Boolean) as string[]
              : selectedFruits;
            const fruitsLines = allFruitIds.map(id => ({ id, name: getFruitName(id) }));
            const adicionaisLines = selectedAdicionais.map(id => {
              const a = ADICIONAIS.find(x => x.id === id);
              return { label: 'Adicional', value: a?.name ?? '', emoji: a?.emoji, color: 'text-amber-600' };
            });
            const geloLine = selectedGelo === 'sem'
              ? null
              : selectedGelo === 'agua'
                ? { name: 'Gelo de Água', emoji: '🧊' }
                : selectedGelo
                  ? { name: (selectedGelo as Product).name, emoji: '🍓' }
                  : null;
            const energLine = selectedEnergetico ? { name: energeticoName ?? '' } : null;
            const dosesLines = noAlcohol
              ? []
              : selectedBottles.map(sb => ({
                  bottleName: sb.bottle.product_name,
                  doses: sb.doses,
                  imageUrl: sb.bottle.image_url,
                }));
            const titleNoun = isDose ? 'dose'
              : isBatida ? 'batida'
              : isLicor ? 'drink'
              : 'drink';
            const titleEmoji = isDose ? '🥃' : isBatida ? '🥤' : isLicor ? '🍸' : '🍹';
            const title = noAlcohol
              ? `${titleEmoji} 1 ${(isBatida ? 'BATIDA' : 'DRINK')} SEM ÁLCOOL`
              : `${titleEmoji} 1 ${titleNoun.toUpperCase()} MONTAD${titleNoun.endsWith('a') ? 'A' : 'O'}`;

            return (
              <div className="flex-1 min-h-0 flex flex-col">
                <DrinkRecipeReview
                  title={title}
                  noun={titleNoun}
                  doses={dosesLines}
                  energetico={energLine}
                  gelo={geloLine}
                  fruits={fruitsLines}
                  extraLines={adicionaisLines}
                  quantity={quantity}
                  setQuantity={setQuantity}
                  unitPrice={totalPrice}
                  onBack={prevStep}
                  onAddAnotherDifferent={handleAddAnother}
                  onFinish={handleFinish}
                />
              </div>
            );

          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
