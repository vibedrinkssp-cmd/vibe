import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_OPS = new Set(['excluir_pedido', 'editar_pedido', 'ver_caixa', 'registrar_fiado']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const operation = String(body?.operation ?? '').trim();
    const pin = String(body?.pin ?? '').trim();
    const targetId = body?.targetId && typeof body.targetId === 'string' ? body.targetId : null;

    if (!ALLOWED_OPS.has(operation)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Operação inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({ success: false, error: 'PIN inválido' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração interna incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const userAgent = req.headers.get('user-agent') ?? null;

    const { data: isValid, error } = await supabase.rpc('verify_operation_pin_v2', {
      p_operation: operation,
      p_pin: pin,
      p_target_id: targetId,
      p_user_agent: userAgent,
    });

    if (error) {
      console.error('[verify-operation-pin] RPC error:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao validar PIN' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: !!isValid, error: isValid ? null : 'PIN incorreto' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[verify-operation-pin] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
