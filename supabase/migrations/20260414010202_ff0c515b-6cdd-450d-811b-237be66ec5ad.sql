
-- Table for cash transactions (SAQ/DEP)
CREATE TABLE public.cash_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('saque', 'deposito')),
  amount numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text,
  responsible text NOT NULL DEFAULT 'PDV',
  notes text,
  session_id uuid REFERENCES public.cash_register_sessions(id)
);

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode gerenciar cash_transactions"
ON public.cash_transactions FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff pode ver cash_transactions"
ON public.cash_transactions FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- Function to create a cash transaction
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
SET search_path = public
AS $$
DECLARE
  v_fee numeric;
  v_total numeric;
  v_session_id uuid;
  v_tx_id uuid;
  v_current_balance numeric;
BEGIN
  -- Validate type
  IF p_type NOT IN ('saque', 'deposito') THEN
    RAISE EXCEPTION 'Tipo inválido: %', p_type;
  END IF;

  -- Validate amount (minimum 5, multiple of 5)
  IF p_amount < 5 OR p_amount % 5 != 0 THEN
    RAISE EXCEPTION 'Valor deve ser múltiplo de R$ 5 (mínimo R$ 5)';
  END IF;

  -- Calculate fee (50%)
  v_fee := p_amount * 0.5;
  v_total := p_amount + v_fee;

  -- Get current open session
  SELECT id, current_balance INTO v_session_id, v_current_balance
  FROM cash_register_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  -- For saque, check balance
  IF p_type = 'saque' AND v_current_balance IS NOT NULL AND v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente no caixa. Disponível: R$ %', v_current_balance;
  END IF;

  -- Insert transaction
  INSERT INTO cash_transactions (type, amount, fee, total, payment_method, responsible, notes, session_id)
  VALUES (p_type, p_amount, v_fee, v_total, p_payment_method, COALESCE(NULLIF(p_responsible, ''), 'PDV'), p_notes, v_session_id)
  RETURNING id INTO v_tx_id;

  -- Update session balance
  IF v_session_id IS NOT NULL THEN
    IF p_type = 'deposito' THEN
      -- Deposit: cash enters the register (client gives cash)
      UPDATE cash_register_sessions 
      SET current_balance = current_balance + v_total
      WHERE id = v_session_id;
    ELSE
      -- Withdrawal: cash leaves the register (client takes cash)
      UPDATE cash_register_sessions 
      SET current_balance = current_balance - p_amount
      WHERE id = v_session_id;
    END IF;
  END IF;

  RETURN v_tx_id;
END;
$$;

-- Function to get transactions filtered by date and type
CREATE OR REPLACE FUNCTION public.get_cash_transactions(
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_type text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  created_at timestamp with time zone,
  type text,
  amount numeric,
  fee numeric,
  total numeric,
  payment_method text,
  responsible text,
  notes text,
  session_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ct.id, ct.created_at, ct.type, ct.amount, ct.fee, ct.total, 
         ct.payment_method, ct.responsible, ct.notes, ct.session_id
  FROM cash_transactions ct
  WHERE ct.created_at >= p_start_date
    AND ct.created_at <= p_end_date
    AND (p_type IS NULL OR ct.type = p_type)
  ORDER BY ct.created_at DESC;
$$;

-- Function to get summary for current session
CREATE OR REPLACE FUNCTION public.get_saq_dep_summary()
RETURNS TABLE(
  total_saques numeric,
  total_depositos numeric,
  total_fees numeric,
  count_saques bigint,
  count_depositos bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN ct.type = 'saque' THEN ct.amount ELSE 0 END), 0) as total_saques,
    COALESCE(SUM(CASE WHEN ct.type = 'deposito' THEN ct.amount ELSE 0 END), 0) as total_depositos,
    COALESCE(SUM(ct.fee), 0) as total_fees,
    COUNT(CASE WHEN ct.type = 'saque' THEN 1 END) as count_saques,
    COUNT(CASE WHEN ct.type = 'deposito' THEN 1 END) as count_depositos
  FROM cash_transactions ct
  WHERE ct.session_id = (
    SELECT id FROM cash_register_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1
  );
$$;
