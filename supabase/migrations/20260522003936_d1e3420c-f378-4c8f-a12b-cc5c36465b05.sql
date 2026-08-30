
-- 1) Coluna cash_received em orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cash_received numeric;

COMMENT ON COLUMN public.orders.cash_received IS
  'Valor real recebido em dinheiro (usado quando iFood/plataforma deu desconto ao cliente, e o motoboy recebeu menos que orders.total). Se NULL, usa orders.total.';

-- 2) confirm_cash_received aceita p_amount opcional
CREATE OR REPLACE FUNCTION public.confirm_cash_received(
  p_order_id uuid,
  p_responsible text DEFAULT 'admin'::text,
  p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_final_amount numeric;
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

  -- Se valor informado e diferente do total, salva como cash_received
  IF p_amount IS NOT NULL AND p_amount >= 0 THEN
    v_final_amount := p_amount;
  ELSE
    v_final_amount := v_order.total;
  END IF;

  UPDATE public.orders
  SET payment_confirmed = true,
      payment_confirmed_at = now(),
      payment_confirmed_by = COALESCE(p_responsible, 'admin'),
      cash_received = CASE
        WHEN p_amount IS NOT NULL AND p_amount >= 0 AND p_amount <> v_order.total
          THEN p_amount
        ELSE NULL
      END
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'amount', v_final_amount,
    'order_total', v_order.total,
    'discount_from_platform', v_order.total - v_final_amount
  );
END;
$function$;

-- 3) unconfirm_cash_received também limpa cash_received
CREATE OR REPLACE FUNCTION public.unconfirm_cash_received(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_order.order_type = 'counter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedidos de balcão não podem ser revertidos');
  END IF;

  UPDATE public.orders
  SET payment_confirmed = false,
      payment_confirmed_at = NULL,
      payment_confirmed_by = NULL,
      cash_received = NULL
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'amount', v_order.total);
END;
$function$;

-- 4) get_session_summary: usa COALESCE(cash_received, total) para cash_sales e cash_pending
CREATE OR REPLACE FUNCTION public.get_session_summary()
RETURNS TABLE(
  session_id uuid, session_status text, opened_at timestamp with time zone,
  opened_by text, opening_balance numeric, cash_sales numeric, pix_sales numeric,
  card_debit_sales numeric, card_credit_sales numeric, total_sales numeric,
  total_sangrias numeric, cash_supplies numeric, saques numeric, depositos numeric,
  fees numeric, saques_pix numeric, saques_card_credit numeric, saques_card_debit numeric,
  saques_vr numeric, expected_cash numeric, delivery_fees numeric, product_cost numeric,
  gross_profit numeric, total_orders bigint, counter_orders bigint, delivery_orders bigint,
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
  v_depositos NUMERIC;
BEGIN
  SELECT * INTO v_session FROM public.cash_register_sessions
  WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;

  IF v_session.id IS NULL THEN RETURN; END IF;

  SELECT
    -- CASH só entra no caixa quando payment_confirmed = true.
    -- Usa cash_received quando definido (ex.: iFood com cupom),
    -- senão usa o total do pedido.
    COALESCE(SUM(CASE
      WHEN o.payment_method = 'cash' AND COALESCE(o.payment_confirmed, false) = true
        THEN COALESCE(o.cash_received, o.total)
      ELSE 0 END), 0) AS cash,
    COALESCE(SUM(CASE
      WHEN o.payment_method = 'cash' AND COALESCE(o.payment_confirmed, false) = false
        THEN COALESCE(o.cash_received, o.total)
      ELSE 0 END), 0) AS cash_pending,
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
    AND o.status NOT IN ('cancelled');

  SELECT COALESCE(SUM(amount), 0) INTO v_sangrias_total
  FROM public.sangrias WHERE session_id = v_session.id;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'saque' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'saque' THEN fee ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'saque' AND payment_method = 'pix' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'saque' AND payment_method = 'card_credit' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'saque' AND payment_method = 'card_debit' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'saque' AND payment_method = 'vr' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'deposito' THEN amount ELSE 0 END), 0)
  INTO v_saques, v_saque_fees, v_saques_pix, v_saques_credit, v_saques_debit, v_saques_vr, v_depositos
  FROM public.cash_transactions WHERE session_id = v_session.id;

  RETURN QUERY SELECT
    v_session.id, v_session.status, v_session.opened_at, v_session.opened_by,
    v_session.opening_balance,
    v_sales.cash, v_sales.pix, v_sales.card_debit, v_sales.card_credit, v_sales.total,
    v_sangrias_total, COALESCE(v_session.cash_supplies, 0),
    v_saques, v_depositos, v_saque_fees,
    v_saques_pix, v_saques_credit, v_saques_debit, v_saques_vr,
    (v_session.opening_balance + v_sales.cash + COALESCE(v_session.cash_supplies, 0) - v_sangrias_total - v_saques),
    v_sales.delivery_fees,
    0::numeric AS product_cost,
    (v_sales.total - 0::numeric) AS gross_profit,
    v_sales.total_orders, v_sales.counter_orders, v_sales.delivery_orders,
    v_sales.cash_pending;
END;
$function$;
