import iconPdv from '@/assets/icon-pdv.png';
import iconTotem from '@/assets/icon-totem.png';
import iconVm from '@/assets/icon-vm.jpg';
import iconIfood from '@/assets/icon-ifood.jpg';
import icon99food from '@/assets/icon-99food.jpg';
import iconIfoodTest from '@/assets/icon-ifood-test.png';
import { LayoutGrid } from 'lucide-react';

export type OriginFilterId = 'all' | 'vm_delivery' | 'pdv' | 'totem' | 'ifood' | '99food' | 'ifood_test';

interface FilterTab {
  id: OriginFilterId;
  label: string;
  image?: string;
  fallbackIcon?: React.ReactNode;
}

const ALL_TABS: FilterTab[] = [
  { id: 'all', label: 'Todos', fallbackIcon: <LayoutGrid className="w-6 h-6" /> },
  { id: 'vm_delivery', label: 'Delivery', image: iconVm },
  { id: 'pdv', label: 'PDV', image: iconPdv },
  { id: 'totem', label: 'Totem', image: iconTotem },
  { id: 'ifood', label: 'iFood', image: iconIfood },
  { id: '99food', label: '99Food', image: icon99food },
  { id: 'ifood_test', label: 'iFood TESTE', image: iconIfoodTest },
];

interface OrderOriginFiltersProps {
  activeFilter: OriginFilterId;
  onFilterChange: (id: OriginFilterId) => void;
  counts: Partial<Record<OriginFilterId, number>>;
  pendingCounts?: Partial<Record<OriginFilterId, number>>;
  showAll?: boolean;
  hiddenFilters?: OriginFilterId[];
}

export function OrderOriginFilters({ activeFilter, onFilterChange, counts, pendingCounts, showAll = true, hiddenFilters = [] }: OrderOriginFiltersProps) {
  let tabs = showAll ? ALL_TABS : ALL_TABS.filter(t => t.id !== 'all');
  if (hiddenFilters.length > 0) {
    tabs = tabs.filter(t => !hiddenFilters.includes(t.id));
  }

  return (
    <div className="flex gap-3 flex-wrap">
      {tabs.map(tab => {
        const isActive = activeFilter === tab.id;
        const count = counts[tab.id] ?? 0;
        const pending = pendingCounts?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            className={`relative overflow-hidden rounded-xl transition-all ${
              isActive
                ? 'ring-2 ring-primary shadow-lg scale-105'
                : 'ring-1 ring-primary/30 hover:ring-primary/60 hover:scale-105'
            } ${tab.image ? 'w-14 h-14 md:w-16 md:h-16' : 'w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-secondary'}`}
            onClick={() => onFilterChange(tab.id)}
            title={tab.label}
          >
            {tab.image ? (
              <img src={tab.image} alt={tab.label} className="w-full h-full object-cover" />
            ) : (
              <span className={isActive ? 'text-primary' : 'text-foreground'}>{tab.fallbackIcon}</span>
            )}
            <span className={`absolute top-0 right-0 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-bl-lg text-[10px] font-bold ${
              isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary/80 text-foreground backdrop-blur-sm'
            }`}>
              {count}
            </span>
            {pending > 0 && (
              <span className="absolute -top-1.5 -left-1.5 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold ring-2 ring-background animate-pulse">
                {pending}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
