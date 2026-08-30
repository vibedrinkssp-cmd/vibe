import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mapeia o role enviado pelo frontend para a chave armazenada em panel_credentials
const panelMap: Record<string, string> = {
  admin: 'admin',
  pdv: 'pdv',
  kitchen: 'kde',
  log: 'log',
};

type LoginBody = {
  role?: string;
  password?: string;
};

async function generateAuthSession(supabase: any, userId: string): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  try {
    const email = `${userId}@internal.vm-brasil.app`;

    // Try to get existing auth user
    let authUser: any = null;
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      authUser = data?.user;
    } catch {}

    // If no auth user exists, create one
    if (!authUser) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        id: userId,
        email,
        email_confirm: true,
        user_metadata: { source: 'staff-login' },
      });
      if (createErr) {
        console.error('[staff-login] Failed to create auth user:', createErr.message);
        return { accessToken: null, refreshToken: null };
      }
      authUser = created?.user;
    }

    if (!authUser?.email) {
      return { accessToken: null, refreshToken: null };
    }

    // Generate magic link + verify OTP to get session
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[staff-login] Generate link failed:', linkError?.message);
      return { accessToken: null, refreshToken: null };
    }

    const { data: otpResult, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (otpError || !otpResult?.session) {
      console.error('[staff-login] OTP verify failed:', otpError?.message);
      return { accessToken: null, refreshToken: null };
    }

    return {
      accessToken: otpResult.session.access_token,
      refreshToken: otpResult.session.refresh_token,
    };
  } catch (err) {
    console.error('[staff-login] Auth session generation error:', err);
    return { accessToken: null, refreshToken: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { role, password } = await req.json() as LoginBody;

    if (!role || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Perfil e senha são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!/^\d{8}$/.test(password)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Senha incorreta' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const panelKey = panelMap[role];
    if (!panelKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Perfil inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[staff-login] Missing server environment for Supabase client');
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração interna incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Valida senha contra panel_credentials (bcrypt)
    const { data: pwValid, error: pwErr } = await supabase.rpc('verify_panel_password_v2', {
      p_panel: panelKey,
      p_password: password,
    });

    if (pwErr) {
      console.error('[staff-login] verify_panel_password_v2 error:', pwErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao validar senha' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!pwValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Senha incorreta' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: roleUsers, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', role);

    if (roleError) {
      console.error('[staff-login] Error loading role users:', roleError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao validar perfil' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!roleUsers?.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum usuário encontrado para este perfil' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userIds = roleUsers.map(({ user_id }) => user_id);

    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, name, whatsapp')
      .in('id', userIds)
      .eq('is_blocked', false)
      .order('created_at', { ascending: true })
      .limit(1);

    if (userError) {
      console.error('[staff-login] Error loading users:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar usuário' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!users?.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário não encontrado ou bloqueado' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const user = users[0];

    const { data: sessionToken, error: sessionError } = await supabase.rpc('issue_session_token', {
      p_user_id: user.id,
      p_role: role,
    });

    if (sessionError || !sessionToken) {
      console.error('[staff-login] Session creation error:', sessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao criar sessão' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Generate real Supabase Auth session
    const { accessToken, refreshToken } = await generateAuthSession(supabase, user.id);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          whatsapp: user.whatsapp,
          role,
        },
        sessionToken,
        accessToken,
        refreshToken,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[staff-login] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
