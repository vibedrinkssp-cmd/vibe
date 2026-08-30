
CREATE OR REPLACE FUNCTION public.insert_external_order_idempotent(
  p_platform text, p_order_number text, p_order_type text, p_status text,
  p_subtotal numeric, p_delivery_fee numeric, p_total numeric, p_payment_method text,
  p_customer_name text, p_salesperson text, p_notes text,
  p_address_street text DEFAULT NULL::text, p_address_number text DEFAULT NULL::text,
  p_address_neighborhood text DEFAULT NULL::text, p_address_city text DEFAULT 'São José dos Campos'::text,
  p_address_state text DEFAULT 'SP'::text, p_address_zip_code text DEFAULT NULL::text,
  p_address_complement text DEFAULT NULL::text, p_address_reference text DEFAULT NULL::text,
  p_payment_confirmed boolean DEFAULT false
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
  v_user_id uuid;
  v_address_id uuid;
  v_external_whatsapp text;
  v_street text;
  v_number text;
  v_neighborhood text;
  v_city text;
  v_state text;
BEGIN
  v_customer_norm := lower(trim(coalesce(p_customer_name, '')));
  v_lock_key := abs(hashtext(coalesce(p_platform, '') || ':' || coalesce(p_order_number, '') || ':' || v_customer_norm));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF p_order_number IS NOT NULL AND p_order_number <> '' THEN
    v_idempotency_tag := '"plataforma":"' || upper(p_platform) || '"';
    v_order_tag := '"pedido":"#' || p_order_number || '"';

    SELECT id INTO v_existing_id
    FROM public.orders
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

  IF p_order_type::public.order_type = 'delivery' THEN
    v_street := NULLIF(trim(coalesce(p_address_street, '')), '');
    v_number := NULLIF(trim(coalesce(p_address_number, '')), '');
    v_neighborhood := NULLIF(trim(coalesce(p_address_neighborhood, '')), '');
    v_city := COALESCE(NULLIF(trim(coalesce(p_address_city, '')), ''), 'São José dos Campos');
    v_state := COALESCE(NULLIF(trim(coalesce(p_address_state, '')), ''), 'SP');

    IF v_street IS NULL OR v_number IS NULL OR upper(v_number) = 'S/N' OR v_neighborhood IS NULL THEN
      RAISE EXCEPTION 'Pedido externo delivery sem endereço completo: rua, número e bairro são obrigatórios';
    END IF;

    v_external_whatsapp := 'EXT-' || upper(coalesce(p_platform, 'PLAT')) || '-' || coalesce(NULLIF(p_order_number, ''), replace(gen_random_uuid()::text, '-', ''));

    INSERT INTO public.users (name, whatsapp)
    VALUES (COALESCE(NULLIF(trim(p_customer_name), ''), 'Cliente ' || p_platform), v_external_whatsapp)
    ON CONFLICT (whatsapp) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_user_id;

    INSERT INTO public.addresses (
      user_id, street, number, complement, neighborhood, city, state, zip_code, notes, is_default
    ) VALUES (
      v_user_id,
      v_street,
      v_number,
      NULLIF(trim(coalesce(p_address_complement, '')), ''),
      v_neighborhood,
      v_city,
      v_state,
      NULLIF(regexp_replace(coalesce(p_address_zip_code, ''), '\D', '', 'g'), ''),
      NULLIF(trim(coalesce(p_address_reference, '')), ''),
      true
    )
    RETURNING id INTO v_address_id;
  END IF;

  INSERT INTO public.orders (
    user_id, address_id, order_type, status, subtotal, delivery_fee, discount, total,
    payment_method, customer_name, salesperson, notes,
    payment_confirmed, payment_confirmed_at, payment_confirmed_by,
    accepted_at
  ) VALUES (
    v_user_id, v_address_id, p_order_type::order_type, p_status::order_status, p_subtotal, p_delivery_fee, 0, p_total,
    p_payment_method::payment_method, p_customer_name, p_salesperson, p_notes,
    COALESCE(p_payment_confirmed, false),
    CASE WHEN COALESCE(p_payment_confirmed, false) THEN now() ELSE NULL END,
    CASE WHEN COALESCE(p_payment_confirmed, false) THEN p_platform || ' (online)' ELSE NULL END,
    CASE WHEN p_status = 'accepted' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id, 'duplicate', false, 'address_id', v_address_id, 'user_id', v_user_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.insert_external_order_idempotent(text, text, text, text, numeric, numeric, numeric, text, text, text, text, text, text, text, text, text, text, text, text, boolean) TO authenticated, anon, service_role;
