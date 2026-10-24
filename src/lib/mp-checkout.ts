import { supabase } from '@/integrations/supabase/client-safe';

/**
 * Abre o Checkout Pro do Mercado Pago para um pedido 'card_online' pendente.
 * O valor é lido do pedido no servidor; a confirmação chega pelo webhook.
 * Se tudo der certo a página é redirecionada e a promise nunca "volta".
 */
export async function startCardCheckout(orderId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('mp-payments', {
    body: { action: 'create_preference', order_id: orderId },
  });

  if (error || data?.error || !data?.init_point) {
    throw new Error(data?.error || error?.message || 'Não foi possível abrir o pagamento agora.');
  }
  window.location.href = data.init_point as string;
}
