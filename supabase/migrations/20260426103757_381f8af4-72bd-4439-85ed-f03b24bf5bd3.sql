-- Totem: PIX já vem confirmado pelo polling do app antes da tela de nome.
-- Se o método de pagamento for PIX, sempre aceita o pedido (mp_payment_id é opcional).
CREATE OR REPLACE FUNCTION public.create_totem_order_with_items(
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method payment_method,
  p_items text,
  p_change_for numeric DEFAULT NULL::numeric,
  p_notes text DEFAULT NULL::text,
  p_customer_name text DEFAULT 'Totem'::text,
  p_client_request_id uuid DEFAULT NULL::uuid,
  p_mp_payment_id text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_items jsonb;
  v_existing uuid;
  v_status public.order_status := 'pending';
  v_payment_confirmed boolean := false;
  v_payment_confirmed_at timestamptz := null;
  v_payment_confirmed_by text := null;
  v_customer_name text;
  v_clean_payment_id text;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.orders
    WHERE client_request_id = p_client_request_id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_items IS NULL OR length(trim(p_items)) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  BEGIN
    v_items := p_items::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Itens do pedido inválidos: %', SQLERRM;
  END;

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  v_customer_name := NULLIF(btrim(COALESCE(p_customer_name, '')), '');
  IF v_customer_name IS NULL THEN
    v_customer_name := 'CLIENTE';
  END IF;

  v_clean_payment_id := NULLIF(btrim(COALESCE(p_mp_payment_id, '')), '');

  -- Totem: PIX é sempre confirmado pelo app via polling antes da tela de nome.
  -- Aceita imediatamente (mp_payment_id é opcional, apenas para rastreio).
  IF p_payment_method = 'pix' THEN
    v_status := 'accepted';
    v_payment_confirmed := true;
    v_payment_confirmed_at := now();
    v_payment_confirmed_by := COALESCE('mercado-pago-totem' || CASE WHEN v_clean_payment_id IS NOT NULL THEN ' #' || v_clean_payment_id ELSE '' END, 'totem');
  END IF;

  INSERT INTO public.orders (
    order_type, subtotal, delivery_fee, discount, total, payment_method,
    change_for, notes, customer_name, status, accepted_at,
    payment_confirmed, payment_confirmed_at, payment_confirmed_by,
    mp_payment_id, client_request_id
  )
  VALUES (
    'totem', p_subtotal, p_delivery_fee, p_discount, p_total, p_payment_method,
    p_change_for, p_notes, upper(v_customer_name), v_status,
    CASE WHEN v_status = 'accepted' THEN now() ELSE NULL END,
    v_payment_confirmed, v_payment_confirmed_at, v_payment_confirmed_by,
    v_clean_payment_id, p_client_request_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price, is_wizard_item)
  SELECT
    v_order_id,
    CASE
      WHEN NULLIF(json_item->>'product_id','') IS NULL THEN NULL
      WHEN (json_item->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (json_item->>'product_id')::uuid
      ELSE NULL
    END,
    COALESCE(NULLIF(json_item->>'product_name',''), 'ITEM'),
    GREATEST(COALESCE(NULLIF(json_item->>'quantity','')::integer, 1), 1),
    COALESCE(NULLIF(json_item->>'unit_price','')::numeric, 0),
    COALESCE(NULLIF(json_item->>'total_price','')::numeric, 0),
    COALESCE((json_item->>'is_wizard_item')::boolean, false)
  FROM jsonb_array_elements(v_items) AS json_item;

  RETURN v_order_id;
EXCEPTION WHEN unique_violation THEN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.orders
    WHERE client_request_id = p_client_request_id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;
  RAISE;
END;
$function$;

-- Permitir que clientes anônimos (totem opera sem login) chamem a RPC
GRANT EXECUTE ON FUNCTION public.create_totem_order_with_items(
  numeric, numeric, numeric, numeric, payment_method, text, numeric, text, text, uuid, text
) TO anon, authenticated;