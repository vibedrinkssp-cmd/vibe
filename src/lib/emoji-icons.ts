/**
 * Mapeamento centralizado de emojis para frutas e categorias.
 * Substitui ícones Lucide monocromáticos por emojis coloridos/ilustrados.
 */

// ── Frutas ──────────────────────────────────────────────
const FRUIT_EMOJI_MAP: [string[], string][] = [
  [['limão', 'limao', 'lemon'], '🍋'],
  [['morango', 'strawberry'], '🍓'],
  [['maracuj', 'passion'], '🥭'],
  [['abacaxi', 'pineapple'], '🍍'],
  [['uva', 'grape'], '🍇'],
  [['pêssego', 'pessego', 'peach'], '🍑'],
  [['laranja', 'orange'], '🍊'],
  [['kiwi'], '🥝'],
  [['manga', 'mango'], '🥭'],
  [['coco', 'coconut'], '🥥'],
  [['goiaba', 'guava'], '🍈'],
  [['melancia', 'watermelon'], '🍉'],
  [['banana'], '🍌'],
  [['maçã', 'maca', 'apple'], '🍎'],
  [['cereja', 'cherry'], '🍒'],
  [['melão', 'melao', 'melon'], '🍈'],
  [['framboesa', 'raspberry'], '🫐'],
  [['acerola'], '🍒'],
  [['jabuticaba'], '🫐'],
  [['tangerina', 'mexerica'], '🍊'],
  [['amora', 'blackberry'], '🫐'],
  [['pitaya', 'dragon fruit'], '🐉'],
  [['graviola'], '🍈'],
  [['cupuaçu', 'cupuacu'], '🥥'],
  [['açaí', 'acai'], '🫐'],
  [['cajá', 'caja'], '🍊'],
  [['carambola'], '⭐'],
  [['tamarindo'], '🌰'],
];

export function getFruitEmoji(name: string): string {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [keywords, emoji] of FRUIT_EMOJI_MAP) {
    for (const kw of keywords) {
      const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (n.includes(kwNorm)) return emoji;
    }
  }
  return '🍒';
}

// ── Categorias ──────────────────────────────────────────
export interface CategoryEmojiOption {
  id: string;
  name: string;
  emoji: string;
  keywords: string[];
}

export const CATEGORY_EMOJIS: CategoryEmojiOption[] = [
  { id: 'wine', name: 'Vinho', emoji: '🍷', keywords: ['vinho', 'wine', 'tinto', 'branco', 'rose', 'espumante'] },
  { id: 'beer', name: 'Cerveja', emoji: '🍺', keywords: ['cerveja', 'beer', 'chopp', 'lager', 'pilsen', 'ipa'] },
  { id: 'martini', name: 'Destilado', emoji: '🍸', keywords: ['destilado', 'whisky', 'vodka', 'gin', 'rum', 'tequila', 'cachaça', 'drink', 'coquetel'] },
  { id: 'grape', name: 'Uva', emoji: '🍇', keywords: ['uva', 'suco', 'grape'] },
  { id: 'snowflake', name: 'Gelo', emoji: '🧊', keywords: ['gelo', 'ice', 'gelado', 'frio'] },
  { id: 'zap', name: 'Energético', emoji: '⚡', keywords: ['energetico', 'energy', 'monster', 'red bull', 'redbull'] },
  { id: 'glass-water', name: 'Água', emoji: '💧', keywords: ['agua', 'water', 'mineral'] },
  { id: 'droplets', name: 'Refrigerante', emoji: '🥤', keywords: ['refrigerante', 'soda', 'cola', 'guarana', 'sprite', 'fanta'] },
  { id: 'coffee', name: 'Café', emoji: '☕', keywords: ['cafe', 'coffee', 'cappuccino', 'espresso'] },
  { id: 'utensils', name: 'Petiscos', emoji: '🍿', keywords: ['petisco', 'snack', 'comida', 'food', 'acompanhamento'] },
  { id: 'candy', name: 'Doces', emoji: '🍬', keywords: ['doce', 'candy', 'chocolate', 'bala'] },
  { id: 'apple', name: 'Frutas', emoji: '🍎', keywords: ['fruta', 'fruit', 'natural'] },
  { id: 'citrus', name: 'Cítricos', emoji: '🍋', keywords: ['citrico', 'limao', 'laranja', 'citrus'] },
  { id: 'cherry', name: 'Cereja', emoji: '🍒', keywords: ['cereja', 'cherry', 'frutas vermelhas'] },
  { id: 'cookie', name: 'Biscoitos', emoji: '🍪', keywords: ['biscoito', 'cookie', 'bolacha'] },
  { id: 'croissant', name: 'Padaria', emoji: '🥐', keywords: ['padaria', 'pao', 'bakery'] },
  { id: 'sandwich', name: 'Lanches', emoji: '🥪', keywords: ['lanche', 'sandwich', 'sanduiche', 'hamburguer'] },
  { id: 'pizza', name: 'Pizza', emoji: '🍕', keywords: ['pizza', 'italiana'] },
  { id: 'ice-cream', name: 'Sorvete', emoji: '🍦', keywords: ['sorvete', 'ice cream', 'gelato', 'picole'] },
  { id: 'milk', name: 'Lácteos', emoji: '🥛', keywords: ['leite', 'milk', 'lacteo', 'iogurte'] },
  { id: 'sparkles', name: 'Especial', emoji: '✨', keywords: ['especial', 'premium', 'vip', 'destaque'] },
  { id: 'flame', name: 'Em Alta', emoji: '🔥', keywords: ['quente', 'hot', 'popular', 'trending'] },
  { id: 'star', name: 'Favoritos', emoji: '⭐', keywords: ['favorito', 'star', 'estrela', 'destaque'] },
  { id: 'crown', name: 'Premium', emoji: '👑', keywords: ['premium', 'luxury', 'luxo', 'exclusivo'] },
  { id: 'diamond', name: 'Exclusivo', emoji: '💎', keywords: ['exclusivo', 'raro', 'diamante', 'especial'] },
  { id: 'gift', name: 'Kits', emoji: '🎁', keywords: ['kit', 'presente', 'gift', 'combo', 'promocao'] },
  { id: 'heart', name: 'Romântico', emoji: '❤️', keywords: ['romantico', 'love', 'namorados', 'especial'] },
  { id: 'leaf', name: 'Natural', emoji: '🍃', keywords: ['natural', 'organico', 'verde', 'saudavel'] },
  { id: 'sun', name: 'Verão', emoji: '☀️', keywords: ['verao', 'summer', 'refrescante'] },
  { id: 'moon', name: 'Noite', emoji: '🌙', keywords: ['noite', 'night', 'balada'] },
];

export function getCategoryEmoji(iconId: string | null | undefined): string {
  if (!iconId) return '💧';
  const found = CATEGORY_EMOJIS.find(item => item.id === iconId);
  return found?.emoji || '💧';
}

export function suggestEmojiForCategory(categoryName: string): string {
  const nameLower = categoryName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const opt of CATEGORY_EMOJIS) {
    for (const keyword of opt.keywords) {
      const kwNorm = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (nameLower.includes(kwNorm) || kwNorm.includes(nameLower)) {
        return opt.id;
      }
    }
  }
  return 'glass-water';
}
