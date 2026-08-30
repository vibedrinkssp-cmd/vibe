-- 1. RPC para admin confirmar recebimento físico do dinheiro do motoboy
CREATE OR REPLACE FUNCTION public.confirm_cash_received(
  p_order_id uuid,
  p_responsible text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, payment_method, payment_confirmed, total, status
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

  IF v_order.payment_confirmed = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recebimento já confirmado');
  END IF;

  UPDATE public.orders
  SET payment_confirmed = true,
      payment_confirmed_at = now(),
      payment_confirmed_by = COALESCE(p_responsible, 'admin')
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'amount', v_order.total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_cash_received(uuid, text) TO authenticated, anon, service_role;

-- 2. Atualizar get_session_summary para que pedidos CASH só entrem como cash_sales
--    APÓS confirmação do admin (payment_confirmed = true). Pedidos counter/PDV
--    são confirmados na hora (trigger) mantendo comportamento atual; delivery
--    cash precisa do botão "RECEBIMENTO CONCLUÍDO" para entrar no caixa.
DROP FUNCTION IF EXISTS public.get_session_summary();

CREATE OR REPLACE FUNCTION public.get_session_summary()
 RETURNS TABLE(
   session_id uuid, session_status text, opened_at timestamp with time zone, opened_by text,
   opening_balance numeric, cash_sales numeric, pix_sales numeric, card_debit_sales numeric, card_credit_sales numeric,
   total_sales numeric, total_sangrias numeric, cash_supplies numeric,
   saques numeric, depositos numeric, fees numeric,
   saques_pix numeric, saques_card_credit numeric, saques_card_debit numeric, saques_vr numeric,
   expected_cash numeric, delivery_fees numeric, product_cost numeric, gross_profit numeric,
   total_orders bigint, counter_orders bigint, delivery_orders bigint,
   cash_pending numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_sales RECORD;
  v_sangrias_total NUMERIC;
  v_saques NUMERIC;
  v_saque_fees NUMERIC;
  v_saques_pix NUMERIC;
  v_saques_credit NUMERIC;
  v_saques_debit NUMERIC;
  v_saques_vr NUMERIC;
BEGIN
  SELECT s.* INTO v_session
  FROM public.cash_register_sessions s
  WHERE s.status = 'open'
  ORDER BY s.opened_at DESC
  LIMIT 1;

  IF v_session IS NULL THEN
    RETURN QUERY SELECT 
      NULL::UUID, 'closed'::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      0::BIGINT, 0::BIGINT, 0::BIGINT, 0::NUMERIC;
    RETURN;
  END IF;

  SELECT 
    -- CASH só entra no caixa quando payment_confirmed = true (counter PDV é true automático;
    -- delivery em dinheiro depende do botão RECEBIMENTO CONCLUÍDO)
    COALESCE(SUM(CASE WHEN o.payment_method = 'cash' AND COALESCE(o.payment_confirmed, false) = true THEN o.total ELSE 0 END), 0) AS cash,
    -- pendente de receber (motoboy ainda não entregou ao admin)
    COALESCE(SUM(CASE WHEN o.payment_method = 'cash' AND COALESCE(o.payment_confirmed, false) = false THEN o.total ELSE 0 END), 0) AS cash_pending,
    COALESCE(SUM(CASE WHEN o.payment_method = 'pix' THEN o.total ELSE 0 END), 0) AS pix,
    COALESCE(SUM(CASE WHEN o.payment_method = 'card_debit' THEN o.total ELSE 0 END), 0) AS card_debit,
    COALESCE(SUM(CASE WHEN o.payment_method = 'card_credit' THEN o.total ELSE 0 END), 0) AS card_credit,
    COALESCE(SUM(o.total), 0) AS total,
    COALESCE(SUM(o.delivery_fee), 0) AS delivery_fees,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE o.order_type = 'counter') AS counter_orders,
    COUNT(*) FILTER (WHERE o.order_type = 'delivery') AS delivery_orders
  INTO v_sales
  FROM public.orders o
  WHERE o.created_at >= v_session.opened_at
    AND o.status NOT IN ('cancelled', 'pending');

  SELECT COALESCE(SUM(sg.amount), 0) INTO v_sangrias_total
  FROM public.sangrias sg
  WHERE sg.created_at >= v_session.opened_at;

  SELECT 
    COALESCE(SUM(ct.amount), 0),
    COALESCE(SUM(ct.fee), 0),
    COALESCE(SUM(CASE WHEN ct.payment_method = 'pix'         THEN ct.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.payment_method = 'card_credit' THEN ct.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.payment_method = 'card_debit'  THEN ct.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.payment_method = 'vr'          THEN ct.total ELSE 0 END), 0)
  INTO v_saques, v_saque_fees, v_saques_pix, v_saques_credit, v_saques_debit, v_saques_vr
  FROM public.cash_transactions ct
  WHERE ct.session_id = v_session.id AND ct.type = 'saque';

  RETURN QUERY SELECT 
    v_session.id,
    v_session.status,
    v_session.opened_at,
    v_session.opened_by,
    v_session.opening_balance,
    v_sales.cash,
    v_sales.pix,
    v_sales.card_debit,
    v_sales.card_credit,
    v_sales.total,
    v_sangrias_total,
    COALESCE(v_session.cash_supplies, 0),
    v_saques,
    0::NUMERIC AS depositos,
    v_saque_fees,
    v_saques_pix,
    v_saques_credit,
    v_saques_debit,
    v_saques_vr,
    (v_session.opening_balance + v_sales.cash + COALESCE(v_session.cash_supplies, 0) - v_sangrias_total - v_saques),
    v_sales.delivery_fees,
    0::NUMERIC,
    v_sales.total + v_saque_fees,
    v_sales.total_orders,
    v_sales.counter_orders,
    v_sales.delivery_orders,
    v_sales.cash_pending;
END;
$function$;

-- 3. Garantir que pedidos COUNTER (PDV balcão) em cash sejam auto-confirmados
--    pois o dinheiro entra direto no caixa físico no momento da venda.
--    Só delivery cash precisa do botão.
CREATE OR REPLACE FUNCTION public.auto_confirm_counter_cash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Counter (balcão/PDV) em dinheiro: confirma na hora
  IF NEW.order_type = 'counter' AND NEW.payment_method = 'cash' AND COALESCE(NEW.payment_confirmed, false) = false THEN
    NEW.payment_confirmed := true;
    NEW.payment_confirmed_at := now();
    NEW.payment_confirmed_by := 'pdv-counter';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_confirm_counter_cash ON public.orders;
CREATE TRIGGER trg_auto_confirm_counter_cash
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_confirm_counter_cash();

-- 4. Marcar pedidos counter/cash existentes não confirmados como confirmados
--    (legado — eles já foram contados no caixa antes desta mudança)
UPDATE public.orders
SET payment_confirmed = true,
    payment_confirmed_at = COALESCE(payment_confirmed_at, created_at),
    payment_confirmed_by = COALESCE(payment_confirmed_by, 'legacy-counter')
WHERE payment_method = 'cash'
  AND order_type = 'counter'
  AND COALESCE(payment_confirmed, false) = false;