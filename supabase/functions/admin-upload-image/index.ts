import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://esm.sh/zod@3.24.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_FOLDERS = ['products', 'banners', 'drink-types', 'special-drinks', 'pager-ads'] as const;
const ALLOWED_ROLES = new Set(['admin', 'pdv']);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const BodySchema = z.object({
  fileBase64: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileType: z.string().startsWith('image/').max(100),
  folder: z.enum(ALLOWED_FOLDERS),
  sessionToken: z.string().uuid(),
});

function getExtension(fileName: string, fileType: string): string {
  const fromName = fileName.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName;
  }

  switch (fileType) {
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
      return 'jpg';
    default:
      return 'webp';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor inválida' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Corpo da requisição inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { sessionToken, fileBase64, fileName, fileType, folder } = parsed.data;

    console.log(`[admin-upload-image] Validating session token: ${sessionToken.substring(0, 8)}...`);

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('user_id, role, is_active, expires_at')
      .eq('token', sessionToken)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    console.log(`[admin-upload-image] Session query result:`, { session, sessionError: sessionError?.message });

    if (sessionError || !session || !ALLOWED_ROLES.has(session.role)) {
      console.error(`[admin-upload-image] Auth failed: error=${sessionError?.message}, session=${JSON.stringify(session)}`);
      return new Response(
        JSON.stringify({ error: 'Sessão administrativa inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const bytes = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: 'Arquivo inválido ou muito grande' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const extension = getExtension(fileName, fileType);
    const storagePath = `${folder}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(storagePath, bytes, {
        cacheControl: '31536000',
        contentType: fileType,
        upsert: false,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('images')
      .getPublicUrl(storagePath);

    return new Response(
      JSON.stringify({ path: storagePath, publicUrl: publicUrlData.publicUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[admin-upload-image] Error:', error);

    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});