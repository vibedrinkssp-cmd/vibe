CREATE OR REPLACE FUNCTION public.insert_external_order_idempotent(
  p_platform text,
  p_order_number text,
  p_order_type text,
  p_status text,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_payment_method text,
  p_customer_name text,
  p_salesperson text,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lock_key bigint;
  v_existing_id uuid;
  v_new_id uuid;
  v_idempotency_tag text;
  v_order_tag text;
  v_customer_norm text;
BEGIN
  v_customer_norm := lower(trim(coalesce(p_customer_name, '')));
  v_lock_key := abs(hashtext(p_platform || ':' || p_order_number || ':' || v_customer_norm));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF p_order_number IS NOT NULL AND p_order_number <> '' THEN
    v_idempotency_tag := '"plataforma":"' || upper(p_platform) || '"';
    v_order_tag := '"pedido":"#' || p_order_number || '"';

    -- Janela de 6h E mesmo cliente (case-insensitive, trim).
    -- Pedidos antigos com mesmo número MAS cliente diferente NAO bloqueiam
    -- (iFood reusa numeros entre clientes diferentes em curto prazo).
    SELECT id INTO v_existing_id
    FROM orders
    WHERE notes LIKE '%' || v_idempotency_tag || '%'
      AND notes LIKE '%' || v_order_tag || '%'
      AND created_at > now() - interval '6 hours'
      AND lower(trim(coalesce(customer_name, ''))) = v_customer_norm
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  INSERT INTO orders (
    order_type, status, subtotal, delivery_fee, discount, total,
    payment_method, customer_name, salesperson, notes,
    payment_confirmed, payment_confirmed_at, payment_confirmed_by,
    accepted_at
  ) VALUES (
    p_order_type::order_type, p_status::order_status, p_subtotal, p_delivery_fee, 0, p_total,
    p_payment_method::payment_method, p_customer_name, p_salesperson, p_notes,
    true, now(), p_platform,
    CASE WHEN p_status = 'accepted' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id, 'duplicate', false);
END;
$function$;