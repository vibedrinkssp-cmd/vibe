import { useEffect } from 'react';
import { Store } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { useToast } from '@/hooks/use-toast';

const STORE_STATUS_KEYS = [
  ['store-is-open'],
  ['store-info-public'],
  ['store-info'],
  ['settings'],
  ['admin-settings'],
];

async function fetchStoreOpen(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_store_info');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row?.is_open);
}

export function StoreStatusToggle() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: isOpen, isLoading } = useQuery({
    queryKey: ['store-is-open'],
    queryFn: fetchStoreOpen,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  // Realtime sync: settings table changes propagate to all panels
  useEffect(() => {
    const channel = supabase
      .channel('store-status-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          const next = (payload.new as any)?.is_open;
          if (typeof next === 'boolean') {
            queryClient.setQueryData(['store-is-open'], next);
          }
          // Always invalidate downstream caches so every panel refetches
          STORE_STATUS_KEYS.forEach((k) =>
            queryClient.invalidateQueries({ queryKey: k })
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const toggleMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      // Use dedicated RPC to avoid overwriting other settings
      const { data, error } = await supabase.rpc('set_store_open', {
        p_is_open: newValue,
      });
      if (error) throw error;
      return Boolean(data);
    },
    onMutate: async (newValue) => {
      await queryClient.cancelQueries({ queryKey: ['store-is-open'] });
      const prev = queryClient.getQueryData(['store-is-open']);
      queryClient.setQueryData(['store-is-open'], newValue);
      return { prev };
    },
    onError: (_err, _val, ctx) => {
      queryClient.setQueryData(['store-is-open'], ctx?.prev);
      toast({ title: 'Erro ao alterar status da loja', variant: 'destructive' });
    },
    onSuccess: (confirmed, requested) => {
      // Trust the value the DB returned (in case of mismatch)
      const finalValue = typeof confirmed === 'boolean' ? confirmed : requested;
      queryClient.setQueryData(['store-is-open'], finalValue);
      STORE_STATUS_KEYS.forEach((k) =>
        queryClient.invalidateQueries({ queryKey: k })
      );
      toast({ title: finalValue ? '🟢 Loja ABERTA' : '🔴 Loja FECHADA' });
    },
  });

  if (isLoading) return null;

  const open = isOpen ?? true;

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={open}
        onCheckedChange={(v) => toggleMutation.mutate(v)}
        disabled={toggleMutation.isPending}
        className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
        aria-label={open ? 'Fechar loja' : 'Abrir loja'}
      />
      <Badge
        className={open
          ? "bg-green-500/20 text-green-200 border-green-500/30"
          : "bg-red-500/20 text-red-200 border-red-500/30"
        }
      >
        <Store className="h-3 w-3 mr-1" />
        <span className="hidden sm:inline">{open ? 'Aberta' : 'Fechada'}</span>
      </Badge>
    </div>
  );
}
