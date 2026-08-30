// Edge Function: ifood-test-auth
// Internal helper — obtém access_token do iFood (sandbox/teste) com cache em DB.
// Pode ser chamada por outras edge functions OU pelo admin para testar credenciais.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IFOOD_AUTH_URL = 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token';

interface TokenResponse {
  accessToken: string;
  type: string;
  expiresIn: number; // seconds
}

async function getIfoodTestToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  // 1) Tenta cache em DB
  const { data: config } = await supabase
    .from('ifood_test_config')
    .select('id, cached_token, cached_token_expires_at')
    .limit(1)
    .single();

  if (config?.cached_token && config?.cached_token_expires_at) {
    const expiresAt = new Date(config.cached_token_expires_at).getTime();
    if (expiresAt > Date.now() + 60_000) {
      return config.cached_token as string;
    }
  }

  // 2) Renova token
  const clientId = Deno.env.get('IFOOD_TEST_CLIENT_ID');
  const clientSecret = Deno.env.get('IFOOD_TEST_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('IFOOD_TEST_CLIENT_ID/SECRET não configurados');
  }

  const body = new URLSearchParams({
    grantType: 'client_credentials',
    clientId,
    clientSecret,
  });

  const res = await fetch(IFOOD_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`iFood auth falhou [${res.status}]: ${text}`);
  }

  const data = JSON.parse(text) as TokenResponse;
  const expiresAt = new Date(Date.now() + (data.expiresIn - 60) * 1000).toISOString();

  // 3) Atualiza cache
  if (config?.id) {
    await supabase
      .from('ifood_test_config')
      .update({ cached_token: data.accessToken, cached_token_expires_at: expiresAt })
      .eq('id', config.id);
  }

  return data.accessToken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = await getIfoodTestToken(supabase);
    return new Response(JSON.stringify({ ok: true, hasToken: !!token, length: token.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
