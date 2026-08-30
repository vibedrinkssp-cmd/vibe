-- 1) RPC SECURITY DEFINER para o cliente confirmar PIX no próprio pedido (bypass RLS).
-- Permite que clientes (login custom, sem auth.uid()) marquem o pedido como pago,
-- disparando o trigger trg_auto_accept_on_pix_confirm que move status pending → accepted.
CREATE OR REPLACE FUNCTION public.confirm_pix_payment_for_order(
  p_order_id uuid,
  p_mp_payment_id text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_user uuid;
  v_status order_status;
  v_payment_method payment_method;
BEGIN
  IF p_order_id IS NULL OR p_mp_payment_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios faltando';
  END IF;

  SELECT user_id, status, payment_method
    INTO v_order_user, v_status, v_payment_method
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order_user IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  -- Só o dono do pedido pode confirmar (idempotente: não falha se já confirmado)
  IF v_order_user <> p_user_id THEN
    RAISE EXCEPTION 'Pedido pertence a outro usuário';
  END IF;

  IF v_payment_method <> 'pix' THEN
    RAISE EXCEPTION 'Pedido não é PIX';
  END IF;

  -- Marca como pago (trigger auto_accept_on_pix_confirm move pending → accepted)
  UPDATE public.orders
     SET mp_payment_id = COALESCE(mp_payment_id, p_mp_payment_id),
         payment_confirmed = true,
         payment_confirmed_at = COALESCE(payment_confirmed_at, now()),
         payment_confirmed_by = COALESCE(payment_confirmed_by, 'Mercado Pago (PIX)')
   WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_pix_payment_for_order(uuid, text, uuid) TO anon, authenticated;

-- 2) Backfill do pedido travado: paga e aceito mas com flags erradas
UPDATE public.orders
   SET payment_confirmed = true,
       payment_confirmed_at = COALESCE(payment_confirmed_at, now()),
       payment_confirmed_by = COALESCE(payment_confirmed_by, 'Mercado Pago (PIX)'),
       mp_payment_id = COALESCE(mp_payment_id, '155425514661'),
       status = CASE WHEN status = 'pending' THEN 'accepted'::order_status ELSE status END,
       accepted_at = COALESCE(accepted_at, now())
 WHERE id = '208e18fe-c5b3-40b7-b440-7f2c0bb97c30'
   AND status = 'pending';