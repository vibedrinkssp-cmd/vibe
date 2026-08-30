
CREATE OR REPLACE FUNCTION public.get_session_summary()
RETURNS TABLE(
  session_id UUID,
  session_status TEXT,
  opened_at TIMESTAMPTZ,
  opened_by TEXT,
  opening_balance NUMERIC,
  cash_sales NUMERIC,
  pix_sales NUMERIC,
  card_debit_sales NUMERIC,
  card_credit_sales NUMERIC,
  total_sales NUMERIC,
  total_sangrias NUMERIC,
  cash_supplies NUMERIC,
  saques NUMERIC,
  depositos NUMERIC,
  fees NUMERIC,
  expected_cash NUMERIC,
  delivery_fees NUMERIC,
  product_cost NUMERIC,
  gross_profit NUMERIC,
  total_orders BIGINT,
  counter_orders BIGINT,
  delivery_orders BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_sales RECORD;
  v_sangrias_total NUMERIC;
  v_saques NUMERIC;
  v_depositos NUMERIC;
  v_depositos_total NUMERIC;
  v_saque_fees NUMERIC;
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
      0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  SELECT 
    COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total ELSE 0 END), 0) AS cash,
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

  -- SAQ/DEP from cash_transactions
  SELECT 
    COALESCE(SUM(CASE WHEN ct.type = 'saque' THEN ct.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'deposito' THEN ct.amount ELSE 0 END), 0),
    -- deposito total (amount + fee) = cash that physically enters the register
    COALESCE(SUM(CASE WHEN ct.type = 'deposito' THEN ct.total ELSE 0 END), 0),
    COALESCE(SUM(ct.fee), 0)
  INTO v_saques, v_depositos, v_depositos_total, v_saque_fees
  FROM public.cash_transactions ct
  WHERE ct.session_id = v_session.id;

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
    v_depositos,
    v_saque_fees,
    -- expected_cash: depositos usam total (amount+fee) pois cliente entrega tudo em cash
    (v_session.opening_balance + v_sales.cash + COALESCE(v_session.cash_supplies, 0) + v_depositos_total - v_sangrias_total - v_saques),
    v_sales.delivery_fees,
    0::NUMERIC,
    v_sales.total + v_saque_fees,
    v_sales.total_orders,
    v_sales.counter_orders,
    v_sales.delivery_orders;
END;
$$;
