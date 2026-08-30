-- =====================================================================
-- BLOQUEIO TOTAL DE MOVIMENTAÇÃO DE DINHEIRO FÍSICO COM CAIXA FECHADO
-- =====================================================================
-- Garante que NENHUMA operação envolvendo dinheiro físico aconteça
-- enquanto não houver uma sessão de caixa aberta. Inclui:
--   - Saques (PIX/Débito/Crédito) -> cash_transactions
--   - Sangrias (todos os tipos)
--   - Pagamentos da Caderneta em dinheiro
--   - Pedidos com payment_method = 'cash' (PDV/Totem/Delivery/Pickup/iFood/99)
--   - Pedidos com payment_method = 'composite' contendo dinheiro nas notes
-- =====================================================================

-- Helper: existe sessão aberta?
CREATE OR REPLACE FUNCTION public.has_open_cash_session()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cash_register_sessions WHERE status = 'open'
  );
$$;

-- ---------------------------------------------------------------------
-- 1) Bloqueia INSERT em cash_transactions (saques/depósitos) sem caixa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_cash_transactions_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  SELECT id INTO v_session_id
  FROM public.cash_register_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: O caixa está fechado. Realize a abertura do caixa antes de registrar saques ou depósitos.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Garante vínculo com a sessão aberta
  IF NEW.session_id IS NULL THEN
    NEW.session_id := v_session_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_cash_transactions ON public.cash_transactions;
CREATE TRIGGER trg_guard_cash_transactions
  BEFORE INSERT ON public.cash_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_cash_transactions_insert();

-- ---------------------------------------------------------------------
-- 2) Bloqueia INSERT em sangrias sem caixa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_sangrias_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_open_cash_session() THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: O caixa está fechado. Realize a abertura do caixa antes de registrar sangrias.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sangrias ON public.sangrias;
CREATE TRIGGER trg_guard_sangrias
  BEFORE INSERT ON public.sangrias
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sangrias_insert();

-- ---------------------------------------------------------------------
-- 3) Bloqueia pagamentos da caderneta em DINHEIRO sem caixa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_caderneta_payment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF LOWER(COALESCE(NEW.payment_method, '')) IN ('cash', 'dinheiro')
     AND NOT public.has_open_cash_session() THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: O caixa está fechado. Realize a abertura do caixa antes de receber pagamentos em dinheiro da caderneta.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_caderneta_payments ON public.caderneta_payments;
CREATE TRIGGER trg_guard_caderneta_payments
  BEFORE INSERT ON public.caderneta_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_caderneta_payment_insert();

-- ---------------------------------------------------------------------
-- 4) Bloqueia pedidos em DINHEIRO sem caixa (PDV/Totem/Delivery/iFood/99)
--    - payment_method = 'cash' SEMPRE bloqueia
--    - payment_method = 'composite' bloqueia se notes mencionar dinheiro
--      (formato armazenado pelo CompositePaymentModal)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_orders_cash_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pm TEXT;
  v_notes TEXT;
  v_has_cash BOOLEAN := FALSE;
BEGIN
  v_pm := LOWER(COALESCE(NEW.payment_method::text, ''));
  v_notes := LOWER(COALESCE(NEW.notes, ''));

  IF v_pm = 'cash' THEN
    v_has_cash := TRUE;
  ELSIF v_pm = 'composite' AND (
        v_notes LIKE '%dinheiro%' OR v_notes LIKE '%cash%'
      ) THEN
    v_has_cash := TRUE;
  END IF;

  IF v_has_cash AND NOT public.has_open_cash_session() THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: O caixa está fechado. Não é possível registrar vendas em dinheiro. Realize a abertura do caixa primeiro.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orders_cash ON public.orders;
CREATE TRIGGER trg_guard_orders_cash
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_orders_cash_insert();

-- Também bloqueia tentar TROCAR pra dinheiro um pedido existente sem caixa
CREATE OR REPLACE FUNCTION public.guard_orders_cash_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method::text = 'cash'
     AND OLD.payment_method::text <> 'cash'
     AND NOT public.has_open_cash_session() THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: Não é possível alterar a forma de pagamento para Dinheiro com o caixa fechado.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orders_cash_upd ON public.orders;
CREATE TRIGGER trg_guard_orders_cash_upd
  BEFORE UPDATE OF payment_method ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_orders_cash_update();