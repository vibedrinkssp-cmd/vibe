// Helper compartilhado: ingest de pedidos oficiais iFood (TESTE/PROD).
// Usado por `ifood-test-poll` (polling) e `ifood-webhook` (push em tempo real).
//
// Extrai o máximo possível do payload `GET /order/v1.0/orders/{id}` documentado
// em https://developer.ifood.com.br/pt-BR/docs/guides/modules/order/order-details
// e materializa:
//   - orders.customer_name = "[IFOODTESTE #displayId] Nome (TEL/loc)"
//   - orders.notes = bloco multilinhas com endereço, agendamento, pickupCode,
//     pagamentos detalhados, taxas, benefícios e observação geral
//   - order_items linha a linha, com complementos/customizations e observações
//     concatenados em `product_name` (compatível com nosso schema enxuto)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type Supabase = ReturnType<typeof createClient>;

const ORIGIN_TAG_TEST = 'ifood_test';
const ORDER_API = 'https://merchant-api.ifood.com.br/order/v1.0';

// ----------------------------- helpers de parsing -----------------------------

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mapPaymentMethod(payments: unknown): string {
  try {
    const arr = (payments as { methods?: { method?: string; type?: string }[] })?.methods ?? [];
    const m = (arr[0]?.method ?? arr[0]?.type ?? '').toUpperCase();
    if (m.includes('PIX')) return 'pix';
    if (m.includes('CREDIT')) return 'card_credit';
    if (m.includes('DEBIT')) return 'card_debit';
    if (m.includes('CASH') || m.includes('MONEY')) return 'cash';
    if (m.includes('VOUCHER')) return 'card_credit';
    if (m.includes('WALLET')) return 'card_credit';
  } catch { /* ignore */ }
  return 'card_credit';
}

// Determina se o pedido iFood JÁ foi pago online (PREPAID) ou se ainda precisa
// ser cobrado na entrega (PENDING/OFFLINE — dinheiro ou maquininha).
// iFood: payments.methods[].type = 'PREPAID' (online) | 'PENDING' (cobrar na entrega),
// e payments.pending > 0 indica valor a cobrar do cliente.
function isPaidOnline(payments: unknown): boolean {
  try {
    const p = payments as {
      prepaid?: number; pending?: number;
      methods?: { type?: string; method?: string }[];
    };
    if (typeof p?.pending === 'number' && p.pending > 0) return false;
    const methods = p?.methods ?? [];
    if (methods.length === 0) {
      // sem detalhamento: só considera pago se houver prepaid explícito
      return typeof p?.prepaid === 'number' && p.prepaid > 0;
    }
    // Pago online somente se TODOS os métodos forem PREPAID e nenhum for dinheiro.
    return methods.every((m) => {
      const type = (m.type ?? '').toUpperCase();
      const method = (m.method ?? '').toUpperCase();
      if (method.includes('CASH') || method.includes('MONEY')) return false;
      return type === 'PREPAID';
    });
  } catch {
    return false;
  }
}


interface IfoodAddress {
  streetName?: string; streetNumber?: string; formattedAddress?: string;
  neighborhood?: string; complement?: string; reference?: string;
  postalCode?: string; city?: string; state?: string; country?: string;
  coordinates?: { latitude?: number; longitude?: number };
}

function formatAddress(a?: IfoodAddress): string {
  if (!a) return '';
  const parts: string[] = [];
  parts.push(a.formattedAddress ?? `${a.streetName ?? ''}, ${a.streetNumber ?? ''}`.trim());
  if (a.complement) parts.push(`Compl: ${a.complement}`);
  if (a.reference) parts.push(`Ref: ${a.reference}`);
  if (a.neighborhood) parts.push(a.neighborhood);
  const city = [a.city, a.state].filter(Boolean).join('/');
  if (city) parts.push(city);
  if (a.postalCode) parts.push(`CEP ${a.postalCode}`);
  return parts.filter(Boolean).join(' — ');
}

function formatPhone(customer: Record<string, unknown> | undefined): string {
  const phone = customer?.phone as { number?: string; localizer?: string } | undefined;
  if (!phone?.number) return '';
  return phone.localizer ? `${phone.number} (cód. ${phone.localizer})` : phone.number;
}

function formatPayments(payments: unknown): string {
  const p = payments as {
    prepaid?: number; pending?: number;
    methods?: Array<{
      value?: number; type?: string; method?: string;
      card?: { brand?: string };
      wallet?: { name?: string };
      cash?: { changeFor?: number };
    }>;
  };
  if (!p) return '';
  const lines: string[] = [];
  if (p.prepaid && p.prepaid > 0) lines.push(`💳 Pré-pago (online): ${fmtMoney(p.prepaid)}`);
  if (p.pending && p.pending > 0) lines.push(`💵 A cobrar na entrega: ${fmtMoney(p.pending)}`);
  for (const m of p.methods ?? []) {
    const tag = m.type === 'OFFLINE' ? '[COBRAR]' : '[PAGO]';
    const brand = m.card?.brand ? ` ${m.card.brand}` : '';
    const wallet = m.wallet?.name ? ` ${m.wallet.name}` : '';
    const change = m.cash?.changeFor ? ` — troco para ${fmtMoney(m.cash.changeFor)}` : '';
    lines.push(`  ${tag} ${m.method ?? '?'}${brand}${wallet}: ${fmtMoney(num(m.value))}${change}`);
  }
  return lines.join('\n');
}

