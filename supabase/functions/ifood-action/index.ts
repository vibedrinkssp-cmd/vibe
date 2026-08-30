// Edge Function: ifood-action
// Endpoint único para AÇÕES do operador no painel iFood TESTE.
// Cada ação dispara uma chamada à API oficial iFood e é AUDITADA em ifood_action_logs.
//
// Body: { action, ifoodOrderId, payload?, performedBy? }
// Actions:
//   - confirm                → POST /orders/{id}/confirm
//   - startPreparation       → POST /orders/{id}/startPreparation
//   - readyToPickup          → POST /orders/{id}/readyToPickup
//   - dispatch               → POST /orders/{id}/dispatch
//   - requestCancellation    → POST /orders/{id}/requestCancellation  (payload: {reason, cancellationCode})
//   - cancellationReasons    → GET  /orders/{id}/cancellationReasons
//   - verifyDeliveryCode     → POST /orders/{id}/verifyDeliveryCode   (payload: {code})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getIfoodToken, ORDER_API, applyEventStatus } from '../_shared/ifood-orders-ingest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ActionRequest {
  action: string;
  ifoodOrderId: string;
  payload?: Record<string, unknown>;
  performedBy?: string;
}

const STATUS_AFTER: Record<string, string> = {
  confirm: 'CONFIRMED',
  startPreparation: 'PREPARATION_STARTED',
  readyToPickup: 'READY_TO_PICKUP',
  dispatch: 'DISPATCHED',
  verifyDeliveryCode: 'CONCLUDED',
};

function endpointFor(action: string, orderId: string): { url: string; method: 'GET' | 'POST' } {
  switch (action) {
    case 'confirm':              return { url: `${ORDER_API}/orders/${orderId}/confirm`, method: 'POST' };
    case 'startPreparation':     return { url: `${ORDER_API}/orders/${orderId}/startPreparation`, method: 'POST' };
    case 'readyToPickup':        return { url: `${ORDER_API}/orders/${orderId}/readyToPickup`, method: 'POST' };
    case 'dispatch':             return { url: `${ORDER_API}/orders/${orderId}/dispatch`, method: 'POST' };
    case 'requestCancellation':  return { url: `${ORDER_API}/orders/${orderId}/requestCancellation`, method: 'POST' };
    case 'cancellationReasons':  return { url: `${ORDER_API}/orders/${orderId}/cancellationReasons`, method: 'GET' };
    case 'verifyDeliveryCode':   return { url: `${ORDER_API}/orders/${orderId}/verifyDeliveryCode`, method: 'POST' };
    default: throw new Error(`Action desconhecida: ${action}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: ActionRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { action, ifoodOrderId, payload, performedBy } = body;
  if (!action || !ifoodOrderId) {
    return new Response(JSON.stringify({ ok: false, error: 'action e ifoodOrderId obrigatórios' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let httpStatus = 0;
  let respBody: unknown = null;
  let success = false;
  let errorMessage: string | null = null;
  let url = '';
  let method: 'GET' | 'POST' = 'POST';

  try {
    const token = await getIfoodToken(supabase);
    const ep = endpointFor(action, ifoodOrderId);
    url = ep.url;
    method = ep.method;

    const init: RequestInit = {
      method,
      headers: { Authorization: `Bearer ${token}` },
    };
    if (method === 'POST' && payload && Object.keys(payload).length > 0) {
      init.headers = { ...init.headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(payload);
    }

    const res = await fetch(url, init);
    httpStatus = res.status;
    const text = await res.text();
    try { respBody = text ? JSON.parse(text) : null; } catch { respBody = text; }

    success = res.ok || res.status === 202;

    if (!success) {
      errorMessage = `iFood ${res.status}: ${typeof respBody === 'string' ? respBody : JSON.stringify(respBody)}`;
    } else if (STATUS_AFTER[action]) {
      // Atualiza status local imediatamente
      await applyEventStatus(supabase, ifoodOrderId, STATUS_AFTER[action], payload);
      if (action === 'verifyDeliveryCode') {
        await supabase.from('ifood_orders')
          .update({ delivery_code_verified_at: new Date().toISOString() })
          .eq('ifood_order_id', ifoodOrderId);
      }
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    console.error('ifood-action falhou:', errorMessage);
  }

  // Audit log
  await supabase.from('ifood_action_logs').insert({
    ifood_order_id: ifoodOrderId,
    action,
    endpoint: url,
    method,
    request_payload: payload ?? null,
    response_payload: respBody as Record<string, unknown> | null,
    http_status: httpStatus,
    success,
    error_message: errorMessage,
    performed_by: performedBy ?? null,
  });

  return new Response(
    JSON.stringify({ ok: success, httpStatus, response: respBody, error: errorMessage }),
    {
      status: success ? 200 : (httpStatus >= 400 ? httpStatus : 500),
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
