CREATE OR REPLACE FUNCTION public.create_delivery_order_with_items(p_user_id uuid, p_address_id uuid, p_subtotal numeric, p_delivery_fee numeric, p_discount numeric, p_total numeric, p_payment_method payment_method, p_items text, p_change_for numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_delivery_distance numeric DEFAULT NULL::numeric, p_client_request_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_items jsonb;
  v_existing uuid;
  v_resolved_name text;
  v_address_user_id uuid;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.orders
    WHERE client_request_id = p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  -- GUARD anti-duplicidade PIX: se já existe pedido PIX recente (15 min)
  -- do mesmo cliente com mesmo total, reutiliza ao invés de criar novo.
  -- Evita que cliente que perdeu o QR/fechou app gere 2º pedido após reconcile.
  IF p_payment_method = 'pix'::payment_method AND p_user_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM public.orders
    WHERE user_id = p_user_id
      AND payment_method = 'pix'::payment_method
      AND status IN ('pending'::order_status, 'accepted'::order_status, 'preparing'::order_status)
      AND abs(total - p_total) < 0.01
      AND created_at > now() - interval '15 minutes'
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Cliente obrigatório para pedido delivery'; END IF;
  IF p_address_id IS NULL THEN RAISE EXCEPTION 'Endereço obrigatório para pedido delivery'; END IF;

  SELECT user_id INTO v_address_user_id FROM public.addresses WHERE id = p_address_id LIMIT 1;
  IF v_address_user_id IS NULL THEN RAISE EXCEPTION 'Endereço não encontrado'; END IF;
  IF v_address_user_id <> p_user_id THEN RAISE EXCEPTION 'Endereço não pertence ao cliente do pedido'; END IF;

  IF p_items IS NULL OR length(trim(p_items)) = 0 THEN RAISE EXCEPTION 'Pedido sem itens não pode ser criado'; END IF;

  v_items := p_items::jsonb;
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  v_resolved_name := NULLIF(trim(coalesce(p_customer_name, '')), '');
  IF v_resolved_name IS NULL THEN
    SELECT name INTO v_resolved_name FROM public.users WHERE id = p_user_id LIMIT 1;
  END IF;

  INSERT INTO public.orders (
    user_id, address_id, order_type, subtotal, delivery_fee, discount, total,
    payment_method, change_for, notes, delivery_distance, status, client_request_id, customer_name
  )
  VALUES (
    p_user_id, p_address_id, 'delivery', p_subtotal, p_delivery_fee, p_discount, p_total,
    p_payment_method, p_change_for, p_notes, p_delivery_distance, 'pending', p_client_request_id, v_resolved_name
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price, is_wizard_item)
  SELECT v_order_id,
    NULLIF(json_item->>'product_id','')::uuid,
    json_item->>'product_name',
    (json_item->>'quantity')::integer,
    (json_item->>'unit_price')::numeric,
    (json_item->>'total_price')::numeric,
    COALESCE((json_item->>'is_wizard_item')::boolean, false)
  FROM jsonb_array_elements(v_items) AS json_item;

  RETURN v_order_id;
END;
$function$;