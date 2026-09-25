import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';

/** Plataformas em que o PDV registra venda com taxa (o canal fica em orders.salesperson). */
export const FEE_PLATFORMS = ['ifood', '99food'] as const;
export type FeePlatform = typeof FEE_PLATFORMS[number];

export interface PlatformFeeSetting {
  platform: string;
  fee_percent: number;
  fixed_fee: number;
}

export const PLATFORM_FEE_SETTINGS_KEY = ['platform-fee-settings'] as const;

export function usePlatformFeeSettings() {
  return useQuery({
    queryKey: PLATFORM_FEE_SETTINGS_KEY,
    queryFn: async (): Promise<PlatformFeeSetting[]> => {
      const { data, error } = await supabase.rpc('get_platform_fee_settings' as never);
      if (error) throw error;
      return ((data as PlatformFeeSetting[] | null) ?? []).map((s) => ({
        platform: s.platform,
        fee_percent: Number(s.fee_percent),
        fixed_fee: Number(s.fixed_fee),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Taxa em R$ sobre o total do pedido, arredondada em centavos. */
export function computePlatformFee(total: number, feePercent: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(feePercent)) return 0;
  return Math.round(total * feePercent) / 100;
}
