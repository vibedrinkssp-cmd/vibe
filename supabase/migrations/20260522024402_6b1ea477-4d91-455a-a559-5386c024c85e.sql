CREATE OR REPLACE FUNCTION public.get_session_summary()
 RETURNS TABLE(session_id uuid, session_status text, opened_at timestamp with time zone, opened_by text, opening_balance numeric, cash_sales numeric, pix_sales numeric, card_debit_sales numeric, card_credit_sales numeric, total_sales numeric, total_sangrias numeric, cash_supplies numeric, saques numeric, depositos numeric, fees numeric, saques_pix numeric, saques_card_credit numeric, saques_card_debit numeric, saques_vr numeric, expected_cash numeric, delivery_fees numeric, product_cost numeric, gross_profit numeric, total_orders bigint, counter_orders bigint, delivery_orders bigint, cash_pending numeric)
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

  SELECT COALESCE(SUM(s.amount), 0) INTO v_sangrias_total
  FROM public.sangrias s
  WHERE s.created_at >= v_session.opened_at
    AND s.closure_id IS NULL;

  SELECT
    COALESCE(SUM(CASE WHEN ct.type = 'saque' THEN ct.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'saque' THEN ct.fee ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'saque' AND ct.payment_method = 'pix' THEN ct.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'saque' AND ct.payment_method = 'card_credit' THEN ct.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'saque' AND ct.payment_method = 'card_debit' THEN ct.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'saque' AND ct.payment_method = 'vr' THEN ct.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'deposito' THEN ct.amount ELSE 0 END), 0)
  INTO v_saques, v_saque_fees, v_saques_pix, v_saques_credit, v_saques_debit, v_saques_vr, v_depositos
  FROM public.cash_transactions ct WHERE ct.session_id = v_session.id;

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