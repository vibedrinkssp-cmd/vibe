import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { Product, CartItem, ComboData, CustomDrink } from '@/shared/schema';
import { CERVEJAS_CATEGORY_ID, calculateBeerDiscount } from '@/lib/beer-discount';
import { computeCartPromoDiscount, mapCartItemsForPromotions, useActivePromotions, type PromoMatch } from '@/lib/weekly-promotions';
import { returnBottleDoses } from '@/lib/deduct-bottle-doses';
import {
  safeLocalStorageGetJson,
  safeLocalStorageSetItem,
} from '@/lib/safe-browser-storage';

interface CartContextType {
  items: CartItem[];
  combos: ComboData[];
  customDrinks: CustomDrink[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  addCombo: (combo: ComboData) => void;
  removeCombo: (comboId: string) => void;
  addCustomDrink: (drink: CustomDrink) => void;
  removeCustomDrink: (drinkId: string) => void;
  clearCart: () => void;
  subtotal: number;
  comboDiscount: number;
  beerDiscount: number;
  beerDiscountPercent: number;
  promotionDiscount: number;
  promotionMatches: Array<{ item: ReturnType<typeof mapCartItemsForPromotions>[number]; match: PromoMatch }>;
  customDrinksTotal: number;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function isValidProduct(product: unknown): product is Product {
  return !!product && typeof product === 'object' && typeof (product as Product).id === 'string' && typeof (product as Product).name === 'string';
}

function sanitizeCartItems(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];

  return items.filter((item): item is CartItem => {
    if (!item || typeof item !== 'object') return false;
    const cartItem = item as Partial<CartItem>;
    return typeof cartItem.productId === 'string'
      && typeof cartItem.quantity === 'number'
      && Number.isFinite(cartItem.quantity)
      && cartItem.quantity > 0
      && isValidProduct(cartItem.product);
  });
}

function sanitizeCombos(combos: unknown): ComboData[] {
  if (!Array.isArray(combos)) return [];

  return combos.filter((combo): combo is ComboData => {
    if (!combo || typeof combo !== 'object') return false;
    const value = combo as Partial<ComboData>;
    return typeof value.id === 'string'
      && isValidProduct(value.destilado)
      && isValidProduct(value.energetico)
      && Array.isArray(value.gelos);
  });
}

function sanitizeCustomDrinks(drinks: unknown): CustomDrink[] {
  if (!Array.isArray(drinks)) return [];

  return drinks.filter((drink): drink is CustomDrink => {
    if (!drink || typeof drink !== 'object') return false;
    const value = drink as Partial<CustomDrink>;
    return typeof value.id === 'string'
      && typeof value.name === 'string'
      && typeof value.totalPrice === 'number'
      && Number.isFinite(value.totalPrice);
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const activePromotions = useActivePromotions();
  const [items, setItems] = useState<CartItem[]>(() => {
    return sanitizeCartItems(safeLocalStorageGetJson<unknown>('vibe-drinks-cart', []));
  });

  const [combos, setCombos] = useState<ComboData[]>(() => {
    return sanitizeCombos(safeLocalStorageGetJson<unknown>('vibe-drinks-combos', []));
  });

  const [customDrinks, setCustomDrinks] = useState<CustomDrink[]>(() => {
    return sanitizeCustomDrinks(safeLocalStorageGetJson<unknown>('vibe-drinks-custom', []));
  });

  useEffect(() => {
    safeLocalStorageSetItem('vibe-drinks-cart', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    safeLocalStorageSetItem('vibe-drinks-combos', JSON.stringify(combos));
  }, [combos]);

  useEffect(() => {
    safeLocalStorageSetItem('vibe-drinks-custom', JSON.stringify(customDrinks));
  }, [customDrinks]);

  const addItem = (product: Product, quantity = 1) => {
    setItems(prev => {
      const existing = prev.find(item => item.productId === product.id && !item.isComboItem);
      if (existing) {
        return prev.map(item =>
          item.productId === product.id && !item.isComboItem
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { productId: product.id, product, quantity }];
    });
  };

  const removeItem = (productId: string) => {
    setItems(prev => prev.filter(item => item.productId !== productId || item.isComboItem));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems(prev =>
      prev.map(item =>
        item.productId === productId && !item.isComboItem ? { ...item, quantity } : item
      )
    );
  };

  const addCombo = (combo: ComboData) => {
    setCombos(prev => [...prev, combo]);
    const geloItems = combo.gelos.map(g => ({
      productId: g.product.id,
      product: g.product,
      quantity: g.quantity,
      isComboItem: true,
      comboId: combo.id,
    }));
    setItems(prev => [
      ...prev,
      { productId: combo.destilado.id, product: combo.destilado, quantity: 1, isComboItem: true, comboId: combo.id },
      { productId: combo.energetico.id, product: combo.energetico, quantity: combo.energeticoQuantity, isComboItem: true, comboId: combo.id },
      ...geloItems,
    ]);
  };

  const removeCombo = (comboId: string) => {
    setCombos(prev => prev.filter(c => c.id !== comboId));
    setItems(prev => prev.filter(item => item.comboId !== comboId));
  };

  const addCustomDrink = (drink: CustomDrink) => {
    setCustomDrinks(prev => [...prev, drink]);
  };

  // Doses são debitadas da garrafa aberta ao MONTAR o drink (dentro do wizard),
  // não ao finalizar o pedido — então remover do carrinho antes de comprar
  // precisa estornar, senão o controle de garrafa fica descontado sem venda.
  // Best-effort: não bloqueia a remoção do carrinho se o estorno falhar.
  const removeCustomDrink = (drinkId: string) => {
    setCustomDrinks(prev => {
      const removed = prev.find(d => d.id === drinkId);
      if (removed) void returnBottleDoses(removed);
      return prev.filter(d => d.id !== drinkId);
    });
  };

  const clearCart = () => {
    setItems([]);
    setCombos([]);
    setCustomDrinks([]);
  };

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.product.salePrice) * item.quantity,
    0
  );

  const comboDiscount = combos.reduce(
    (sum, combo) => sum + (combo.originalTotal - combo.discountedTotal),
    0
  );

  const customDrinksTotal = customDrinks.reduce(
    (sum, drink) => sum + drink.totalPrice * (drink.quantity || 1),
    0
  );

  // Calculate beer discount using unified logic
  const beerDiscountResult = useMemo(() => {
    const beerCartItems = items
      .filter(i => !i.isComboItem)
      .map(i => ({
        productId: i.productId,
        productName: i.product.name,
        categoryId: i.product.categoryId,
        quantity: i.quantity,
        salePrice: Number(i.product.salePrice),
      }));
    return calculateBeerDiscount(beerCartItems);
  }, [items]);

  const beerDiscountPercent = beerDiscountResult.lines.length > 0 ? beerDiscountResult.lines[0].percent : 0;
  const actualBeerDiscount = beerDiscountResult.totalDiscount;

  const promotionResult = useMemo(() => {
    return computeCartPromoDiscount(mapCartItemsForPromotions(items, customDrinks), activePromotions);
  }, [items, customDrinks, activePromotions]);

  const promotionDiscount = promotionResult.total;

  const total = Math.max(0, subtotal - comboDiscount - actualBeerDiscount - promotionDiscount + customDrinksTotal);

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0) + customDrinks.reduce((sum, d) => sum + (d.quantity || 1), 0);

  return (
    <CartContext.Provider
      value={{
        items,
        combos,
        customDrinks,
        addItem,
        removeItem,
        updateQuantity,
        addCombo,
        removeCombo,
        addCustomDrink,
        removeCustomDrink,
        clearCart,
        subtotal,
        comboDiscount,
        beerDiscount: actualBeerDiscount,
        beerDiscountPercent,
        promotionDiscount,
        promotionMatches: promotionResult.matches,
        customDrinksTotal,
        total,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

// Variante que NÃO lança erro quando usada fora de um CartProvider
// (ex.: modais de drink reutilizados no PDV, que usam onAddCustomDrink).
export function useCartOptional() {
  return useContext(CartContext);
}
