/**
 * Unified beer discount system — same rules for PDV, delivery, and totem.
 *
 * Rules:
 * - Original 269ml / Budweiser: fardo = 8 units, 15% discount (per product)
 * - All other cervejas: 12+ units (aggregate) = 20% flat discount
 *
 * Discount applies to ALL units of qualifying products once the fardo threshold is met.
 */

export const FARDO_SIZE = 12;
export const CERVEJAS_CATEGORY_ID = '910004ea-3a2c-4f2e-85a5-e94d00ebd3ab';

/* ─── Small-fardo beers (Original 269ml, Budweiser 269ml) ─── */
const SMALL_FARDO_PATTERNS = [/original\s*269/i, /budweiser\s*269/i];
const SMALL_FARDO_SIZE = 8;
const SMALL_FARDO_DISCOUNT = 15;

/* ─── Regular beers ─── */
const REGULAR_FARDO_SIZE = 12;
const REGULAR_DISCOUNT = 20;

/* ─── Exclusion: Long Necks and non-lata sizes are NOT eligible ─── */
const EXCLUDED_PATTERNS = [/long\s*neck/i, /longneck/i, /473ml/i, /beats/i];
const ELIGIBLE_PATTERNS = [/350\s*ml/i, /269\s*ml/i];

/** Returns true if the beer is eligible for bulk discount (only 350ml and 269ml cans) */
export function isBeerDiscountEligible(productName: string): boolean {
  if (EXCLUDED_PATTERNS.some(p => p.test(productName))) return false;
  return ELIGIBLE_PATTERNS.some(p => p.test(productName));
}

export function isSmallFardoBeer(productName: string): boolean {
  return SMALL_FARDO_PATTERNS.some(p => p.test(productName));
}

/* ─── Unified discount calculation ─── */

export interface BeerDiscountLine {
  productId: string;
  productName: string;
  qty: number;
  percent: number;
  discount: number;
}

export interface BeerDiscountResult {
  totalDiscount: number;
  lines: BeerDiscountLine[];
}

export interface BeerCartItem {
  productId: string;
  productName: string;
  categoryId: string | null;
  quantity: number;
  salePrice: number;
}

/**
 * Calculate beer discounts for any cart (PDV, delivery, totem).
 * - Original 269ml / Budweiser: 8+ units per product → 15%
 * - All other cervejas: 12+ total regular beer units → 20%
 */
export function calculateBeerDiscount(items: BeerCartItem[]): BeerDiscountResult {
  const beerItems = items.filter(i => i.categoryId === CERVEJAS_CATEGORY_ID && isBeerDiscountEligible(i.productName));
  if (beerItems.length === 0) return { totalDiscount: 0, lines: [] };

  const smallFardoItems = beerItems.filter(i => isSmallFardoBeer(i.productName));
  const regularItems = beerItems.filter(i => !isSmallFardoBeer(i.productName));

  const lines: BeerDiscountLine[] = [];
  let totalDiscount = 0;

  // Small fardo (Original 269 / Budweiser): per-product threshold
  for (const item of smallFardoItems) {
    if (item.quantity >= SMALL_FARDO_SIZE) {
      const discount = item.quantity * item.salePrice * (SMALL_FARDO_DISCOUNT / 100);
      lines.push({ productId: item.productId, productName: item.productName, qty: item.quantity, percent: SMALL_FARDO_DISCOUNT, discount });
      totalDiscount += discount;
    }
  }

  // Regular beers: aggregate all regular beer units
  const totalRegularUnits = regularItems.reduce((s, i) => s + i.quantity, 0);
  if (totalRegularUnits >= REGULAR_FARDO_SIZE) {
    for (const item of regularItems) {
      const discount = item.quantity * item.salePrice * (REGULAR_DISCOUNT / 100);
      lines.push({ productId: item.productId, productName: item.productName, qty: item.quantity, percent: REGULAR_DISCOUNT, discount });
      totalDiscount += discount;
    }
  }

  return { totalDiscount, lines };
}

/* ─── Legacy helpers (used by BeerQuantityModal UI) ─── */

export function getBeerDiscountPercent(totalUnits: number): number {
  if (totalUnits < REGULAR_FARDO_SIZE) return 0;
  return REGULAR_DISCOUNT;
}

export function getSmallFardoDiscountPercent(totalUnits: number): number {
  if (totalUnits < SMALL_FARDO_SIZE) return 0;
  return SMALL_FARDO_DISCOUNT;
}

export function getNextFardoThreshold(totalUnits: number, fardoSize = REGULAR_FARDO_SIZE): number {
  const nextFardo = Math.floor(totalUnits / fardoSize) + 1;
  return nextFardo * fardoSize;
}

export function formatBeerDiscountInfo(totalUnits: number, productName?: string): {
  fardos: number;
  fardoSize: number;
  loose: number;
  percent: number;
  unitsToNextFardo: number;
} {
  const isSmall = productName ? isSmallFardoBeer(productName) : false;
  const fardoSize = isSmall ? SMALL_FARDO_SIZE : REGULAR_FARDO_SIZE;
  const discountPercent = isSmall ? SMALL_FARDO_DISCOUNT : REGULAR_DISCOUNT;

  const fardos = Math.floor(totalUnits / fardoSize);
  const loose = totalUnits % fardoSize;
  const percent = totalUnits >= fardoSize ? discountPercent : 0;
  const nextThreshold = getNextFardoThreshold(totalUnits, fardoSize);
  const unitsToNextFardo = nextThreshold - totalUnits;

  return { fardos, fardoSize, loose, percent, unitsToNextFardo };
}

// Keep backward compat alias
export const calculatePdvBeerDiscount = calculateBeerDiscount;
export type PdvBeerDiscountResult = BeerDiscountResult;
