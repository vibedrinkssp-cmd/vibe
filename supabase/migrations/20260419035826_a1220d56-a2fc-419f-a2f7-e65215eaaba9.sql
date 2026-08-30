-- Índice para verificação ultra-rápida de sessão aberta
CREATE INDEX IF NOT EXISTS idx_cash_register_sessions_open 
  ON public.cash_register_sessions (status) 
  WHERE status = 'open';

-- Função que verifica se há caixa aberto antes de aceitar pedido
CREATE OR REPLACE FUNCTION public.enforce_cash_session_for_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_count INTEGER;
BEGIN
  -- Verifica se existe pelo menos uma sessão de caixa aberta
  SELECT COUNT(*) INTO v_open_count
  FROM public.cash_register_sessions
  WHERE status = 'open';

  IF v_open_count = 0 THEN
    RAISE EXCEPTION 'CAIXA FECHADO: Não é possível criar pedidos sem uma sessão de caixa aberta. Abra o caixa em Admin → Caixa antes de processar vendas.'
      USING ERRCODE = 'P0001', HINT = 'Vá em /admin → aba Caixa → Abrir Caixa';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger BEFORE INSERT em orders (intercepta TODOS os canais)
DROP TRIGGER IF EXISTS trg_enforce_cash_session ON public.orders;
CREATE TRIGGER trg_enforce_cash_session
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cash_session_for_orders();

COMMENT ON FUNCTION public.enforce_cash_session_for_orders() IS 
  'Bloqueia criação de pedidos quando não há sessão de caixa aberta. Atinge PDV, Delivery, Totem e plataformas externas (iFood/Rappi/etc).';