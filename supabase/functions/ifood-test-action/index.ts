// Edge Function: ifood-test-action
// Sincroniza ações operacionais (em preparo / pronto / despachado / cancelar) com a API oficial do iFood.
// Chamada pelos painéis (Kitchen / LOG / Admin) quando o status de um pedido com external_origin='ifood_test' muda.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const IFOOD_AUTH_URL = 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token';

async function getIfoodTestToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: config } = await supabase
    .from('ifood_test_config')
    .select('id, cached_token, cached_token_expires_at')
    .limit(1)
    .single();

  if (config?.cached_token && config?.cached_token_expires_at) {
    const expiresAt = new Date(config.cached_token_expires_at as string).getTime();
    if (expiresAt > Date.now() + 60_000) return config.cached_token as string;
  }

  const clientId = Deno.env.get('IFOOD_TEST_CLIENT_ID');
  const clientSecret = Deno.env.get('IFOOD_TEST_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('IFOOD_TEST_CLIENT_ID/SECRET não configurados');

  const body = new URLSearchParams({ grantType: 'client_credentials', clientId, clientSecret });
  const res = await fetch(IFOOD_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`iFood auth falhou [${res.status}]: ${text}`);
  const data = JSON.parse(text);
  const expiresAt = new Date(Date.now() + (data.expiresIn - 60) * 1000).toISOString();
  if (config?.id) {
    await supabase.from('ifood_test_config').update({
      cached_token: data.accessToken, cached_token_expires_at: expiresAt,
    }).eq('id', config.id);
  }
  return data.accessToken;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ORDER_URL = 'https://merchant-api.ifood.com.br/order/v1.0';
type Action = 'startPrep' | 'ready' | 'dispatch' | 'cancel';

const ACTION_PATH: Record<Action, string> = {
  startPrep: 'startPreparation',
  ready: 'readyToPickup',
  dispatch: 'dispatch',
  cancel: 'requestCancellation',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const orderIdLocal: string | undefined = body.orderId;
    const action: Action | undefined = body.action;
    const cancellationCode: string | undefined = body.cancellationCode;

    if (!orderIdLocal || !action || !ACTION_PATH[action]) {
      return new Response(JSON.stringify({ ok: false, error: 'orderId+action requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: order } = await supabase
      .from('orders')
      .select('id, external_origin, external_order_id')
      .eq('id', orderIdLocal)
      .maybeSingle();

    if (!order || order.external_origin !== 'ifood_test' || !order.external_order_id) {
      return new Response(JSON.stringify({ ok: false, error: 'Pedido não é IFOODTESTE' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getIfoodTestToken(supabase);
    const path = `${ORDER_URL}/orders/${order.external_order_id}/${ACTION_PATH[action]}`;

    const init: RequestInit = {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    };
    if (action === 'cancel' && cancellationCode) {
      init.body = JSON.stringify({ reason: 'Cancelamento operacional', cancellationCode });
    }

    const res = await fetch(path, init);
    const text = await res.text();
    const ok = res.ok || res.status === 202;

    return new Response(
      JSON.stringify({ ok, status: res.status, response: text || null }),
      {
        status: ok ? 200 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
