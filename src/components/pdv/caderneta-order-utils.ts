import type { CustomDrink, CustomDrinkDose, Product } from '@/shared/schema';
import { stripLooseCigaretteMarker } from './loose-cigarette-utils';
import { parseNumeric } from '@/lib/format-utils';
import { hasRealEnergetico } from '@/lib/copao-recipe';

interface CartItem {
  product: Product;
  quantity: number;
}

export interface PreparedCadernetaItem {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string | null;
}

export interface PreparedCadernetaOrder {
  items: PreparedCadernetaItem[];
  summary: {
    subtotal: number;
    total: number;
    discount: number;
    totalItems: number;
    lineCount: number;
  };
}

interface BaseItem {
  productId: string | null;
  productName: string;
  quantity: number;
  originalTotal: number;
  notes?: string | null;
}

const MAX_PRODUCT_NAME_LENGTH = 220;
const MAX_NOTES_LENGTH = 500;

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function clampText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildOrderSummaryText(summary: PreparedCadernetaOrder['summary']): string {
  const lines = [`Pedido: ${summary.totalItems} item(s) em ${summary.lineCount} lançamento(s)`];

  if (summary.discount > 0) {
    lines.push(`Subtotal original: ${formatCurrency(summary.subtotal)}`);
    lines.push(`Desconto aplicado: ${formatCurrency(summary.discount)}`);
  }

  lines.push(`Total lançado: ${formatCurrency(summary.total)}`);
  return lines.join('\n');
}

function mergeNotes(...parts: Array<string | null | undefined>): string | null {
  const value = parts
    .filter(Boolean)
    .map(part => String(part).trim())
    .filter(Boolean)
    .join('\n');

  if (!value) return null;
  return clampText(value, MAX_NOTES_LENGTH);
}

function buildDrinkComposition(drink: CustomDrink): string {
  const parts: string[] = [];

  // Doses (destilados)
  if (drink.doses?.length > 0) {
    const grouped = drink.doses.reduce<Record<string, { name: string; count: number; price: number }>>((acc, d) => {
      const key = d.bottleName || d.bottleId;
      if (!acc[key]) acc[key] = { name: d.bottleName, count: 0, price: d.pricePerDose };
      acc[key].count += d.doseCount;
      return acc;
    }, {});
    for (const [, info] of Object.entries(grouped)) {
      parts.push(`${info.count}x dose ${info.name} (${formatCurrency(info.price)}/dose)`);
    }
  }

  // Energético
  if (hasRealEnergetico(drink) && drink.energetico) {
    parts.push(`Energético: ${drink.energetico.productName} (${formatCurrency(drink.energetico.price)})`);
  }

  // Frutas
  if (drink.fruits?.length > 0) {
    const fruitNames = drink.fruits.map(f => `${f.name} (${formatCurrency(f.price)})`).join(', ');
    parts.push(`Frutas: ${fruitNames}`);
  }

  // Gelo
  if (drink.gelo) {
    parts.push(`Gelo: ${drink.gelo.name} (${formatCurrency(drink.gelo.price)})`);
  }

  if (parts.length === 0 && drink.description) {
    return `Composição: ${drink.description}`;
  }

  return parts.length > 0 ? `Composição:\n${parts.join('\n')}` : '';
}

function buildBaseItems(cart: CartItem[], customDrinks: CustomDrink[]): BaseItem[] {
  return [
    ...cart.map(item => ({
      productId: item.product.id,
      productName: clampText(item.product.name, MAX_PRODUCT_NAME_LENGTH),
      quantity: item.quantity,
      originalTotal: roundCurrency(parseNumeric(item.product.salePrice) * item.quantity),
      notes: null,
    })),
    ...customDrinks.map(drink => ({
      productId: null,
      productName: clampText(stripLooseCigaretteMarker(drink.name), MAX_PRODUCT_NAME_LENGTH),
      quantity: drink.quantity || 1,
      originalTotal: roundCurrency(parseNumeric(drink.totalPrice) * (drink.quantity || 1)),
      notes: mergeNotes(buildDrinkComposition(drink)),
    })),
  ];
}

export function prepareCadernetaOrder(params: {
  cart: CartItem[];
  customDrinks: CustomDrink[];
  total: number;
}): PreparedCadernetaOrder {
  const baseItems = buildBaseItems(params.cart, params.customDrinks);
  const subtotal = roundCurrency(baseItems.reduce((sum, item) => sum + item.originalTotal, 0));
  const cappedTotal = subtotal > 0 ? Math.max(0, Math.min(roundCurrency(params.total), subtotal)) : roundCurrency(params.total);
  const discount = roundCurrency(Math.max(0, subtotal - cappedTotal));

  const summary: PreparedCadernetaOrder['summary'] = {
    subtotal,
    total: cappedTotal,
    discount,
    totalItems: baseItems.reduce((sum, item) => sum + item.quantity, 0),
    lineCount: baseItems.length,
  };

  if (baseItems.length === 0) {
    return { items: [], summary };
  }

  const orderSummaryText = buildOrderSummaryText(summary);
  let remainingTotal = cappedTotal;

  const items = baseItems.map((item, index) => {
    const isLastItem = index === baseItems.length - 1;
    const proportionalTotal = subtotal > 0 ? roundCurrency((item.originalTotal / subtotal) * cappedTotal) : 0;
    const totalPrice = isLastItem ? roundCurrency(Math.max(0, remainingTotal)) : proportionalTotal;

    remainingTotal = roundCurrency(remainingTotal - totalPrice);

    return {
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.quantity > 0 ? Number((totalPrice / item.quantity).toFixed(4)) : totalPrice,
      totalPrice,
      notes: mergeNotes(index === 0 ? orderSummaryText : null, item.notes),
    } satisfies PreparedCadernetaItem;
  });

  return {
    items,
    summary,
  };
}