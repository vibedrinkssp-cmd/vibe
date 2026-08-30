import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Verify SHA-256 hashed password (legacy format: sha256:salt:hash)
async function verifySha256Password(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 3 || parts[0] !== 'sha256') return false;
    const salt = parts[1];
    const expectedHash = parts[2];
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return computedHash === expectedHash;
  } catch (e) {
    console.error('[auth-login] SHA-256 verification error:', e);
    return false;
  }
}

// Verify new hash format: salt:hash (salt prepended to password)
async function verifyNewHashFormat(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const salt = parts[0];
    const expectedHash = parts[1];
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return computedHash === expectedHash;
  } catch (e) {
    console.error('[auth-login] New hash verification error:', e);
    return false;
  }
}

// Verify password with support for multiple formats
async function verifyPassword(password: string, storedPassword: string): Promise<boolean> {
  if (!storedPassword) return false;
  if (storedPassword.startsWith('sha256:')) return await verifySha256Password(password, storedPassword);
  if (storedPassword.includes(':') && !storedPassword.startsWith('$2')) return await verifyNewHashFormat(password, storedPassword);
  if (storedPassword.startsWith('$2')) {
    console.log('[auth-login] Bcrypt hash detected - user needs password reset');
    return false;
  }
  console.error('[auth-login] BLOCKED: Plain text password detected - user must reset password');
  return false;
}

async function generateAuthSession(supabase: any, userId: string): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  try {
    const email = `${userId}@internal.vm-brasil.app`;

    let authUser: any = null;
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      authUser = data?.user;
    } catch {}

    if (!authUser) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        id: userId,
        email,
        email_confirm: true,
        user_metadata: { source: 'auth-login' },
      });
      if (createErr) {
        console.error('[auth-login] Failed to create auth user:', createErr.message);
        return { accessToken: null, refreshToken: null };
      }
      authUser = created?.user;
    }

    if (!authUser?.email) return { accessToken: null, refreshToken: null };

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[auth-login] Generate link failed:', linkError?.message);
      return { accessToken: null, refreshToken: null };
    }

    const { data: otpResult, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (otpError || !otpResult?.session) {
      console.error('[auth-login] OTP verify failed:', otpError?.message);
      return { accessToken: null, refreshToken: null };
    }

    return {
      accessToken: otpResult.session.access_token,
      refreshToken: otpResult.session.refresh_token,
    };
  } catch (err) {
    console.error('[auth-login] Auth session generation error:', err);
    return { accessToken: null, refreshToken: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[auth-login] Missing env vars');
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração do servidor inválida' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: 'Corpo da requisição inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { whatsapp, password, loginType, username } = body;

    console.log(`[auth-login] Login attempt: type=${loginType}, username=${username || whatsapp || 'N/A'}`);

    if (!password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Senha obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let user: any = null;
    let userRole: string | null = null;
    let address: any = null;

    async function getUserRole(userId: string): Promise<string | null> {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        console.error('[auth-login] Error fetching role:', error);
        return null;
      }
      return data?.role || null;
    }

    // Staff login
    if (loginType === 'staff') {
      if (!username) {
        return new Response(
          JSON.stringify({ success: false, error: 'Usuário obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const validRoles = ['admin', 'kitchen', 'pdv'];
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .ilike('name', username.trim());

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao buscar usuário' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const matchedUser = users?.find((u: any) =>
        u.name?.toLowerCase() === username.toLowerCase() && !u.is_blocked
      );

      if (!matchedUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Usuário não encontrado' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const role = await getUserRole(matchedUser.id);
      if (!role || !validRoles.includes(role)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Usuário sem permissão de staff' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      user = matchedUser;
      userRole = role;

      const isValidPassword = await verifyPassword(password, user.password || '');
      if (!isValidPassword) {
        return new Response(
          JSON.stringify({ success: false, error: 'Senha incorreta' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

    // Customer login
    } else if (loginType === 'customer') {
      if (!whatsapp) {
        return new Response(
          JSON.stringify({ success: false, error: 'WhatsApp obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('whatsapp', whatsapp)
        .maybeSingle();

      if (userError || !userData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Usuário não encontrado' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const role = await getUserRole(userData.id);
      if (role !== 'customer') {
        return new Response(
          JSON.stringify({ success: false, error: 'Use o login de staff' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      user = userData;
      userRole = role;

      const isValidPassword = await verifyPassword(password, user.password || '');
      if (!isValidPassword) {
        return new Response(
          JSON.stringify({ success: false, error: 'Senha incorreta' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: addressData } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle();

      address = addressData;

    // Motoboy login
    } else if (loginType === 'motoboy') {
      if (!whatsapp) {
        return new Response(
          JSON.stringify({ success: false, error: 'WhatsApp obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('whatsapp', whatsapp)
        .maybeSingle();

      if (error || !userData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Motoboy não encontrado' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const role = await getUserRole(userData.id);
      if (role !== 'motoboy') {
        return new Response(
          JSON.stringify({ success: false, error: 'Usuário não é motoboy' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (userData.is_blocked) {
        return new Response(
          JSON.stringify({ success: false, error: 'Motoboy bloqueado' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      user = userData;
      userRole = role;

      const isValidPassword = await verifyPassword(password, user.password || '');
      if (!isValidPassword) {
        return new Response(
          JSON.stringify({ success: false, error: 'Senha incorreta' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Tipo de login inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (user.is_blocked) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário bloqueado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auth-login] Login successful: ${user.id}, role: ${userRole}`);

    const { data: sessionToken, error: sessionError } = await supabase.rpc('issue_session_token', {
      p_user_id: user.id,
      p_role: userRole,
    });

    if (sessionError || !sessionToken) {
      console.error('[auth-login] Failed to create session:', sessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível iniciar a sessão' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate real Supabase Auth session
    const { accessToken, refreshToken } = await generateAuthSession(supabase, user.id);

    const safeUser = {
      id: user.id,
      name: user.name,
      whatsapp: user.whatsapp,
      role: userRole,
      createdAt: user.created_at,
      requiresPasswordChange: user.requires_password_change,
    };

    const safeAddress = address ? {
      id: address.id,
      userId: address.user_id,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zipCode: address.zip_code,
      notes: address.notes,
      isDefault: address.is_default,
      latitude: address.latitude,
      longitude: address.longitude,
    } : null;

    return new Response(
      JSON.stringify({
        success: true,
        user: safeUser,
        address: safeAddress,
        sessionToken,
        accessToken,
        refreshToken,
        requiresPasswordChange: user.requires_password_change,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[auth-login] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
