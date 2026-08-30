
-- Table for manual extra fees added to motoboys throughout the period
CREATE TABLE public.motoboy_manual_extras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  motoboy_id UUID NOT NULL REFERENCES public.motoboys(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  created_by TEXT,
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_order_id UUID REFERENCES public.motoboy_payment_orders(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_motoboy_manual_extras_motoboy ON public.motoboy_manual_extras(motoboy_id, created_at DESC);
CREATE INDEX idx_motoboy_manual_extras_unpaid ON public.motoboy_manual_extras(motoboy_id) WHERE paid = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.motoboy_manual_extras TO authenticated;
GRANT SELECT ON public.motoboy_manual_extras TO anon;
GRANT ALL ON public.motoboy_manual_extras TO service_role;

ALTER TABLE public.motoboy_manual_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read manual extras" ON public.motoboy_manual_extras
  FOR SELECT USING (true);
CREATE POLICY "Public insert manual extras" ON public.motoboy_manual_extras
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update manual extras" ON public.motoboy_manual_extras
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete manual extras" ON public.motoboy_manual_extras
  FOR DELETE USING (true);

CREATE TRIGGER trg_mme_updated_at BEFORE UPDATE ON public.motoboy_manual_extras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add manual extra
CREATE OR REPLACE FUNCTION public.add_motoboy_manual_extra(
  p_motoboy_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_created_by TEXT DEFAULT 'Admin'
) RETURNS public.motoboy_manual_extras
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.motoboy_manual_extras;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor invalido'; END IF;
  IF p_description IS NULL OR length(btrim(p_description)) = 0 THEN RAISE EXCEPTION 'Descricao obrigatoria'; END IF;
  INSERT INTO public.motoboy_manual_extras(motoboy_id, description, amount, created_by)
  VALUES (p_motoboy_id, btrim(p_description), p_amount, p_created_by)
  RETURNING * INTO r;
  RETURN r;
END; $$;

-- List manual extras with optional filters
CREATE OR REPLACE FUNCTION public.list_motoboy_manual_extras(
  p_motoboy_id UUID DEFAULT NULL,
  p_start TIMESTAMPTZ DEFAULT NULL,
  p_end TIMESTAMPTZ DEFAULT NULL,
  p_only_unpaid BOOLEAN DEFAULT false
) RETURNS SETOF public.motoboy_manual_extras
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.motoboy_manual_extras
  WHERE (p_motoboy_id IS NULL OR motoboy_id = p_motoboy_id)
    AND (p_start IS NULL OR created_at >= p_start)
    AND (p_end IS NULL OR created_at <= p_end)
    AND (NOT p_only_unpaid OR paid = false)
  ORDER BY created_at DESC;
$$;

-- Delete a manual extra (only if unpaid)
CREATE OR REPLACE FUNCTION public.delete_motoboy_manual_extra(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.motoboy_manual_extras WHERE id = p_id AND paid = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Extra ja pago ou nao encontrado'; END IF;
END; $$;

-- Mark manual extras as paid and link them to a payment order
CREATE OR REPLACE FUNCTION public.mark_motoboy_extras_paid(
  p_ids UUID[],
  p_payment_order_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.motoboy_manual_extras
  SET paid = true, paid_at = now(), payment_order_id = p_payment_order_id
  WHERE id = ANY(p_ids) AND paid = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
