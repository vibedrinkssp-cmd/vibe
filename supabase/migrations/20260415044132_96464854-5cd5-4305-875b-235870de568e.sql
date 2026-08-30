
-- RPC: motoboy changes payment method on an assigned order
CREATE OR REPLACE FUNCTION public.change_order_payment_motoboy(
  p_motoboy_id uuid,
  p_order_id uuid,
  p_payment_method payment_method
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate the order belongs to this motoboy and is in a changeable status
  IF NOT EXISTS (
    SELECT 1 FROM orders
    WHERE id = p_order_id
      AND motoboy_id = p_motoboy_id
      AND status IN ('dispatched', 'arrived')
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não pode ser alterado';
  END IF;

  -- Update the payment method and reset payment confirmation
  UPDATE orders
  SET payment_method = p_payment_method,
      payment_confirmed = CASE
        WHEN p_payment_method IN ('card_credit', 'card_debit') THEN false
        WHEN p_payment_method = 'pix' THEN false
        ELSE payment_confirmed
      END,
      payment_confirmed_at = CASE
        WHEN p_payment_method IN ('card_credit', 'card_debit', 'pix') THEN NULL
        ELSE payment_confirmed_at
      END,
      payment_confirmed_by = CASE
        WHEN p_payment_method IN ('card_credit', 'card_debit', 'pix') THEN NULL
        ELSE payment_confirmed_by
      END,
      mp_payment_id = CASE
        WHEN p_payment_method = 'pix' THEN NULL
        ELSE mp_payment_id
      END
  WHERE id = p_order_id;
END;
$$;
