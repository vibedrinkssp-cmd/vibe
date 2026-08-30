-- ============================================================
-- HARDENING DO CAIXA + AUDITORIA + RECOVERY
-- ============================================================

-- 1) Tabela de auditoria
CREATE TABLE IF NOT EXISTS public.cash_register_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid,
  action text NOT NULL,           -- 'open' | 'close' | 'reopen' | 'recover'
  responsible text,
  user_agent text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_register_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff vê auditoria de caixa" ON public.cash_register_audit;
CREATE POLICY "Staff vê auditoria de caixa"
  ON public.cash_register_audit FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

DROP POLICY IF EXISTS "Staff insere auditoria de caixa" ON public.cash_register_audit;
CREATE POLICY "Staff insere auditoria de caixa"
  ON public.cash_register_audit FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE INDEX IF NOT EXISTS idx_cash_register_audit_created_at
  ON public.cash_register_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_register_audit_session
  ON public.cash_register_audit (session_id);

-- 2) Trava de unicidade — apenas UMA sessão aberta por vez
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_open_session
  ON public.cash_register_sessions (status)
  WHERE status = 'open';

-- 3) RPC open_cash_register endurecida — devolve sessão existente em vez de erro
CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_opening_balance numeric DEFAULT 0,
  p_opened_by text DEFAULT 'Sistema'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_session uuid;
  v_new_session_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cash_register_open'));

  SELECT id INTO v_existing_session
  FROM cash_register_sessions
  WHERE status = 'open'
  LIMIT 1;

  IF v_existing_session IS NOT NULL THEN
    INSERT INTO cash_register_audit(session_id, action, responsible, notes)
    VALUES (v_existing_session, 'open_attempt_existing', p_opened_by,
            'Tentativa de abrir com sessão já ativa — devolvida a existente');
    RETURN v_existing_session;
  END IF;

  INSERT INTO cash_register_sessions (
    opening_balance, current_balance, cash_supplies, status, opened_by
  ) VALUES (
    p_opening_balance, p_opening_balance, 0, 'open', p_opened_by
  )
  RETURNING id INTO v_new_session_id;

  INSERT INTO cash_register_audit(session_id, action, responsible, notes)
  VALUES (v_new_session_id, 'open', p_opened_by,
          'Abertura com saldo ' || p_opening_balance::text);

  RETURN v_new_session_id;
END;
$function$;

-- 4) RPC close_cash_register endurecida — auditoria + idempotência
CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_session_id uuid,
  p_closed_by text DEFAULT 'Sistema'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cash_register_close:' || p_session_id::text));

  SELECT status INTO v_status FROM cash_register_sessions WHERE id = p_session_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada';
  END IF;

  IF v_status = 'closed' THEN
    INSERT INTO cash_register_audit(session_id, action, responsible, notes)
    VALUES (p_session_id, 'close_noop', p_closed_by, 'Tentativa de fechar sessão já fechada');
    RETURN;
  END IF;

  UPDATE cash_register_sessions
  SET status = 'closed', closed_at = now(), closed_by = p_closed_by
  WHERE id = p_session_id AND status = 'open';

  INSERT INTO cash_register_audit(session_id, action, responsible, notes)
  VALUES (p_session_id, 'close', p_closed_by, 'Fechamento confirmado');
END;
$function$;

-- 5) RPC reopen_last_session — recupera fechamento acidental
CREATE OR REPLACE FUNCTION public.reopen_last_session(
  p_responsible text DEFAULT 'Sistema'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_open_id uuid;
  v_session_id uuid;
  v_closure_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cash_register_open'));

  -- Bloqueia se já houver sessão aberta
  SELECT id INTO v_open_id FROM cash_register_sessions WHERE status='open' LIMIT 1;
  IF v_open_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma sessão aberta (%); feche-a antes de reabrir a anterior', v_open_id;
  END IF;

  -- Pega a última sessão fechada
  SELECT id, closure_id INTO v_session_id, v_closure_id
  FROM cash_register_sessions
  WHERE status='closed'
  ORDER BY closed_at DESC NULLS LAST
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma sessão fechada para reabrir';
  END IF;

  -- Reabre
  UPDATE cash_register_sessions
  SET status='open', closed_at=NULL, closed_by=NULL, closure_id=NULL
  WHERE id = v_session_id;

  -- Apaga o fechamento associado (se existir) para não bagunçar o histórico
  IF v_closure_id IS NOT NULL THEN
    DELETE FROM cash_register_closures WHERE id = v_closure_id;
  END IF;

  INSERT INTO cash_register_audit(session_id, action, responsible, notes)
  VALUES (v_session_id, 'reopen', p_responsible,
          'Sessão reaberta — fechamento ' || COALESCE(v_closure_id::text,'N/A') || ' removido');

  RETURN v_session_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reopen_last_session(text) TO authenticated;