// Customer authentication - with fallback to direct DB when edge functions fail
import { supabase } from '@/integrations/supabase/client-safe';
import type { User, Address } from '@/shared/schema';

interface CheckPhoneResult {
  exists: boolean;
  userName?: string;
  isMotoboy?: boolean;
}

interface LoginResult {
  success: boolean;
  user?: User;
  address?: Address;
  sessionToken?: string;
  accessToken?: string;
  refreshToken?: string;
  requiresPasswordChange?: boolean;
  error?: string;
}

interface RegisterResult {
  success: boolean;
  user?: User;
  address?: Address;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}





// Fallback: Direct database login when edge functions are unavailable
async function directStaffLogin(username: string, password: string): Promise<LoginResult> {
  try {
    // Use SECURITY DEFINER RPC to bypass RLS
    const { data, error } = await supabase.rpc('staff_login_rpc', {
      p_username: username,
      p_password: password,
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Staff login RPC error:', error);
      return { success: false, error: 'Erro ao fazer login' };
    }

    const result = data as any;
    if (!result?.success) {
      return { success: false, error: result?.error || 'Erro ao fazer login' };
    }

    return {
      success: true,
      user: result.user as User,
      sessionToken: result.sessionToken,
      requiresPasswordChange: result.user?.requiresPasswordChange ?? false,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error('Direct staff login error:', error);
    return { success: false, error: 'Erro ao fazer login' };
  }
}

async function directCustomerLogin(whatsapp: string, password: string): Promise<LoginResult> {
  try {
    // Use SECURITY DEFINER RPC to bypass RLS
    const { data, error } = await supabase.rpc('customer_login_rpc', {
      p_whatsapp: whatsapp,
      p_password: password,
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Customer login RPC error:', error);
      return { success: false, error: 'Erro ao fazer login' };
    }

    const result = data as any;
    if (!result?.success) {
      return { success: false, error: result?.error || 'Erro ao fazer login' };
    }

    return {
      success: true,
      user: result.user as User,
      address: result.address as Address | undefined,
      sessionToken: result.sessionToken,
      requiresPasswordChange: result.user?.requiresPasswordChange ?? false,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error('Direct customer login error:', error);
    return { success: false, error: 'Erro ao fazer login' };
  }
}

async function directMotoboyLogin(whatsapp: string, password: string): Promise<LoginResult> {
  try {
    // Use SECURITY DEFINER RPC to bypass RLS
    const { data, error } = await supabase.rpc('motoboy_login_rpc', {
      p_whatsapp: whatsapp,
      p_password: password,
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Motoboy login RPC error:', error);
      return { success: false, error: 'Erro ao fazer login' };
    }

    const result = data as any;
    if (!result?.success) {
      return { success: false, error: result?.error || 'Erro ao fazer login' };
    }

    return {
      success: true,
      user: result.user as User,
      sessionToken: result.sessionToken,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error('Direct motoboy login error:', error);
    return { success: false, error: 'Erro ao fazer login' };
  }
}

export async function checkPhone(whatsapp: string): Promise<CheckPhoneResult> {
  // Try RPC first (faster and more reliable than edge functions)
  const rpcAttempt = async (): Promise<CheckPhoneResult | null> => {
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('check_phone_rpc', {
        p_whatsapp: whatsapp,
      });
      if (rpcError) return null;
      const result = rpcResult as any;
      return {
        exists: result?.exists ?? false,
        userName: result?.userName,
        isMotoboy: result?.isMotoboy ?? false,
      };
    } catch {
      return null;
    }
  };

  // Try RPC first
  const rpcResult = await rpcAttempt();
  if (rpcResult !== null) return rpcResult;

  // Fallback to edge function
  try {
    const { data, error } = await supabase.functions.invoke('auth-verify', {
      body: { whatsapp, action: 'check-phone' },
    });
    if (!error && data) return data;
  } catch {
    // ignore
  }

  // Final retry on RPC
  const retry = await rpcAttempt();
  return retry ?? { exists: false };
}

export async function customerLogin(whatsapp: string, password: string): Promise<LoginResult> {
  // Try edge function first (returns auth tokens for RLS)
  try {
    const { data, error } = await supabase.functions.invoke('auth-login', {
      body: { whatsapp, password, loginType: 'customer' },
    });

    if (!error && data?.success) {
      return {
        success: true,
        user: data.user,
        address: data.address,
        sessionToken: data.sessionToken,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        requiresPasswordChange: data.requiresPasswordChange,
      };
    }

    if (data && !data.success) {
      return { success: false, error: data.error || 'Erro ao fazer login' };
    }
  } catch {
    // Edge function failed, try RPC fallback
  }

  // Fallback to RPC (no auth tokens — RLS may be limited)
  return directCustomerLogin(whatsapp, password);
}

export async function staffLogin(username: string, password: string): Promise<LoginResult> {
  // Try edge function first (returns auth tokens for RLS)
  try {
    const { data, error } = await supabase.functions.invoke('auth-login', {
      body: { username, password, loginType: 'staff' },
    });

    if (!error && data?.success) {
      return { success: true, user: data.user, sessionToken: data.sessionToken, accessToken: data.accessToken, refreshToken: data.refreshToken };
    }
    if (data && !data.success) {
      return { success: false, error: data.error || 'Erro ao fazer login' };
    }
  } catch {
    // Edge function failed, try RPC fallback
  }

  // Fallback to RPC (no auth tokens)
  return directStaffLogin(username, password);
}

export async function motoboyLogin(whatsapp: string, password: string): Promise<LoginResult> {
  // Try edge function first (returns auth tokens for RLS)
  try {
    const { data, error } = await supabase.functions.invoke('auth-login', {
      body: { whatsapp, password, loginType: 'motoboy' },
    });

    if (!error && data?.success) {
      return {
        success: true,
        user: data.user,
        sessionToken: data.sessionToken,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      };
    }

    if (data && !data.success) {
      return { success: false, error: data.error || 'Erro ao fazer login' };
    }
  } catch {
    // Edge function failed, try RPC fallback
  }

  // Fallback to RPC (no auth tokens)
  return directMotoboyLogin(whatsapp, password);
}

// Fallback: Direct database registration using RPC function to bypass RLS
async function directRegisterCustomer(
  userData: { name: string; whatsapp: string; cpf: string },
  addressData: { street: string; number: string; complement?: string; neighborhood: string; city?: string; state?: string; zipCode?: string; notes?: string; latitude?: number | null; longitude?: number | null }
): Promise<RegisterResult> {
  try {
    // Call RPC function - now accepts p_cpf and generates password internally
    const { data: rpcResult, error } = await supabase.rpc('register_customer', {
      p_name: userData.name,
      p_whatsapp: userData.whatsapp,
      p_cpf: userData.cpf,
      p_street: addressData.street,
      p_number: addressData.number,
      p_neighborhood: addressData.neighborhood,
      p_complement: addressData.complement || undefined,
      p_city: addressData.city || 'São José dos Campos',
      p_state: addressData.state || 'SP',
      p_zip_code: addressData.zipCode || undefined,
      p_notes: addressData.notes || undefined,
      p_latitude: addressData.latitude !== null ? addressData.latitude : undefined,
      p_longitude: addressData.longitude !== null ? addressData.longitude : undefined,
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Register RPC error:', error);
      if (error.message.includes('CPF já cadastrado')) {
        return { success: false, error: 'CPF já cadastrado' };
      }
      if (error.message.includes('WhatsApp já cadastrado')) {
        return { success: false, error: 'WhatsApp já cadastrado' };
      }
      return { success: false, error: 'Erro ao cadastrar' };
    }

    // The RPC now returns JSON directly with user and address
    const result = rpcResult as any;
    if (!result?.success) {
      return { success: false, error: result?.error || 'Erro ao cadastrar' };
    }

    return {
      success: true,
      user: result.user as User,
      address: result.address as Address,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error('Direct register error:', error);
    return { success: false, error: 'Erro ao cadastrar' };
  }
}

export async function registerCustomer(
  userData: { name: string; whatsapp: string; cpf: string },
  addressData: { street: string; number: string; complement?: string; neighborhood: string; city?: string; state?: string; zipCode?: string; notes?: string; latitude?: number | null; longitude?: number | null }
): Promise<RegisterResult> {
  // Try RPC first (faster, no cold start)
  const rpcResult = await directRegisterCustomer(userData, addressData);
  if (rpcResult.success || rpcResult.error !== 'Erro ao cadastrar') {
    return rpcResult;
  }

  // Fallback to edge function
  try {
    const { data, error } = await supabase.functions.invoke('auth-verify', {
      body: {
        action: 'register',
        name: userData.name,
        whatsapp: userData.whatsapp,
        cpf: userData.cpf,
        address: addressData,
      },
    });

    if (!error && data?.success) {
      return {
        success: true,
        user: data.user,
        address: data.address,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      };
    }

    if (data && !data.success) {
      return { success: false, error: data.error || 'Erro ao cadastrar' };
    }

    return { success: false, error: 'Erro ao cadastrar' };
  } catch {
    return { success: false, error: 'Erro de conexão. Tente novamente.' };
  }
}

export async function changePassword(userId: string, newPassword: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('auth-verify', {
      body: { action: 'change-password', userId, newPassword },
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Change password error:', error);
      return { success: false, error: error.message || 'Erro ao alterar senha' };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Erro ao alterar senha' };
    }

    return {
      success: true,
      user: data.user,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error('Change password error:', error);
    return { success: false, error: 'Erro ao alterar senha' };
  }
}

export async function requestPasswordReset(whatsapp: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('auth-verify', {
      body: { action: 'request-reset', whatsapp },
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Request reset error:', error);
      return { success: false, error: error.message || 'Erro ao solicitar reset' };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Erro ao solicitar reset' };
    }

    return { success: true };
  } catch (error) {
    if (import.meta.env.DEV) console.error('Request reset error:', error);
    return { success: false, error: 'Erro ao solicitar reset' };
  }
}
