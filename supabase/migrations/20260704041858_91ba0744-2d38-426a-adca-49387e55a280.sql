
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS original_payment_method text;

-- Confirma o pagamento de um pedido de entrega no fechamento do motoboy.
-- p_as_cash = true  -> entra no caixa físico como dinheiro (valor = p_amount ou total)
-- p_as_cash = false -> apenas marca como conferido (máquina POS / cartão), sem afetar o caixa
CREATE OR REPLACE FUNCTION public.confirm_delivery_payment(
  p_order_id uuid,
  p_responsible text DEFAULT 'admin',
  p_as_cash boolean DEFAULT false,
  p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
  v_final_amount numeric;
BEGIN
  SELECT id, payment_method, payment_confirmed, total, status, original_payment_method
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado');
  END IF;

  IF p_as_cash THEN
    v_final_amount := COALESCE(p_amount, v_order.total);
    UPDATE public.orders
    SET original_payment_method = COALESCE(original_payment_method, payment_method),
        payment_method = 'cash',
        cash_received = v_final_amount,
        payment_confirmed = true,
        payment_confirmed_at = now(),
        payment_confirmed_by = COALESCE(p_responsible, 'admin')
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'as_cash', true, 'amount', v_final_amount);
  ELSE
    -- Máquina POS / cartão: apenas confere, não entra no caixa de dinheiro
    UPDATE public.orders
    SET payment_confirmed = true,
        payment_confirmed_at = now(),
        payment_confirmed_by = COALESCE(p_responsible, 'admin')
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'as_cash', false, 'amount', v_order.total);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_delivery_payment(uuid, text, boolean, numeric) TO authenticated, anon, service_role;

-- Desfaz a confirmação, restaurando a forma de pagamento original quando foi forçada para dinheiro.
CREATE OR REPLACE FUNCTION public.unconfirm_delivery_payment(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, payment_method, original_payment_method, order_type
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado');
  END IF;

  IF v_order.order_type = 'counter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedidos de balcão não podem ser revertidos');
  END IF;

  UPDATE public.orders
  SET payment_method = COALESCE(original_payment_method, payment_method),
      original_payment_method = NULL,
      cash_received = NULL,
      payment_confirmed = false,
      payment_confirmed_at = NULL,
      payment_confirmed_by = NULL
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unconfirm_delivery_payment(uuid) TO authenticated, anon, service_role;
