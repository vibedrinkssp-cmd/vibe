// Edge Function: ifood-test-poll
// Polling iFood TESTE — agendado a cada 30s via pg_cron.
// Grava em ifood_orders + ifood_events (módulo paralelo).
// Mantém compat com ifood_test_events_log para auditoria histórica.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  getIfoodToken,
  fetchOrderDetails,
  upsertIfoodOrder,
  applyEventStatus,
  logEvent,
  EVENTS_API,
} from '../_shared/ifood-orders-ingest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IfoodEvent {
  id: string;
  code: string;
  fullCode?: string;
  orderId: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

async function fetchNewEvents(token: string): Promise<IfoodEvent[]> {
  const res = await fetch(`${EVENTS_API}/events:polling`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-polling-types': 'PLC,CFM,RPR,CAR,CON,CAN,DSP,RTP',
    },
  });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`Polling falhou [${res.status}]: ${await res.text()}`);
  return await res.json();
}

async function acknowledgeEvents(token: string, events: IfoodEvent[]): Promise<void> {
  if (events.length === 0) return;
  const res = await fetch(`${EVENTS_API}/events/acknowledgment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(events.map((e) => ({ id: e.id }))),
  });
  if (!res.ok) console.error(`Ack falhou [${res.status}]: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let processed = 0;
  let errors = 0;

  try {
    const { data: config } = await supabase
      .from('ifood_test_config')
      .select('id, is_enabled, merchant_id')
      .limit(1)
      .single();

    if (!config?.is_enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: 'disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!config.merchant_id) throw new Error('merchant_id não configurado');

    const token = await getIfoodToken(supabase);
    const events = await fetchNewEvents(token);
    const ackList: IfoodEvent[] = [];

    for (const ev of events) {
      try {
        // Idempotência via ifood_events
        const { data: dup } = await supabase
          .from('ifood_events')
          .select('id')
          .eq('ifood_event_id', ev.id)
          .maybeSingle();
        if (dup) { ackList.push(ev); continue; }

        const code = (ev.fullCode ?? ev.code ?? '').toUpperCase();

        // PLC = novo pedido → busca detalhes e grava em ifood_orders
        if (code === 'PLC' || code === 'PLACED') {
          const detail = await fetchOrderDetails(token, ev.orderId);
          await upsertIfoodOrder(supabase, detail);
        } else if (ev.orderId) {
          // Atualizações de status
          await applyEventStatus(supabase, ev.orderId, code, ev.metadata);
        }

        await logEvent(supabase, ev, 'poll', ev, true);
        ackList.push(ev);
        processed++;
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Falha processar evento:', ev.id, msg);
        await logEvent(supabase, ev, 'poll', ev, false, msg);
      }
    }

    await acknowledgeEvents(token, ackList);

    await supabase
      .from('ifood_test_config')
      .update({
        last_polled_at: new Date().toISOString(),
        last_poll_event_count: events.length,
        last_error: errors > 0 ? `${errors} erro(s)` : null,
        last_error_at: errors > 0 ? new Date().toISOString() : null,
      })
      .eq('id', config.id);

    return new Response(
      JSON.stringify({ ok: true, total: events.length, processed, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Falha geral poll iFood:', msg);
    await supabase
      .from('ifood_test_config')
      .update({ last_error: msg, last_error_at: new Date().toISOString() });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
