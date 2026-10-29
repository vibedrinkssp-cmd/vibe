/** Baly / Big Boss: vendidos em garrafa aberta (dose de 400ml), nunca como lata paga. */
export const isFreeEnergeticoBrand = (name: string): boolean => {
  const normalized = name.toLowerCase();
  return normalized.includes('baly') || normalized.includes('big boss');
};

/** Fusion removido temporariamente do Copão. */
export const isExcludedEnergetico = (name: string): boolean => name.toLowerCase().includes('fusion');
