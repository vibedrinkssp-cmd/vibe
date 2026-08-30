import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface RegisterRequest {
  name: string;
  whatsapp: string;
  cpf: string;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city?: string;
    state?: string;
    zipCode?: string;
    notes?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface ChangePasswordRequest {
  userId: string;
  newPassword: string;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const saltArray = new Uint8Array(8);
  crypto.getRandomValues(saltArray);
  const salt = Array.from(saltArray).map(b => b.toString(16).padStart(2, '0')).join('');
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hashHex}`;
}

async function getUserRole(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[auth-verify] Error fetching role:', error);
    return null;
  }
  return data?.role || null;
}

function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(digits[10]);
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
        user_metadata: { source: 'auth-verify' },
      });
      if (createErr) {
        console.error('[auth-verify] Failed to create auth user:', createErr.message);
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
      console.error('[auth-verify] Generate link failed:', linkError?.message);
      return { accessToken: null, refreshToken: null };
    }

    const { data: otpResult, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (otpError || !otpResult?.session) {
      console.error('[auth-verify] OTP verify failed:', otpError?.message);
      return { accessToken: null, refreshToken: null };
    }

    return {
      accessToken: otpResult.session.access_token,
      refreshToken: otpResult.session.refresh_token,
    };
  } catch (err) {
    console.error('[auth-verify] Auth session generation error:', err);
    return { accessToken: null, refreshToken: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    const body = await req.json();
    if (!action && body.action) action = body.action;

    console.log(`[auth-verify] Action: ${action}`);

    if (action === 'check-phone') {
      const whatsapp = body.whatsapp as string;
      const { data: user, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('whatsapp', whatsapp)
        .maybeSingle();

      if (error || !user) {
        return new Response(
          JSON.stringify({ exists: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userRole = await getUserRole(supabase, user.id);
      return new Response(
        JSON.stringify({ exists: true, userName: user.name, isMotoboy: userRole === 'motoboy' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'register') {
      const { name, whatsapp, cpf, address } = body as RegisterRequest;

      const cpfDigits = cpf.replace(/\D/g, '');
      const whatsappDigits = whatsapp.replace(/\D/g, '');
      if (!validateCPF(cpfDigits)) {
        return new Response(
          JSON.stringify({ success: false, error: 'CPF inválido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: result, error: registerError } = await supabase.rpc('register_customer', {
        p_name: name,
        p_whatsapp: whatsappDigits || whatsapp,
        p_cpf: cpfDigits,
        p_street: address.street,
        p_number: address.number,
        p_complement: address.complement || null,
        p_neighborhood: address.neighborhood,
        p_city: address.city || 'São José dos Campos',
        p_state: address.state || 'SP',
        p_zip_code: address.zipCode || null,
        p_notes: address.notes || null,
        p_latitude: address.latitude ?? null,
        p_longitude: address.longitude ?? null,
      });

      if (registerError || !result?.success) {
        console.error('[auth-verify] Register RPC error:', registerError || result?.error);
        return new Response(
          JSON.stringify({ success: false, error: result?.error || 'Erro ao cadastrar' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userId = result.user?.id;
      const { accessToken, refreshToken } = userId
        ? await generateAuthSession(supabase, userId)
        : { accessToken: null, refreshToken: null };

      console.log(`[auth-verify] Customer registered/reused: ${userId}`);

      return new Response(
        JSON.stringify({ success: true, user: result.user, address: result.address, accessToken, refreshToken }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'change-password') {
      const { userId, newPassword } = body as ChangePasswordRequest;
      const hashedPassword = await hashPassword(newPassword);

      const { data, error } = await supabase
        .from('users')
        .update({ password: hashedPassword, requires_password_change: false })
        .eq('id', userId)
        .select()
        .single();

      if (error || !data) {
        console.error('[auth-verify] Change password error:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao alterar senha' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userRole = await getUserRole(supabase, data.id);

      // Generate new auth session after password change
      const { accessToken, refreshToken } = await generateAuthSession(supabase, data.id);

      const safeUser = {
        id: data.id,
        name: data.name,
        whatsapp: data.whatsapp,
        role: userRole || 'customer',
        createdAt: data.created_at,
      };

      return new Response(
        JSON.stringify({ success: true, user: safeUser, accessToken, refreshToken }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'request-reset') {
      const whatsapp = body.whatsapp as string;
      const { data: user, error: findError } = await supabase
        .from('users')
        .select('id')
        .eq('whatsapp', whatsapp)
        .maybeSingle();

      if (findError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Usuário não encontrado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userRole = await getUserRole(supabase, user.id);
      if (userRole !== 'customer') {
        return new Response(
          JSON.stringify({ success: false, error: 'Use o reset de funcionário' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[auth-verify] Password reminder requested for: ${whatsapp}`);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação inválida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[auth-verify] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
