
CREATE OR REPLACE FUNCTION public.create_totem_order(
  p_subtotal numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_total numeric DEFAULT 0,
  p_payment_method payment_method DEFAULT 'cash',
  p_change_for numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_customer_name text DEFAULT 'Totem',
  p_salesperson text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO orders (
    order_type, status, subtotal, delivery_fee, discount, total,
    payment_method, change_for, notes, customer_name, salesperson, user_id
  )
  VALUES (
    'totem', 'pending', p_subtotal, p_delivery_fee, p_discount, p_total,
    p_payment_method, p_change_for, p_notes, p_customer_name, p_salesperson, p_user_id
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id::text;
END;
$$;
