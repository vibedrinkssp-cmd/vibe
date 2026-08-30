import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fallbackResponse(error: string, extra: Record<string, unknown> = {}) {
  return jsonResponse({ error, fallback: true, ...extra }, 200);
}

function validateAmount(amount: unknown): number {
  if (typeof amount !== 'number' || isNaN(amount)) throw new Error('Valor inválido');
  if (amount <= 0) throw new Error('Valor deve ser positivo');
  return Math.round(amount * 100) / 100;
}

function validateString(value: unknown, fieldName: string, maxLength = 200): string {
  if (typeof value !== 'string') throw new Error(`${fieldName} inválido`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${fieldName} não pode estar vazio`);
  return trimmed.slice(0, maxLength).replace(/<[^>]*>/g, '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    console.error(`[mercadopago] Invalid UUID for ${fieldName}: type=${typeof value}, value=`, value);
    throw new Error(`${fieldName} não é um UUID válido`);
  }
  return value;
}

/**
 * Garante um UUID válido. Se o input já for UUID, retorna; caso contrário
 * gera um novo e loga origem para diagnóstico (PIX nunca deve falhar por isso).
 */
function ensureUUID(value: unknown, fieldName: string): string {
  if (typeof value === 'string' && UUID_RE.test(value)) return value;
  const fallback = crypto.randomUUID();
  console.warn(`[mercadopago] ${fieldName} inválido (${typeof value}: ${String(value).slice(0,40)}) — usando fallback ${fallback}`);
  return fallback;
}

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceKey);
}

function normalizeTotemItems(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Pedido sem itens não pode ser registrado');
  }

  return items.map((item: any) => {
    const productName = validateString(item?.product_name, 'Nome do item', 300);
    const quantity = Math.max(1, Math.floor(Number(item?.quantity || 1)));
    const unitPrice = Math.max(0, Math.round(Number(item?.unit_price || 0) * 100) / 100);
    const totalPrice = Math.max(0, Math.round(Number(item?.total_price ?? unitPrice * quantity) * 100) / 100);
    const productId = typeof item?.product_id === 'string' && UUID_RE.test(item.product_id) ? item.product_id : null;

    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || !Number.isFinite(totalPrice)) {
      throw new Error('Valores dos itens inválidos');
    }

    return {
      product_id: productId,
      product_name: productName,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      is_wizard_item: Boolean(item?.is_wizard_item),
    };
  });
}

serve(async (req: Request) => {
  console.log('[mercadopago] Request received:', req.method, req.url);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const rawToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? '';
  const accessToken = rawToken.trim();
  console.log('[mercadopago] token diagnostic:', {
    present: !!rawToken,
    length: rawToken.length,
    trimmedLength: accessToken.length,
    prefix: accessToken.slice(0, 8),
    looksValid: accessToken.startsWith('APP_USR-') || accessToken.startsWith('TEST-'),
  });
  if (!accessToken) {
    console.error('[mercadopago] MERCADO_PAGO_ACCESS_TOKEN not configured (empty after trim)');
    return fallbackResponse('Mercado Pago não configurado', { code: 'MP_NOT_CONFIGURED' });
  }
  if (!accessToken.startsWith('APP_USR-') && !accessToken.startsWith('TEST-')) {
    console.error('[mercadopago] Token format inválido. Esperado começar com APP_USR- (produção) ou TEST- (sandbox). Recebido prefix:', accessToken.slice(0, 12));
    return fallbackResponse('Credencial Mercado Pago em formato inválido. Use o Access Token (APP_USR-... para produção ou TEST-... para sandbox), não a Public Key.', {
      code: 'MP_INVALID_TOKEN_FORMAT',
    });
  }
  

  try {
    const body = await req.json();
    const action = body.action || new URL(req.url).searchParams.get('action');
    console.log('[mercadopago] Action:', action);
    
    if (action === 'create_pix') {
      console.log('[mercadopago] Creating PIX payment:', JSON.stringify(body));
      
      const amount = validateAmount(body.amount);
      const description = validateString(body.description, 'Descrição', 100);
      // ensureUUID: nunca falha por external_reference inválido — gera fallback e loga
      const externalReference = ensureUUID(body.external_reference, 'external_reference');

      const mpBody = {
        transaction_amount: amount,
        description,
        payment_method_id: 'pix',
        external_reference: externalReference,
        payer: { 
          email: body.payer?.email || 'contato.vmbrasil@gmail.com', 
          first_name: 'Cliente', 
          last_name: 'VM Brasil' 
        },
      };

      console.log('[mercadopago] Sending to MP API:', JSON.stringify(mpBody));

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `pix-${externalReference}`,
        },
        body: JSON.stringify(mpBody),
      });

      const result = await response.json();
      console.log('[mercadopago] MP API response status:', response.status);
      
      if (!response.ok) {
        console.error('[mercadopago] MP API error:', JSON.stringify(result));
        return fallbackResponse(result.message || 'Serviço de pagamento temporariamente indisponível', {
          code: 'MP_CREATE_FAILED',
          status: response.status,
        });
      }

      const responseData = {
        payment_id: result.id,
        status: result.status,
        qr_code: result.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: result.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: result.point_of_interaction?.transaction_data?.ticket_url,
        expiration_date: result.date_of_expiration,
      };
      
      // Save mp_payment_id on the order for reconciliation when the order already exists.
      // Totem creates the order only after PIX approval + customer name, so the
      // external_reference is a temporary client_request_id at this stage.
      try {
        const supabaseAdmin = getSupabaseAdmin();
        await supabaseAdmin
          .from('orders')
          .update({ mp_payment_id: String(result.id) })
          .or(`id.eq.${externalReference},client_request_id.eq.${externalReference}`);
        console.log('[mercadopago] Reconciliation attempted for reference:', externalReference);
      } catch (e) {
        console.warn('[mercadopago] Could not save mp_payment_id:', e);
      }
      
      console.log('[mercadopago] PIX created successfully, payment_id:', result.id);
      return jsonResponse(responseData);
    }

    if (action === 'check_status') {
      const paymentId = body.payment_id;
      if (!paymentId) {
        return new Response(JSON.stringify({ error: 'payment_id obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      let orderId = body.order_id;
      console.log('[mercadopago] Checking status for payment:', paymentId, 'order_id from body:', orderId);
      
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (!response.ok) {
        console.error('[mercadopago] MP API error on check_status:', response.status);
        return fallbackResponse('Erro ao consultar pagamento', {
          code: 'MP_STATUS_FAILED',
          payment_id: paymentId,
          status: 'unknown',
        });
      }
      
      const result = await response.json();
      
      if (!orderId && result.external_reference) {
        orderId = result.external_reference;
        console.log('[mercadopago] Using external_reference as orderId:', orderId);
      }
      
      const statusData = {
        payment_id: result.id, 
        status: result.status, 
        status_detail: result.status_detail,
        date_approved: result.date_approved, 
        transaction_amount: result.transaction_amount,
        order_updated: false,
      };

      if (result.status === 'approved' && orderId) {
        try {
          const validOrderRef = validateUUID(orderId, 'order_id');
          const supabaseAdmin = getSupabaseAdmin();
          
          let { data: order, error: fetchErr } = await supabaseAdmin
            .from('orders')
            .select('id,status')
            .eq('id', validOrderRef)
            .maybeSingle();

          if (!order && !fetchErr) {
            const byClientRequest = await supabaseAdmin
              .from('orders')
              .select('id,status')
              .eq('client_request_id', validOrderRef)
              .maybeSingle();
            order = byClientRequest.data;
            fetchErr = byClientRequest.error;
          }

          if (fetchErr) {
            console.warn('[mercadopago] Order lookup failed:', fetchErr);
          }

          if (!order) {
            console.log('[mercadopago] Approved PIX has no order yet; waiting for frontend registration. Reference:', validOrderRef);
          }
          
          if (!fetchErr && order?.status === 'pending') {
            const { error: updateErr } = await supabaseAdmin
              .from('orders')
              .update({ 
                status: 'accepted',
                accepted_at: new Date().toISOString(),
                payment_confirmed: true,
                payment_confirmed_at: new Date().toISOString(),
                payment_confirmed_by: 'mercado-pago',
                mp_payment_id: String(paymentId),
                notes: `✅ PIX PAGO - MP #${paymentId}`,
              })
              .eq('id', order.id)
              .eq('status', 'pending');
            
            if (updateErr) {
              console.error('[mercadopago] Error updating order:', updateErr);
            } else {
              console.log('[mercadopago] Order updated to accepted:', order.id);
              statusData.order_updated = true;
            }
          } else {
            console.log('[mercadopago] Order not pending, skipping update. Status:', order?.status);
          }
        } catch (err) {
          console.error('[mercadopago] Failed to update order:', err);
        }
      }

      return jsonResponse(statusData);
    }

    if (action === 'get_payment_full') {
      const paymentId = body.payment_id;
      if (!paymentId) {
        return jsonResponse({ error: 'payment_id obrigatório' }, 400);
      }
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        return jsonResponse({ error: 'Falha ao consultar MP', status: response.status }, 502);
      }
      const result = await response.json();
      return jsonResponse(result);
    }

    if (action === 'finalize_totem_order') {
      const paymentId = validateString(String(body.payment_id || ''), 'payment_id', 80);
      const customerName = validateString(body.customer_name, 'Nome do cliente', 80).toUpperCase();
      const clientRequestId = validateUUID(body.client_request_id, 'client_request_id');
      const items = normalizeTotemItems(body.items);
      const submittedTotal = validateAmount(body.total);
      const calculatedTotal = Math.round(items.reduce((sum, item) => sum + Number(item.total_price), 0) * 100) / 100;

      if (Math.abs(submittedTotal - calculatedTotal) > 0.01) {
        throw new Error('Total do pedido não confere com os itens');
      }

      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!mpResponse.ok) {
        console.error('[mercadopago] Could not verify Totem PIX before finalizing:', mpResponse.status);
        return jsonResponse({ error: 'Não foi possível confirmar o pagamento. Chame o atendente.' }, 409);
      }

      const payment = await mpResponse.json();
      if (payment.status !== 'approved') {
        return jsonResponse({ error: 'Pagamento ainda não aprovado pelo Mercado Pago.', status: payment.status }, 409);
      }

      if (String(payment.external_reference || '') !== clientRequestId) {
        console.error('[mercadopago] Totem reference mismatch:', payment.external_reference, clientRequestId);
        return jsonResponse({ error: 'Pagamento não corresponde a este pedido. Chame o atendente.' }, 409);
      }

      if (Math.abs(Number(payment.transaction_amount || 0) - submittedTotal) > 0.01) {
        console.error('[mercadopago] Totem amount mismatch:', payment.transaction_amount, submittedTotal);
        return jsonResponse({ error: 'Valor pago não corresponde ao pedido. Chame o atendente.' }, 409);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const { data: orderId, error: orderError } = await supabaseAdmin.rpc('create_totem_order_with_items', {
        p_subtotal: submittedTotal,
        p_delivery_fee: 0,
        p_discount: 0,
        p_total: submittedTotal,
        p_payment_method: 'pix',
        p_items: JSON.stringify(items),
        p_change_for: null,
        p_notes: `✅ PIX PAGO - MP #${paymentId}`,
        p_customer_name: customerName,
        p_client_request_id: clientRequestId,
        p_mp_payment_id: paymentId,
      });

      if (orderError || !orderId) {
        console.error('[mercadopago] finalize_totem_order RPC failed:', orderError);
        return jsonResponse({ error: 'Pagamento aprovado, mas falhou ao registrar o pedido. Chame o atendente.', detail: orderError?.message }, 500);
      }

      return jsonResponse({ order_id: orderId, status: 'registered' });
    }

    if (action === 'search_by_amount') {
      // Busca pagamentos PIX recentes por valor exato (para localizar pedidos perdidos)
      const targetAmount = Number(body.amount);
      const hours = Number(body.hours ?? 12);
      if (!targetAmount || isNaN(targetAmount)) {
        return jsonResponse({ error: 'amount obrigatório' }, 400);
      }
      const beginDate = new Date(Date.now() - hours * 3600_000).toISOString();
      const endDate = new Date().toISOString();
      console.log('[mercadopago] Searching PIX by amount:', targetAmount, 'since', beginDate);

      const url = new URL('https://api.mercadopago.com/v1/payments/search');
      url.searchParams.set('sort', 'date_created');
      url.searchParams.set('criteria', 'desc');
      url.searchParams.set('range', 'date_created');
      url.searchParams.set('begin_date', beginDate);
      url.searchParams.set('end_date', endDate);
      url.searchParams.set('limit', '50');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[mercadopago] Search failed:', response.status, errText);
        return jsonResponse({ error: 'Falha ao buscar no MP', detail: errText }, 502);
      }

      const data = await response.json();
      const all = Array.isArray(data?.results) ? data.results : [];
      const matches = all.filter((p: any) =>
        Math.abs(Number(p?.transaction_amount ?? 0) - targetAmount) < 0.01
      ).map((p: any) => ({
        id: p.id,
        status: p.status,
        status_detail: p.status_detail,
        transaction_amount: p.transaction_amount,
        external_reference: p.external_reference,
        description: p.description,
        date_created: p.date_created,
        date_approved: p.date_approved,
        payer_email: p.payer?.email,
        payer_first_name: p.payer?.first_name,
        payer_last_name: p.payer?.last_name,
        payer_identification: p.payer?.identification,
      }));
      return jsonResponse({ count: matches.length, total_searched: all.length, matches });
    }

    if (action === 'cancel') {
      console.log('[mercadopago] Cancelling payment:', body.payment_id);
      
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${body.payment_id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${accessToken}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ status: 'cancelled' }),
      });

      if (!response.ok) {
        console.error('[mercadopago] MP API error on cancel:', response.status);
        return fallbackResponse('Erro ao cancelar pagamento', {
          code: 'MP_CANCEL_FAILED',
          payment_id: body.payment_id,
          status: 'unknown',
        });
      }

      const result = await response.json();
      
      return jsonResponse({ payment_id: result.id, status: result.status });
    }

    return jsonResponse({ error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('[mercadopago] Error:', error);
    return fallbackResponse(error instanceof Error ? error.message : 'Erro interno', { code: 'MP_UNEXPECTED' });
  }
});
