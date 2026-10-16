import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isAdminRequest } from '../_shared/admin-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mesmas tabelas do export-database: só o que faz parte do backup pode ser restaurado.
const TABLES = new Set([
  'categories', 'users', 'employees', 'motoboys', 'settings',
  'addresses', 'products', 'banners', 'drink_fruits', 'special_drink_configs',
  'coupons', 'user_coupons', 'caderneta_customers', 'caderneta_entries',
  'orders', 'order_items', 'open_bottles',
  'cash_register_sessions', 'cash_register_closures',
  'sangrias', 'sangria_items', 'platform_sales', 'user_roles',
  'visitor_sessions', 'motoboy_locations',
]);

const BUCKETS = new Set(['images']);
const MAX_ROWS_PER_CALL = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    if (!(await isAdminRequest(supabase, req))) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();

    // Restaura registros de uma tabela (upsert por id)
    if (body.action === 'upsert') {
      const { table, rows } = body;
      if (!TABLES.has(table)) return json({ error: 'Tabela não permitida' }, 400);
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS_PER_CALL) {
        return json({ error: `Envie de 1 a ${MAX_ROWS_PER_CALL} registros por chamada` }, 400);
      }
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
      if (error) return json({ success: false, error: error.message });
      return json({ success: true, count: rows.length });
    }

    // Gera uma URL de upload assinada: o navegador envia o arquivo direto ao storage, sem a chave
    if (body.action === 'signed-upload') {
      const { bucket, path } = body;
      if (!BUCKETS.has(bucket) || typeof path !== 'string' || !path || path.includes('..')) {
        return json({ error: 'Bucket ou caminho inválido' }, 400);
      }
      const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
      if (error || !data) return json({ success: false, error: error?.message ?? 'Falha ao assinar upload' });
      return json({ success: true, token: data.token, path: data.path });
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});
