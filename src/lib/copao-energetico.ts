/** Baly / Big Boss: vendidos em garrafa aberta (dose de 400ml), nunca como lata paga. */
export const isFreeEnergeticoBrand = (name: string): boolean => {
  const normalized = name.toLowerCase();
  return normalized.includes('baly') || normalized.includes('big boss');
};

/** Fusion removido temporariamente do Copão. */
export const isExcludedEnergetico = (name: string): boolean => name.toLowerCase().includes('fusion');

/** Filtro PostgREST (.or) dos produtos que são energético: pelo tipo ou, se não houver tipo, pelo nome. */
export const ENERGETICO_OR_FILTER = 'product_type.eq.energetico,name.ilike.%energ%tico%';

/** Há cadastros com product_type vazio: o nome ("ENERGETICO VIBE TROPICAL 2L") também identifica. */
export const isEnergeticoProduct = (product: { product_type?: string | null; name?: string | null }): boolean =>
  product.product_type === 'energetico' || /energ.?tico/i.test(product.name ?? '');
