
CREATE OR REPLACE FUNCTION public.get_current_cash_balance()
 RETURNS TABLE(session_id uuid, session_status text, opened_at timestamp with time zone, opening_balance numeric, cash_sales numeric, cash_withdrawals numeric, cash_supplies numeric, total_saques numeric, total_depositos numeric, current_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_cash_sales NUMERIC;
  v_sangrias NUMERIC;
  v_saques NUMERIC;
  v_depositos NUMERIC;
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

  -- Vendas em dinheiro
  SELECT COALESCE(SUM(o.total), 0) INTO v_cash_sales
  FROM public.orders o
  WHERE o.created_at >= v_session.opened_at
    AND o.payment_method = 'cash'
    AND o.status NOT IN ('cancelled', 'pending');

  -- Sangrias
  SELECT COALESCE(SUM(sg.amount), 0) INTO v_sangrias
  FROM public.sangrias sg
  WHERE sg.created_at >= v_session.opened_at
    AND sg.type = 'sangria';

  -- SAQ/DEP
  SELECT 
    COALESCE(SUM(CASE WHEN ct.type = 'saque' THEN ct.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'deposito' THEN ct.total ELSE 0 END), 0)
  INTO v_saques, v_depositos
  FROM public.cash_transactions ct
  WHERE ct.session_id = v_session.id;

  RETURN QUERY SELECT 
    v_session.id,
    v_session.status,
    v_session.opened_at,
    v_session.opening_balance,
    v_cash_sales,
    v_sangrias,
    COALESCE(v_session.cash_supplies, 0),
    v_saques,
    v_depositos,
    (v_session.opening_balance + v_cash_sales + COALESCE(v_session.cash_supplies, 0) + v_depositos - v_sangrias - v_saques);
END;
$function$;
