-- RPC para caixa/admin/PDV marcar manualmente que o pagamento de qualquer pedido foi recebido.
-- Bate olho no card → clica → fica roxo claro = "finalizado, sem pendência".
-- NÃO altera status do pedido, só marca a flag payment_confirmed.
CREATE OR REPLACE FUNCTION public.confirm_order_payment_manual(
  p_order_id uuid,
  p_confirmed_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already boolean;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id é obrigatório';
  END IF;

  -- Só admin/pdv podem confirmar manualmente
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pdv'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar pagamento';
  END IF;

  SELECT COALESCE(payment_confirmed, false)
    INTO v_already
  FROM public.orders
  WHERE id = p_order_id;

  IF v_already IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'already_confirmed', true);
  END IF;

  UPDATE public.orders
     SET payment_confirmed = true,
         payment_confirmed_at = now(),
         payment_confirmed_by = COALESCE(p_confirmed_by, 'Caixa (manual)')
   WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_confirmed', false,
    'order_id', p_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_order_payment_manual(uuid, text) TO authenticated;