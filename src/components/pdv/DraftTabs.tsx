import { Plus, X } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export interface DraftTab {
  id: string;
  label: string;
  itemCount: number;
}

interface DraftTabsProps {
  tabs: DraftTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function DraftTabs({ tabs, activeId, onSelect, onAdd, onRemove }: DraftTabsProps) {
  return (
    <div className="bg-primary/10 border-b border-primary/20 flex-shrink-0">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-0.5 px-2 py-1.5 min-w-max">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <button
                key={tab.id}
                onClick={() => onSelect(tab.id)}
                className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-background text-foreground shadow-sm border border-b-0 border-border'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
                }`}
              >
                <span>{tab.label}</span>
                {tab.itemCount > 0 && (
                  <span className={`inline-flex items-center justify-center rounded-full h-4 min-w-[16px] px-1 text-[10px] font-bold ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/30 text-muted-foreground'
                  }`}>
                    {tab.itemCount}
                  </span>
                )}
                {tabs.length > 1 && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(tab.id);
                    }}
                    className={`inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive transition-colors ${
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={onAdd}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
            title="Novo rascunho"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
