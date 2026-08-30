import {
  Wine,
  Beer,
  Grape,
  Snowflake,
  Zap,
  GlassWater,
  Utensils,
  Droplets,
  Martini,
  Coffee,
  Candy,
  Apple,
  Citrus,
  Cherry,
  Cookie,
  Croissant,
  Sandwich,
  Pizza,
  IceCream,
  Milk,
  Sparkles,
  Flame,
  Star,
  Crown,
  Diamond,
  Gift,
  Heart,
  Leaf,
  Sun,
  Moon,
  CloudRain,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryIconOption {
  id: string;
  name: string;
  icon: LucideIcon;
  keywords: string[];
}

export const CATEGORY_ICONS: CategoryIconOption[] = [
  { id: 'wine', name: 'Vinho', icon: Wine, keywords: ['vinho', 'wine', 'tinto', 'branco', 'rose', 'espumante'] },
  { id: 'beer', name: 'Cerveja', icon: Beer, keywords: ['cerveja', 'beer', 'chopp', 'lager', 'pilsen', 'ipa'] },
  { id: 'martini', name: 'Destilado', icon: Martini, keywords: ['destilado', 'whisky', 'vodka', 'gin', 'rum', 'tequila', 'cachaça', 'drink', 'coquetel'] },
  { id: 'grape', name: 'Uva', icon: Grape, keywords: ['uva', 'suco', 'grape'] },
  { id: 'snowflake', name: 'Gelo', icon: Snowflake, keywords: ['gelo', 'ice', 'gelado', 'frio'] },
  { id: 'zap', name: 'Energético', icon: Zap, keywords: ['energetico', 'energy', 'monster', 'red bull', 'redbull'] },
  { id: 'glass-water', name: 'Água', icon: GlassWater, keywords: ['agua', 'water', 'mineral'] },
  { id: 'droplets', name: 'Refrigerante', icon: Droplets, keywords: ['refrigerante', 'soda', 'cola', 'guarana', 'sprite', 'fanta'] },
  { id: 'coffee', name: 'Café', icon: Coffee, keywords: ['cafe', 'coffee', 'cappuccino', 'espresso'] },
  { id: 'utensils', name: 'Petiscos', icon: Utensils, keywords: ['petisco', 'snack', 'comida', 'food', 'acompanhamento'] },
  { id: 'candy', name: 'Doces', icon: Candy, keywords: ['doce', 'candy', 'chocolate', 'bala'] },
  { id: 'apple', name: 'Frutas', icon: Apple, keywords: ['fruta', 'fruit', 'natural'] },
  { id: 'citrus', name: 'Cítricos', icon: Citrus, keywords: ['citrico', 'limao', 'laranja', 'citrus'] },
  { id: 'cherry', name: 'Cereja', icon: Cherry, keywords: ['cereja', 'cherry', 'frutas vermelhas'] },
  { id: 'cookie', name: 'Biscoitos', icon: Cookie, keywords: ['biscoito', 'cookie', 'bolacha'] },
  { id: 'croissant', name: 'Padaria', icon: Croissant, keywords: ['padaria', 'pao', 'bakery'] },
  { id: 'sandwich', name: 'Lanches', icon: Sandwich, keywords: ['lanche', 'sandwich', 'sanduiche', 'hamburguer'] },
  { id: 'pizza', name: 'Pizza', icon: Pizza, keywords: ['pizza', 'italiana'] },
  { id: 'ice-cream', name: 'Sorvete', icon: IceCream, keywords: ['sorvete', 'ice cream', 'gelato', 'picole'] },
  { id: 'milk', name: 'Lácteos', icon: Milk, keywords: ['leite', 'milk', 'lacteo', 'iogurte'] },
  { id: 'sparkles', name: 'Especial', icon: Sparkles, keywords: ['especial', 'premium', 'vip', 'destaque'] },
  { id: 'flame', name: 'Em Alta', icon: Flame, keywords: ['quente', 'hot', 'popular', 'trending'] },
  { id: 'star', name: 'Favoritos', icon: Star, keywords: ['favorito', 'star', 'estrela', 'destaque'] },
  { id: 'crown', name: 'Premium', icon: Crown, keywords: ['premium', 'luxury', 'luxo', 'exclusivo'] },
  { id: 'diamond', name: 'Exclusivo', icon: Diamond, keywords: ['exclusivo', 'raro', 'diamante', 'especial'] },
  { id: 'gift', name: 'Kits', icon: Gift, keywords: ['kit', 'presente', 'gift', 'combo', 'promocao'] },
  { id: 'heart', name: 'Romântico', icon: Heart, keywords: ['romantico', 'love', 'namorados', 'especial'] },
  { id: 'leaf', name: 'Natural', icon: Leaf, keywords: ['natural', 'organico', 'verde', 'saudavel'] },
  { id: 'sun', name: 'Verão', icon: Sun, keywords: ['verao', 'summer', 'refrescante'] },
  { id: 'moon', name: 'Noite', icon: Moon, keywords: ['noite', 'night', 'balada'] },
];

export function getCategoryIcon(iconId: string | null | undefined): LucideIcon {
  if (!iconId) return GlassWater;
  const found = CATEGORY_ICONS.find(item => item.id === iconId);
  return found?.icon || GlassWater;
}

export function suggestIconForCategory(categoryName: string): string {
  const nameLower = categoryName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  for (const iconOption of CATEGORY_ICONS) {
    for (const keyword of iconOption.keywords) {
      const keywordNormalized = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (nameLower.includes(keywordNormalized) || keywordNormalized.includes(nameLower)) {
        return iconOption.id;
      }
    }
  }
  
  return 'glass-water';
}

export function CategoryIconDisplay({ 
  iconId, 
  className = "h-6 w-6",
  ...props 
}: { 
  iconId: string | null | undefined; 
  className?: string;
} & React.SVGProps<SVGSVGElement>) {
  const IconComponent = getCategoryIcon(iconId);
  return <IconComponent className={className} {...props} />;
}
