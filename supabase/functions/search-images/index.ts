import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SerperImageResult {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  source: string;
  link: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      console.error('[search-images] Invalid query:', query);
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serperApiKey = Deno.env.get('SERPER_API_KEY');
    if (!serperApiKey) {
      console.error('[search-images] SERPER_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Image search API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[search-images] Searching for: "${query}"`);

    const searchQuery = `${query} produto bebida`;

    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: searchQuery,
        num: 8,
        gl: 'br',
        hl: 'pt-br',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[search-images] Serper API error:', response.status, errorText);
      let userMessage = 'Falha ao pesquisar imagens';
      let code: string | undefined;
      try {
        const parsed = JSON.parse(errorText);
        if (typeof parsed?.message === 'string') {
          if (/not enough credits/i.test(parsed.message)) {
            userMessage = 'Créditos da API de busca de imagens (Serper) esgotados. Recarregue a conta em serper.dev para voltar a buscar imagens.';
            code = 'SERPER_NO_CREDITS';
          } else {
            userMessage = `Serper: ${parsed.message}`;
          }
        }
      } catch { /* keep default */ }
      return new Response(
        JSON.stringify({ error: userMessage, code, status: response.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`[search-images] Found ${data.images?.length || 0} images`);

    const images: SerperImageResult[] = (data.images || []).map((img: any) => ({
      title: img.title || '',
      imageUrl: img.imageUrl || '',
      thumbnailUrl: img.thumbnailUrl || '',
      source: img.source || '',
      link: img.link || '',
    }));

    return new Response(
      JSON.stringify({ images }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[search-images] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
