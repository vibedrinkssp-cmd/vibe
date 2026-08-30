-- create_delivery_order_with_items: propagar is_wizard_item
CREATE OR REPLACE FUNCTION public.create_delivery_order_with_items(
  p_user_id uuid, p_address_id uuid, p_subtotal numeric, p_delivery_fee numeric,
  p_discount numeric, p_total numeric, p_payment_method payment_method,
  p_items text, p_change_for numeric DEFAULT NULL::numeric,
  p_notes text DEFAULT NULL::text, p_delivery_distance numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_items jsonb;
  v_item_count integer;
  v_item jsonb;
BEGIN
  IF p_items IS NULL OR length(trim(p_items)) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;
  v_items := p_items::jsonb;
  v_item_count := jsonb_array_length(v_items);
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_item->>'product_name') IS NULL OR length(v_item->>'product_name') = 0 THEN
      RAISE EXCEPTION 'Item sem nome detectado';
    END IF;
  END LOOP;

  INSERT INTO public.orders (user_id, address_id, order_type, subtotal, delivery_fee, discount, total, payment_method, change_for, notes, delivery_distance, status)
  VALUES (p_user_id, p_address_id, 'delivery', p_subtotal, p_delivery_fee, p_discount, p_total, p_payment_method, p_change_for, p_notes, p_delivery_distance, 'pending')
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price, is_wizard_item)
  SELECT
    v_order_id,
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

-- create_counter_order_with_items
CREATE OR REPLACE FUNCTION public.create_counter_order_with_items(
  p_subtotal numeric, p_delivery_fee numeric, p_discount numeric, p_total numeric,
  p_payment_method payment_method, p_items text,
  p_user_id uuid DEFAULT NULL, p_change_for numeric DEFAULT NULL,
  p_notes text DEFAULT NULL, p_customer_name text DEFAULT 'Balcão',
  p_salesperson text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_items jsonb;
BEGIN
  IF p_items IS NULL OR length(trim(p_items)) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;
  v_items := p_items::jsonb;
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  INSERT INTO public.orders (user_id, order_type, subtotal, delivery_fee, discount, total, payment_method, change_for, notes, customer_name, salesperson, status)
  VALUES (p_user_id, 'counter', p_subtotal, p_delivery_fee, p_discount, p_total, p_payment_method, p_change_for, p_notes, COALESCE(p_customer_name, 'Balcão'), p_salesperson, 'pending')
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price, is_wizard_item)
  SELECT
    v_order_id,
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

-- create_totem_order_with_items
CREATE OR REPLACE FUNCTION public.create_totem_order_with_items(
  p_subtotal numeric, p_delivery_fee numeric, p_discount numeric, p_total numeric,
  p_payment_method payment_method, p_items text,
  p_change_for numeric DEFAULT NULL, p_notes text DEFAULT NULL,
  p_customer_name text DEFAULT 'Totem'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_items jsonb;
BEGIN
  IF p_items IS NULL OR length(trim(p_items)) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;
  v_items := p_items::jsonb;
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  INSERT INTO public.orders (order_type, subtotal, delivery_fee, discount, total, payment_method, change_for, notes, customer_name, status)
  VALUES ('totem', p_subtotal, p_delivery_fee, p_discount, p_total, p_payment_method, p_change_for, p_notes, COALESCE(p_customer_name, 'Totem'), 'pending')
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price, is_wizard_item)
  SELECT
    v_order_id,
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