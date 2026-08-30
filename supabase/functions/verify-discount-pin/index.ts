import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pin } = await req.json()

    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({ success: false, error: 'PIN inválido' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração interna incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const userAgent = req.headers.get('user-agent') ?? null

    const { data: isValid, error } = await supabase.rpc('verify_operation_pin_v2', {
      p_operation: 'desconto',
      p_pin: pin,
      p_target_id: null,
      p_user_agent: userAgent,
    })

    if (error) {
      console.error('[verify-discount-pin] RPC error:', error)
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao validar PIN' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: !!isValid, error: isValid ? null : 'PIN incorreto' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[verify-discount-pin] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
