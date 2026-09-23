import { supabase } from '@/integrations/supabase/client-safe';
import type { SelectedBottleEntry } from '@/components/home/TierBottleCarousel';

// Shared by CaipirinhaModal, CaipiIceModal and CopaoModal — deduplicates the
// dose-deduction RPC loop that was copy-pasted identically across all three.
// `quantity` is how many units of this exact drink are being sold at once
// (the stepper on the review screen) — doses must scale with it, since the
// price already does.
export async function deductBottleDoses(
  selectedBottles: SelectedBottleEntry[],
  onError: (bottleName: string) => void,
  quantity: number = 1
): Promise<boolean> {
  for (const sb of selectedBottles) {
    const { error } = await supabase.rpc('deduct_bottle_doses', {
      p_bottle_id: sb.bottle.bottle_id, p_doses_used: sb.doses * quantity,
    });
    if (error) {
      onError(sb.bottle.product_name);
      return false;
    }
  }
  return true;
}
