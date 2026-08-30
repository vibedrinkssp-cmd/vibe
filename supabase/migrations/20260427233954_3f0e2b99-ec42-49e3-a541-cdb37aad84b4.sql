-- RPC para reverter a confirmação de recebimento em dinheiro
-- (usada quando admin desfaz a baixa no fechamento do motoboy)
CREATE OR REPLACE FUNCTION public.unconfirm_cash_received(
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
  SELECT id, payment_method, payment_confirmed, total, order_type
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado');
  END IF;

  IF v_order.payment_method <> 'cash' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não é em dinheiro');
  END IF;

  -- Não permite reverter pedidos counter (PDV balcão), pois o dinheiro já foi
  -- recebido fisicamente no momento da venda.
  IF v_order.order_type = 'counter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedidos de balcão não podem ser revertidos');
  END IF;

  UPDATE public.orders
  SET payment_confirmed = false,
      payment_confirmed_at = NULL,
      payment_confirmed_by = NULL
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'amount', v_order.total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unconfirm_cash_received(uuid) TO authenticated, anon, service_role;