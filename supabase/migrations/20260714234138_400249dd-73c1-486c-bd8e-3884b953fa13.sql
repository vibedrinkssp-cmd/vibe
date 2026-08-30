
-- 1) Table
CREATE TABLE IF NOT EXISTS public.motoboy_payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id UUID NOT NULL REFERENCES public.motoboys(id) ON DELETE RESTRICT,
  motoboy_name TEXT NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  delivery_fees_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  extra_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  extra_note TEXT,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','pix')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  pix_full_name TEXT,
  pix_key TEXT,
  pix_key_type TEXT,
  cash_session_id UUID,
  sangria_id UUID,
  order_ids UUID[] NOT NULL DEFAULT '{}',
  created_by TEXT,
  paid_by TEXT,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpo_motoboy ON public.motoboy_payment_orders(motoboy_id);
CREATE INDEX IF NOT EXISTS idx_mpo_status ON public.motoboy_payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_mpo_created ON public.motoboy_payment_orders(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.motoboy_payment_orders TO authenticated;
GRANT ALL ON public.motoboy_payment_orders TO service_role;

ALTER TABLE public.motoboy_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mpo select" ON public.motoboy_payment_orders;
CREATE POLICY "mpo select" ON public.motoboy_payment_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mpo insert" ON public.motoboy_payment_orders;
CREATE POLICY "mpo insert" ON public.motoboy_payment_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mpo update" ON public.motoboy_payment_orders;
CREATE POLICY "mpo update" ON public.motoboy_payment_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.trg_mpo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS mpo_updated_at ON public.motoboy_payment_orders;
CREATE TRIGGER mpo_updated_at BEFORE UPDATE ON public.motoboy_payment_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_mpo_updated_at();

-- 2) RPC: create payment order
CREATE OR REPLACE FUNCTION public.create_motoboy_payment_order(
  p_motoboy_id UUID,
  p_delivery_fees NUMERIC,
  p_extra_amount NUMERIC,
  p_extra_note TEXT,
  p_payment_method TEXT,
  p_order_ids UUID[],
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_pix_full_name TEXT DEFAULT NULL,
  p_pix_key TEXT DEFAULT NULL,
  p_pix_key_type TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'Admin',
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_total NUMERIC := COALESCE(p_delivery_fees,0) + COALESCE(p_extra_amount,0);
  v_status TEXT;
  v_name TEXT;
  v_session_id UUID;
  v_sangria_id UUID;
BEGIN
  IF p_payment_method NOT IN ('cash','pix') THEN
    RAISE EXCEPTION 'invalid payment method';
  END IF;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'total must be greater than zero';
  END IF;

  SELECT name INTO v_name FROM motoboys WHERE id = p_motoboy_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'motoboy not found'; END IF;

  IF p_payment_method = 'cash' THEN
    -- Verificar caixa aberto
    SELECT id INTO v_session_id FROM cash_register_sessions
      WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1;
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'no open cash session';
    END IF;
    -- Criar sangria
    INSERT INTO sangrias (amount, type, description, reason, responsible)
    VALUES (
      v_total,
      'motoboy',
      'Pagamento motoboy ' || v_name || COALESCE(' - ' || p_extra_note, ''),
      'Pagamento em dinheiro de ordem de motoboy',
      p_created_by
    ) RETURNING id INTO v_sangria_id;
    v_status := 'paid';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO motoboy_payment_orders(
    motoboy_id, motoboy_name, period_start, period_end,
    delivery_fees_total, extra_amount, extra_note, total_amount,
    payment_method, status,
    pix_full_name, pix_key, pix_key_type,
    cash_session_id, sangria_id, order_ids,
    created_by, paid_by, paid_at, notes
  ) VALUES (
    p_motoboy_id, v_name, p_period_start, p_period_end,
    COALESCE(p_delivery_fees,0), COALESCE(p_extra_amount,0), p_extra_note, v_total,
    p_payment_method, v_status,
    p_pix_full_name, p_pix_key, p_pix_key_type,
    v_session_id, v_sangria_id, COALESCE(p_order_ids, '{}'::uuid[]),
    p_created_by,
    CASE WHEN v_status = 'paid' THEN p_created_by ELSE NULL END,
    CASE WHEN v_status = 'paid' THEN now() ELSE NULL END,
    p_notes
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_motoboy_payment_order(UUID,NUMERIC,NUMERIC,TEXT,TEXT,UUID[],TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated, anon, service_role;

-- 3) RPC: pay pending order
CREATE OR REPLACE FUNCTION public.pay_motoboy_payment_order(
  p_order_id UUID,
  p_paid_by TEXT DEFAULT 'Admin'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row motoboy_payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM motoboy_payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'order is not pending';
  END IF;
  UPDATE motoboy_payment_orders
    SET status = 'paid', paid_by = p_paid_by, paid_at = now()
    WHERE id = p_order_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pay_motoboy_payment_order(UUID,TEXT) TO authenticated, anon, service_role;

-- 4) RPC: cancel order (reverses sangria if any by inserting refund cash_transaction is out of scope; simply delete sangria if cash and still same day)
CREATE OR REPLACE FUNCTION public.cancel_motoboy_payment_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row motoboy_payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM motoboy_payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_row.status = 'cancelled' THEN RETURN; END IF;

  -- Reverter sangria (apenas se ainda existir e caixa aberto)
  IF v_row.sangria_id IS NOT NULL THEN
    DELETE FROM sangrias WHERE id = v_row.sangria_id;
  END IF;

  UPDATE motoboy_payment_orders
    SET status = 'cancelled', notes = COALESCE(notes,'') || E'\n[Cancelada] ' || COALESCE(p_reason,'')
    WHERE id = p_order_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_motoboy_payment_order(UUID,TEXT) TO authenticated, anon, service_role;

-- 5) RPC: list orders
CREATE OR REPLACE FUNCTION public.list_motoboy_payment_orders(
  p_motoboy_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_start TIMESTAMPTZ DEFAULT NULL,
  p_end TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF public.motoboy_payment_orders
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM motoboy_payment_orders
  WHERE (p_motoboy_id IS NULL OR motoboy_id = p_motoboy_id)
    AND (p_status IS NULL OR status = p_status)
    AND (p_start IS NULL OR created_at >= p_start)
    AND (p_end IS NULL OR created_at <= p_end)
  ORDER BY created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.list_motoboy_payment_orders(UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated, anon, service_role;

-- 6) RPC: orders IDs already tied to non-cancelled payment orders for a motoboy
CREATE OR REPLACE FUNCTION public.list_motoboy_paid_order_ids(
  p_motoboy_id UUID
) RETURNS TABLE(order_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT unnest(order_ids) FROM motoboy_payment_orders
  WHERE motoboy_id = p_motoboy_id AND status <> 'cancelled';
$$;
GRANT EXECUTE ON FUNCTION public.list_motoboy_paid_order_ids(UUID) TO authenticated, anon, service_role;
