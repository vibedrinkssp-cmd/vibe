import type { Product } from '@/shared/schema';

const COPAO_NAME_RE = /^cop[aã]o\b/i;
const CAIPI_ICE_NAME_RE = /^caipi\s+ice\b/i;

/** Qual complemento a venda pede ao lançar o produto: o gelo (copão) ou a Ice (Caipi Ice). */
export type ExtraKind = 'gelo' | 'ice';

/** Copão pronto vendido como produto (categoria COPAO, ou nome começando com "Copão"). */
export function isCopaoProduct(product: Pick<Product, 'name'>, categoryName?: string | null): boolean {
  const category = (categoryName || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  return category === 'COPAO' || COPAO_NAME_RE.test((product.name || '').trim());
}

/** Caipi Ice pronta vendida como produto (ex.: "Caipi Ice de Uva"). */
export function isCaipiIceProduct(product: Pick<Product, 'name'>): boolean {
  return CAIPI_ICE_NAME_RE.test((product.name || '').trim());
}

/** null = produto comum, sem janela de escolha. */
export function extraKindFor(product: Pick<Product, 'name'>, categoryName?: string | null): ExtraKind | null {
  if (isCopaoProduct(product, categoryName)) return 'gelo';
  if (isCaipiIceProduct(product)) return 'ice';
  return null;
}

/**
 * Cópia do item escolhido para entrar no carrinho como linha de R$ 0: ele já está no
 * preço do produto, a linha existe para o pedido baixar o estoque dele.
 */
export function freeExtraLine(extra: Product): Product {
  return { ...extra, salePrice: '0.00' };
}
