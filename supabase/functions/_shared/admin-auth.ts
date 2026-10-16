import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Supabase = ReturnType<typeof createClient>;

/**
 * Confere se a requisição vem de um admin logado, sem precisar da service role key no navegador.
 * Aceita o token de sessão do app (header x-session-token) ou o JWT do Supabase Auth (Authorization).
 */
export async function isAdminRequest(supabase: Supabase, req: Request): Promise<boolean> {
  const sessionToken = req.headers.get('x-session-token');
  if (sessionToken) {
    const { data } = await (supabase.from('sessions') as any)
      .select('role')
      .eq('token', sessionToken)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (data?.role === 'admin') return true;
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: userData } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userData?.user) {
      const { data: roles } = await (supabase.from('user_roles') as any)
        .select('role')
        .eq('user_id', userData.user.id);
      if ((roles ?? []).some((r: { role: string }) => r.role === 'admin')) return true;
    }
  }

  return false;
}
