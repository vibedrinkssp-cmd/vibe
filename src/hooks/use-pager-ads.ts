import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { queryClient } from '@/lib/queryClient';

export interface PagerAd {
  id: string;
  imageUrl: string;
  title: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

const PAGER_ADS_QUERY_KEY = ['pager-ads'];

export function usePagerAds(activeOnly = false) {
  useRealtimeSync({
    tables: ['pager_ads'],
    onEvent: () => {
      queryClient.invalidateQueries({ queryKey: PAGER_ADS_QUERY_KEY });
    },
  });

  return useQuery<PagerAd[]>({
    queryKey: PAGER_ADS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pager_ads' as any)
        .select('id, image_url, title, is_active, sort_order, created_at')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) {
        console.warn('[usePagerAds] error:', error.message);
        return [];
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        imageUrl: row.image_url,
        title: row.title,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      }));
    },
    select: activeOnly ? (rows) => rows.filter((r) => r.isActive) : undefined,
    refetchInterval: 30000,
    staleTime: 0,
    retry: 0,
  });
}
