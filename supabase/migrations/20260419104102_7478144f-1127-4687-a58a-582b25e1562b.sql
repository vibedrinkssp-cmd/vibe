-- ============================================
-- A4: Tabela de confirmação de dinheiro do motoboy
-- ============================================
CREATE TABLE IF NOT EXISTS public.motoboy_cash_confirmations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  motoboy_id uuid NOT NULL,
  session_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  confirmed_by text,
  confirmed_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_motoboy_cash_conf_session 
  ON public.motoboy_cash_confirmations(session_id);
CREATE INDEX IF NOT EXISTS idx_motoboy_cash_conf_motoboy 
  ON public.motoboy_cash_confirmations(motoboy_id);

ALTER TABLE public.motoboy_cash_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode ver confirmações de dinheiro motoboy"
  ON public.motoboy_cash_confirmations FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff pode inserir confirmações de dinheiro motoboy"
  ON public.motoboy_cash_confirmations FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Admin pode deletar confirmações de dinheiro motoboy"
  ON public.motoboy_cash_confirmations FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- A2: Coerência cronológica de timestamps em update_order_status
-- ============================================
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_status order_status,
  p_motoboy_id uuid DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  -- Atualiza status e o timestamp correspondente, preenchendo os anteriores se faltarem
  UPDATE orders SET
    status = p_status,
    motoboy_id = COALESCE(p_motoboy_id, motoboy_id),
    accepted_at = CASE 
      WHEN accepted_at IS NULL AND p_status IN ('accepted','preparing','ready','dispatched','arrived','delivered') 
      THEN v_now ELSE accepted_at END,
    preparing_at = CASE 
      WHEN preparing_at IS NULL AND p_status IN ('preparing','ready','dispatched','arrived','delivered') 
      THEN v_now ELSE preparing_at END,
    ready_at = CASE 
      WHEN ready_at IS NULL AND p_status IN ('ready','dispatched','arrived','delivered') 
      THEN v_now ELSE ready_at END,
    dispatched_at = CASE 
      WHEN dispatched_at IS NULL AND p_status IN ('dispatched','arrived','delivered') 
      THEN v_now ELSE dispatched_at END,
    arrived_at = CASE 
      WHEN arrived_at IS NULL AND p_status IN ('arrived','delivered') 
      THEN v_now ELSE arrived_at END,
    delivered_at = CASE 
      WHEN delivered_at IS NULL AND p_status = 'delivered' 
      THEN v_now ELSE delivered_at END
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;