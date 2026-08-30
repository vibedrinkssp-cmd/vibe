// External platform order identification
// CANONICAL LIST — single source of truth for all platform UIs (PDV modal, Admin tab, badges)
export const EXTERNAL_PLATFORMS = ['ifood', 'rappi', '99food', 'keeta', 'outro'] as const;

export type ExternalPlatform = typeof EXTERNAL_PLATFORMS[number];

export interface PlatformDescriptor {
  id: ExternalPlatform;
  label: string;
  /** Used by Admin summary cards (subtle, theme-friendly) */
  badgeClass: string;
  /** Used by order cards (bold, high contrast) */
  orderBadgeClass: string;
}

export const PLATFORM_DESCRIPTORS: PlatformDescriptor[] = [
  { id: 'ifood',  label: 'iFood',  badgeClass: 'bg-red-500/20 text-red-400 border-red-500/30',       orderBadgeClass: 'bg-red-600 text-white border-red-700' },
  { id: '99food', label: '99Food', badgeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', orderBadgeClass: 'bg-yellow-500 text-black border-yellow-600' },
  { id: 'keeta',  label: 'Keeta',  badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',     orderBadgeClass: 'bg-blue-600 text-white border-blue-700' },
  { id: 'rappi',  label: 'Rappi',  badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/30', orderBadgeClass: 'bg-orange-500 text-white border-orange-600' },
  { id: 'outro',  label: 'Outro',  badgeClass: 'bg-gray-500/20 text-gray-400 border-gray-500/30',     orderBadgeClass: 'bg-muted text-muted-foreground border-border' },
];

/** Pedido vindo da integração OFICIAL iFood (modo teste) */
export function isIfoodTestOrder(order: { externalOrigin?: string | null }): boolean {
  return order.externalOrigin === 'ifood_test';
}

export function isExternalOrder(order: { salesperson?: string | null; externalOrigin?: string | null }): boolean {
  // Pedidos da integração oficial iFood (teste) são sempre externos
  if (isIfoodTestOrder(order)) return true;
  if (!order.salesperson) return false;
  const key = order.salesperson.toLowerCase();
  // 'outro' is a manual catch-all for PDV; do not treat as external on order cards
  return EXTERNAL_PLATFORMS.includes(key as ExternalPlatform) && key !== 'outro';
}

export function getPlatformLabel(salesperson: string): string {
  const found = PLATFORM_DESCRIPTORS.find((p) => p.id === salesperson.toLowerCase());
  return found?.label || salesperson;
}

// Heuristic: detect prepared/wizard drinks by name when item has no product_id
// (typical of external platforms like iFood that send items as plain text).
// Industrialized items (cigarro, cerveja, refri, biscoito, etc.) return false → vão para LOG.
// IMPORTANTE: somente palavras-chave INEQUÍVOCAS de bebidas preparadas/wizards.
// NÃO incluir nomes de destilados ('gin', 'vodka', 'whisky'...) — vão bater em
// garrafas industrializadas (ex.: "GIN GORDONS 750ML") e prender o pedido no KDE.
const PREPARED_NAME_KEYWORDS = [
  'caipirinha', 'caipi ice', 'caipiice', 'caipi-ice',
  'copao', 'copão', 'copa de',
  'drink ', 'drink de', 'drinks ', 'drinks de',
  'batida ', 'batida de',
  'monte seu', 'monte sua',
  'combo natural', 'combo salgado', 'combo hamburguer', 'combo hambúrguer',
  'lanche natural', 'almoço natural', 'almoco natural',
];

export function itemNameLooksPrepared(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return PREPARED_NAME_KEYWORDS.some((kw) => normalized.includes(kw));
}

export function getPlatformColor(salesperson: string): string {
  const found = PLATFORM_DESCRIPTORS.find((p) => p.id === salesperson.toLowerCase());
  return found?.orderBadgeClass || 'bg-muted text-muted-foreground border-border';
}
