// Helper compartilhado: ingest do iFood TESTE no MÓDULO PARALELO (ifood_orders).
// NÃO grava em `orders` — isso é responsabilidade do scanner manual atual.
//
// Mapa de status iFood → status_vm:
//   PLACED              → PENDENTE
//   CONFIRMED           → CONFIRMADO
//   PREPARATION_STARTED → PREPARANDO
//   READY_TO_PICKUP     → PRONTO
//   DISPATCHED          → SAIU
//   CONCLUDED           → ENTREGUE
//   CANCELLED           → CANCELADO

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type Supabase = ReturnType<typeof createClient>;

export const ORDER_API = 'https://merchant-api.ifood.com.br/order/v1.0';
export const EVENTS_API = 'https://merchant-api.ifood.com.br/events/v1.0';

// ----------------- Status mapping -----------------

export const STATUS_MAP: Record<string, { ifood: string; vm: string }> = {
  PLC: { ifood: 'PLACED', vm: 'PENDENTE' },
  PLACED: { ifood: 'PLACED', vm: 'PENDENTE' },
  CFM: { ifood: 'CONFIRMED', vm: 'CONFIRMADO' },
  CONFIRMED: { ifood: 'CONFIRMED', vm: 'CONFIRMADO' },
  RPR: { ifood: 'PREPARATION_STARTED', vm: 'PREPARANDO' },
  PREPARATION_STARTED: { ifood: 'PREPARATION_STARTED', vm: 'PREPARANDO' },
  RTP: { ifood: 'READY_TO_PICKUP', vm: 'PRONTO' },
  READY_TO_PICKUP: { ifood: 'READY_TO_PICKUP', vm: 'PRONTO' },
  DSP: { ifood: 'DISPATCHED', vm: 'SAIU' },
  DISPATCHED: { ifood: 'DISPATCHED', vm: 'SAIU' },
  CON: { ifood: 'CONCLUDED', vm: 'ENTREGUE' },
  CONCLUDED: { ifood: 'CONCLUDED', vm: 'ENTREGUE' },
  CAN: { ifood: 'CANCELLED', vm: 'CANCELADO' },
  CANCELLED: { ifood: 'CANCELLED', vm: 'CANCELADO' },
  CAR: { ifood: 'CANCELLATION_REQUESTED', vm: 'PENDENTE' },
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ----------------- Token (reutiliza ifood_test_config) -----------------

export async function getIfoodToken(supabase: Supabase): Promise<string> {
  const { data: config } = await supabase
    .from('ifood_test_config')
    .select('id, cached_token, cached_token_expires_at')
    .limit(1)
    .single();

  if (config?.cached_token && config?.cached_token_expires_at) {
    const expiresAt = new Date(config.cached_token_expires_at as string).getTime();
    if (expiresAt > Date.now() + 60_000) return config.cached_token as string;
  }

  const clientId = Deno.env.get('IFOOD_TEST_CLIENT_ID');
  const clientSecret = Deno.env.get('IFOOD_TEST_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('IFOOD_TEST_CLIENT_ID/SECRET não configurados');

  const body = new URLSearchParams({ grantType: 'client_credentials', clientId, clientSecret });
  const res = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`iFood auth falhou [${res.status}]: ${text}`);
  const data = JSON.parse(text);
  const expiresAt = new Date(Date.now() + (data.expiresIn - 60) * 1000).toISOString();
  if (config?.id) {
    await supabase.from('ifood_test_config').update({
      cached_token: data.accessToken,
      cached_token_expires_at: expiresAt,
    }).eq('id', config.id);
  }
  return data.accessToken;
}

// ----------------- Fetch detalhes do pedido -----------------

export async function fetchOrderDetails(token: string, orderId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${ORDER_API}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GetOrder ${orderId} falhou [${res.status}]: ${text}`);
  return JSON.parse(text);
}

// ----------------- Ingest de pedido iFood em ifood_orders -----------------

export async function upsertIfoodOrder(
  supabase: Supabase,
  detail: Record<string, unknown>,
): Promise<string> {
  const ifoodOrderId = String(detail.id);
  const customer = (detail.customer as Record<string, unknown>) ?? {};
  const phone = customer.phone as { number?: string; localizer?: string } | undefined;
  const totalObj = (detail.total as Record<string, unknown>) ?? {};
  const delivery = (detail.delivery as Record<string, unknown>) ?? {};
  const orderTypeRaw = String(detail.orderType ?? 'DELIVERY').toUpperCase();

  const row = {
    ifood_order_id: ifoodOrderId,
    merchant_id: String((detail.merchant as Record<string, unknown>)?.id ?? ''),
    display_id: (detail.displayId as string) ?? ifoodOrderId.slice(-6),
    status_ifood: 'PLACED',
    status_vm: 'PENDENTE',
    order_type: orderTypeRaw,
    category: String(detail.orderTiming ?? 'IMMEDIATE'),
    delivered_by: (delivery.deliveredBy as string) ?? null,
    customer_name: String(customer.name ?? 'Cliente iFood'),
    customer_phone: phone?.number
      ? (phone.localizer ? `${phone.number} (cód ${phone.localizer})` : phone.number)
      : null,
    customer_doc: (customer.documentNumber as string) ?? null,
    delivery_address: delivery.deliveryAddress ?? null,
    items: detail.items ?? [],
    payments: detail.payments ?? {},
    total: num(totalObj.orderAmount),
    subtotal: num(totalObj.subTotal, num(totalObj.orderAmount)),
    delivery_fee: num(totalObj.deliveryFee),
    discount: num(totalObj.benefits),
    change_for: (() => {
      const methods = (detail.payments as { methods?: Array<{ cash?: { changeFor?: number } }> })?.methods ?? [];
      const c = methods[0]?.cash?.changeFor;
      return c && c > 0 ? c : null;
    })(),
    fees: detail.additionalFees ?? null,
    benefits: detail.benefits ?? null,
    raw_order: detail,
    delivery_code: (delivery.pickupCode as string) ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ifood_orders')
    .upsert(row, { onConflict: 'ifood_order_id' })
    .select('id')
    .single();

  if (error) throw new Error(`Upsert ifood_orders falhou: ${error.message}`);
  return data.id as string;
}

// ----------------- Atualiza status local conforme evento -----------------

export async function applyEventStatus(
  supabase: Supabase,
  ifoodOrderId: string,
  code: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const map = STATUS_MAP[code.toUpperCase()];
  if (!map) return;

  const patch: Record<string, unknown> = {
    status_ifood: map.ifood,
    status_vm: map.vm,
    updated_at: new Date().toISOString(),
  };

  const now = new Date().toISOString();
  if (map.ifood === 'CONFIRMED') patch.confirmed_at = now;
  if (map.ifood === 'PREPARATION_STARTED') patch.preparation_started_at = now;
  if (map.ifood === 'READY_TO_PICKUP') patch.ready_at = now;
  if (map.ifood === 'DISPATCHED') patch.dispatched_at = now;
  if (map.ifood === 'CONCLUDED') patch.concluded_at = now;
  if (map.ifood === 'CANCELLED') {
    patch.cancelled_at = now;
    if (metadata?.reason) patch.cancellation_reason = String(metadata.reason);
  }

  await supabase.from('ifood_orders').update(patch).eq('ifood_order_id', ifoodOrderId);
}

// ----------------- Log de evento -----------------

export async function logEvent(
  supabase: Supabase,
  ev: { id: string; code: string; fullCode?: string; orderId?: string; metadata?: unknown },
  source: 'poll' | 'webhook',
  raw: unknown,
  acknowledged = false,
  error?: string,
): Promise<void> {
  await supabase.from('ifood_events').upsert({
    ifood_event_id: ev.id,
    ifood_order_id: ev.orderId ?? null,
    code: ev.code,
    full_code: ev.fullCode ?? null,
    metadata: (ev.metadata ?? null) as Record<string, unknown> | null,
    raw_event: raw as Record<string, unknown>,
    acknowledged,
    acknowledged_at: acknowledged ? new Date().toISOString() : null,
    source,
    error: error ?? null,
  }, { onConflict: 'ifood_event_id' });
}
