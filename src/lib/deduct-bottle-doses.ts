import { supabase } from '@/integrations/supabase/client-safe';
import type { SelectedBottleEntry } from '@/components/home/TierBottleCarousel';
import type { CustomDrink } from '@/shared/schema';

// deduct_bottle_doses/return_bottle_doses só são chamáveis via service role
// (achado crítico de auditoria: eram públicas, qualquer visitante do site
// podia zerar o controle de qualquer garrafa aberta via devtools, sem nunca
// ter feito um pedido). Todo o front — site do cliente, PDV e Cozinha —
// passa por aqui, que chama a edge function bottle-doses (valida e limita
// os valores antes de repassar pra RPC).
async function invokeBottleDoses(
  action: 'deduct' | 'return' | 'return-by-product',
  idField: { bottle_id: string } | { product_id: string },
  doses: number
): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('bottle-doses', {
    body: { action, doses, ...idField },
  });
  if (error) return error.message || 'Erro ao ajustar doses';
  if (!data?.success) return data?.error || 'Erro ao ajustar doses';
  return null;
}

// Shared by CaipirinhaModal, CaipiIceModal and CopaoModal — deduplicates the
// dose-deduction loop that was copy-pasted identically across all three.
// `quantity` is how many units of this exact drink are being sold at once
// (the stepper on the review screen) — doses must scale with it, since the
// price already does.
export async function deductBottleDoses(
  selectedBottles: SelectedBottleEntry[],
  onError: (bottleName: string) => void,
  quantity: number = 1
): Promise<boolean> {
  for (const sb of selectedBottles) {
    const err = await invokeBottleDoses('deduct', { bottle_id: sb.bottle.bottle_id }, sb.doses * quantity);
    if (err) {
      onError(sb.bottle.product_name);
      return false;
    }
  }
  return true;
}

// Debita um único destilado/energético de garrafa fora do formato
// SelectedBottleEntry (CustomDrinkModal, PrepIngredientModal, RecentDrinksButton).
export async function deductBottleDose(bottleId: string, dosesUsed: number): Promise<string | null> {
  return invokeBottleDoses('deduct', { bottle_id: bottleId }, dosesUsed);
}

// Estorna as doses de um drink que ainda não virou pedido (removido do
// carrinho, rascunho de PDV apagado). Espelha a baixa feita nos 4 wizards de
// drink. Best-effort: erro só vai pro console, nunca bloqueia a remoção em si
// — a alternativa seria travar o cliente/operador removendo um item por causa
// de uma falha de rede no estorno.
export async function returnBottleDoses(drink: CustomDrink): Promise<void> {
  const qty = drink.quantity || 1;
  for (const d of drink.doses ?? []) {
    const err = await invokeBottleDoses('return', { bottle_id: d.bottleId }, d.doseCount * qty);
    if (err) console.error(`[returnBottleDoses] falha ao estornar ${d.bottleName}:`, err);
  }
  if (drink.energetico?.type === 'garrafa') {
    // A receita salva não guarda o bottleId do energético "de garrafa" (grátis),
    // só o product_id. open_bottles só é legível por staff via RLS, então a
    // resolução pra garrafa aberta mais recente desse produto acontece dentro
    // da edge function (service role), não aqui no client.
    const err = await invokeBottleDoses('return-by-product', { product_id: drink.energetico.productId }, qty);
    if (err) console.error(`[returnBottleDoses] falha ao estornar ${drink.energetico.productName}:`, err);
  }
}

export async function returnManyBottleDoses(drinks: CustomDrink[]): Promise<void> {
  for (const drink of drinks) await returnBottleDoses(drink);
}
