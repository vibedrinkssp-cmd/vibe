// Weekly promotions engine — recurring discounts by weekday.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import type { CartItem, CustomDrink, Product } from '@/shared/schema';

export type WeeklyPromotion = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  target_type: 'product' | 'category' | 'drink_type';
  target_id: string | null;
  target_key: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_quantity: number;
  active: boolean;
};

export const DRINK_TYPE_KEYS = [
  { key: 'caipirinha', label: 'Caipirinha' },
  { key: 'copao', label: 'Copão' },
  { key: 'caipi_ice', label: 'Caipi Ice' },
  { key: 'premium', label: 'Drink Premium' },
  { key: 'especial', label: 'Drink Especial' },
  { key: 'monte_seu', label: 'Monte seu Drink' },
] as const;

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isWithinWindow(promo: WeeklyPromotion, d: Date): boolean {
  if (!promo.active) return false;
  if (promo.weekday !== d.getDay()) return false;
  const now = nowHHMM(d);
  const start = promo.start_time.slice(0, 5);
  const end = promo.end_time.slice(0, 5);
  return now >= start && now <= end;
}

/** Hook: fetch all promotions and expose only those active right now. */
export function useActivePromotions() {
  const { data = [] } = useQuery({
    queryKey: ['weekly-promotions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_promotions')
        .select('*')
        .eq('active', true);
      if (error) {
        console.warn('[weekly-promotions] fetch error', error.message);
        return [] as WeeklyPromotion[];
      }
      return (data ?? []) as WeeklyPromotion[];
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const now = new Date();
  return data.filter((p) => isWithinWindow(p, now));
}

/** Hook: fetch ALL promotions (for the Manager tab listing). */
export function useAllPromotions() {
  return useQuery({
    queryKey: ['weekly-promotions', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_promotions')
        .select('*')
        .order('weekday', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WeeklyPromotion[];
    },
  });
}

export type CartItemLike = {
  productId?: string;
  product?: {
    id?: string;
    categoryId?: string | null;
    category_id?: string | null;
    price?: number | string | null;
    salePrice?: number | string | null;
    sale_price?: number | string | null;
  } | null;
  quantity: number;
  unitPrice?: number;
  drinkTypeKey?: string | null;
};

export type PromoMatch = {
  promo: WeeklyPromotion;
  discountPerUnit: number;
  totalDiscount: number;
};

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function inferCustomDrinkTypeKey(drink: Pick<CustomDrink, 'name' | 'description'>): string {
  const text = normalizeKey(`${drink.name || ''} ${drink.description || ''}`);
  if (text.includes('caipi ice')) return 'caipi_ice';
  if (text.includes('caipirinha')) return 'caipirinha';
  if (text.includes('copao')) return 'copao';
  if (text.includes('premium')) return 'premium';
  if (text.includes('especial') || text.includes('licor')) return 'especial';
  return 'monte_seu';
}

export function mapCartItemsForPromotions(items: CartItem[], customDrinks: CustomDrink[] = []): CartItemLike[] {
  return [
    ...items
      .filter((item) => !item.isComboItem)
      .map((item) => ({
        productId: item.productId,
        product: item.product,
        quantity: item.quantity,
        unitPrice: toNumber(item.product.salePrice),
      })),
    ...customDrinks.map((drink) => ({
      quantity: Math.max(1, drink.quantity || 1),
      unitPrice: toNumber(drink.totalPrice),
      drinkTypeKey: inferCustomDrinkTypeKey(drink),
    })),
  ];
}

export function getBestProductPromotion(product: Product, activePromos: WeeklyPromotion[]): WeeklyPromotion | null {
  const unitPrice = toNumber(product.salePrice);
  let best: { promo: WeeklyPromotion; discount: number } | null = null;

  for (const promo of activePromos) {
    const matches =
      (promo.target_type === 'product' && promo.target_id === product.id) ||
      (promo.target_type === 'category' && promo.target_id === product.categoryId);

    if (!matches) continue;

    const discount = promo.discount_type === 'percent'
      ? unitPrice * (promo.discount_value / 100)
      : Math.min(promo.discount_value, unitPrice);

    if (!best || discount > best.discount) best = { promo, discount };
  }

  return best?.promo ?? null;
}

/** Compute the best-matching promotion discount for a given cart item. */
export function computeItemPromoDiscount(
  item: CartItemLike,
  activePromos: WeeklyPromotion[],
): PromoMatch | null {
  if (!activePromos.length) return null;
  const productId = item.productId ?? item.product?.id ?? null;
  const categoryId = item.product?.categoryId ?? item.product?.category_id ?? null;
  const unitPrice = toNumber(item.unitPrice ?? item.product?.salePrice ?? item.product?.sale_price ?? item.product?.price);
  if (!unitPrice || item.quantity < 1) return null;

  const candidates = activePromos.filter((p) => {
    if (item.quantity < p.min_quantity) return false;
    if (p.target_type === 'product') return productId && p.target_id === productId;
    if (p.target_type === 'category') return categoryId && p.target_id === categoryId;
    if (p.target_type === 'drink_type') return item.drinkTypeKey && p.target_key === item.drinkTypeKey;
    return false;
  });

  if (!candidates.length) return null;

  let best: PromoMatch | null = null;
  for (const promo of candidates) {
    const perUnit =
      promo.discount_type === 'percent'
        ? +(unitPrice * (promo.discount_value / 100)).toFixed(2)
        : Math.min(promo.discount_value, unitPrice);
    const total = +(perUnit * item.quantity).toFixed(2);
    if (!best || total > best.totalDiscount) {
      best = { promo, discountPerUnit: perUnit, totalDiscount: total };
    }
  }
  return best;
}

/** Compute the total promo discount for a list of cart items. */
export function computeCartPromoDiscount(
  items: CartItemLike[],
  activePromos: WeeklyPromotion[],
): { total: number; matches: Array<{ item: CartItemLike; match: PromoMatch }> } {
  const matches: Array<{ item: CartItemLike; match: PromoMatch }> = [];
  let total = 0;
  for (const item of items) {
    const match = computeItemPromoDiscount(item, activePromos);
    if (match) {
      matches.push({ item, match });
      total += match.totalDiscount;
    }
  }
  return { total: +total.toFixed(2), matches };
}
