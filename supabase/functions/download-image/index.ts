import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function tryFetch(url: string, headers: Record<string, string>, timeoutMs = 15000): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers, redirect: 'follow' });
    clearTimeout(timeoutId);
    if (res.ok) return res;
    console.log(`[download-image] Got ${res.status} for attempt`);
    await res.body?.cancel();
    return null;
  } catch (e) {
    clearTimeout(timeoutId);
    console.log(`[download-image] Attempt failed:`, e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();

    if (!imageUrl || typeof imageUrl !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[download-image] Downloading: ${imageUrl.substring(0, 120)}...`);

    let response: Response | null = null;

    // Attempt 1: Direct with browser-like headers
    response = await tryFetch(imageUrl, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'identity',
      'Referer': new URL(imageUrl).origin + '/',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    });

    // Attempt 2: Googlebot
    if (!response) {
      response = await tryFetch(imageUrl, {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': '*/*',
      });
    }

    // Attempt 3: Minimal headers
    if (!response) {
      response = await tryFetch(imageUrl, {
        'Accept': 'image/*,*/*;q=0.8',
      });
    }

    // Attempt 4: Use images.weserv.nl proxy (free image proxy/CDN)
    if (!response) {
      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=512&h=512&fit=inside&output=jpg&q=80`;
      console.log(`[download-image] Trying weserv.nl proxy...`);
      response = await tryFetch(proxyUrl, {
        'Accept': 'image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
    }

    // Attempt 5: Use wsrv.nl (alternative domain for same service)
    if (!response) {
      const proxyUrl2 = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&w=512&h=512&fit=inside&output=jpg&q=80`;
      console.log(`[download-image] Trying wsrv.nl proxy...`);
      response = await tryFetch(proxyUrl2, {
        'Accept': 'image/*,*/*;q=0.8',
      });
    }

    if (!response) {
      console.error('[download-image] All attempts failed for:', imageUrl.substring(0, 100));
      return new Response(
        JSON.stringify({ error: 'Failed to download image after multiple attempts' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let contentType = response.headers.get('content-type') || 'image/jpeg';
    
    if (!contentType.startsWith('image/')) {
      const urlLower = imageUrl.toLowerCase();
      if (urlLower.includes('.png')) contentType = 'image/png';
      else if (urlLower.includes('.webp')) contentType = 'image/webp';
      else if (urlLower.includes('.gif')) contentType = 'image/gif';
      else contentType = 'image/jpeg';
    }

    const arrayBuffer = await response.arrayBuffer();
    
    if (arrayBuffer.byteLength < 100) {
      return new Response(
        JSON.stringify({ error: 'Downloaded file too small, likely not a valid image' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const base64 = base64Encode(new Uint8Array(arrayBuffer));

    console.log(`[download-image] OK ${arrayBuffer.byteLength} bytes, type: ${contentType}`);

    return new Response(
      JSON.stringify({ base64, contentType, size: arrayBuffer.byteLength }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[download-image] Error:', error);
    const errorObj = error as { name?: string };
    const status = errorObj.name === 'AbortError' ? 504 : 500;
    return new Response(
      JSON.stringify({ error: status === 504 ? 'Download timeout' : 'Internal server error' }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
