// Delivery fee calculation utilities

export interface DeliveryFeeConfig {
  minFee: number;      // Taxa mínima (base) - default R$ 4,00
  ratePerKm: number;   // Taxa adicional por km - default R$ 1,00
  maxDistance: number; // Distância máxima em km - default 15
}

export interface DeliveryFeeResult {
  fee: number;
  distanceKm: number;
  breakdown: {
    baseFee: number;
    additionalKm: number;
    additionalFee: number;
  };
  isWithinRange: boolean;
}

/**
 * Calcula a taxa de entrega baseada na distância (somente IDA — sem retorno).
 *
 * Regras oficiais (definidas pelo gestor):
 * - Até 1km (inclusive): taxa mínima fixa (R$ 3,00)
 * - Acima de 1km: R$ 1,50 pelo primeiro km + R$ 1,50 por cada km adicional,
 *   arredondando km PARA CIMA (ceil). Equivalente a: ceil(km) × R$ 1,50.
 *   Aplica também o piso mínimo (nunca menor que minFee).
 *
 * Exemplos (minFee=3, ratePerKm=1.50):
 * - 0.5km → R$ 3,00 (mínima)
 * - 1.0km → R$ 3,00 (mínima)
 * - 1.1km → ceil(1.1)=2 × 1,50 = R$ 3,00
 * - 2.0km → 2 × 1,50 = R$ 3,00
 * - 3.0km → 3 × 1,50 = R$ 4,50
 * - 6.3km → ceil(6.3)=7 × 1,50 = R$ 10,50
 * - 10km  → 10 × 1,50 = R$ 15,00
 */
export function calculateDeliveryFee(
  distanceMeters: number,
  config: DeliveryFeeConfig
): DeliveryFeeResult {
  const distanceKm = distanceMeters / 1000;
  const isWithinRange = distanceKm <= config.maxDistance;

  // Até 1km = taxa mínima
  if (distanceKm <= 1) {
    return {
      fee: Math.round(config.minFee * 100) / 100,
      distanceKm: Math.round(distanceKm * 100) / 100,
      breakdown: {
        baseFee: config.minFee,
        additionalKm: 0,
        additionalFee: 0,
      },
      isWithinRange,
    };
  }

  // Acima de 1km: ceil(km) × taxa por km, com piso mínimo (minFee)
  const billedKm = Math.ceil(distanceKm);
  const rawFee = billedKm * config.ratePerKm;
  const totalFee = Math.max(rawFee, config.minFee);

  return {
    fee: Math.round(totalFee * 100) / 100,
    distanceKm: Math.round(distanceKm * 100) / 100,
    breakdown: {
      baseFee: 0,
      additionalKm: billedKm,
      additionalFee: Math.round(totalFee * 100) / 100,
    },
    isWithinRange,
  };
}

/**
 * Formata o detalhamento da taxa de entrega para exibição
 */
export function formatDeliveryFeeBreakdown(result: DeliveryFeeResult, config: DeliveryFeeConfig): string {
  if (result.distanceKm <= 1) {
    return `Taxa mínima (até 1km): R$ ${config.minFee.toFixed(2)}`;
  }

  return `${result.breakdown.additionalKm}km (arredondado) × R$ ${config.ratePerKm.toFixed(2)} = R$ ${result.fee.toFixed(2)}`;
}

/**
 * Valores padrão de configuração
 */
export const DEFAULT_DELIVERY_CONFIG: DeliveryFeeConfig = {
  minFee: 3.00,
  ratePerKm: 1.50,
  maxDistance: 20,
};