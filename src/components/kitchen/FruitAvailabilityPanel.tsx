import { useState } from 'react';
import { ChevronDown, ChevronUp, Apple } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useDrinkFruits, useToggleFruit } from '@/hooks/use-drink-fruits';
import { getFruitEmoji } from '@/lib/emoji-icons';

export function FruitAvailabilityPanel() {
  const [expanded, setExpanded] = useState(false);

  const { data: fruits = [], isLoading } = useDrinkFruits({
    activeOnly: false,
    refetchInterval: 30000,
  });

  const toggleMutation = useToggleFruit();

  const activeCount = fruits.filter(f => f.is_active).length;

  return (
    <div className="mb-4 rounded-lg border border-primary/20 bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Apple className="h-5 w-5 text-green-400" />
          <span className="font-semibold text-foreground text-sm">Frutas Disponíveis</span>
          <Badge variant="outline" className="text-xs">
            {activeCount}/{fruits.length}
          </Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-primary/10">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-3">Carregando...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-3">
              {fruits.map(fruit => (
                <div
                  key={fruit.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-md border transition-colors ${
                    fruit.is_active
                      ? 'border-green-500/30 bg-green-500/5'
                      : 'border-red-500/30 bg-red-500/5 opacity-60'
                  }`}
                >
                  <span className="text-xs font-medium text-foreground truncate">
                    {fruit.icon_url ? (
                      <img src={fruit.icon_url} alt="" className="inline h-4 w-4 mr-1" />
                    ) : (
                      <span className="mr-1">{getFruitEmoji(fruit.name)}</span>
                    )}
                    {fruit.name}
                  </span>
                  <Switch
                    checked={fruit.is_active}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: fruit.id, is_active: checked })
                    }
                    disabled={toggleMutation.isPending}
                    className="scale-75"
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">
            🍊 Frutas desativadas ficam indisponíveis para seleção nos drinks
          </p>
        </div>
      )}
    </div>
  );
}
