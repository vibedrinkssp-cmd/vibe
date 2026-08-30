-- ============================================================
-- ATOMIC ORDER CREATION: pedido + itens em transação única
-- Resolve o bug de pedidos órfãos sem itens quando a 2ª RPC falhava
-- ============================================================

-- 1) DELIVERY (site / cliente final)
CREATE OR REPLACE FUNCTION public.create_delivery_order_with_items(
  p_user_id uuid,
  p_address_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method payment_method,
  p_items text,
  p_change_for numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_delivery_distance numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_items jsonb;
  v_item_count integer;
  v_item jsonb;
BEGIN
  -- Validar items ANTES de criar pedido
  IF p_items IS NULL OR length(trim(p_items)) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  v_items := p_items::jsonb;
  v_item_count := jsonb_array_length(v_items);
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  -- Validar cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_item->>'product_name') IS NULL OR length(v_item->>'product_name') = 0 THEN
      RAISE EXCEPTION 'Item sem nome de produto';
    END IF;
    IF (v_item->>'quantity')::integer IS NULL OR (v_item->>'quantity')::integer <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida no item: %', v_item->>'product_name';
    END IF;
    IF (v_item->>'unit_price')::numeric IS NULL OR (v_item->>'unit_price')::numeric < 0 THEN
      RAISE EXCEPTION 'Preço unitário inválido no item: %', v_item->>'product_name';
    END IF;
  END LOOP;

  -- Criar pedido
  INSERT INTO public.orders (
    user_id, address_id, subtotal, delivery_fee, discount, total,
    payment_method, change_for, notes, delivery_distance, order_type, status
  ) VALUES (
    p_user_id, p_address_id, p_subtotal, COALESCE(p_delivery_fee, 0),
    COALESCE(p_discount, 0), p_total, p_payment_method, p_change_for, p_notes,
    p_delivery_distance, 'delivery', 'pending'
  )
  RETURNING id INTO v_order_id;

  -- Inserir itens (mesma transação — rollback automático se falhar)
  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  SELECT
    v_order_id,
    NULLIF(json_item->>'product_id','')::uuid,
    json_item->>'product_name',
    (json_item->>'quantity')::integer,
    (json_item->>'unit_price')::numeric,
    (json_item->>'total_price')::numeric
  FROM jsonb_array_elements(v_items) AS json_item;

  RETURN v_order_id;
END;
$$;

-- 2) COUNTER (PDV)
CREATE OR REPLACE FUNCTION public.create_counter_order_with_items(
  p_subtotal numeric,
  p_total numeric,
  p_payment_method payment_method,
  p_items text,
  p_user_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_change_for numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_delivery_fee numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_salesperson text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_items jsonb;
  v_item jsonb;
BEGIN
  IF p_items IS NULL OR length(trim(p_items)) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  v_items := p_items::jsonb;
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_item->>'product_name') IS NULL OR length(v_item->>'product_name') = 0 THEN
      RAISE EXCEPTION 'Item sem nome de produto';
    END IF;
    IF (v_item->>'quantity')::integer IS NULL OR (v_item->>'quantity')::integer <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;
  END LOOP;

  INSERT INTO public.orders (
    user_id, customer_name, subtotal, delivery_fee, discount, total,
    payment_method, change_for, notes, salesperson, order_type, status
  ) VALUES (
    p_user_id, p_customer_name, p_subtotal, COALESCE(p_delivery_fee, 0),
    COALESCE(p_discount, 0), p_total, p_payment_method, p_change_for, p_notes,
    p_salesperson, 'counter', 'accepted'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  SELECT
    v_order_id,
    NULLIF(json_item->>'product_id','')::uuid,
    json_item->>'product_name',
    (json_item->>'quantity')::integer,
    (json_item->>'unit_price')::numeric,
    (json_item->>'total_price')::numeric
  FROM jsonb_array_elements(v_items) AS json_item;

  RETURN v_order_id;
END;
$$;

-- 3) TOTEM
CREATE OR REPLACE FUNCTION public.create_totem_order_with_items(
  p_subtotal numeric,
  p_total numeric,
  p_payment_method payment_method,
  p_items text,
  p_user_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_change_for numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_delivery_fee numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_salesperson text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_items jsonb;
  v_item jsonb;
  v_status order_status;
BEGIN
  IF p_items IS NULL OR length(trim(p_items)) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  v_items := p_items::jsonb;
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens não pode ser criado';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_item->>'product_name') IS NULL OR length(v_item->>'product_name') = 0 THEN
      RAISE EXCEPTION 'Item sem nome de produto';
    END IF;
  END LOOP;

  -- Totem PIX fica pending até confirmação; cartão/cash já aceito
  v_status := CASE WHEN p_payment_method = 'pix' THEN 'pending'::order_status ELSE 'accepted'::order_status END;

  INSERT INTO public.orders (
    user_id, customer_name, subtotal, delivery_fee, discount, total,
    payment_method, change_for, notes, salesperson, order_type, status
  ) VALUES (
    p_user_id, p_customer_name, p_subtotal, COALESCE(p_delivery_fee, 0),
    COALESCE(p_discount, 0), p_total, p_payment_method, p_change_for, p_notes,
    p_salesperson, 'counter', v_status
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  SELECT
    v_order_id,
    NULLIF(json_item->>'product_id','')::uuid,
    json_item->>'product_name',
    (json_item->>'quantity')::integer,
    (json_item->>'unit_price')::numeric,
    (json_item->>'total_price')::numeric
  FROM jsonb_array_elements(v_items) AS json_item;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delivery_order_with_items TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_counter_order_with_items TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_totem_order_with_items TO anon, authenticated;

-- LIMPEZA: remover pedidos órfãos sem itens (>2min de idade) já no banco
DELETE FROM public.orders o
WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
  AND o.created_at < NOW() - INTERVAL '2 minutes'
  AND (o.notes IS NULL OR o.notes NOT LIKE '%META%');