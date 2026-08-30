
-- =====================================================
-- SAQ/DEP: Sistema de Saque e Depósito de Dinheiro
-- Taxa: 50% (R$ 5 a cada R$ 10)
-- =====================================================

-- Dropar funções existentes para recriar com nova assinatura
DROP FUNCTION IF EXISTS public.get_session_summary();
DROP FUNCTION IF EXISTS public.get_current_cash_balance();

-- 9. Recriar get_session_summary com SAQ/DEP
CREATE OR REPLACE FUNCTION public.get_session_summary()
RETURNS TABLE (
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
  total_saques NUMERIC,
  total_depositos NUMERIC,
  saq_dep_fees NUMERIC,
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
  v_sangrias NUMERIC;
  v_saq_dep RECORD;
BEGIN
  -- Buscar sessão aberta
  SELECT * INTO v_session
  FROM public.cash_register_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
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

  -- Calcular vendas por método de pagamento
  SELECT 
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash,
    COALESCE(SUM(CASE WHEN payment_method = 'pix' THEN total ELSE 0 END), 0) AS pix,
    COALESCE(SUM(CASE WHEN payment_method = 'card_debit' THEN total ELSE 0 END), 0) AS card_debit,
    COALESCE(SUM(CASE WHEN payment_method = 'card_credit' THEN total ELSE 0 END), 0) AS card_credit,
    COALESCE(SUM(total), 0) AS total,
    COALESCE(SUM(delivery_fee), 0) AS delivery_fees,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE order_type = 'counter') AS counter_orders,
    COUNT(*) FILTER (WHERE order_type = 'delivery') AS delivery_orders
  INTO v_sales
  FROM public.orders
  WHERE created_at >= v_session.opened_at
    AND status NOT IN ('cancelled', 'pending');

  -- Calcular sangrias
  SELECT COALESCE(SUM(amount), 0) INTO v_sangrias
  FROM public.sangrias
  WHERE created_at >= v_session.opened_at
    AND type = 'sangria';

  -- Calcular SAQ/DEP
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'saque' THEN amount ELSE 0 END), 0) AS saques,
    COALESCE(SUM(CASE WHEN type = 'deposito' THEN total ELSE 0 END), 0) AS depositos,
    COALESCE(SUM(fee), 0) AS fees
  INTO v_saq_dep
  FROM public.cash_transactions
  WHERE session_id = v_session.id;

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
    v_sangrias,
    COALESCE(v_session.cash_supplies, 0),
    v_saq_dep.saques,
    v_saq_dep.depositos,
    v_saq_dep.fees,
    -- expected_cash = abertura + vendas_cash + suprimentos + depositos - sangrias - saques
    (v_session.opening_balance + v_sales.cash + COALESCE(v_session.cash_supplies, 0) + v_saq_dep.depositos - v_sangrias - v_saq_dep.saques),
    v_sales.delivery_fees,
    0::NUMERIC, -- product_cost placeholder
    (v_sales.total - 0), -- gross_profit placeholder
    v_sales.total_orders,
    v_sales.counter_orders,
    v_sales.delivery_orders;
END;
$$;

-- 10. Recriar get_current_cash_balance com SAQ/DEP
CREATE OR REPLACE FUNCTION public.get_current_cash_balance()
RETURNS TABLE (
  session_id UUID,
  session_status TEXT,
  opened_at TIMESTAMPTZ,
  opening_balance NUMERIC,
  cash_sales NUMERIC,
  cash_withdrawals NUMERIC,
  cash_supplies NUMERIC,
  total_saques NUMERIC,
  total_depositos NUMERIC,
  current_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_cash_sales NUMERIC;
  v_sangrias NUMERIC;
  v_saq_dep RECORD;
BEGIN
  SELECT * INTO v_session
  FROM public.cash_register_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session IS NULL THEN
    RETURN QUERY SELECT 
      NULL::UUID, 'closed'::TEXT, NULL::TIMESTAMPTZ,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- Vendas em dinheiro
  SELECT COALESCE(SUM(total), 0) INTO v_cash_sales
  FROM public.orders
  WHERE created_at >= v_session.opened_at
    AND payment_method = 'cash'
    AND status NOT IN ('cancelled', 'pending');

  -- Sangrias
  SELECT COALESCE(SUM(amount), 0) INTO v_sangrias
  FROM public.sangrias
  WHERE created_at >= v_session.opened_at
    AND type = 'sangria';

  -- SAQ/DEP
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'saque' THEN amount ELSE 0 END), 0) AS saques,
    COALESCE(SUM(CASE WHEN type = 'deposito' THEN total ELSE 0 END), 0) AS depositos
  INTO v_saq_dep
  FROM public.cash_transactions
  WHERE session_id = v_session.id;

  RETURN QUERY SELECT 
    v_session.id,
    v_session.status,
    v_session.opened_at,
    v_session.opening_balance,
    v_cash_sales,
    v_sangrias,
    COALESCE(v_session.cash_supplies, 0),
    v_saq_dep.saques,
    v_saq_dep.depositos,
    (v_session.opening_balance + v_cash_sales + COALESCE(v_session.cash_supplies, 0) + v_saq_dep.depositos - v_sangrias - v_saq_dep.saques);
END;
$$;
