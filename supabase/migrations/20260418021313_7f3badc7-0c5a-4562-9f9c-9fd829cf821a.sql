
-- Drop functions that change signature
DROP FUNCTION IF EXISTS public.get_saq_dep_summary();

-- 1) create_cash_transaction: only saque
CREATE OR REPLACE FUNCTION public.create_cash_transaction(
  p_type text,
  p_amount numeric,
  p_payment_method text DEFAULT NULL,
  p_responsible text DEFAULT 'PDV',
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fee numeric;
  v_total numeric;
  v_session_id uuid;
  v_tx_id uuid;
  v_current_balance numeric;
BEGIN
  IF p_type <> 'saque' THEN
    RAISE EXCEPTION 'Apenas operações de saque são suportadas. Tipo recebido: %', p_type;
  END IF;

  IF p_amount < 5 OR p_amount % 5 != 0 THEN
    RAISE EXCEPTION 'Valor deve ser múltiplo de R$ 5 (mínimo R$ 5)';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('pix','card_credit','card_debit','vr') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida para saque (use PIX, crédito, débito ou VR)';
  END IF;

  v_fee := p_amount * 0.5;
  v_total := p_amount + v_fee;

  SELECT id, current_balance INTO v_session_id, v_current_balance
  FROM cash_register_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: O caixa está fechado. Realize a abertura de caixa antes de operar saques.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_current_balance IS NOT NULL AND v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente no caixa. Disponível: R$ %', v_current_balance;
  END IF;

  INSERT INTO cash_transactions (type, amount, fee, total, payment_method, responsible, notes, session_id)
  VALUES ('saque', p_amount, v_fee, v_total, p_payment_method, COALESCE(NULLIF(p_responsible, ''), 'PDV'), p_notes, v_session_id)
  RETURNING id INTO v_tx_id;

  UPDATE cash_register_sessions
  SET current_balance = current_balance - p_amount
  WHERE id = v_session_id;

  RETURN v_tx_id;
END;
$function$;

-- 2) get_saq_dep_summary: simplified
CREATE FUNCTION public.get_saq_dep_summary()
RETURNS TABLE(
  total_saques numeric,
  total_fees numeric,
  count_saques bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(ct.amount), 0) as total_saques,
    COALESCE(SUM(ct.fee), 0) as total_fees,
    COUNT(*)::bigint as count_saques
  FROM cash_transactions ct
  WHERE ct.type = 'saque'
    AND ct.session_id = (
      SELECT id FROM cash_register_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1
    );
$function$;

-- 3) get_current_cash_balance (signature kept for compat: depositos always 0)
CREATE OR REPLACE FUNCTION public.get_current_cash_balance()
RETURNS TABLE(
  session_id uuid,
  session_status text,
  opened_at timestamp with time zone,
  opening_balance numeric,
  cash_sales numeric,
  sangrias numeric,
  cash_supplies numeric,
  saques numeric,
  depositos numeric,
  current_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_cash_sales NUMERIC;
  v_sangrias NUMERIC;
  v_saques NUMERIC;
BEGIN
  SELECT s.* INTO v_session
  FROM public.cash_register_sessions s
  WHERE s.status = 'open'
  ORDER BY s.opened_at DESC
  LIMIT 1;

  IF v_session IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID, 'closed'::TEXT, NULL::TIMESTAMPTZ,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(o.total), 0) INTO v_cash_sales
  FROM public.orders o
  WHERE o.created_at >= v_session.opened_at
    AND o.payment_method = 'cash'
    AND o.status NOT IN ('cancelled', 'pending');

  SELECT COALESCE(SUM(sg.amount), 0) INTO v_sangrias
  FROM public.sangrias sg
  WHERE sg.created_at >= v_session.opened_at;

  SELECT COALESCE(SUM(ct.amount), 0) INTO v_saques
  FROM public.cash_transactions ct
  WHERE ct.session_id = v_session.id AND ct.type = 'saque';

  RETURN QUERY SELECT
    v_session.id,
    v_session.status,
    v_session.opened_at,
    v_session.opening_balance,
    v_cash_sales,
    v_sangrias,
    COALESCE(v_session.cash_supplies, 0),
    v_saques,
    0::NUMERIC AS depositos,
    (v_session.opening_balance
      + v_cash_sales
      + COALESCE(v_session.cash_supplies, 0)
      - v_sangrias
      - v_saques);
END;
$function$;

-- 4) get_session_summary (keep depositos col = 0; fees count as profit)
CREATE OR REPLACE FUNCTION public.get_session_summary()
RETURNS TABLE(
  session_id uuid,
  session_status text,
  opened_at timestamp with time zone,
  opened_by text,
  opening_balance numeric,
  cash_sales numeric,
  pix_sales numeric,
  card_debit_sales numeric,
  card_credit_sales numeric,
  total_sales numeric,
  total_sangrias numeric,
  cash_supplies numeric,
  saques numeric,
  depositos numeric,
  fees numeric,
  expected_cash numeric,
  delivery_fees numeric,
  product_cost numeric,
  gross_profit numeric,
  total_orders bigint,
  counter_orders bigint,
  delivery_orders bigint
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

  SELECT 
    COALESCE(SUM(ct.amount), 0),
    COALESCE(SUM(ct.fee), 0)
  INTO v_saques, v_saque_fees
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
    (v_session.opening_balance + v_sales.cash + COALESCE(v_session.cash_supplies, 0) - v_sangrias_total - v_saques),
    v_sales.delivery_fees,
    0::NUMERIC,
    v_sales.total + v_saque_fees,
    v_sales.total_orders,
    v_sales.counter_orders,
    v_sales.delivery_orders;
END;
$function$;
