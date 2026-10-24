import { Bike } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client-safe';
import { useToast } from '@/hooks/use-toast';
import { DELIVERY_ENABLED_KEY, useDeliveryEnabled } from '@/hooks/use-delivery-enabled';

/** Botão de ativar/desativar entregas (PDV e admin). Desativado = clientes só retiram na loja. */
export function DeliveryToggle() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { deliveryEnabled, isLoading } = useDeliveryEnabled();

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc('set_delivery_enabled' as any, { p_enabled: enabled });
      if (error) throw error;
      return data !== false;
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: DELIVERY_ENABLED_KEY });
      const prev = queryClient.getQueryData<boolean>(DELIVERY_ENABLED_KEY);
      queryClient.setQueryData(DELIVERY_ENABLED_KEY, enabled);
      return { prev };
    },
    onError: (_err, _enabled, ctx) => {
      queryClient.setQueryData(DELIVERY_ENABLED_KEY, ctx?.prev ?? true);
      toast({ title: 'Erro ao alterar as entregas', variant: 'destructive' });
    },
    onSuccess: (confirmed) => {
      queryClient.setQueryData(DELIVERY_ENABLED_KEY, confirmed);
      toast({ title: confirmed ? '🛵 Entregas ATIVADAS' : '🚫 Entregas DESATIVADAS (só retirada)' });
    },
  });

  if (isLoading) return null;

  return (
    <div className="flex items-center gap-2" data-testid="toggle-delivery">
      <Switch
        checked={deliveryEnabled}
        onCheckedChange={(v) => mutation.mutate(v)}
        disabled={mutation.isPending}
        className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
        aria-label={deliveryEnabled ? 'Desativar entregas' : 'Ativar entregas'}
      />
      <Badge
        className={deliveryEnabled
          ? 'bg-green-500/20 text-green-200 border-green-500/30'
          : 'bg-red-500/20 text-red-200 border-red-500/30'}
      >
        <Bike className="h-3 w-3 mr-1" />
        <span className="hidden sm:inline">{deliveryEnabled ? 'Entregas ON' : 'Entregas OFF'}</span>
      </Badge>
    </div>
  );
}
