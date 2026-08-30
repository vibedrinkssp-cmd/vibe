CREATE OR REPLACE FUNCTION public.create_cash_transaction(
  p_type text,
  p_amount numeric,
  p_payment_method text DEFAULT NULL::text,
  p_responsible text DEFAULT 'PDV'::text,
  p_notes text DEFAULT NULL::text
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
  v_session_opened_at timestamptz;
  v_opening_balance numeric;
  v_cash_sales numeric;
  v_sangrias numeric;
  v_saques numeric;
  v_real_balance numeric;
  v_tx_id uuid;
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

  SELECT id, opened_at, opening_balance
    INTO v_session_id, v_session_opened_at, v_opening_balance
  FROM cash_register_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: O caixa está fechado. Realize a abertura de caixa antes de operar saques.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Calcula saldo real dinamicamente (igual get_current_cash_balance)
  -- para evitar discrepância com current_balance defasado.
  SELECT COALESCE(SUM(o.total), 0) INTO v_cash_sales
  FROM orders o
  WHERE o.created_at >= v_session_opened_at
    AND o.payment_method = 'cash'
    AND o.status NOT IN ('cancelled', 'pending');

  SELECT COALESCE(SUM(sg.amount), 0) INTO v_sangrias
  FROM sangrias sg
  WHERE sg.created_at >= v_session_opened_at;

  SELECT COALESCE(SUM(ct.amount), 0) INTO v_saques
  FROM cash_transactions ct
  WHERE ct.session_id = v_session_id AND ct.type = 'saque';

  v_real_balance := COALESCE(v_opening_balance, 0)
                    + COALESCE(v_cash_sales, 0)
                    - COALESCE(v_sangrias, 0)
                    - COALESCE(v_saques, 0);

  IF v_real_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente no caixa. Disponível: R$ %', v_real_balance;
  END IF;

  INSERT INTO cash_transactions (type, amount, fee, total, payment_method, responsible, notes, session_id)
  VALUES ('saque', p_amount, v_fee, v_total, p_payment_method, COALESCE(NULLIF(p_responsible, ''), 'PDV'), p_notes, v_session_id)
  RETURNING id INTO v_tx_id;

  -- Sincroniza o campo current_balance com o saldo real após o saque
  UPDATE cash_register_sessions
  SET current_balance = v_real_balance - p_amount
  WHERE id = v_session_id;

  RETURN v_tx_id;
END;
$function$;