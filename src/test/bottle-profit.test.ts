import { describe, expect, it } from 'vitest';
import { projectBottleProfit, sumBottleProfit } from '@/lib/bottle-profit';

describe('projectBottleProfit', () => {
  it('rende doses restantes x preço e o custo é proporcional ao que sobrou', () => {
    // garrafa de R$ 100 com 10 de 20 doses: custo das doses restantes = 50; receita = 10 x 8 = 80
    const p = projectBottleProfit({ remaining_doses: 10, total_doses: 20, dose_price: 8 }, 100);
    expect(p.revenue).toBe(80);
    expect(p.cost).toBe(50);
    expect(p.profit).toBe(30);
    expect(p.marginPercent).toBeCloseTo(37.5);
    expect(p.hasCost).toBe(true);
    expect(p.hasDosePrice).toBe(true);
  });

  it('marca produto sem custo e garrafa sem preço de dose', () => {
    expect(projectBottleProfit({ remaining_doses: 5, total_doses: 20, dose_price: 8 }, 0).hasCost).toBe(false);
    expect(projectBottleProfit({ remaining_doses: 5, total_doses: 20, dose_price: 0 }, 100).hasDosePrice).toBe(false);
  });
});

describe('sumBottleProfit', () => {
  it('soma só garrafas com preço e custo e conta as que ficaram de fora', () => {
    const full = projectBottleProfit({ remaining_doses: 20, total_doses: 20, dose_price: 10 }, 100);
    const noCost = projectBottleProfit({ remaining_doses: 20, total_doses: 20, dose_price: 10 }, 0);
    const free = projectBottleProfit({ remaining_doses: 5, total_doses: 5, dose_price: 0 }, 20);
    const totals = sumBottleProfit([full, noCost, free]);
    expect(totals.revenue).toBe(200);
    expect(totals.profit).toBe(100);
    expect(totals.withoutCost).toBe(1);
    expect(totals.withoutDosePrice).toBe(1);
  });
});
