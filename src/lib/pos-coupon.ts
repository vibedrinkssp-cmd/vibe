/**
 * Cupons gerais (não atribuídos a clientes) para uso no PDV e Totem.
 * Validação e redenção via RPCs atômicas (validate_pos_coupon / redeem_pos_coupon).
 */
import { supabase } from '@/integrations/supabase/client';

export interface PosCoupon {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  category_ids: string[];
  include_drinks: boolean;
}

export interface PosCouponValidation {
  valid: boolean;
  reason?: string;
  coupon?: PosCoupon;
}

export interface EligibleItem {
  categoryId: string | null | undefined;
  lineTotal: number;
}

/**
 * Valida um cupom pelo código (sem consumir uso).
 */
export async function validatePosCoupon(code: string): Promise<PosCouponValidation> {
  const clean = (code || '').trim();
  if (!clean) return { valid: false, reason: 'Digite um código' };

  const { data, error } = await supabase.rpc('validate_pos_coupon' as any, { p_code: clean });
  if (error) {
    return { valid: false, reason: error.message || 'Erro ao validar cupom' };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { valid: false, reason: 'Cupom não encontrado' };

  if (!row.valid) {
    return { valid: false, reason: row.reason || 'Cupom inválido' };
  }

  return {
    valid: true,
    coupon: {
      id: row.id,
      code: row.code,
      description: row.description ?? null,
      discount_percent: Number(row.discount_percent) || 0,
      category_ids: Array.isArray(row.category_ids) ? row.category_ids : [],
      include_drinks: !!row.include_drinks,
    },
  };
}

/**
 * Calcula o valor de desconto de um cupom sobre o carrinho.
 * - Se category_ids vazio: aplica em todos os produtos regulares.
 * - include_drinks: aplica também sobre o total dos "monte seu drink".
 */
export function calcPosCouponDiscount(
  coupon: PosCoupon,
  regularItems: EligibleItem[],
  drinksTotal: number,
): { discount: number; eligibleBase: number } {
  const allCategories = !coupon.category_ids || coupon.category_ids.length === 0;
  const catSet = new Set(coupon.category_ids || []);

  let eligibleBase = 0;
  for (const it of regularItems) {
    if (allCategories || (it.categoryId && catSet.has(it.categoryId))) {
      eligibleBase += Number(it.lineTotal) || 0;
    }
  }
  if (coupon.include_drinks) {
    eligibleBase += Number(drinksTotal) || 0;
  }

  const discount = Math.max(0, eligibleBase * (coupon.discount_percent / 100));
  return { discount: Number(discount.toFixed(2)), eligibleBase: Number(eligibleBase.toFixed(2)) };
}

/**
 * Consome um uso do cupom de forma atômica. Lança erro se não puder redimir.
 */
export async function redeemPosCoupon(couponId: string): Promise<void> {
  const { error } = await supabase.rpc('redeem_pos_coupon' as any, { p_coupon_id: couponId });
  if (error) throw error;
}
