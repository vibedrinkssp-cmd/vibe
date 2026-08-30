-- Amplia tipos válidos em cash_transactions
ALTER TABLE public.cash_transactions DROP CONSTRAINT IF EXISTS cash_transactions_type_check;
ALTER TABLE public.cash_transactions ADD CONSTRAINT cash_transactions_type_check
  CHECK (type IN ('saque', 'deposito', 'rectification'));

-- Atualiza função para usar 'rectification'
CREATE OR REPLACE FUNCTION public.rectify_order_payment(p_order_id uuid, p_splits jsonb, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_split record;
  v_session_id uuid;
  v_total_paid numeric := 0;
  v_excess numeric := 0;
  v_order_total numeric;
  v_tag text;
  v_new_notes text;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v_order.status NOT IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Apenas pedidos finalizados podem ter pagamento retificado';
  END IF;

  v_order_total := COALESCE(v_order.total, 0);
  v_tag := '[ORDER:' || p_order_id::text || ']';

  SELECT id INTO v_session_id FROM cash_register_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;

  IF v_order.payment_method = 'cash' AND v_order.order_type <> 'counter' AND COALESCE(v_order.payment_confirmed, false) = true THEN
    UPDATE orders
    SET payment_confirmed = false,
        payment_confirmed_at = NULL,
        payment_confirmed_by = NULL
    WHERE id = p_order_id;
  END IF;

  DELETE FROM cash_transactions
  WHERE notes LIKE '%' || v_tag || '%'
     OR notes LIKE '%Pedido #' || UPPER(RIGHT(p_order_id::text, 6)) || '%';

  SELECT COALESCE(SUM((value->>'amount')::numeric), 0) INTO v_total_paid
  FROM jsonb_array_elements(p_splits) AS value;

  IF v_total_paid + 0.02 < v_order_total THEN
    RAISE EXCEPTION 'Valor pago (%) menor que o total do pedido (%).', v_total_paid, v_order_total;
  END IF;

  v_excess := GREATEST(0, v_total_paid - v_order_total);

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO cash_transactions (type, amount, total, payment_method, responsible, notes, session_id)
    VALUES (
      'rectification',
      (v_split.value->>'amount')::numeric,
      (v_split.value->>'amount')::numeric,
      v_split.value->>'method',
      'Sistema',
      '⚡ Retificação Pedido #' || UPPER(RIGHT(p_order_id::text, 6))
        || ' — ' || (v_split.value->>'label')
        || ': R$ ' || (v_split.value->>'amount')
        || ' ' || v_tag,
      v_session_id
    );
  END LOOP;

  IF v_excess > 0.01 THEN
    INSERT INTO cash_transactions (type, amount, total, payment_method, responsible, notes, session_id)
    VALUES (
      'rectification',
      v_excess,
      v_excess,
      'cash',
      'Sistema',
      '💰 ENTRADA EXCEDENTE Pedido #' || UPPER(RIGHT(p_order_id::text, 6))
        || ': R$ ' || to_char(v_excess, 'FM999999990.00')
        || ' ' || v_tag,
      v_session_id
    );
  END IF;

  v_new_notes := regexp_replace(COALESCE(v_order.notes, ''), E'\\n?⚡ Retificação:.*', '', 'g');
  v_new_notes := regexp_replace(v_new_notes, E'\\n?💰 ENTRADA EXCEDENTE:.*', '', 'g');
  v_new_notes := trim(both E' \n' from v_new_notes);

  IF COALESCE(p_notes, '') <> '' THEN
    v_new_notes := CASE WHEN v_new_notes = '' THEN p_notes ELSE v_new_notes || E'\n' || p_notes END;
  END IF;

  IF v_excess > 0.01 THEN
    v_new_notes := v_new_notes || E'\n💰 ENTRADA EXCEDENTE: R$ ' || to_char(v_excess, 'FM999999990.00');
  END IF;

  UPDATE orders
  SET payment_method = 'mixed',
      notes = v_new_notes
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'total_paid', v_total_paid,
    'order_total', v_order_total,
    'excess', v_excess
  );
END;
$function$;