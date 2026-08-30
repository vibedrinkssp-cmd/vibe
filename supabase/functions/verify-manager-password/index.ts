import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function generateAuthSession(supabase: any, userId: string): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  try {
    const email = `${userId}@internal.vm-brasil.app`

    let authUser: any = null
    try {
      const { data } = await supabase.auth.admin.getUserById(userId)
      authUser = data?.user
    } catch {}

    if (!authUser) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        id: userId,
        email,
        email_confirm: true,
        user_metadata: { source: 'verify-manager-password' },
      })

      if (createErr) {
        console.error('[verify-manager-password] Failed to create auth user:', createErr.message)
        return { accessToken: null, refreshToken: null }
      }

      authUser = created?.user
    }

    if (!authUser?.email) {
      return { accessToken: null, refreshToken: null }
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.email,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[verify-manager-password] Generate link failed:', linkError?.message)
      return { accessToken: null, refreshToken: null }
    }

    const { data: otpResult, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })

    if (otpError || !otpResult?.session) {
      console.error('[verify-manager-password] OTP verify failed:', otpError?.message)
      return { accessToken: null, refreshToken: null }
    }

    return {
      accessToken: otpResult.session.access_token,
      refreshToken: otpResult.session.refresh_token,
    }
  } catch (err) {
    console.error('[verify-manager-password] Auth session generation error:', err)
    return { accessToken: null, refreshToken: null }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { password, context } = await req.json()
    const normalizedPassword = typeof password === 'string' ? password.trim() : ''

    if (!normalizedPassword) {
      return new Response(
        JSON.stringify({ success: false, error: 'Senha é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!/^\d{8}$/.test(normalizedPassword)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Senha incorreta' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const panelKey = context === 'financeiro' ? 'financeiro' : 'manager';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[verify-manager-password] Missing server environment', {
        hasUrl: !!supabaseUrl,
        hasServiceRoleKey: !!serviceRoleKey,
      })
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração interna incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Valida senha contra panel_credentials (bcrypt)
    const { data: pwValid, error: pwErr } = await supabase.rpc('verify_panel_password_v2', {
      p_panel: panelKey,
      p_password: normalizedPassword,
    })

    if (pwErr) {
      console.error('[verify-manager-password] verify_panel_password_v2 error:', pwErr)
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao validar senha' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pwValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Senha incorreta' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: adminRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)

    if (rolesError || !adminRoles?.length) {
      console.error('[verify-manager-password] Failed to load admin role:', rolesError)
      return new Response(
        JSON.stringify({ success: false, error: 'Administrador não encontrado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminUserId = adminRoles[0].user_id

    const { data: adminUser, error: userError } = await supabase
      .from('users')
      .select('id, name, whatsapp')
      .eq('id', adminUserId)
      .single()

    if (userError || !adminUser) {
      console.error('[verify-manager-password] Failed to load admin user:', userError)
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário administrador não encontrado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: sessionToken, error: sessionError } = await supabase.rpc('issue_session_token', {
      p_user_id: adminUserId,
      p_role: 'admin',
    })

    if (sessionError || !sessionToken) {
      console.error('[verify-manager-password] Failed to issue session token:', sessionError)
      return new Response(
        JSON.stringify({ success: false, error: 'Falha ao iniciar sessão administrativa' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { accessToken, refreshToken } = await generateAuthSession(supabase, adminUserId)

    if (!accessToken || !refreshToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Falha ao iniciar sessão administrativa' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionToken,
        user: { id: adminUser.id, name: adminUser.name, whatsapp: adminUser.whatsapp },
        accessToken,
        refreshToken,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[verify-manager-password] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})