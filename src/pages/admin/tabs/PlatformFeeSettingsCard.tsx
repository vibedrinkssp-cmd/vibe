import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getPlatformLabel } from '@/lib/external-platforms';
import { PLATFORM_FEE_SETTINGS_KEY, usePlatformFeeSettings } from '@/lib/platform-fees';

interface FeeRowProps {
  platform: string;
  feePercent: number;
  fixedFee: number;
}

function FeeRow({ platform, feePercent, fixedFee }: FeeRowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState(String(feePercent));
  const [fixed, setFixed] = useState(String(fixedFee));

  useEffect(() => {
    setPercent(String(feePercent));
    setFixed(String(fixedFee));
  }, [feePercent, fixedFee]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_platform_fee_setting' as never, {
        p_platform: platform,
        p_fee_percent: Number(percent) || 0,
        p_fixed_fee: Number(fixed) || 0,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_FEE_SETTINGS_KEY });
      toast({ title: `Taxa padrão da ${getPlatformLabel(platform)} salva` });
    },
    onError: (error: Error) => toast({ title: 'Erro ao salvar taxa', description: error.message, variant: 'destructive' }),
  });

  return (
    <div className="flex items-end gap-2">
      <span className="w-20 pb-2 text-sm font-medium">{getPlatformLabel(platform)}</span>
      <div className="flex-1">
        <span className="text-xs text-muted-foreground">Taxa (%)</span>
        <Input inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value.replace(',', '.'))} />
      </div>
      <div className="flex-1">
        <span className="text-xs text-muted-foreground">Fixa por pedido (R$)</span>
        <Input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value.replace(',', '.'))} />
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? '...' : 'Salvar'}
      </Button>
    </div>
  );
}

export function PlatformFeeSettingsCard() {
  const { data: settings = [], isLoading } = usePlatformFeeSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Taxas padrão das plataformas</CardTitle>
        <p className="text-xs text-muted-foreground">
          Valor sugerido no PDV. A taxa real de cada pedido pode ser ajustada na hora da venda; pedidos importados
          (sem ajuste) usam este padrão no relatório.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {settings.map((s) => (
          <FeeRow key={s.platform} platform={s.platform} feePercent={s.fee_percent} fixedFee={s.fixed_fee} />
        ))}
      </CardContent>
    </Card>
  );
}
