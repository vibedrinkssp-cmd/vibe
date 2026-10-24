import type { Product } from '@/shared/schema';

const COPAO_NAME_RE = /^cop[aã]o\b/i;

/** Copão pronto vendido como produto (categoria COPAO, ou nome começando com "Copão"). */
export function isCopaoProduct(product: Pick<Product, 'name'>, categoryName?: string | null): boolean {
  const category = (categoryName || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  return category === 'COPAO' || COPAO_NAME_RE.test((product.name || '').trim());
}

/**
 * Cópia do gelo escolhido para entrar no carrinho como linha de R$ 0: o gelo já está no
 * preço do copão, a linha existe para o pedido baixar o estoque dele.
 */
export function freeGeloLine(gelo: Product): Product {
  return { ...gelo, salePrice: '0.00' };
}
