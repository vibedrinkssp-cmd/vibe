CREATE OR REPLACE FUNCTION public.confirm_totem_payment(p_order_id uuid, p_confirmed_by text DEFAULT null)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orders
  SET payment_confirmed = true,
      payment_confirmed_at = now(),
      payment_confirmed_by = COALESCE(p_confirmed_by, 'caixa')
  WHERE id = p_order_id;
END;
$$;