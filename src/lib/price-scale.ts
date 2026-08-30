/**
 * Returns a "$" scale (like GTA wanted stars) for a dose price
 * relative to the min/max prices available.
 * Cheapest → $, Most expensive → $$$$
 */
export function getDosePriceScale(price: number, allPrices: number[]): string {
  if (allPrices.length === 0) return '$';
  
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  
  // If all same price, show $$
  if (max === min) return '$$';
  
  const ratio = (price - min) / (max - min);
  
  if (ratio <= 0.25) return '$';
  if (ratio <= 0.5) return '$$';
  if (ratio <= 0.75) return '$$$';
  return '$$$$';
}

/**
 * Returns a color class for the price scale indicator
 */
export function getPriceScaleColor(scale: string): string {
  switch (scale.length) {
    case 1: return 'text-green-500';
    case 2: return 'text-yellow-500';
    case 3: return 'text-orange-500';
    case 4: return 'text-red-500';
    default: return 'text-muted-foreground';
  }
}
