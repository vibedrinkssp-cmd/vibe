import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://esm.sh/zod@3.24.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_FOLDERS = ['products', 'banners', 'drink-types', 'special-drinks'] as const;
const ALLOWED_ROLES = new Set(['admin', 'pdv']);

const BodySchema = z.object({
  imageUrl: z.string().url(),
  folder: z.enum(ALLOWED_FOLDERS).default('products'),
  sessionToken: z.string().uuid(),
  maxSize: z.number().int().min(64).max(2048).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function tryFetch(url: string, headers: Record<string, string>, timeoutMs = 20000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers, redirect: 'follow' });
    clearTimeout(t);
    if (res.ok) return res;
    console.log(`[serper-upload] ${res.status} on ${url.substring(0, 80)}`);
    await res.body?.cancel();
    return null;
  } catch (e) {
    clearTimeout(t);
    console.log(`[serper-upload] fetch failed: ${(e as Error).message}`);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured' }, 500);

    let raw: unknown;
    try { raw = await req.json(); } catch { return json({ error: 'Invalid body' }, 400); }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { imageUrl, folder, sessionToken, maxSize = 512 } = parsed.data;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate admin/pdv session
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .select('role, is_active, expires_at')
      .eq('token', sessionToken)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessErr || !session || !ALLOWED_ROLES.has(session.role)) {
      console.error('[serper-upload] auth failed', sessErr?.message);
      return json({ error: 'Sessão administrativa inválida' }, 401);
    }

    // PRIMARY: wsrv.nl proxy — resize + format conversion server-side (resolves 403/timeout/huge files)
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&w=${maxSize}&h=${maxSize}&fit=inside&output=jpg&q=80`;
    let response = await tryFetch(proxyUrl, {
      'Accept': 'image/*,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0',
    });

    // FALLBACK 1: images.weserv.nl (same service, alt domain)
    if (!response) {
      const alt = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=${maxSize}&h=${maxSize}&fit=inside&output=jpg&q=80`;
      response = await tryFetch(alt, { 'Accept': 'image/*' });
    }

    // FALLBACK 2: direct fetch with browser headers
    if (!response) {
      response = await tryFetch(imageUrl, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
        'Referer': new URL(imageUrl).origin + '/',
      });
    }

    if (!response) return json({ error: 'Não foi possível baixar a imagem', code: 'DOWNLOAD_FAILED' }, 502);

    let contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) contentType = 'image/jpeg';

    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength < 200) return json({ error: 'Imagem inválida ou muito pequena', code: 'TOO_SMALL' }, 502);
    if (buf.byteLength > 8 * 1024 * 1024) return json({ error: 'Imagem maior que 8MB', code: 'TOO_LARGE' }, 413);

    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const storagePath = `${folder}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('images')
      .upload(storagePath, buf, {
        cacheControl: '31536000',
        contentType,
        upsert: false,
      });

    if (upErr) {
      console.error('[serper-upload] storage error:', upErr.message);
      return json({ error: upErr.message }, 500);
    }

    const { data: pub } = supabase.storage.from('images').getPublicUrl(storagePath);
    console.log(`[serper-upload] OK ${buf.byteLength}B → ${storagePath}`);
    return json({ path: storagePath, publicUrl: pub.publicUrl, size: buf.byteLength });
  } catch (e) {
    console.error('[serper-upload] fatal:', e);
    return json({ error: 'Erro interno' }, 500);
  }
});
