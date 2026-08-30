import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://esm.sh/zod@3.24.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  sourcePath: z.string().min(1),
  sessionToken: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server config error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { sessionToken, sourcePath } = parsed.data;

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('user_id, role, is_active, expires_at')
      .eq('token', sessionToken)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session || !['admin', 'pdv'].includes(session.role)) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Download the source file server-side (no egress cost — internal)
    const { data: fileData, error: dlError } = await supabase.storage
      .from('images')
      .download(sourcePath);

    if (dlError || !fileData) {
      return new Response(JSON.stringify({ error: 'Imagem de origem não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build new path: same folder, new UUID, same extension
    const parts = sourcePath.split('/');
    const folder = parts.slice(0, -1).join('/');
    const ext = sourcePath.split('.').pop() || 'webp';
    const newPath = `${folder}/${crypto.randomUUID()}.${ext}`;

    const bytes = new Uint8Array(await fileData.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(newPath, bytes, {
        cacheControl: '31536000',
        contentType: fileData.type || 'image/webp',
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from('images')
      .getPublicUrl(newPath);

    return new Response(JSON.stringify({ path: newPath, publicUrl: publicUrlData.publicUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[copy-storage-image] Error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
