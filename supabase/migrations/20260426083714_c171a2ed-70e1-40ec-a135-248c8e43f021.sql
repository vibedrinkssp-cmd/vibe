DROP FUNCTION IF EXISTS public.create_totem_order_with_items(
  numeric,
  numeric,
  numeric,
  numeric,
  public.payment_method,
  text,
  numeric,
  text,
  text,
  uuid
);