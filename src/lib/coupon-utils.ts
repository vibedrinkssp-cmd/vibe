import type { CartItem, Product } from '@/shared/schema';

// Coupon types matching database
export type CouponType = 'percent' | 'fixed_amount' | 'full_discount' | 'caipirinha_dobro' | 'product_specific';

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  coupon_type: CouponType;
  max_discount_value: number | null;
  product_id: string | null;
  category_id: string | null;
  min_quantity: number;
  is_template: boolean;
  is_active: boolean;
}

export interface UserCoupon {
  id: string;
  coupon_id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  coupon_type: CouponType;
  max_discount_value: number | null;
  product_id: string | null;
  category_id: string | null;
  min_quantity: number;
  assigned_at: string;
  is_used: boolean;
  used_at: string | null;
}

export interface CouponEligibility {
  eligible: boolean;
  reason?: string;
  discount: number;
  appliedTo?: string;
}

// Category ID for caipirinhas (will be fetched dynamically)
const CAIPIRINHA_CATEGORY_NAMES = ['CAIPIRINHAS', 'CAIPIRINHA', 'Caipirinhas', 'Caipirinha'];

/**
 * Calculate the discount amount for a coupon based on its type
 */
export function calculateCouponDiscount(
  coupon: UserCoupon,
  cartItems: CartItem[],
  cartTotal: number,
  categories?: { id: string; name: string }[]
): CouponEligibility {
  switch (coupon.coupon_type) {
    case 'percent':
      // Simple percentage discount on total
      const percentDiscount = cartTotal * (coupon.discount_percent / 100);
      return {
        eligible: true,
        discount: percentDiscount,
        appliedTo: 'Desconto no total',
      };

    case 'fixed_amount': {
      // Desconto fixo em R$ — armazenado em max_discount_value
      const fixed = Number(coupon.max_discount_value || 0);
      if (fixed <= 0) {
        return { eligible: false, reason: 'Cupom sem valor configurado', discount: 0 };
      }
      return {
        eligible: true,
        discount: Math.min(fixed, cartTotal),
        appliedTo: `Desconto de R$ ${fixed.toFixed(2)}`,
      };
    }

    case 'full_discount':
      // 100% discount up to max value
      const maxValue = coupon.max_discount_value || 0;
      if (maxValue <= 0) {
        return {
          eligible: false,
          reason: 'Valor máximo não configurado para este cupom',
          discount: 0,
        };
      }
      return {
        eligible: true,
        discount: Math.min(cartTotal, maxValue),
        appliedTo: `Desconto de até R$ ${maxValue.toFixed(2)}`,
      };

    case 'caipirinha_dobro':
      // Find caipirinha items in cart
      const caipirinhaItems = findCaipirinhaItems(cartItems, categories);
      
      if (caipirinhaItems.length < (coupon.min_quantity || 2)) {
        return {
          eligible: false,
          reason: `Adicione ${coupon.min_quantity || 2} ou mais caipirinhas ao carrinho`,
          discount: 0,
        };
      }
      
      // Sort by price to find the cheapest one
      const sortedCaipirinhas = [...caipirinhaItems].sort(
        (a, b) => Number(a.product.salePrice) - Number(b.product.salePrice)
      );
      
      // The cheapest one is free
      const cheapestPrice = Number(sortedCaipirinhas[0].product.salePrice);
      return {
        eligible: true,
        discount: cheapestPrice,
        appliedTo: `Segunda caipirinha grátis (${sortedCaipirinhas[0].product.name})`,
      };

    case 'product_specific':
      // Discount only on specific product
      if (!coupon.product_id) {
        return {
          eligible: false,
          reason: 'Produto não configurado para este cupom',
          discount: 0,
        };
      }
      
      const targetItem = cartItems.find(item => item.productId === coupon.product_id);
      if (!targetItem) {
        return {
          eligible: false,
          reason: 'Produto do cupom não está no carrinho',
          discount: 0,
        };
      }
      
      const productDiscount = Number(targetItem.product.salePrice) * (coupon.discount_percent / 100);
      return {
        eligible: true,
        discount: productDiscount,
        appliedTo: `${coupon.discount_percent}% OFF em ${targetItem.product.name}`,
      };

    default:
      // Fallback for unknown types - treat as percent
      return {
        eligible: true,
        discount: cartTotal * (coupon.discount_percent / 100),
        appliedTo: 'Desconto no total',
      };
  }
}

/**
 * Find caipirinha items in cart based on category
 */
function findCaipirinhaItems(
  cartItems: CartItem[],
  categories?: { id: string; name: string }[]
): CartItem[] {
  if (!categories) return [];
  
  const caipirinhaCategory = categories.find(cat => 
    CAIPIRINHA_CATEGORY_NAMES.some(name => 
      cat.name.toUpperCase().includes(name.toUpperCase())
    )
  );
  
  if (!caipirinhaCategory) return [];
  
  return cartItems.filter(item => item.product.categoryId === caipirinhaCategory.id);
}

/**
 * Get coupon type display info
 */
export function getCouponTypeInfo(couponType: CouponType): { label: string; icon: string; color: string } {
  switch (couponType) {
    case 'percent':
      return { label: 'Desconto %', icon: '🏷️', color: 'amber' };
    case 'fixed_amount':
      return { label: 'Desconto R$', icon: '💵', color: 'green' };
    case 'full_discount':
      return { label: 'Desconto Total', icon: '🎁', color: 'green' };
    case 'caipirinha_dobro':
      return { label: 'Caipirinha 2x1', icon: '🍹', color: 'orange' };
    case 'product_specific':
      return { label: 'Produto Específico', icon: '🎯', color: 'blue' };
    default:
      return { label: 'Desconto', icon: '🎟️', color: 'amber' };
  }
}

/**
 * Get eligibility message for a coupon
 */
export function getCouponEligibilityMessage(
  coupon: UserCoupon,
  cartItems: CartItem[],
  categories?: { id: string; name: string }[]
): string {
  if (coupon.coupon_type === 'caipirinha_dobro') {
    const caipirinhaItems = findCaipirinhaItems(cartItems, categories);
    const needed = (coupon.min_quantity || 2) - caipirinhaItems.length;
    if (needed > 0) {
      return `Adicione mais ${needed} caipirinha${needed > 1 ? 's' : ''}`;
    }
    return 'Aplicável!';
  }
  
  if (coupon.coupon_type === 'product_specific' && coupon.product_id) {
    const hasProduct = cartItems.some(item => item.productId === coupon.product_id);
    if (!hasProduct) {
      return 'Adicione o produto ao carrinho';
    }
    return 'Aplicável!';
  }
  
  return 'Aplicável!';
}

/**
 * Check if a coupon can be applied to current cart
 */
export function canApplyCoupon(
  coupon: UserCoupon,
  cartItems: CartItem[],
  cartTotal: number,
  categories?: { id: string; name: string }[]
): boolean {
  const eligibility = calculateCouponDiscount(coupon, cartItems, cartTotal, categories);
  return eligibility.eligible;
}
