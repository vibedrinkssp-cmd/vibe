// Voice order parser: transcribes audio and maps it to catalog products.
// Client sends multipart/form-data: `audio` (Blob) + `products` (JSON string).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY = 'https://ai.gateway.lovable.dev/v1';

interface ProductLite {
  id: string;
  name: string;
  category?: string | null;
  price?: number | null;
  stock?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    const form = await req.formData();
    const audio = form.get('audio');
    const productsRaw = form.get('products');
    if (!(audio instanceof File)) throw new Error('audio required');
    if (typeof productsRaw !== 'string') throw new Error('products required');

    const products = JSON.parse(productsRaw) as ProductLite[];
    if (!Array.isArray(products) || products.length === 0) throw new Error('empty catalog');

    // 1) Transcribe
    const sttForm = new FormData();
    sttForm.append('model', 'openai/gpt-4o-transcribe');
    sttForm.append('file', audio, audio.name || 'recording.webm');
    const sttRes = await fetch(`${GATEWAY}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: sttForm,
    });
    if (!sttRes.ok) {
      const t = await sttRes.text();
      return json({ error: 'STT failed', details: t }, sttRes.status);
    }
    const sttJson = await sttRes.json();
    const transcript: string = sttJson.text || '';
    if (!transcript.trim()) return json({ transcript: '', items: [] });

    // 2) Map to catalog via LLM (structured output)
    // Keep the catalog compact to fit context.
    const compactCatalog = products.slice(0, 800).map(p => ({
      id: p.id,
      n: p.name,
      c: p.category ?? '',
      s: p.stock ?? null,
    }));

    const sys = `Você é um assistente de PDV. Receberá uma transcrição de um pedido falado em português brasileiro e um catálogo de produtos disponíveis (id, n=nome, c=categoria, s=estoque).
Sua tarefa: identificar quais produtos do catálogo o cliente pediu e a quantidade de cada.
Regras:
- Só use produtos existentes no catálogo (retorne o id EXATO).
- Interprete sinônimos, abreviações e variantes (ex: "coca 2 litros" -> COCA COLA 2L).
- Se houver ambiguidade, escolha o mais provável com base em popularidade/tamanho mencionado.
- Se não encontrar correspondência para algum item, adicione em "unmatched".
- Quantidade padrão = 1 se não dita.
Retorne APENAS JSON: { items: [{ product_id, quantity, matched_name }], unmatched: [string] }.`;

    const chatRes = await fetch(`${GATEWAY}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.5',
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: `TRANSCRIÇÃO:\n${transcript}\n\nCATÁLOGO (JSON):\n${JSON.stringify(compactCatalog)}`,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!chatRes.ok) {
      const t = await chatRes.text();
      return json({ error: 'LLM failed', transcript, details: t }, chatRes.status);
    }
    const chatJson = await chatRes.json();
    const content = chatJson.choices?.[0]?.message?.content || '{}';
    let parsed: { items?: Array<{ product_id: string; quantity: number; matched_name?: string }>; unmatched?: string[] } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    // Validate ids
    const idSet = new Set(products.map(p => p.id));
    const items = (parsed.items || []).filter(i => i && idSet.has(i.product_id) && (i.quantity ?? 0) > 0)
      .map(i => ({ product_id: i.product_id, quantity: Math.max(1, Math.floor(i.quantity)), matched_name: i.matched_name }));

    return json({ transcript, items, unmatched: parsed.unmatched || [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return json({ error: msg }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
