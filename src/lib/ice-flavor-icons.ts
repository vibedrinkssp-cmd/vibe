// Mapeia nome de gelo de sabor → imagem do produto (sachê/caixinha) ou foto de fruta cadastrada.
// Prioridade: 1) foto local do sachê real (com volume/profundidade) 2) icon_url da fruta 3) emoji.
import type { DrinkFruit } from '@/hooks/use-drink-fruits';

// Imagens locais dos sachês/caixinhas reais — bundled assets para zero egress.
import iceMaracujaSache from '@/assets/ice/maracuja.webp';
import iceMelancia from '@/assets/ice/melancia.webp';
import iceMacaVerde from '@/assets/ice/maca-verde.webp';
import iceCocoSache from '@/assets/ice/coco.webp';
import iceMorango from '@/assets/ice/morango.webp';
import iceCocoCaixinha from '@/assets/ice/coco-caixinha.webp';
import iceMaracujaCaixinha from '@/assets/ice/maracuja-caixinha.webp';
import iceAgua from '@/assets/ice/agua.png';

export { iceAgua };

const normalize = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const ICE_FLAVOR_ORDER = [
  'morango',
  'maracuja',
  'melancia',
  'maca-verde',
  'coco',
  'coco-caixinha',
  'maracuja-caixinha',
] as const;

export const MAX_VISIBLE_ICE_FLAVORS = ICE_FLAVOR_ORDER.length;

export function isWaterIceName(iceName: string): boolean {
  const n = normalize(iceName).replace(/\s+/g, ' ').trim();
  const flavor = n.replace(/^gelo\s*(de|do|da)?\s*/i, '').trim();
  return (
    /\bagua\b/.test(n) ||
    /\bcomum\b/.test(n) ||
    /\bnatural\b/.test(n) ||
    /\bsem sabor\b/.test(n) ||
    /\bcubo(s)?\b/.test(n) ||
    /\bsaco\b/.test(n) ||
    /\b5\s?kg\b/.test(n) ||
    flavor === ''
  );
}

function getCanonicalIceFlavorKey(iceName: string): typeof ICE_FLAVOR_ORDER[number] | null {
  const n = normalize(iceName).replace(/^gelo\s*(de|do|da)?\s*/i, '').trim();
  const isCaixinha = n.includes('caixinha') || n.includes('caixa');
  if (n.includes('coco') && isCaixinha) return 'coco-caixinha';
  if (n.includes('maracuja') && isCaixinha) return 'maracuja-caixinha';
  if (n.includes('morango')) return 'morango';
  if (n.includes('maracuja')) return 'maracuja';
  if (n.includes('melancia')) return 'melancia';
  if (n.includes('maca') && n.includes('verde')) return 'maca-verde';
  if (n.includes('coco')) return 'coco';
  return null;
}

export function filterVisibleIceFlavorOptions<T extends { name?: string | null }>(items: T[]): T[] {
  const byFlavor = new Map<typeof ICE_FLAVOR_ORDER[number], T>();
  for (const item of items) {
    const name = item.name || '';
    if (!name || isWaterIceName(name)) continue;
    const key = getCanonicalIceFlavorKey(name);
    if (key && !byFlavor.has(key)) byFlavor.set(key, item);
  }
  return ICE_FLAVOR_ORDER.map((key) => byFlavor.get(key)).filter(Boolean) as T[];
}

// Match local de embalagem: tem prioridade sobre frutas cadastradas.
// Cada entrada: [palavras-chave do nome do gelo, imagem]. Caixinha tem precedência sobre sachê.
const LOCAL_ICE_PACK_IMAGES: { keywords: string[]; image: string; caixinha?: boolean }[] = [
  // CAIXINHAS (200ml) — checar antes do sachê
  { keywords: ['coco', 'caixinha'], image: iceCocoCaixinha, caixinha: true },
  { keywords: ['coco', 'caixa'], image: iceCocoCaixinha, caixinha: true },
  { keywords: ['maracuja', 'caixinha'], image: iceMaracujaCaixinha, caixinha: true },
  { keywords: ['maracuja', 'caixa'], image: iceMaracujaCaixinha, caixinha: true },
  // SACHÊS (105ml)
  { keywords: ['morango'], image: iceMorango },
  { keywords: ['melancia'], image: iceMelancia },
  { keywords: ['maca verde'], image: iceMacaVerde },
  { keywords: ['maca', 'verde'], image: iceMacaVerde },
  { keywords: ['maracuja'], image: iceMaracujaSache },
  { keywords: ['coco'], image: iceCocoSache },
  // ÁGUA — cubos de gelo (substitui emoji 💧)
  { keywords: ['agua'], image: iceAgua },
  { keywords: ['água'], image: iceAgua },
];

