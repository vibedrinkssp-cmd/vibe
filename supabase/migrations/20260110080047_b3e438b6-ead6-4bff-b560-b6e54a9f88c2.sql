-- Atualizar função create_cash_closure para aceitar session_id
CREATE OR REPLACE FUNCTION public.create_cash_closure(
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_shift_type TEXT,
  p_opening_balance NUMERIC,
  p_expected_cash NUMERIC,
  p_actual_cash NUMERIC,
  p_cash_difference NUMERIC,
  p_total_sales NUMERIC,
  p_total_pix NUMERIC,
  p_total_card_credit NUMERIC,
  p_total_card_debit NUMERIC,
  p_total_cash NUMERIC,
  p_gross_profit NUMERIC,
  p_net_profit NUMERIC,
  p_total_sangrias NUMERIC,
  p_total_orders INTEGER,
  p_notes TEXT DEFAULT NULL,
  p_closed_by TEXT DEFAULT NULL,
  p_total_delivery_fees NUMERIC DEFAULT 0,
  p_total_product_cost NUMERIC DEFAULT 0,
  p_real_gross_profit NUMERIC DEFAULT 0,
  p_cash_supplies NUMERIC DEFAULT 0,
  p_counter_orders_count INTEGER DEFAULT 0,
  p_delivery_orders_count INTEGER DEFAULT 0,
  p_session_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closure_id UUID;
BEGIN
  INSERT INTO cash_register_closures (
    period_start,
    period_end,
    shift_type,
    opening_balance,
    expected_cash,
    actual_cash,
    cash_difference,
    total_sales,
    total_pix,
    total_card_credit,
    total_card_debit,
    total_cash,
    gross_profit,
    net_profit,
    total_sangrias,
    total_orders,
    notes,
    closed_by,
    total_delivery_fees,
    total_product_cost,
    real_gross_profit,
    cash_supplies,
    counter_orders_count,
    delivery_orders_count,
    session_id
  ) VALUES (
    p_period_start,
    p_period_end,
    p_shift_type,
    p_opening_balance,
    p_expected_cash,
    p_actual_cash,
    p_cash_difference,
    p_total_sales,
    p_total_pix,
    p_total_card_credit,
    p_total_card_debit,
    p_total_cash,
    p_gross_profit,
    p_net_profit,
    p_total_sangrias,
    p_total_orders,
    p_notes,
    p_closed_by,
    p_total_delivery_fees,
    p_total_product_cost,
    p_real_gross_profit,
    p_cash_supplies,
    p_counter_orders_count,
    p_delivery_orders_count,
    p_session_id
  )
  RETURNING id INTO v_closure_id;

  -- Atualizar sessão com referência ao closure
  IF p_session_id IS NOT NULL THEN
    UPDATE cash_register_sessions
    SET closure_id = v_closure_id
    WHERE id = p_session_id;
  END IF;

  RETURN v_closure_id;
END;
$$;