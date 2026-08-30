import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { parseIfoodTicket, ticketToStructuredBody } from './parse-ifood.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

function parseCurrency(value: unknown): number {
  if (value == null || value === '') return 0;
  const normalized = String(value)
    .trim()
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQuantity(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeIncomingItems(items: any[]) {
  return items.map((item: any) => {
    const quantity = parseQuantity(item.quantity ?? item.qtd);
    const hasLegacyLineTotal = item.valor != null && item.valor !== '';
    const hasUnitPrice = item.unit_price != null && item.unit_price !== '';
    const hasTotalPrice = item.total_price != null && item.total_price !== '';

    let unitPrice = hasUnitPrice ? parseCurrency(item.unit_price) : 0;
    let totalPrice = hasTotalPrice
      ? parseCurrency(item.total_price)
      : hasLegacyLineTotal
        ? parseCurrency(item.valor)
        : unitPrice * quantity;

    if ((!hasUnitPrice || hasLegacyLineTotal) && totalPrice > 0) {
      unitPrice = totalPrice / quantity;
    }
    if (totalPrice <= 0 && unitPrice > 0) {
      totalPrice = unitPrice * quantity;
    }

    return {
      product_name: item.product_name || item.nome || 'Item',
      quantity,
      unit_price: Number(unitPrice.toFixed(2)),
      total_price: Number(totalPrice.toFixed(2)),
    };
  });
}

function ensureAddressHasNumber(rawAddress: string): string {
  const addr = (rawAddress || '').trim();
  if (!addr) return '';
  const hasNumber = /(?:^|[\s,;-])(\d{1,5})(?:[\s,;-]|$)/.test(addr);
  if (hasNumber) return addr;
  return `${addr.replace(/[\s,]+$/, '')}, S/N`;
}

interface AddressValidation {
  fullAddress: string;
  isComplete: boolean;
  missingFields: string[];
}

function buildStructuredAddress(body: any): AddressValidation {
  const street = (body.address_street || '').trim();
  const number = (body.address_number || '').trim();
  const complement = (body.address_complement || '').trim();
  const neighborhood = (body.address_neighborhood || body.bairro || '').trim();
  const city = (body.address_city || '').trim();
  const cep = (body.address_cep || '').trim();
  const reference = (body.address_reference || '').trim();
  const explicitlyIncomplete = body.address_incomplete === true;

  const missingFields: string[] = [];
  if (!street) missingFields.push('rua');
  if (!number || number.toUpperCase() === 'S/N') missingFields.push('numero');

  // Se temos campos estruturados, monta a string completa
  let fullAddress = '';
  if (street || number) {
    const parts: string[] = [];
    if (street) parts.push(street);
    if (number) parts.push(number);
    fullAddress = parts.join(', ');
  } else {
    // fallback para o campo legado `address`
    fullAddress = ensureAddressHasNumber((body.address || '').trim());
    // re-detecta missing baseado na string legada
    if (!fullAddress) missingFields.push('rua');
    if (/S\/N/i.test(fullAddress) || !/(?:^|[\s,;-])(\d{1,5})(?:[\s,;-]|$)/.test(fullAddress)) {
      if (!missingFields.includes('numero')) missingFields.push('numero');
    }
  }

  const isComplete = missingFields.length === 0 && !explicitlyIncomplete;

  return { fullAddress, isComplete, missingFields };
}

function buildMeta(
  body: any,
  normalizedOrderNumber: string,
  parsedServiceFee: number,
  parsedDeliveryFee: number,
  addressValidation: AddressValidation,
): string {
  const {
    platform, phone, store_name, order_date, delivery_estimate,
    locator_code, collection_code, delivery_type, payment_method,
    payment_status, address_complement, address_neighborhood, address_reference,
    address_city, address_cep, service_fee, delivery_fee_external, total_ifood,
    charge_customer, notes,
  } = body;

  const meta: Record<string, string> = {};
  meta['plataforma'] = platform.toUpperCase();
  if (normalizedOrderNumber) meta['pedido'] = `#${normalizedOrderNumber}`;
  if (store_name) meta['loja'] = store_name;
  if (order_date) meta['data'] = order_date;
  if (delivery_estimate) meta['previsao'] = delivery_estimate;
  if (locator_code) meta['localizador'] = locator_code;
  if (collection_code) meta['cod_coleta'] = collection_code;
  if (delivery_type) meta['tipo_entrega'] = delivery_type;
  if (phone) meta['telefone'] = phone;

  // Endereço — prefixa com aviso visual quando incompleto
  const addressParts = [
    addressValidation.fullAddress,
    address_complement ? `Comp: ${address_complement}` : '',
    address_neighborhood ? `Bairro: ${address_neighborhood}` : '',
    address_reference ? `Ref: ${address_reference}` : '',
    address_city || '',
    address_cep ? `CEP: ${address_cep}` : '',
  ].filter(Boolean);
  let enderecoFinal = addressParts.length > 0 ? addressParts.join(', ') : '';
  if (enderecoFinal && !addressValidation.isComplete) {
    enderecoFinal = `⚠️ INCOMPLETO ⚠️ ${enderecoFinal} [faltando: ${addressValidation.missingFields.join(', ')}]`;
  }
  if (enderecoFinal) meta['endereco'] = enderecoFinal;
  if (!addressValidation.isComplete) {
    meta['endereco_incompleto'] = 'true';
    meta['endereco_faltando'] = addressValidation.missingFields.join(',');
  }

  if (payment_method) meta['pagamento'] = payment_method;
  if (payment_status) meta['status_pgto'] = payment_status;
  if (service_fee) meta['taxa_servico'] = `R$ ${parsedServiceFee.toFixed(2)}`;
  if (delivery_fee_external) meta['taxa_entrega'] = `R$ ${parsedDeliveryFee.toFixed(2)}`;
  if (total_ifood) meta['total_ifood'] = `R$ ${parseCurrency(total_ifood).toFixed(2)}`;
  if (charge_customer != null) meta['cobrar_cliente'] = `R$ ${parseCurrency(charge_customer).toFixed(2)}`;
  if (body.discount_external && parseCurrency(body.discount_external) > 0) {
    meta['desconto'] = `R$ ${parseCurrency(body.discount_external).toFixed(2)}`;
  }
  if (body.incentive_ifood && parseCurrency(body.incentive_ifood) > 0) {
    meta['incentivo_ifood'] = `R$ ${parseCurrency(body.incentive_ifood).toFixed(2)}`;
  }
  if (body.incentive_promo && parseCurrency(body.incentive_promo) > 0) {
    meta['incentivo_promo'] = `R$ ${parseCurrency(body.incentive_promo).toFixed(2)}`;
  }
  if (body.subtotal_external) meta['subtotal'] = `R$ ${parseCurrency(body.subtotal_external).toFixed(2)}`;
  if (notes) meta['obs'] = notes;

  return `<!--META:${JSON.stringify(meta)}-->`;
}

function resolvePaymentMethod(payment_method?: string, payment_status?: string): { method: string; alreadyPaid: boolean } {
  const pm = (payment_method || '').toLowerCase();
  const ps = (payment_status || '').toLowerCase();

  // Sinais de pagamento ONLINE pela plataforma (já recebido pelo iFood/99, NÃO é dinheiro físico)
  const isOnline =
    pm.includes('online') ||
    pm.includes('carteira digital') ||
    pm.includes('wallet') ||
    pm.includes('outros') ||
    ps.includes('pago') ||
    ps.includes('paid');

  // 1) Detectar método específico (pelo texto)
  let method: string | null = null;
  if (pm.includes('pix')) method = 'pix';
  else if (pm.includes('créd') || pm.includes('cred')) method = 'card_credit';
  else if (pm.includes('déb') || pm.includes('deb')) method = 'card_debit';
  else if (pm.includes('dinheiro') || pm.includes('cash') || pm.includes('espécie')) method = 'cash';

  // 2) DINHEIRO físico: motoboy recebe em mãos. NÃO está pago, mesmo se status disser o contrário.
  //    (plataformas não cobram dinheiro adiantado)
  if (method === 'cash') {
    return { method: 'cash', alreadyPaid: false };
  }

  // 3) Pagamento ONLINE sem método específico identificado (ex: "Online - OUTROS",
  //    carteira iFood, vale-refeição online). NÃO pode entrar como cash no caixa físico.
  //    Mapeia para 'pix' (digital externo já recebido pela plataforma).
  if (!method && isOnline) {
    return { method: 'pix', alreadyPaid: true };
  }

  // 4) Sem nenhum sinal claro → assume dinheiro a receber pelo motoboy
  if (!method) {
    return { method: 'cash', alreadyPaid: false };
  }

  // 5) Método eletrônico identificado: pago online se houver sinal explícito
  return { method, alreadyPaid: isOnline };
}

async function getOrderItemsCount(supabase: any, orderId: string): Promise<number> {
  const { count, error } = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId);

  if (error) {
    throw new Error(`Failed to verify order items: ${error.message}`);
  }

  return count ?? 0;
}

async function ensureOrderItemsPersisted(
  supabase: any,
  orderId: string,
  normalizedItems: Array<{ product_name: string; quantity: number; unit_price: number; total_price: number }>,
  options: { platform: string; normalizedOrderNumber: string; canRollbackOrder: boolean },
): Promise<{ itemCount: number; healedMissingItems: boolean }> {
  const existingCount = await getOrderItemsCount(supabase, orderId);

  if (existingCount > 0) {
    console.log(`[receive-external-order] items already present for ${options.platform} #${options.normalizedOrderNumber} -> ${orderId} (${existingCount} items)`);
    return { itemCount: existingCount, healedMissingItems: false };
  }

  console.warn(`[receive-external-order] order ${orderId} has no items yet; inserting/recovering ${normalizedItems.length} items`);

  const orderItems = normalizedItems.map((item) => ({
    order_id: orderId,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);

  if (itemsError) {
    console.error('Items insert error:', itemsError);

    if (options.canRollbackOrder) {
      const { error: rollbackError } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (rollbackError) {
        console.error('Rollback delete error:', rollbackError);
      } else {
        console.warn(`[receive-external-order] rolled back orphan external order ${orderId} after item insert failure`);
      }
    }

    throw new Error(`Failed to save order items: ${itemsError.message}`);
  }

  const finalCount = await getOrderItemsCount(supabase, orderId);
  if (finalCount <= 0) {
    if (options.canRollbackOrder) {
      const { error: rollbackError } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (rollbackError) {
        console.error('Rollback delete error after zero-item verification:', rollbackError);
      }
    }

    throw new Error('Order item verification failed after insert');
  }

  console.log(`[receive-external-order] items persisted for ${options.platform} #${options.normalizedOrderNumber} -> ${orderId} (${finalCount} items)`);
  return { itemCount: finalCount, healedMissingItems: true };
}

async function quarantineTicket(
  supabase: any,
  args: {
    platform: string;
    sourceFilename: string | null;
    rawText: string;
    failureReason: string;
    failureDetails?: Record<string, unknown>;
    parsedSummary?: Record<string, unknown>;
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('external_order_quarantine')
      .insert({
        platform: args.platform,
        source_filename: args.sourceFilename,
        raw_text: args.rawText,
        failure_reason: args.failureReason,
        failure_details: args.failureDetails ?? null,
        parsed_summary: args.parsedSummary ?? null,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[receive-external-order] quarantine insert failed:', error);
      return null;
    }
    console.warn(`[receive-external-order] ticket quarantined id=${data.id} reason="${args.failureReason}" file=${args.sourceFilename || '-'}`);
    return data.id;
  } catch (e) {
    console.error('[receive-external-order] quarantine exception:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Health check (sem auth) ─────────────────────────────────────────────
  const url = new URL(req.url);
  if (req.method === 'GET' && (url.pathname.endsWith('/health') || url.searchParams.has('health'))) {
    let dbOk = false;
    let dbError: string | null = null;
    try {
      const sb = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { error } = await sb.from('orders').select('id', { count: 'exact', head: true }).limit(1);
      dbOk = !error;
      dbError = error?.message ?? null;
    } catch (e: any) {
      dbError = e.message;
    }
    return new Response(JSON.stringify({
      status: dbOk ? 'ok' : 'degraded',
      service: 'receive-external-order',
      timestamp: new Date().toISOString(),
      api_key_configured: !!Deno.env.get('EXTERNAL_ORDER_API_KEY'),
      db_ok: dbOk,
      db_error: dbError,
    }), {
      status: dbOk ? 200 : 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Auth check
    const apiKey = req.headers.get('x-api-key')?.trim();
    const expectedKey = Deno.env.get('EXTERNAL_ORDER_API_KEY')?.trim();
    if (!expectedKey || !apiKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: any = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Bot v4 (ultra-thin): { platform, raw_text, source_filename } ──
    // Toda a extração roda aqui via parser estruturado por âncoras.
    let sourceFilename: string | null = null;
    if (body && typeof body === 'object' && typeof body.raw_text === 'string' && body.raw_text.length > 0) {
      const platformIn = String(body.platform || 'ifood').toLowerCase();
      sourceFilename = typeof body.source_filename === 'string' ? body.source_filename : null;

      console.log(`[receive-external-order] RAW_TEXT mode platform=${platformIn} file=${sourceFilename || '-'} bytes=${body.raw_text.length}`);

      if (platformIn !== 'ifood') {
        const qid = await quarantineTicket(supabase, {
          platform: platformIn,
          sourceFilename,
          rawText: body.raw_text,
          failureReason: `Parser server-side ainda não disponível para "${platformIn}"`,
        });
        return new Response(JSON.stringify({
          error: `Parser server-side ainda não disponível para "${platformIn}". Use payload estruturado.`,
          quarantine_id: qid,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let parsed;
      try {
        parsed = parseIfoodTicket(body.raw_text);
      } catch (parseErr: any) {
        console.error('[receive-external-order] parse error:', parseErr);
        const qid = await quarantineTicket(supabase, {
          platform: platformIn,
          sourceFilename,
          rawText: body.raw_text,
          failureReason: 'Falha ao interpretar ticket bruto',
          failureDetails: { message: parseErr.message, stack: parseErr.stack?.slice(0, 1000) },
        });
        return new Response(JSON.stringify({
          error: 'Falha ao interpretar ticket bruto',
          details: parseErr.message,
          quarantine_id: qid,
        }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (parsed.missing_fields && parsed.missing_fields.length > 0) {
        console.warn(
          `[receive-external-order] non-blocking missing fields: ${parsed.missing_fields.join(', ')} (file=${sourceFilename})`,
        );
        // Se nome do cliente faltou, persiste raw_text em quarentena pra auditoria/melhorar parser
        if (parsed.missing_fields.includes('customer_name')) {
          try {
            await quarantineTicket(supabase, {
              platform: platformIn,
              sourceFilename,
              rawText: body.raw_text,
              failureReason: 'customer_name não extraído (pedido seguiu como Cliente iFood)',
              parsedSummary: { pedido: parsed.order_number, missing_fields: parsed.missing_fields },
            });
          } catch (qErr) {
            console.error('[receive-external-order] falha ao gravar quarentena auditoria:', qErr);
          }
        }
      }

      if (!parsed.itens || parsed.itens.length === 0) {
        const qid = await quarantineTicket(supabase, {
          platform: platformIn,
          sourceFilename,
          rawText: body.raw_text,
          failureReason: 'Nenhum item identificado no ticket bruto',
          parsedSummary: { pedido: parsed.order_number, cliente: parsed.customer_name, missing_fields: parsed.missing_fields },
        });
        return new Response(JSON.stringify({
          error: 'Nenhum item identificado no ticket bruto',
          parsed_summary: { pedido: parsed.order_number, cliente: parsed.customer_name },
          quarantine_id: qid,
        }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      body = ticketToStructuredBody(parsed);
      body.notes = sourceFilename ? `Arquivo: ${sourceFilename}` : '';
    }

    const { platform, order_number, customer_name, items, payment_method } = body;

    if (!platform || !items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields: platform, items' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedOrderNumber = String(order_number ?? '').replace(/^#/, '');

    console.log(`[receive-external-order] platform=${platform}, order_number=${normalizedOrderNumber}, customer=${customer_name}, items=${items.length}`);

    // ── Normalize items and calculate totals ──
    const normalizedItems = normalizeIncomingItems(items);
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.total_price, 0);
    const parsedDeliveryFee = body.delivery_fee_external ? parseCurrency(body.delivery_fee_external) : 0;
    const parsedServiceFee = body.service_fee ? parseCurrency(body.service_fee) : 0;
    
    // ─── REGRA DE OURO DO TOTAL ───
    // "Cobrar do cliente" no ticket iFood JÁ inclui taxas e QUALQUER cupom/desconto
    // aplicado pelo cliente. É a única fonte de verdade do valor que o operador
    // deve cobrar na entrega. Nunca recalcular por subtotal+taxas, pois:
    //   1) modificadores podem inflar a soma dos itens
    //   2) cupons de loja/clube/iFood podem não estar parseados
    // Para pedidos pagos online (PIX/cartão pelo iFood), charge_customer=0 e
    // usamos total_ifood (valor faturado) para registro contábil.
    const chargeCustomer = body.charge_customer ? parseCurrency(body.charge_customer) : 0;
    const totalIfood = body.total_ifood ? parseCurrency(body.total_ifood) : 0;
    const parsedDiscount = body.discount_external ? parseCurrency(body.discount_external) : 0;
    const computedTotal = +(subtotal + parsedDeliveryFee + parsedServiceFee - parsedDiscount).toFixed(2);

    let orderTotal: number;
    let orderSubtotal: number = subtotal;

    if (chargeCustomer > 0) {
      // Pagamento na entrega: ticket manda. Reconstruímos subtotal pra fechar matemática
      // (subtotal + delivery_fee = total no schema, sem coluna de service_fee).
      orderTotal = chargeCustomer;
      orderSubtotal = Math.max(+(chargeCustomer - parsedDeliveryFee).toFixed(2), 0);
      if (Math.abs(orderSubtotal - subtotal) > 0.5) {
        console.log(
          `[receive-external-order] ⚠️ subtotal ajustado de R$ ${subtotal.toFixed(2)} ` +
          `para R$ ${orderSubtotal.toFixed(2)} (cobrar_cliente=${chargeCustomer.toFixed(2)} ` +
          `manda — provável cupom/modificador duplicado)`,
        );
      }
    } else if (totalIfood > 0) {
      // Pago online — usa o valor faturado pelo iFood (já líquido de incentivos)
      orderTotal = totalIfood;
      orderSubtotal = Math.max(+(totalIfood - parsedDeliveryFee).toFixed(2), 0);
    } else if (computedTotal > 0) {
      orderTotal = computedTotal;
    } else {
      orderTotal = subtotal + parsedDeliveryFee;
    }

    const { method: paymentMethodDb, alreadyPaid } = resolvePaymentMethod(payment_method, body.payment_status);

    // Validação estrita do endereço
    const addressValidation = buildStructuredAddress(body);
    console.log(`[receive-external-order] address complete=${addressValidation.isComplete} missing=[${addressValidation.missingFields.join(',')}] full="${addressValidation.fullAddress}"`);

    const orderNotes = buildMeta(body, normalizedOrderNumber, parsedServiceFee, parsedDeliveryFee, addressValidation);

    const rpcParams = {
      p_platform: platform,
      p_order_number: normalizedOrderNumber,
      p_order_type: 'delivery',
      p_status: 'accepted',
      p_subtotal: orderSubtotal,
      p_delivery_fee: parsedDeliveryFee,
      p_total: orderTotal,
      p_payment_method: paymentMethodDb,
      p_customer_name: customer_name || `Cliente ${platform}`,
      p_salesperson: platform.toLowerCase(),
      p_notes: orderNotes,
      p_address_street: body.address_street || null,
      p_address_number: body.address_number || null,
      p_address_neighborhood: body.address_neighborhood || body.bairro || null,
      p_address_city: body.address_city || 'São José dos Campos',
      p_address_state: body.address_state || 'SP',
      p_address_zip_code: body.address_cep || null,
      p_address_complement: body.address_complement || null,
      p_address_reference: body.address_reference || null,
      p_payment_confirmed: alreadyPaid,
    };

    // ── Atomic idempotent insert via advisory lock RPC ──
    let { data: rpcResult, error: rpcError } = await supabase.rpc('insert_external_order_idempotent', rpcParams);

    if (rpcError) {
      console.error('Order insert RPC error:', rpcError);
      return new Response(JSON.stringify({ error: 'Failed to create order', details: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let orderId = rpcResult.id;
    let isDuplicate = rpcResult.duplicate;

    // ── Detecção de fantasma: ID retornado como duplicata mas linha não existe ──
    if (isDuplicate) {
      const { data: ghostCheck, error: ghostErr } = await supabase
        .from('orders')
        .select('id')
        .eq('id', orderId)
        .maybeSingle();

      if (ghostErr) {
        console.error('Ghost check error:', ghostErr);
      }

      if (!ghostCheck) {
        console.warn(`[receive-external-order] GHOST detected: id ${orderId} not found in orders. Forcing fresh insert with bypass.`);
        // Bypass: muda o platform string para forçar não-match na RPC, depois renomeia via UPDATE
        const bypassPlatform = `${platform}__ghostbypass_${Date.now()}`;
        const retry = await supabase.rpc('insert_external_order_idempotent', {
          ...rpcParams,
          p_platform: bypassPlatform,
        });
        if (retry.error) {
          console.error('Ghost retry RPC error:', retry.error);
          return new Response(JSON.stringify({ error: 'Failed to create order after ghost retry', details: retry.error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        orderId = retry.data.id;
        isDuplicate = false;
        // Restaura salesperson e notes (que podem ter o nome bypass)
        await supabase
          .from('orders')
          .update({ salesperson: platform.toLowerCase(), notes: orderNotes })
          .eq('id', orderId);
      }
    }

    const itemSync = await ensureOrderItemsPersisted(supabase, orderId, normalizedItems, {
      platform,
      normalizedOrderNumber,
      canRollbackOrder: !isDuplicate,
    });

    const auditPayload = {
      wasInserted: !isDuplicate,
      wasDuplicate: isDuplicate,
      addressComplete: addressValidation.isComplete,
      missingFields: addressValidation.missingFields,
    };

    if (isDuplicate) {
      console.log(`[receive-external-order] DUPLICATE detected (advisory lock): ${platform} #${normalizedOrderNumber} -> ${orderId}`);
      return new Response(JSON.stringify({
        success: true,
        order_id: orderId,
        message: itemSync.healedMissingItems
          ? `Pedido ${platform} #${normalizedOrderNumber} recuperado com itens`
          : `Pedido ${platform} #${normalizedOrderNumber} já existe (idempotente)`,
        duplicate: true,
        healed_missing_items: itemSync.healedMissingItems,
        item_count: itemSync.itemCount,
        ...auditPayload,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Confirmação de pagamento já é gravada atomicamente na RPC (p_payment_confirmed).
    // Pedidos em dinheiro / a cobrar na máquina entram como NÃO pagos (motoboy cobra).


    // ── Persist discount when ticket has incentives ──
    if (parsedDiscount > 0) {
      const { error: discErr } = await supabase
        .from('orders')
        .update({ discount: parsedDiscount })
        .eq('id', orderId);
      if (discErr) console.error('Discount update error:', discErr);
    }

    return new Response(JSON.stringify({
      success: true,
      order_id: orderId,
      message: `Pedido ${platform} criado com sucesso`,
      item_count: itemSync.itemCount,
      ...auditPayload,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});