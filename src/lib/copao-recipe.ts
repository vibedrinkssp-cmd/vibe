import type { CustomDrink } from '@/shared/schema';

export function hasRealEnergetico(drink: CustomDrink): boolean {
  const energ = drink.energetico;
  if (!energ) return false;
  const productId = String(energ.productId || '').toLowerCase();
  const productName = String(energ.productName || '').toLowerCase();
  return productId !== '__none__' && !/^sem\s+energ[eé]tico$/.test(productName.trim());
}

function shouldDeclareNoMixer(drink: CustomDrink): boolean {
  const name = (drink.name || '').toLowerCase();
  return name.includes('copão') || name.includes('copao') || name.includes('batida') || name.includes('drink personalizado');
}

/**
 * Format a CustomDrink (Copão / drink especial montado) as a multi-line
 * recipe string for the kitchen ticket / KDE card.
 */
export function formatCopaoRecipe(drink: CustomDrink, index?: number, total?: number): string {
  const baseHeader = drink.name?.trim() || '🍷 COPÃO';
  const headerWithEmoji = /^[\p{Emoji}]/u.test(baseHeader) ? baseHeader : `🍷 ${baseHeader}`;
  const header = total && total > 1
    ? `${headerWithEmoji} (${index ?? 1}/${total})`
    : headerWithEmoji;

  const lines: string[] = [header.toUpperCase()];

  if (drink.doses && drink.doses.length > 0) {
    drink.doses.forEach(d => {
      const label = d.doseCount > 1 ? `${d.doseCount} DOSES` : '1 DOSE';
      lines.push(`• ${label} ${d.bottleName.toUpperCase()}`);
    });
  }

  const energetico = hasRealEnergetico(drink) ? drink.energetico : null;
  if (energetico) {
    lines.push(`• ENERGÉTICO: ${energetico.productName.toUpperCase()}`);
  } else if (drink.doses && drink.doses.length > 0 && shouldDeclareNoMixer(drink)) {
    lines.push('• NÃO ADICIONAR MISTURA');
  }

  if (drink.gelo) {
    lines.push(`• GELO: ${drink.gelo.name.toUpperCase().replace(/^GELO\s*/, '')}`);
  }

  if (drink.fruits && drink.fruits.length > 0) {
    lines.push(`• FRUTAS: ${drink.fruits.map(f => f.name.toUpperCase()).join(', ')}`);
  }

  return lines.join('\n');
}

/** Heuristic: a drink is a "real recipe" (Copão/Caipi/Special) when it has doses. */
export function isRecipeDrink(drink: CustomDrink): boolean {
  return Array.isArray(drink.doses) && drink.doses.length > 0;
}

/**
 * Expand a CustomDrink into N separate order_items (one per copão, "(i/N)"),
 * giving the kitchen one card per drink. Non-recipe items (e.g. avulso cig
 * sales) keep their original single-line format and are NOT exploded.
 */
export function explodeCopaoToOrderItems(drink: CustomDrink, fallbackName?: string) {
  const qty = Math.max(1, drink.quantity || 1);

  if (!isRecipeDrink(drink)) {
    return [{
      product_id: null as string | null,
      product_name: fallbackName ?? `🍸 ${drink.name}: ${drink.description}`,
      quantity: qty,
      unit_price: drink.totalPrice,
      total_price: drink.totalPrice * qty,
      is_wizard_item: true,
    }];
  }

  return Array.from({ length: qty }).map((_, i) => ({
    product_id: null as string | null,
    product_name: formatCopaoRecipe(drink, i + 1, qty),
    quantity: 1,
    unit_price: drink.totalPrice,
    total_price: drink.totalPrice,
    is_wizard_item: true,
  }));
}