function formatBenefits(benefits: unknown): string {
  const arr = benefits as Array<{
    value?: number; target?: string;
    campaign?: { name?: string };
    sponsorshipValues?: Array<{ name?: string; value?: number }>;
  }>;
  if (!arr?.length) return '';
  return arr.map((b) => {
    const camp = b.campaign?.name ? ` (${b.campaign.name})` : '';
    const sponsors = (b.sponsorshipValues ?? [])
      .filter((s) => num(s.value) > 0)
      .map((s) => `${s.name}=${fmtMoney(num(s.value))}`)
      .join(', ');
    return `  • ${b.target ?? '?'}: -${fmtMoney(num(b.value))}${camp}${sponsors ? ` [${sponsors}]` : ''}`;
  }).join('\n');
}

function formatAdditionalFees(fees: unknown): string {
  const arr = fees as Array<{ type?: string; description?: string; value?: number }>;
  if (!arr?.length) return '';
  return arr.map((f) => `  • ${f.description ?? f.type ?? 'Taxa'}: ${fmtMoney(num(f.value))}`).join('\n');
}

function formatItemLine(it: Record<string, unknown>): {
  name: string; qty: number; unit: number; total: number;
} {
  const qty = num(it.quantity, 1);
  const unitPrice = num(it.unitPrice, num(it.price));
  const totalPrice = num(it.totalPrice, unitPrice * qty);
  let name = String(it.name ?? 'Item iFood').trim();

  // externalCode (PDV) ajuda no batimento
  const ext = it.externalCode ? ` [PDV:${it.externalCode}]` : '';

  // Complementos (options + customizations)
  const options = (it.options as Array<Record<string, unknown>>) ?? [];
  const optLines: string[] = [];
  for (const opt of options) {
    const oqty = num(opt.quantity, 1);
    const oname = String(opt.name ?? '').trim();
    if (oname) optLines.push(`  + ${oqty}x ${oname}`);
    const customs = (opt.customization as Array<Record<string, unknown>>) ?? [];
    for (const c of customs) {
      const cqty = num(c.quantity, 1);
      const cname = String(c.name ?? '').trim();
      if (cname) optLines.push(`     ↳ ${cqty}x ${cname}`);
    }
  }

  const obs = it.observations ? `\n  📝 ${String(it.observations).trim()}` : '';
  const composed = `${name}${ext}${optLines.length ? '\n' + optLines.join('\n') : ''}${obs}`;
  return { name: composed, qty, unit: unitPrice, total: totalPrice };
}

// --------------------------- API auxiliares (iFood) ---------------------------

export async function getIfoodTestToken(supabase: Supabase): Promise<string> {
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
      cached_token: data.accessToken, cached_token_expires_at: expiresAt,
    }).eq('id', config.id);
  }
  return data.accessToken;
}

export async function fetchOrderDetails(token: string, orderId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${ORDER_API}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GetOrder ${orderId} falhou [${res.status}]: ${t}`);
  }
  return await res.json();
}

export async function autoConfirmAtIfood(token: string, orderId: string): Promise<void> {
  const res = await fetch(`${ORDER_API}/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 202) {
    const t = await res.text();
    console.warn(`Auto-confirm iFood ${orderId} falhou [${res.status}]: ${t}`);
  }
}

// ------------------------------- Ingest principal ------------------------------

