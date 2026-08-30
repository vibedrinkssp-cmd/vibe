
CREATE OR REPLACE FUNCTION public.rectify_order_payment(
  p_order_id uuid,
  p_splits jsonb,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_split record;
  v_session_id uuid;
BEGIN
  -- Validate order exists and is delivered
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v_order.status NOT IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Apenas pedidos finalizados podem ter pagamento retificado';
  END IF;

  -- Get active cash session if any
  SELECT id INTO v_session_id FROM cash_register_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;

  -- Delete old cash transactions for this order (notes contain order id)
  DELETE FROM cash_transactions WHERE notes LIKE '%' || p_order_id::text || '%';

  -- Update order payment method to mixed and add rectification notes
  UPDATE orders 
  SET payment_method = 'mixed',
      notes = COALESCE(notes, '') || E'\n' || COALESCE(p_notes, '')
  WHERE id = p_order_id;

  -- Create new cash transactions for each split
  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO cash_transactions (type, amount, total, payment_method, responsible, notes, session_id)
    VALUES (
      'sale',
      (v_split.value->>'amount')::numeric,
      (v_split.value->>'amount')::numeric,
      v_split.value->>'method',
      'Sistema',
      '⚡ Retificação Pedido #' || UPPER(RIGHT(p_order_id::text, 6)) || ' — ' || (v_split.value->>'label') || ': R$ ' || (v_split.value->>'amount'),
      v_session_id
    );
  END LOOP;
END;
$$;
