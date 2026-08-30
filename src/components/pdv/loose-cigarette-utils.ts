export interface LooseCigaretteSelection {
  packId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export const LOOSE_CIG_MARKER_PREFIX = '[LOOSE_CIG:';

export function buildLooseCigaretteItemName(packId: string, productName: string): string {
  return `${LOOSE_CIG_MARKER_PREFIX}${packId}] CIGARRO SOLTO – ${productName.replace(/\s*(MACO|MAÇO)\b/i, '').trim()}`;
}

export function parseLooseCigarettePackId(itemName: string): string | null {
  if (!itemName.startsWith(LOOSE_CIG_MARKER_PREFIX)) return null;
  const end = itemName.indexOf(']');
  if (end < 0) return null;
  return itemName.slice(LOOSE_CIG_MARKER_PREFIX.length, end);
}

export function stripLooseCigaretteMarker(itemName: string): string {
  if (!itemName.startsWith(LOOSE_CIG_MARKER_PREFIX)) return itemName;
  const end = itemName.indexOf(']');
  if (end < 0) return itemName;
  return itemName.slice(end + 1).trim();
}

export function buildCustomDrinkProductName(name: string, description?: string | null): string {
  if (name.startsWith(LOOSE_CIG_MARKER_PREFIX)) {
    return stripLooseCigaretteMarker(name);
  }
  const desc = (description || '').trim();
  return desc ? `${name} - ${desc}` : name;
}