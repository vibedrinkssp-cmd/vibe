-- Drop conflicting overloads, keep only the 10-arg version with p_client_request_id
DROP FUNCTION IF EXISTS public.create_totem_order_with_items(
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method payment_method,
  p_items text,
  p_change_for numeric,
  p_notes text,
  p_customer_name text
);

DROP FUNCTION IF EXISTS public.create_totem_order_with_items(
  p_subtotal numeric,
  p_total numeric,
  p_payment_method payment_method,
  p_items text,
  p_user_id uuid,
  p_customer_name text,
  p_change_for numeric,
  p_notes text,
  p_delivery_fee numeric,
  p_discount numeric,
  p_salesperson text
);