/**
 * Retorna imagem local do sachê/caixinha quando o nome bate com uma das embalagens cadastradas.
 * As keywords são todas tokens AND — todas precisam estar presentes no nome normalizado.
 */
export function getLocalIcePackImage(iceName: string): string | null {
  const n = normalize(iceName).replace(/^gelo\s*/i, '').trim();
  if (!n) return null;
  for (const entry of LOCAL_ICE_PACK_IMAGES) {
    if (entry.keywords.every((k) => n.includes(k))) return entry.image;
  }
  return null;
}

// Sinônimos que mapeiam o nome do gelo a um termo canônico de fruta
const ICE_FLAVOR_TO_FRUIT_KEYWORDS: [string[], string[]][] = [
  [['frutas vermelhas', 'vermelha', 'vermelhas'], ['morango', 'amora', 'framboesa', 'cereja']],
  [['frutas amarelas', 'amarela', 'amarelas'], ['abacaxi', 'manga', 'maracuja']],
  [['tropical', 'tropicais'], ['manga', 'abacaxi', 'maracuja']],
  [['limao', 'lemon', 'lima'], ['limao']],
  [['morango', 'strawberry'], ['morango']],
  [['maracuja', 'passion'], ['maracuja']],
  [['abacaxi', 'pineapple'], ['abacaxi']],
  [['uva', 'grape'], ['uva']],
  [['tangerina', 'mexerica', 'mexirica', 'bergamota'], ['tangerina', 'mexerica', 'laranja']],
  [['laranja', 'orange'], ['laranja']],
  [['manga', 'mango'], ['manga']],
  [['coco', 'coconut'], ['coco']],
  [['melancia', 'watermelon'], ['melancia']],
  [['kiwi'], ['kiwi']],
  [['pessego', 'peach'], ['pessego']],
  [['cereja', 'cherry'], ['cereja']],
  [['acai'], ['acai']],
  [['amora', 'blackberry'], ['amora']],
  [['framboesa', 'raspberry'], ['framboesa']],
  [['acerola'], ['acerola']],
  [['goiaba', 'guava'], ['goiaba']],
  [['melao', 'melon'], ['melao']],
  [['banana'], ['banana']],
  [['maca', 'apple'], ['maca']],
  [['hortela', 'menta', 'mint'], ['hortela', 'menta']],
];

/**
 * Tenta resolver a URL da foto da fruta cadastrada que melhor representa o gelo de sabor.
 * Retorna null quando não houver foto disponível (caller decide o fallback).
 */
export function getIceFlavorPhotoUrl(
  iceName: string,
  fruits: DrinkFruit[] | undefined | null,
): string | null {
  if (!iceName) return null;

  // 0) Imagem local da embalagem (sachê/caixinha) — máxima fidelidade visual
  const local = getLocalIcePackImage(iceName);
  if (local) return local;

  if (!fruits || fruits.length === 0) return null;
  const ice = normalize(iceName).replace(/^gelo\s*/i, '').trim();
  if (!ice) return null;

  // 1) Match direto: nome da fruta aparece no nome do gelo
  for (const f of fruits) {
    if (!f.icon_url) continue;
    const fn = normalize(f.name);
    if (ice.includes(fn) || fn.includes(ice)) return f.icon_url;
  }

  // 2) Match via sinônimos
  for (const [keys, fruitKeywords] of ICE_FLAVOR_TO_FRUIT_KEYWORDS) {
    if (!keys.some((k) => ice.includes(k))) continue;
    for (const fk of fruitKeywords) {
      const fruit = fruits.find((f) => f.icon_url && normalize(f.name).includes(fk));
      if (fruit?.icon_url) return fruit.icon_url;
    }
  }
  return null;
}
