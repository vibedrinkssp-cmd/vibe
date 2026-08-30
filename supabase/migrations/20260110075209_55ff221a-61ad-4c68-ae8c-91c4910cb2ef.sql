-- Criar função get_session_summary que retorna resumo completo da sessão aberta
CREATE OR REPLACE FUNCTION public.get_session_summary()
RETURNS TABLE(
  session_id UUID,
  opened_at TIMESTAMPTZ,
  opened_by TEXT,
  opening_balance NUMERIC,
  cash_supplies NUMERIC,
  cash_sales NUMERIC,
  total_sales NUMERIC,
  pix_sales NUMERIC,
  card_credit_sales NUMERIC,
  card_debit_sales NUMERIC,
  total_sangrias NUMERIC,
  total_orders INTEGER,
  counter_orders INTEGER,
  delivery_orders INTEGER,
  delivery_fees NUMERIC,
  product_cost NUMERIC,
  expected_cash NUMERIC,
  gross_profit NUMERIC,
  session_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_cash_sales NUMERIC := 0;
  v_pix_sales NUMERIC := 0;
  v_card_credit_sales NUMERIC := 0;
  v_card_debit_sales NUMERIC := 0;
  v_total_sangrias NUMERIC := 0;
  v_total_orders INTEGER := 0;
  v_counter_orders INTEGER := 0;
  v_delivery_orders INTEGER := 0;
  v_delivery_fees NUMERIC := 0;
  v_product_cost NUMERIC := 0;
BEGIN
  -- Buscar sessão aberta
  SELECT * INTO v_session
  FROM cash_register_sessions
  WHERE status = 'open'
  LIMIT 1;

  IF v_session IS NULL THEN
    RETURN;
  END IF;

  -- Calcular vendas por método de pagamento desde a abertura
  SELECT 
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'pix' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card_credit' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card_debit' THEN total ELSE 0 END), 0),
    COUNT(*),
    COUNT(CASE WHEN order_type = 'counter' THEN 1 END),
    COUNT(CASE WHEN order_type = 'delivery' THEN 1 END),
    COALESCE(SUM(COALESCE(delivery_fee, 0)), 0)
  INTO 
    v_cash_sales,
    v_pix_sales,
    v_card_credit_sales,
    v_card_debit_sales,
    v_total_orders,
    v_counter_orders,
    v_delivery_orders,
    v_delivery_fees
  FROM orders
  WHERE created_at >= v_session.opened_at
    AND status NOT IN ('pending', 'cancelled');

  -- Calcular total de sangrias desde a abertura (excluindo suprimentos)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_sangrias
  FROM sangrias
  WHERE created_at >= v_session.opened_at
    AND type != 'suprimento';

  -- Calcular custo dos produtos vendidos
  SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0)
  INTO v_product_cost
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE o.created_at >= v_session.opened_at
    AND o.status NOT IN ('pending', 'cancelled');

  RETURN QUERY SELECT
    v_session.id,
    v_session.opened_at,
    v_session.opened_by,
    v_session.opening_balance,
    v_session.cash_supplies,
    v_cash_sales,
    v_cash_sales + v_pix_sales + v_card_credit_sales + v_card_debit_sales,
    v_pix_sales,
    v_card_credit_sales,
    v_card_debit_sales,
    v_total_sangrias,
    v_total_orders,
    v_counter_orders,
    v_delivery_orders,
    v_delivery_fees,
    v_product_cost,
    v_session.opening_balance + v_cash_sales + v_session.cash_supplies - v_total_sangrias,
    (v_cash_sales + v_pix_sales + v_card_credit_sales + v_card_debit_sales) - v_product_cost,
    v_session.status;
END;
$$;

-- Atualizar função open_cash_register para verificar duplicação
CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_opening_balance NUMERIC DEFAULT 0,
  p_opened_by TEXT DEFAULT 'Sistema'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_session UUID;
  v_new_session_id UUID;
BEGIN
  -- Verificar se já existe sessão aberta
  SELECT id INTO v_existing_session
  FROM cash_register_sessions
  WHERE status = 'open'
  LIMIT 1;

  IF v_existing_session IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma sessão de caixa aberta';
  END IF;

  -- Criar nova sessão
  INSERT INTO cash_register_sessions (
    opening_balance,
    current_balance,
    cash_supplies,
    status,
    opened_by
  ) VALUES (
    p_opening_balance,
    p_opening_balance,
    0,
    'open',
    p_opened_by
  )
  RETURNING id INTO v_new_session_id;

  RETURN v_new_session_id;
END;
$$;

-- Atualizar função close_cash_register
CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_session_id UUID,
  p_closed_by TEXT DEFAULT 'Sistema'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE cash_register_sessions
  SET 
    status = 'closed',
    closed_at = NOW(),
    closed_by = p_closed_by
  WHERE id = p_session_id
    AND status = 'open';
END;
$$;

-- Criar função get_all_cash_closures se não existir
CREATE OR REPLACE FUNCTION public.get_all_cash_closures()
RETURNS SETOF cash_register_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM cash_register_closures
  ORDER BY closed_at DESC
  LIMIT 20;
END;
$$;