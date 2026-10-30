/** Projeção do que as doses que restam numa garrafa aberta rendem quando forem vendidas. */
export interface BottleProfitInput {
  remaining_doses: number;
  total_doses: number;
  dose_price: number;
}

export interface BottleProfit {
  revenue: number;
  cost: number;
  profit: number;
  /** Margem sobre a receita (%); null sem receita. */
  marginPercent: number | null;
  /** Falso quando o produto está sem custo cadastrado: o lucro mostrado seria igual à receita. */
  hasCost: boolean;
  /** Falso quando a garrafa está sem preço de dose (ex.: energético grátis no Copão). */
  hasDosePrice: boolean;
}

/** `bottleCost` é o custo da garrafa fechada inteira (cadastro do produto); o das doses restantes é proporcional. */
export function projectBottleProfit(bottle: BottleProfitInput, bottleCost: number): BottleProfit {
  const dosePrice = Number(bottle.dose_price) || 0;
  const remaining = Math.max(0, bottle.remaining_doses);
  const revenue = remaining * dosePrice;
  const share = bottle.total_doses > 0 ? remaining / bottle.total_doses : 0;
  const cost = bottleCost * share;
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    marginPercent: revenue > 0 ? (profit / revenue) * 100 : null,
    hasCost: bottleCost > 0,
    hasDosePrice: dosePrice > 0,
  };
}

export interface BottleProfitTotals {
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number | null;
  withoutCost: number;
  withoutDosePrice: number;
}

/** Soma só garrafas com preço de dose e com custo, para o lucro total não ficar inflado nem negativo por falta de cadastro. */
export function sumBottleProfit(projections: BottleProfit[]): BottleProfitTotals {
  const counted = projections.filter((p) => p.hasDosePrice && p.hasCost);
  const revenue = counted.reduce((s, p) => s + p.revenue, 0);
  const cost = counted.reduce((s, p) => s + p.cost, 0);
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    marginPercent: revenue > 0 ? (profit / revenue) * 100 : null,
    withoutCost: projections.filter((p) => p.hasDosePrice && !p.hasCost).length,
    withoutDosePrice: projections.filter((p) => !p.hasDosePrice).length,
  };
}
