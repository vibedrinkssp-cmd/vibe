import { useState } from 'react';
import { confirmDialog } from '@/lib/dialogs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wine, ChevronDown, ChevronUp, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client-safe';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { OpenBottleDialog } from '@/components/bottles/OpenBottleDialog';

interface OpenBottle {
  id: string;
  product_id: string;
  product_name: string;
  total_ml: number;
  ml_per_dose: number;
  total_doses: number;
  remaining_doses: number;
  is_empty: boolean;
  opened_at: string;
  notes: string | null;
  dose_price: number;
}

export function BottlesCarousel() {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allBottles = [], isLoading } = useQuery({
    queryKey: ['open-bottles-kitchen'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_bottles');
      if (error) throw error;
      return (data || []) as OpenBottle[];
    },
    refetchInterval: 30000,
  });

  const activeBottles = allBottles.filter((b) => !b.is_empty);
  const emptyBottles = allBottles.filter((b) => b.is_empty);

  const renewMutation = useMutation({
    mutationFn: async (bottle: OpenBottle) => {
      const res = await supabase.functions.invoke('verify-bottle-renew', {
        body: { bottle_id: bottle.id },
      });
      // FunctionsHttpError exposes a .context.json() yielding { success, error }
      let body: { success?: boolean; error?: string } | null = res.data ?? null;
      if (res.error) {
        try {
          const ctx = (res.error as { context?: { json?: () => Promise<unknown> } }).context;
          body = ((await ctx?.json?.()) as typeof body) ?? body;
        } catch {
          /* ignore parse errors */
        }
        if (!body) throw new Error(res.error.message || 'Erro ao renovar');
      }
      if (!body?.success) throw new Error(body?.error || 'Falha na renovação');
      // Auditoria
      await supabase.from('cash_register_audit').insert({
        action: 'bottle_renewed',
        responsible: 'Kitchen',
        notes: `Garrafa renovada: ${bottle.product_name} (era: ${bottle.remaining_doses}/${bottle.total_doses} doses)`,
      });
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      toast({ title: '🍾 Garrafa renovada com sucesso!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (bottle: OpenBottle) => {
      const { error } = await supabase.rpc('delete_open_bottle', { p_bottle_id: bottle.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      toast({ title: '🗑️ Garrafa excluída!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    },
  });

  const getLevelColor = (percentage: number) => {
    if (percentage > 60) return 'bg-green-500';
    if (percentage > 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (isLoading) {
    return (
      <div className="mb-6 p-4 bg-card/50 border border-primary/20 rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Wine className="h-5 w-5 text-primary" />
          <span className="font-medium">Garrafas Abertas</span>
        </div>
        <div className="animate-pulse flex gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 w-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (activeBottles.length === 0 && emptyBottles.length === 0) {
    return (
      <div className="mb-6 p-4 bg-card/50 border border-primary/20 rounded-lg flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wine className="h-5 w-5" />
          <span>Nenhuma garrafa aberta</span>
        </div>
        <OpenBottleDialog openedBy="Cozinha" />
      </div>
    );
  }

  const renderBottleCard = (bottle: OpenBottle, index: number) => {
    const percentage = bottle.is_empty
      ? 0
      : Math.max(0, Math.min(100, (bottle.remaining_doses / bottle.total_doses) * 100));
    const levelColor = bottle.is_empty ? 'bg-red-500' : getLevelColor(percentage);

    return (
      <Card key={bottle.id} className={`border-primary/20 h-full ${bottle.is_empty ? 'bg-red-50 dark:bg-red-950/20 border-red-300' : 'bg-background/80'}`}>
        <CardContent className="p-3 flex flex-col items-center">
          <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between w-full">
            <span>#{index + 1}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 text-destructive hover:bg-destructive/10"
              disabled={deleteMutation.isPending}
              onClick={async (e) => {
                e.stopPropagation();
                const msg = bottle.is_empty
                  ? `Excluir garrafa vazia "${bottle.product_name}"?`
                  : `⚠️ Garrafa "${bottle.product_name}" ainda tem ${bottle.remaining_doses} doses! Excluir mesmo assim?`;
                if (await confirmDialog(msg)) deleteMutation.mutate(bottle);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          <div className="relative w-8 h-16 mb-2">
            <div className="absolute inset-0 border-2 border-primary/40 rounded-b-lg rounded-t-sm bg-background/50">
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-2 border-2 border-primary/40 rounded-t-sm bg-background/50" />
              <div className={`absolute bottom-0 left-0 right-0 ${levelColor} rounded-b-md`} style={{ height: `${percentage}%` }} />
            </div>
          </div>

          <div className="text-center w-full overflow-hidden">
            <p className="text-xs font-semibold truncate" title={bottle.product_name}>
              {bottle.product_name}
            </p>
            {bottle.is_empty ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-1 h-6 text-[10px] px-2 border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
                disabled={renewMutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  renewMutation.mutate(bottle);
                }}
              >
                {renewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Renovar
              </Button>
            ) : (
              <p className="text-xs text-primary font-medium mt-1">
                {bottle.remaining_doses}/{bottle.total_doses} doses
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-6">
      <div className="p-4 bg-card/50 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex-1 flex items-center justify-between p-0 h-auto hover:bg-transparent"
            >
              <div className="flex items-center gap-2">
                <Wine className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Garrafas Abertas</span>
                <Badge variant="secondary" className="text-xs">
                  {activeBottles.length}
                </Badge>
                {emptyBottles.length > 0 && (
                  <Badge variant="outline" className="text-xs text-red-500 border-red-300">
                    {emptyBottles.length} vazia{emptyBottles.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <OpenBottleDialog openedBy="Cozinha" compact />
        </div>

        <CollapsibleContent className="mt-3 space-y-3">
          {emptyBottles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-red-500">Garrafas a renovar</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
                {emptyBottles.map((bottle, index) => renderBottleCard(bottle, index))}
              </div>
            </div>
          )}

          {activeBottles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Em uso</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2 max-h-[46vh] overflow-y-auto pr-1">
                {activeBottles.map((bottle, index) => renderBottleCard(bottle, index))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