export async function ingestPlacedOrder(
  supabase: Supabase,
  ifoodOrder: Record<string, unknown>,
  origin: string = ORIGIN_TAG_TEST,
): Promise<string | null> {
  const ifoodOrderId = String(ifoodOrder.id);
  const displayId = (ifoodOrder.displayId as string) ?? ifoodOrderId.slice(-6);
  const customer = (ifoodOrder.customer as Record<string, unknown>) ?? {};
  const items = ((ifoodOrder.items as unknown[]) ?? []) as Array<Record<string, unknown>>;
  const totalObj = (ifoodOrder.total as Record<string, unknown>) ?? {};
  const total = num(totalObj.orderAmount);
  const subTotal = num(totalObj.subTotal, total);
  const deliveryFee = num(totalObj.deliveryFee);
  const discount = num(totalObj.benefits);
  const orderTiming = String(ifoodOrder.orderTiming ?? '').toUpperCase();
  const orderTypeRaw = String(ifoodOrder.orderType ?? 'DELIVERY').toUpperCase();
  const orderType = orderTypeRaw === 'TAKEOUT' ? 'pickup' : 'delivery';
  const payment = mapPaymentMethod((ifoodOrder as { payments?: unknown }).payments);
  // Dinheiro NUNCA entra pré-pago (motoboy cobra em mãos). Cartão/PIX só se PREPAID online.
  const paidOnline = payment !== 'cash' && isPaidOnline((ifoodOrder as { payments?: unknown }).payments);
  const isTest = Boolean(ifoodOrder.isTest ?? ifoodOrder.test ?? false);

  // Idempotência
  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('external_origin', origin)
    .eq('external_order_id', ifoodOrderId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // ---- Monta bloco de NOTES com TODO o contexto operacional ----
  const noteLines: string[] = [];
  noteLines.push(`📦 Pedido oficial iFood — display #${displayId}`);
  noteLines.push(`🆔 ${ifoodOrderId}`);
  if (isTest) noteLines.push('⚠️  PEDIDO DE TESTE (isTest=true)');
  if (orderTiming === 'SCHEDULED') {
    const sched = ifoodOrder.schedule as { deliveryDateTimeStart?: string; deliveryDateTimeEnd?: string } | undefined;
    if (sched?.deliveryDateTimeStart) {
      noteLines.push(`⏰ AGENDADO: ${new Date(sched.deliveryDateTimeStart).toLocaleString('pt-BR')}` +
        (sched.deliveryDateTimeEnd ? ` → ${new Date(sched.deliveryDateTimeEnd).toLocaleString('pt-BR')}` : ''));
    }
  }

  // Cliente
  const phoneStr = formatPhone(customer);
  if (phoneStr) noteLines.push(`📞 ${phoneStr}`);
  if (customer.documentNumber) noteLines.push(`🪪 Doc: ${customer.documentNumber}`);

  // Entrega
  const delivery = (ifoodOrder.delivery as Record<string, unknown>) ?? {};
  if (orderType === 'delivery') {
    const addr = formatAddress(delivery.deliveryAddress as IfoodAddress | undefined);
    if (addr) noteLines.push(`🏠 ${addr}`);
    if (delivery.deliveredBy) noteLines.push(`🛵 Entrega por: ${delivery.deliveredBy}` +
      (delivery.description ? ` (${delivery.description})` : ''));
    if (delivery.pickupCode) noteLines.push(`🔑 Cód. coleta: ${delivery.pickupCode}`);
    if (delivery.observations) noteLines.push(`📝 Obs entrega: ${delivery.observations}`);
  } else {
    const takeout = (ifoodOrder.takeout as Record<string, unknown>) ?? {};
    if (takeout.takeoutDateTime) noteLines.push(`📍 Retirar: ${new Date(takeout.takeoutDateTime as string).toLocaleString('pt-BR')}`);
    if (takeout.observations) noteLines.push(`📝 Obs retirada: ${takeout.observations}`);
  }

  // Pagamentos
  const payStr = formatPayments(ifoodOrder.payments);
  if (payStr) noteLines.push(`💰 Pagamentos:\n${payStr}`);

  // Benefícios (cupons)
  const benStr = formatBenefits(ifoodOrder.benefits);
  if (benStr) noteLines.push(`🎟️  Cupons/benefícios:\n${benStr}`);

  // Taxas adicionais
  const feesStr = formatAdditionalFees(ifoodOrder.additionalFees);
  if (feesStr) noteLines.push(`➕ Taxas adicionais:\n${feesStr}`);

  // Info extra do pedido
  if (ifoodOrder.extraInfo) noteLines.push(`ℹ️  ${ifoodOrder.extraInfo}`);

  const customerLabel = `[IFOOD${origin === ORIGIN_TAG_TEST ? 'TESTE' : ''} #${displayId}]` +
    ` ${String(customer.name ?? 'Cliente iFood').trim()}` +
    (phoneStr ? ` · ${phoneStr.split(' ')[0]}` : '');

  // ---- Cria o pedido ----
  const { data: created, error: orderErr } = await supabase
    .from('orders')
    .insert({
      external_origin: origin,
      external_order_id: ifoodOrderId,
      customer_name: customerLabel,
      order_type: orderType,
      payment_method: payment,
      status: 'accepted', // auto-aceite, transição posterior via /confirm
      subtotal: subTotal,
      total,
      delivery_fee: deliveryFee,
      discount,
      accepted_at: new Date().toISOString(),
      payment_confirmed: paidOnline,
      payment_confirmed_at: paidOnline ? new Date().toISOString() : null,
      payment_confirmed_by: paidOnline ? 'iFood (online)' : null,
      notes: noteLines.join('\n'),
    })
    .select('id')
    .single();

  if (orderErr || !created) {
    console.error('Falha ao criar order local:', orderErr);
    return null;
  }

  // ---- Itens (com complementos + observações embutidos no product_name) ----
  const itemRows = items.map((it) => {
    const { name, qty, unit, total: t } = formatItemLine(it);
    return {
      order_id: created.id,
      product_name: name,
      quantity: qty,
      unit_price: unit,
      total_price: t,
    };
  });
  if (itemRows.length > 0) {
    const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
    if (itemsErr) console.error('Falha ao inserir itens:', itemsErr);
  }

  return created.id as string;
}

export { mapPaymentMethod };
