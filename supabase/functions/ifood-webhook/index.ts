// Edge Function: ifood-webhook
// Recebe eventos PUSH do iFood. Grava em ifood_orders + ifood_events.
// URL pública: https://djkonftjquielnqejwht.supabase.co/functions/v1/ifood-webhook
// Validação HMAC SHA-256 opcional via x-ifood-signature.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  getIfoodToken,
  fetchOrderDetails,
  upsertIfoodOrder,
  applyEventStatus,
  logEvent,
  STATUS_MAP,
} from '../_shared/ifood-orders-ingest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ifood-signature',
};

interface IfoodEvent {
  id: string;
  code: string;
  fullCode?: string;
  orderId: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

type Supabase = ReturnType<typeof createClient>;

async function verifyHmac(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
    const hex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    return signature.replace(/^sha256=/i, '').trim().toLowerCase() === hex.toLowerCase();
  } catch {
    return false;
  }
}

async function handleEvent(supabase: Supabase, token: string, ev: IfoodEvent): Promise<void> {
  const code = (ev.fullCode ?? ev.code ?? '').toUpperCase();

  if (code === 'PLC' || code === 'PLACED') {
    const detail = await fetchOrderDetails(token, ev.orderId);
    await upsertIfoodOrder(supabase, detail);
    return;
  }

  if (STATUS_MAP[code] && ev.orderId) {
    await applyEventStatus(supabase, ev.orderId, code, ev.metadata);
    return;
  }

  // Outros eventos (ASSIGN_DRIVER etc): só registra em ifood_events (já feito por logEvent)
}

async function processEvents(supabase: Supabase, events: IfoodEvent[]): Promise<void> {
  if (events.length === 0) return;
  const token = await getIfoodToken(supabase);

  for (const ev of events) {
    try {
      const { data: dup } = await supabase
        .from('ifood_events').select('id')
        .eq('ifood_event_id', ev.id).maybeSingle();
      if (dup) continue;

      await handleEvent(supabase, token, ev);
      await logEvent(supabase, ev, 'webhook', ev, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Webhook ingest falhou:', ev.id, msg);
      await logEvent(supabase, ev, 'webhook', ev, false, msg);
    }
  }
}

Deno.serve(async (req) => {
  // 200 para qualquer probe — iFood marca DROPPED 405 se health-check não responder 2xx
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: true, service: 'ifood-webhook', method: req.method }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: config } = await supabase
    .from('ifood_test_config')
    .select('id, webhook_enabled, webhook_secret')
    .limit(1).single();

  if (!config) {
    return new Response(JSON.stringify({ ok: false, error: 'config not found' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!config.webhook_enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: 'disabled' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();

  if (config.webhook_secret) {
    const sig = req.headers.get('x-ifood-signature');
    const ok = await verifyHmac(rawBody, sig, String(config.webhook_secret));
    if (!ok) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid signature' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let events: IfoodEvent[] = [];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await supabase
    .from('ifood_test_config')
    .update({ last_webhook_at: new Date().toISOString() })
    .eq('id', config.id);

  try {
    await processEvents(supabase, events);
  } catch (e) {
    console.error('Falha geral webhook:', e);
  }

  return new Response(JSON.stringify({ ok: true, received: events.length }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
