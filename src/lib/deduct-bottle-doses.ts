import { supabase } from '@/integrations/supabase/client-safe';
import type { SelectedBottleEntry } from '@/components/home/TierBottleCarousel';

// Shared by CaipirinhaModal, CaipiIceModal and CopaoModal — deduplicates the
// dose-deduction RPC loop that was copy-pasted identically across all three.
export async function deductBottleDoses(
  selectedBottles: SelectedBottleEntry[],
  onError: (bottleName: string) => void
): Promise<boolean> {
  for (const sb of selectedBottles) {
    const { error } = await supabase.rpc('deduct_bottle_doses', {
      p_bottle_id: sb.bottle.bottle_id, p_doses_used: sb.doses,
    });
    if (error) {
      onError(sb.bottle.product_name);
      return false;
    }
  }
  return true;
}
