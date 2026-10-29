import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import type { CustomDrink } from '@/shared/schema';

// deduct_bottle_doses/return_bottle_doses só são chamáveis via service role
// (achado crítico de auditoria: eram públicas, qualquer visitante do site
// podia zerar o controle de qualquer garrafa aberta via devtools, sem nunca
// ter feito um pedido). Todo o front — site do cliente, PDV e Cozinha —
// passa por aqui, que chama a edge function bottle-doses (valida e limita
// os valores antes de repassar pra RPC).
// Limite da edge function por chamada (bottle-doses).
const MAX_DOSES_PER_CALL = 20;

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

// Baixa as doses dos destilados de drinks que viraram pedido (site, PDV e caderneta).
// Roda DEPOIS do pedido criado, nunca ao montar o drink: carrinho abandonado não mexe na garrafa.
// `quantity` é o stepper do drink — a dose escala com ele, assim como o preço.
// Best-effort: o pedido já existe, então falha só é devolvida (nomes das garrafas) para avisar.
export async function settleDrinkDoses(drinks: CustomDrink[]): Promise<string[]> {
  const failed: string[] = [];
  for (const drink of drinks) {
    const qty = drink.quantity || 1;
    for (const d of drink.doses ?? []) {
      let remaining = d.doseCount * qty;
      while (remaining > 0) {
        const chunk = Math.min(remaining, MAX_DOSES_PER_CALL);
        const err = await invokeBottleDoses('deduct', { bottle_id: d.bottleId }, chunk);
        if (err) {
          console.error(`[settleDrinkDoses] falha ao baixar ${d.bottleName}:`, err);
          failed.push(d.bottleName);
          break;
        }
        remaining -= chunk;
      }
    }
  }
  for (const key of ['open-bottles', 'open-bottles-kitchen', 'open-bottles-prep', 'assembly-bottles', 'copao-available']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
  return failed;
}

// Debita um único destilado/energético de garrafa fora do formato
// SelectedBottleEntry (CustomDrinkModal, PrepIngredientModal, RecentDrinksButton).
export async function deductBottleDose(bottleId: string, dosesUsed: number): Promise<string | null> {
  return invokeBottleDoses('deduct', { bottle_id: bottleId }, dosesUsed);
}

// Estorna o energético em garrafa de um drink que não virou pedido (removido do
// carrinho, rascunho de PDV apagado). As doses dos destilados NÃO são estornadas
// aqui: só são baixadas quando o pedido é criado (settleDrinkDoses). Best-effort:
// erro só vai pro console, nunca bloqueia a remoção em si.
export async function returnBottleDoses(drink: CustomDrink): Promise<void> {
  const qty = drink.quantity || 1;
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
