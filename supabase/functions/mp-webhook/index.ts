import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

/**
 * Mercado Pago Webhook — server-to-server confirmation.
 * Guarantees order status update even if the client closes the browser.
 * 
 * MP sends POST with:
 *  - action: "payment.created" | "payment.updated"
 *  - data.id: payment ID
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceKey);
}

/**
 * Validate the x-signature header sent by Mercado Pago.
 * Manifest template: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * HMAC-SHA256 with MERCADO_PAGO_WEBHOOK_SECRET, compared to the v1 hash.
 * Returns true when valid OR when no secret is configured (tolerant mode).
 */
async function validateSignature(req: Request, dataId: string | null): Promise<boolean> {
  const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET');
  // Tolerant mode: if secret not configured yet, allow (do not break setup)
  if (!secret) {
    console.warn('[mp-webhook] MERCADO_PAGO_WEBHOOK_SECRET not set — skipping signature validation');
    return true;
  }

  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  if (!xSignature) {
    console.error('[mp-webhook] Missing x-signature header');
    return false;
  }

  // Parse "ts=...,v1=..."
  let ts = '';
  let v1 = '';
  for (const part of xSignature.split(',')) {
    const [k, val] = part.split('=').map((s) => s.trim());
    if (k === 'ts') ts = val;
    else if (k === 'v1') v1 = val;
  }
  if (!ts || !v1) {
    console.error('[mp-webhook] Malformed x-signature:', xSignature);
    return false;
  }

  // Build manifest exactly as MP specifies (lowercase id, trailing semicolons)
  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
    const computed = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const ok = computed === v1;
    if (!ok) console.error('[mp-webhook] Signature mismatch');
    return ok;
  } catch (err) {
    console.error('[mp-webhook] Signature validation error:', err);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // MP webhooks are always POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
  if (!accessToken) {
    console.error('[mp-webhook] MERCADO_PAGO_ACCESS_TOKEN not configured');
    return new Response('Server not configured', { status: 500, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('[mp-webhook] Received:', JSON.stringify(body).substring(0, 500));

    // MP sends different notification formats
    const paymentId = body?.data?.id || body?.id;
    const action = body?.action || body?.type || '';

    // Validate signature (uses data.id from query or body)
    const url = new URL(req.url);
    const dataIdForSig = url.searchParams.get('data.id') || (paymentId ? String(paymentId) : null);
    const signatureValid = await validateSignature(req, dataIdForSig);
    if (!signatureValid) {
      return new Response('Invalid signature', { status: 401, headers: corsHeaders });
    }

    // Only process payment events
    if (!paymentId || (!action.includes('payment') && action !== 'payment')) {
      console.log('[mp-webhook] Ignoring non-payment event:', action);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Fetch payment details from MP API (source of truth)
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!mpResponse.ok) {
      console.error('[mp-webhook] Failed to fetch payment from MP:', mpResponse.status);
      return new Response('Payment fetch failed', { status: 502, headers: corsHeaders });
    }

    const payment = await mpResponse.json();
    console.log('[mp-webhook] Payment status:', payment.status, 'external_reference:', payment.external_reference);

    if (payment.status !== 'approved') {
      console.log('[mp-webhook] Payment not approved, status:', payment.status);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    const orderId = payment.external_reference;
    if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      console.log('[mp-webhook] No valid order UUID in external_reference:', orderId);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Idempotent update: only update if still pending
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('status, mp_payment_id')
      .eq('id', orderId)
      .single();

    if (fetchErr) {
      console.error('[mp-webhook] Order fetch error:', fetchErr);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Already processed — idempotent
    if (order.mp_payment_id === String(paymentId)) {
      console.log('[mp-webhook] Already processed payment', paymentId, 'for order', orderId);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    if (order.status === 'pending') {
      const { error: updateErr } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          mp_payment_id: String(paymentId),
          // OBRIGATÓRIO: marca o pagamento como confirmado. A trava de banco
          // (enforce_pix_payment_before_progress) bloqueia qualquer avanço de
          // pedido PIX sem payment_confirmed = true.
          payment_confirmed: true,
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: `mp_webhook #${paymentId}`,
          notes: `✅ PIX CONFIRMADO (webhook) - MP #${paymentId}`,
        })
        .eq('id', orderId)
        .eq('status', 'pending'); // optimistic lock

      if (updateErr) {
        console.error('[mp-webhook] Update error:', updateErr);
      } else {
        console.log('[mp-webhook] ✅ Order', orderId, 'confirmed via webhook');
      }
    } else {
      // Order not pending but save the payment_id for reconciliation
      if (!order.mp_payment_id) {
        await supabaseAdmin
          .from('orders')
          .update({ mp_payment_id: String(paymentId) })
          .eq('id', orderId);
        console.log('[mp-webhook] Saved mp_payment_id on non-pending order', orderId);
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('[mp-webhook] Error:', error);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
});
