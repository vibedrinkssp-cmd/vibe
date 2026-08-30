-- Corrige get_current_cash_balance para considerar TODAS sangrias e depositos
-- Alinha a fórmula com get_session_summary (única fonte de verdade)

DROP FUNCTION IF EXISTS public.get_current_cash_balance();

CREATE OR REPLACE FUNCTION public.get_current_cash_balance()
RETURNS TABLE(
  session_id UUID,
  session_status TEXT,
  opened_at TIMESTAMPTZ,
  opening_balance NUMERIC,
  cash_sales NUMERIC,
  sangrias NUMERIC,
  cash_supplies NUMERIC,
  saques NUMERIC,
  depositos NUMERIC,
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
  v_saques NUMERIC;
  v_depositos_total NUMERIC;
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

  -- Vendas em dinheiro (apenas pedidos válidos)
  SELECT COALESCE(SUM(o.total), 0) INTO v_cash_sales
  FROM public.orders o
  WHERE o.created_at >= v_session.opened_at
    AND o.payment_method = 'cash'
    AND o.status NOT IN ('cancelled', 'pending');

  -- TODAS as sangrias (qualquer type) saem do caixa físico
  SELECT COALESCE(SUM(sg.amount), 0) INTO v_sangrias
  FROM public.sangrias sg
  WHERE sg.created_at >= v_session.opened_at;

  -- Saques: dinheiro entregue ao cliente
  SELECT COALESCE(SUM(ct.amount), 0) INTO v_saques
  FROM public.cash_transactions ct
  WHERE ct.session_id = v_session.id AND ct.type = 'saque';

  -- Depositos: cliente entrega cash (amount + fee), entra todo no caixa
  SELECT COALESCE(SUM(ct.total), 0) INTO v_depositos_total
  FROM public.cash_transactions ct
  WHERE ct.session_id = v_session.id AND ct.type = 'deposito';

  RETURN QUERY SELECT
    v_session.id,
    v_session.status,
    v_session.opened_at,
    v_session.opening_balance,
    v_cash_sales,
    v_sangrias,
    COALESCE(v_session.cash_supplies, 0),
    v_saques,
    v_depositos_total,
    (v_session.opening_balance
      + v_cash_sales
      + COALESCE(v_session.cash_supplies, 0)
      + v_depositos_total
      - v_sangrias
      - v_saques);
END;
$$;